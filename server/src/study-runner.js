/**
 * 进程内刷课运行器（替代 fork）
 * @module server/study-runner
 */

import { createStandalone } from '../../src/core/factory.js';
import { RateLimiter } from '../../src/core/ratelimiter.js';
import { JobProcessor } from '../../src/tasks/processor.js';
import { TikuDeepSeek } from '../../src/tiku/deepseek.js';
import { sendTaskComplete } from '../../src/notify/email.js';
import { Account } from './models/account.js';
import { StudyTask } from './models/study-task.js';
import cfg from '../../src/config.js';
import bus from './log-bus.js';

/**
 * 在进程内运行刷课任务
 * @param {Object} params
 * @param {string} params.phone
 * @param {string} params.password
 * @param {string[]} [params.courseIds]
 * @param {number} [params.speed=1]
 * @param {number} [params.jobs=3]
 * @param {string} [params.deepseekApiKey]
 * @param {boolean} [params.autoSubmit]
 * @param {number} params.taskId
 * @param {Object} params.pool — mysql2/promise pool
 */
// 全局节流器 — 所有任务共用，控制对超星的整体请求频率
const GLOBAL_THROTTLE = new RateLimiter(cfg.globalThrottle);

export async function runStudy(params) {
  const { phone, password, courseIds, speed, jobs, deepseekApiKey, deepseekModel, autoSubmit, coverRate, taskId } = params;

  let _terminated = false;
  let _progressLock = Promise.resolve();

  const abortController = new AbortController();
  bus.once('terminate:' + taskId, () => {
    _terminated = true;
    abortController.abort();
  });

  // 任务结束时清理视频缓存
  const _cleanupVideoCache = () => {
    bus._videoCache.delete(taskId);
  };

  const updateStatus = async (status, progress) => {
    try {
      if (status !== 'failed') {
        const [rows] = await StudyTask.getStatus(taskId);
        if (rows.length > 0 && rows[0].status === 'terminated') {
          _terminated = true;
          return;
        }
      }
      await StudyTask.updateStatus(taskId, status, progress);
    } catch (e) { console.warn('updateStatus 失败: ' + (e.message || e)); }
  };

  // 串行化进度写入，防止并发覆盖
  const withProgressLock = async (fn) => {
    const prev = _progressLock;
    let release;
    _progressLock = new Promise(r => { release = r; });
    await prev;
    try {
      return await fn();
    } finally {
      release();
    }
  };

  const readProgress = async () => {
    try {
      const [rows] = await StudyTask.readProgress(taskId);
      if (rows.length && rows[0].progress) {
        return typeof rows[0].progress === 'string'
          ? JSON.parse(rows[0].progress)
          : rows[0].progress;
      }
    } catch (e) {
      console.warn('readProgress 失败: ' + (e.message || e));
    }
    return {};
  };

  const writeProgress = async (msg) => {
    // 日志消息：无锁，SSE 即时推送 + 独立表写入，不阻塞进度更新
    if (msg.type === 'log' && msg.text) {
      if (_terminated) return;
      const entry = { t: new Date().toLocaleTimeString('zh-CN', { hour12: false }), text: msg.text };
      bus.emit('log:' + taskId, entry);
      StudyTask.insertLog(taskId, entry.t, entry.text).catch(e =>
        console.warn('insertLog 失败: ' + (e.message || e))
      );
      return;
    }

    // 视频进度：SSE 实时推送 + 缓存（支持多视频并发）
    if (msg.type === 'video_progress') {
      if (_terminated) return;
      const data = { name: msg.name, currentTime: msg.currentTime, duration: msg.duration };
      bus.updateVideo(taskId, data);
      bus.emit('video:' + taskId, { videos: bus.getActiveVideos(taskId) });
      return;
    }

    // 视频完成：从活跃列表移除
    if (msg.type === 'video_done') {
      bus.removeVideo(taskId, msg.name);
      bus.emit('video:' + taskId, { videos: bus.getActiveVideos(taskId) });
      return;
    }

    // 进度/心跳：串行化 read-modify-write，防止并发覆盖
    await withProgressLock(async () => {
      try {
        const p = await readProgress();
        p.timestamp = new Date().toISOString();

        if (msg.total > 0) {
          if (!p.courses) p.courses = {};
          const cid = String(msg.courseId).replace(/[^a-zA-Z0-9_]/g, '');
          if (cid) {
            p.courses[cid] = { title: msg.courseTitle, total: msg.total, completed: msg.completed };
          }
          await StudyTask.updateProgress(taskId, p);
          return;
        }

        // 心跳：只更新时间戳
        await StudyTask.updateProgress(taskId, p);
      } catch (e) {
        console.warn('writeProgress 失败: ' + e.message);
      }
    });
  };

  try {
    const tiku = (params.enableAnswering !== false) ? (() => {
      const t = new TikuDeepSeek(deepseekApiKey || '', deepseekModel);
      t.initTiku({ SUBMIT: !!autoSubmit, COVER_RATE: coverRate ?? 0.8 });
      return t;
    })() : null;

    // 每个任务创建独立的 session，避免串号
    const chaoxing = createStandalone({ phone, password }, {
      tiku,
      globalThrottle: GLOBAL_THROTTLE
    });
    // 给独立 session 挂上 abort signal
    if (chaoxing.axios?.defaults) {
      chaoxing.axios.defaults.signal = abortController.signal;
    }
    chaoxing._taskId = taskId;
    chaoxing._onProgress = writeProgress;
    chaoxing._abortController = abortController;
    chaoxing.__terminated = false;

    // 输出自动答题/提交配置日志
    const answeringEnabled = !!tiku;
    const autoSubmitEnabled = !!(tiku && tiku.SUBMIT);
    await writeProgress({ type: 'log', text: '自动答题：' + (answeringEnabled ? '已开启' : '未开启（缺少 DeepSeek API Key 或已关闭）') });
    await writeProgress({ type: 'log', text: '自动提交：' + (autoSubmitEnabled ? '已开启' : '未开启（仅保存答案，不提交）') });

    // 强制密码登录，避免 SessionManager 单例串号
    const loginResult = await chaoxing.login(false);
    if (!loginResult.status) {
      await updateStatus('failed', JSON.stringify({ error: '登录失败: ' + loginResult.msg }));
      return;
    }

    // 尝试拉取预上传的人脸图片（对应 Python main.py:356-358）
    if (cfg.fetchUploadedFace !== false) {
      try {
        const faceUrl = await chaoxing.fetchFace();
        if (faceUrl) await chaoxing.saveFace(faceUrl);
      } catch {} // 拉取失败不影响主流程
    }

    if (_terminated) return;

    const allCourses = await chaoxing.getCourseList();

    // 用户没选课 → 不刷，直接完成
    if (!courseIds || courseIds.length === 0) {
      await updateStatus('completed', JSON.stringify({ note: '未选择课程' }));
      return;
    }

    // 筛选用户选择的课程
    let targetCourses = allCourses.filter(c => courseIds.includes(c.courseId));
    if (targetCourses.length === 0) {
      await updateStatus('completed', JSON.stringify({ note: '所选课程ID无效，请重新选择' }));
      return;
    }

    for (let ci = 0; ci < targetCourses.length; ci++) {
      const course = targetCourses[ci];

      // 课程间随机延迟 10-30 秒
      if (ci > 0) {
        if (_terminated) return;
        const delay = 10000 + Math.floor(Math.random() * 20000);
        await new Promise(r => setTimeout(r, delay));
      }

      if (_terminated) return;

      const { points } = await chaoxing.getCoursePoint(course.courseId, course.clazzId, course.cpi);
      if (_terminated) return;
      if (!points.length) continue;

      // 立即写入初始进度，让前端尽早显示 "0/N 章节"
      if (chaoxing._onProgress) {
        await chaoxing._onProgress({
          type: 'chapter_progress',
          courseTitle: course.title,
          courseId: course.courseId,
          total: points.length,
          completed: 0
        });
      }

      const processor = new JobProcessor(chaoxing, course, points, { speed, jobs });
      await processor.run();
    }

    // 用 targetCourses 的完整标题，避免 progress JSON 中 courseTitle 被截断或遗漏
    const courseNames = targetCourses.map(c => c.title);

    await updateStatus('completed', JSON.stringify({ note: 'all_done' }));
    if (_terminated) { _cleanupVideoCache(); return; }

    // 发送完成通知邮件
    try {
      const [userRows] = await Account.getNotifyEmail(phone);
      if (userRows.length > 0 && userRows[0].notify_email) {
        const [taskRows] = await StudyTask.getTimestamps(taskId);
        if (taskRows.length > 0) {

          const fmt = (d) => {
            if (!d) return '—';
            const dt = new Date(d);
            return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')} ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}:${String(dt.getSeconds()).padStart(2,'0')}`;
          };

          await sendTaskComplete(
            userRows[0].notify_email,
            phone,
            fmt(taskRows[0].started_at),
            fmt(taskRows[0].finished_at || new Date()),
            courseNames
          );
        }
      }
    } catch (e) {
      console.warn('发送任务完成邮件失败: ' + (e.message || e));
    }
  } catch (err) {
    if (!_terminated) {
      await updateStatus('failed', JSON.stringify({ error: err.message }));
    }
  } finally {
    _cleanupVideoCache();
  }
}
