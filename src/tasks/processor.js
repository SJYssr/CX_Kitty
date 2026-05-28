/**
 * JobProcessor — 任务队列调度器 (章节并发 → 任务分发)
 * @module tasks/processor
 */

import logger from '../utils/logger.js';
import { StudyResult, ChapterResult } from '../core/study-result.js';
import { processVideo } from './video.js';
import { processDocument } from './document.js';
import { processRead } from './read.js';
import { processWork } from './work.js';

const TYPE_LABEL = { video: '视频', document: '文档', workid: '答题', work: '答题', read: '阅读', live: '直播' };

/**
 * 作业调度处理器
 */
export class JobProcessor {
  /**
   * @param {import('../core/chaoxing.js').Chaoxing} chaoxing
   * @param {Object} course — { courseId, clazzId, cpi, title }
   * @param {Array<{id: string, title: string, jobCount: number, hasFinished: boolean, needUnlock: boolean}>} chapterPoints
   * @param {Object} [config]
   */
  constructor(chaoxing, course, chapterPoints, config = {}) {
    this.chaoxing = chaoxing;
    this.course = course;
    this.chapterPoints = chapterPoints;
    this.speed = config.speed || 1;
    this.jobs = config.jobs || 3;
    this.notopenAction = config.notopenAction || 'continue';

    this._completedCount = 0;
    this._errorCount = 0;
    this._notOpenCount = 0;
    this._completedJobIds = new Set();
  }

  /**
   * 执行所有章节任务
   */
  async run() {
    logger.info(`课程: ${this.course.title || this.course.courseId}`);
    logger.info(`章节: ${this.chapterPoints.length}, 并行: ${this.jobs}`);

    const tasks = this.chapterPoints.map((point, i) => () =>
      this._processChapter(point, i, this.chapterPoints.length)
    );

    for (let i = 0; i < tasks.length; i += this.jobs) {
      if (i > 0) {
        const delay = 3000 + Math.floor(Math.random() * 5000);
        await new Promise(r => setTimeout(r, delay));
      }

      const batch = tasks.slice(i, i + this.jobs);
      await Promise.all(batch.map(t => t()));
    }

    logger.info(`完成: 成功${this._completedCount} 失败${this._errorCount} 未开放${this._notOpenCount}`);
  }

  // ===================== 进度上报 =====================

  /** 上报当前进度到 DB（等待写入完成） */
  async _sendProgress() {
    if (!this.chaoxing._taskId) return;
    const msg = {
      type: 'chapter_progress',
      taskId: this.chaoxing._taskId,
      courseTitle: this.course.title,
      courseId: this.course.courseId,
      total: this.chapterPoints.length,
      completed: this._completedCount
    };
    if (typeof this.chaoxing._onProgress === 'function') {
      await this.chaoxing._onProgress(msg);
    }
  }

  /** 发送日志到 SSE + DB（等待写入完成，保证进度不被覆盖） */
  async _sendLog(text) {
    if (!this.chaoxing._taskId) return;
    const msg = { type: 'log', taskId: this.chaoxing._taskId, text };
    if (typeof this.chaoxing._onProgress === 'function') {
      await this.chaoxing._onProgress(msg);
    }
  }

  // ===================== 章节处理 =====================

  async _processChapter(point, index, total) {
    const label = `[${index + 1}/${total}] ${point.title || point.id}`;

    // 已完成
    if (point.hasFinished) {
      logger.info(`${label} 已完成，跳过`);
      await this._sendLog(`${label} 已完成，跳过`);
      this._completedCount++;
      await this._sendProgress();
      return ChapterResult.SUCCESS;
    }

    // 开始处理
    await this._sendLog(`${label} 正在处理...`);

    const { jobs, jobInfo, notOpen } = await this.chaoxing.getJobList(this.course, point);

    // 未开放
    if (notOpen) {
      logger.warn(`${label} 章节未开放，跳过`);
      await this._sendLog(`⚠️ ${label} 章节未开放，跳过`);
      this._notOpenCount++;
      await this._sendProgress();
      return ChapterResult.NOT_OPEN;
    }

    // 空章节
    if (!jobs.length) {
      logger.info(`${label} 空章节，已跳过`);
      await this._sendLog(`${label} 空章节，已跳过`);
      await this.chaoxing.studyEmptyPage(this.course, point);
      this._completedCount++;
      await this._sendProgress();
      return ChapterResult.SUCCESS;
    }

    await this._sendLog(`${label} (${jobs.length} 个任务)`);

    // 逐个处理 job，跳过已完成的
    let allSuccess = true;
    for (const job of jobs) {
      const jobName = job.name || job.jobid;
      const jobKey = job.jobid || jobName;
      // 同时用去掉 "work-" 前缀的 key，防止跨章节 jobid 格式差异导致重复提交
      const bareKey = jobKey.replace(/^work-/, '');
      const typeLabel = TYPE_LABEL[job.type] || (job.type || '任务');

      if (this._completedJobIds.has(jobKey) || this._completedJobIds.has(bareKey)) {
        await this._sendLog(`  ✅ ${typeLabel}: ${jobName} 已跳过（之前已完成）`);
        continue;
      }

      await this._sendLog(`  正在完成${typeLabel}: ${jobName}`);

      const result = await this._processJob(job, jobInfo);
      if (result !== StudyResult.SUCCESS) {
        allSuccess = false;
        await this._sendLog(`  ❌ ${typeLabel}: ${jobName} 失败`);
      } else {
        await this._sendLog(`  ✅ ${typeLabel}: ${jobName} 完成`);
        this._completedJobIds.add(jobKey);
        this._completedJobIds.add(bareKey);
      }
    }

    if (allSuccess) this._completedCount++;
    else this._errorCount++;

    await this._sendProgress();
    return allSuccess ? ChapterResult.SUCCESS : ChapterResult.ERROR;
  }

  // ===================== 任务分发 =====================

  async _processJob(job, jobInfo) {
    try {
      switch (job.type) {
        case 'video':
          return await processVideo(this.chaoxing, this.course, job, jobInfo, { speed: this.speed });
        case 'document':
          return await processDocument(this.chaoxing, this.course, job, jobInfo);
        case 'workid':
        case 'work':
          return await processWork(this.chaoxing, this.course, job, jobInfo);
        case 'read':
          return await processRead(this.chaoxing, this.course, job, jobInfo);
        case 'live':
          logger.info(`直播任务跳过: ${job.name || job.jobid}`);
          return StudyResult.SUCCESS;
        default:
          logger.warn(`未知任务类型: ${job.type || 'unknown'}`);
          return StudyResult.SUCCESS;
      }
    } catch (err) {
      logger.error(`任务异常: ${err.message}`);
      return StudyResult.ERROR;
    }
  }
}
