/**
 * 进程内刷课运行器（替代 fork）
 * @module server/study-runner
 */

import { Chaoxing } from '../../src/core/chaoxing.js';
import { RateLimiter } from '../../src/core/ratelimiter.js';
import { JobProcessor } from '../../src/tasks/processor.js';
import { TikuDeepSeek } from '../../src/tiku/deepseek.js';
import bus from './log-bus.js';
import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';

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
const GLOBAL_THROTTLE = new RateLimiter(200);

export async function runStudy(params) {
  const { phone, password, courseIds, speed, jobs, deepseekApiKey, deepseekModel, autoSubmit, taskId, pool } = params;

  let _terminated = false;
  // 写进度锁 — 防止并发 writeProgress 互相覆盖
  let _progressLock = Promise.resolve();

  const updateStatus = async (status, progress) => {
    try {
      // 如果任务已被终止（新任务启动），不再覆盖其状态
      if (status !== 'failed') {
        const [rows] = await pool.query('SELECT status FROM study_tasks WHERE id = ?', [taskId]);
        if (rows.length > 0 && rows[0].status === 'terminated') {
          _terminated = true;
          return;
        }
      }
      await pool.query(
        'UPDATE study_tasks SET status = ?, progress = ?, finished_at = NOW() WHERE id = ?',
        [status, progress || '{}', taskId]
      );
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

  // 检查任务是否被终止（新任务替换了旧任务时）
  const checkTerminated = async () => {
    if (_terminated) return true;
    try {
      const [rows] = await pool.query('SELECT status FROM study_tasks WHERE id = ?', [taskId]);
      if (rows.length > 0 && rows[0].status === 'terminated') {
        _terminated = true;
        abortController.abort(); // 中止正在跑的 HTTP 请求
        return true;
      }
      return false;
    } catch (e) { console.warn('checkTerminated 失败: ' + (e.message || e)); return false; }
  };

  /** 读取当前进度 (JS 操作避免复杂 JSON_SET) */
  const readProgress = async () => {
    try {
      const [rows] = await pool.query('SELECT progress FROM study_tasks WHERE id = ?', [taskId]);
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
    // 串行化写入：通过锁保证每次 read-modify-write 是原子的
    await withProgressLock(async () => {
      try {
        const p = await readProgress();
        p.timestamp = new Date().toISOString();

        if (msg.type === 'log' && msg.text) {
          if (_terminated) return;
          const entry = { t: new Date().toLocaleTimeString('zh-CN', { hour12: false }), text: msg.text };
          bus.emit('log:' + taskId, entry);
          // 写入独立 task_logs 表
          await pool.query(
            'INSERT INTO task_logs (task_id, time, text) VALUES (?, ?, ?)',
            [taskId, entry.t, entry.text]
          );
          // 同时保留在 progress.logs 中（前端旧版兼容）
          if (!Array.isArray(p.logs)) p.logs = [];
          p.logs.push(entry);
          await pool.query('UPDATE study_tasks SET progress = ? WHERE id = ?', [JSON.stringify(p), taskId]);
          return;
        }

        if (msg.total > 0) {
          if (!p.courses) p.courses = {};
          const cid = String(msg.courseId).replace(/[^a-zA-Z0-9_]/g, '');
          if (cid) {
            p.courses[cid] = { title: msg.courseTitle, total: msg.total, completed: msg.completed };
          }
          await pool.query('UPDATE study_tasks SET progress = ? WHERE id = ?', [JSON.stringify(p), taskId]);
          return;
        }

        // 心跳：只更新时间戳
        await pool.query('UPDATE study_tasks SET progress = ? WHERE id = ?', [JSON.stringify(p), taskId]);
      } catch (e) {
        console.warn('writeProgress 失败: ' + e.message);
      }
    });
  };

  try {
    const tiku = (params.enableAnswering !== false) ? (() => {
      const t = new TikuDeepSeek(deepseekApiKey || '', deepseekModel);
      t.initTiku({ SUBMIT: !!autoSubmit, COVER_RATE: 0.8 });
      return t;
    })() : null;

    // 每个任务创建独立的 session，避免串号
    const jar = new CookieJar();
    const abortController = new AbortController();
    const standaloneSession = wrapper(axios.create({ jar, withCredentials: true, timeout: 30000, signal: abortController.signal }));
    const chaoxing = new Chaoxing({ phone, password }, tiku, {
      speed: 1,
      jobs: 1,
      _standaloneSession: standaloneSession,
      _globalThrottle: GLOBAL_THROTTLE
    });
    chaoxing._taskId = taskId;
    chaoxing._onProgress = writeProgress;

    // 强制密码登录，避免 SessionManager 单例串号
    const loginResult = await chaoxing.login(false);
    if (!loginResult.status) {
      await updateStatus('failed', JSON.stringify({ error: '登录失败: ' + loginResult.msg }));
      return;
    }

    const allCourses = await chaoxing.getCourseList();

    // 用户没选课 → 不刷，直接完成
    if (!courseIds || courseIds.length === 0) {
      await updateStatus('completed', JSON.stringify({ note: '未选择课程' }));
      return;
    }

    // 筛选用户选择的课程
    let targetCourses = allCourses.filter(c => courseIds.includes(c.courseId));
    if (targetCourses.length === 0) {
      // 一个都没匹配上 → 不刷
      await updateStatus('completed', JSON.stringify({ note: '所选课程ID无效，请重新选择' }));
      return;
    }

    for (let ci = 0; ci < targetCourses.length; ci++) {
      const course = targetCourses[ci];

      // 课程间随机延迟 10-30 秒前检查是否被终止
      if (ci > 0) {
        if (await checkTerminated()) return;
        const delay = 10000 + Math.floor(Math.random() * 20000);
        await new Promise(r => setTimeout(r, delay));
      }

      // 每次 getCoursePoint 后检查是否被终止
      const { points } = await chaoxing.getCoursePoint(course.courseId, course.clazzId, course.cpi);
      if (await checkTerminated()) return;
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

    await updateStatus('completed', JSON.stringify({ note: 'all_done' }));
  } catch (err) {
    await updateStatus('failed', JSON.stringify({ error: err.message }));
  }
}
