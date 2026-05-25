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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 作业调度处理器
 */
export class JobProcessor {
  /**
   * @param {import('../core/chaoxing.js').Chaoxing} chaoxing
   * @param {Object} course — { courseId, clazzId, cpi, title }
   * @param {Array<{id: string, title: string, jobCount: number, hasFinished: boolean, needUnlock: boolean}>} chapterPoints
   * @param {Object} [config]
   * @param {number} [config.speed=1] — 倍速
   * @param {number} [config.jobs=3] — 并行 chapter 数量
   * @param {string} [config.notopenAction='continue'] — retry|continue
   */
  constructor(chaoxing, course, chapterPoints, config = {}) {
    this.chaoxing = chaoxing;
    this.course = course;
    this.chapterPoints = chapterPoints;
    this.speed = config.speed || 1;
    this.jobs = config.jobs || 3;
    this.notopenAction = config.notopenAction || 'continue';

    /** 重试队列 */
    this.retryQueue = [];
    this.maxRetries = 5;
  }

  /**
   * 执行所有章节任务
   * @returns {Promise<void>}
   */
  async run() {
    logger.info(`课程: ${this.course.title || this.course.courseId}`);
    logger.info(`章节: ${this.chapterPoints.length}, 并行: ${this.jobs}`);

    // 按顺序并发处理章节
    const tasks = this.chapterPoints.map((point, i) => () =>
      this._processChapter(point, i, this.chapterPoints.length)
    );

    // 限制并发
    const results = [];
    for (let i = 0; i < tasks.length; i += this.jobs) {
      const batch = tasks.slice(i, i + this.jobs);
      const batchResults = await Promise.all(batch.map(t => t()));
      results.push(...batchResults);

      if (this.chaoxing._taskId) {
        const doneCount = results.filter(r => r === ChapterResult.SUCCESS).length;
        const msg = {
          type: 'chapter_progress',
          taskId: this.chaoxing._taskId,
          courseTitle: this.course.title,
          courseId: this.course.courseId,
          total: this.chapterPoints.length,
          completed: doneCount
        };
        if (typeof process.send === 'function') process.send(msg);
        if (typeof this.chaoxing._onProgress === 'function') this.chaoxing._onProgress(msg);
      }
    }

    // 处理重试队列
    await this._processRetryQueue();

    // 统计结果
    const successCount = results.filter(r => r === ChapterResult.SUCCESS).length;
    const errorCount = results.filter(r => r === ChapterResult.ERROR).length;
    const notOpenCount = results.filter(r => r === ChapterResult.NOT_OPEN).length;

    logger.info(`完成: 成功${successCount} 失败${errorCount} 未开放${notOpenCount}`);
  }

  /**
   * 处理单个章节
   * @private
   */
  async _processChapter(point, index, total) {
    const label = `[${index + 1}/${total}] ${point.title || point.id}`;

    if (point.hasFinished) {
      logger.info(`${label} 已完成，跳过`);
      return ChapterResult.SUCCESS;
    }

    // 获取任务列表
    const { jobs, jobInfo, notOpen } = await this.chaoxing.getJobList(this.course, point);

    if (notOpen) {
      logger.warn(`${label} 章节未开放`);
      if (this.notopenAction === 'retry') {
        this.retryQueue.push({ point, jobs, jobInfo, retries: 0 });
      }
      return ChapterResult.NOT_OPEN;
    }

    if (!jobs.length) {
      logger.info(`${label} 空章节`);
      await this.chaoxing.studyEmptyPage(this.course, point);
      return ChapterResult.SUCCESS;
    }

    logger.info(`${label} (${jobs.length} 个任务)`);

    // 处理每个 job，完成后实时上报进度
    let jobDone = 0;
    for (const job of jobs) {
      await this._processJob(job, jobInfo);
      jobDone++;
      this._sendProgress();
    }

    return ChapterResult.SUCCESS;
  }

  /**
   * 处理单个任务
   * @private
   */
  async _processJob(job, jobInfo) {
    let result = StudyResult.ERROR;

    try {
      switch (job.type) {
        case 'video':
          result = await processVideo(this.chaoxing, this.course, job, jobInfo, { speed: this.speed });
          break;
        case 'document':
          result = await processDocument(this.chaoxing, this.course, job, jobInfo);
          break;
        case 'workid':
        case 'work':
          result = await processWork(this.chaoxing, this.course, job, jobInfo);
          break;
        case 'read':
          result = await processRead(this.chaoxing, this.course, job, jobInfo);
          break;
        case 'live':
          logger.info(`直播任务跳过: ${job.name || job.jobid}`);
          result = StudyResult.SUCCESS;
          break;
        default:
          logger.warn(`未知任务类型: ${job.type || 'unknown'}`);
          result = StudyResult.SUCCESS;
      }
    } catch (err) {
      logger.error(`任务异常: ${err.message}`);
      result = StudyResult.ERROR;
    }

    return result;
  }

  /**
   * 处理重试队列
   * @private
   */
  async _processRetryQueue() {
    while (this.retryQueue.length > 0) {
      const entry = this.retryQueue.shift();

      if (entry.retries >= this.maxRetries) {
        logger.warn(`章节重试超限: ${entry.point.title}`);
        continue;
      }

      await sleep(5000); // 重试前等待

      const { jobs, jobInfo, notOpen } = await this.chaoxing.getJobList(this.course, entry.point);

      if (notOpen) {
        entry.retries++;
        this.retryQueue.push(entry);
        continue;
      }

      logger.info(`重试章节: ${entry.point.title}`);
      for (const job of jobs) {
        await this._processJob(job, jobInfo);
      }
    }
  }

  _sendProgress() {
    if (!this.chaoxing._taskId) return;
    if (typeof this.chaoxing._onProgress !== 'function' && typeof process.send !== 'function') return;
    // Just send a heartbeat to update timestamp, don't overwrite completed count
    const msg = {
      type: 'heartbeat',
      taskId: this.chaoxing._taskId,
      courseTitle: this.course.title,
      courseId: this.course.courseId
    };
    if (typeof process.send === 'function') process.send(msg);
    if (typeof this.chaoxing._onProgress === 'function') this.chaoxing._onProgress(msg);
  }
}
