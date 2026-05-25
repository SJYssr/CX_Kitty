/**
 * 进程内刷课运行器（替代 fork）
 * @module server/study-runner
 */

import { Chaoxing } from '../../src/core/chaoxing.js';
import { JobProcessor } from '../../src/tasks/processor.js';
import { TikuDeepSeek } from '../../src/tiku/deepseek.js';
import bus from './log-bus.js';

// 写进度队列，防止并发写覆盖
const writeQueue = new Map();

async function enqueueWrite(taskId, fn) {
  if (!writeQueue.has(taskId)) writeQueue.set(taskId, Promise.resolve());
  const prev = writeQueue.get(taskId);
  const next = prev.then(() => fn()).catch(() => {});
  writeQueue.set(taskId, next);
  return next;
}
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
export async function runStudy(params) {
  const { phone, password, courseIds, speed, jobs, deepseekApiKey, autoSubmit, taskId, pool } = params;

  const updateStatus = async (status, progress) => {
    try {
      // 如果任务已被终止（新任务启动），不再覆盖其状态
      if (status !== 'failed') {
        const [rows] = await pool.query('SELECT status FROM study_tasks WHERE id = ?', [taskId]);
        if (rows.length > 0 && rows[0].status === 'terminated') return;
      }
      await pool.query(
        'UPDATE study_tasks SET status = ?, progress = ?, finished_at = NOW() WHERE id = ?',
        [status, progress || '{}', taskId]
      );
    } catch (e) { /* ignore */ }
  };

  const writeProgress = async (msg) => {
    return enqueueWrite(taskId, async () => {
    try {
      const [existing] = await pool.query('SELECT progress FROM study_tasks WHERE id = ?', [taskId]);
      let progData = { courses: {}, logs: [], timestamp: new Date().toISOString() };
      if (existing[0]?.progress) {
        try { progData = JSON.parse(existing[0].progress); } catch {}
      }
      if (!progData.courses) progData.courses = {};
      if (!progData.logs) progData.logs = [];

      if (msg.type === 'log' && msg.text) {
        // 日志消息：只追加日志，不动 courses（防止覆盖进度）
        const entry = { t: new Date().toLocaleTimeString(), text: msg.text };
        bus.emit('log:' + taskId, entry);
        progData.logs.push(entry);
        if (progData.logs.length > 200) progData.logs = progData.logs.slice(-200);
        // 如果 courses 意外被清空，从 DB 读到的原始数据恢复
        if (!progData.courses || Object.keys(progData.courses).length === 0) {
          if (existing[0]?.progress) {
            try {
              const raw = JSON.parse(existing[0].progress);
              if (raw.courses && Object.keys(raw.courses).length > 0) progData.courses = raw.courses;
            } catch {}
          }
        }
      } else if (msg.total > 0) {
        // 章节进度更新
        progData.courses[msg.courseId] = {
          title: msg.courseTitle,
          total: msg.total,
          completed: msg.completed
        };
      }
      // 其他类型（心跳等）只刷新时间戳
      progData.timestamp = new Date().toISOString();
      await pool.query('UPDATE study_tasks SET progress = ? WHERE id = ?', [JSON.stringify(progData), taskId]);
    } catch (e) { /* ignore */ }
    });
  };

  try {
    const tiku = (params.enableAnswering !== false) ? (() => {
      const t = new TikuDeepSeek(deepseekApiKey || '');
      t.initTiku({ SUBMIT: !!autoSubmit, COVER_RATE: 0.8 });
      return t;
    })() : null;

    // 每个任务创建独立的 session，避免串号
    const jar = new CookieJar();
    const standaloneSession = wrapper(axios.create({ jar, withCredentials: true, timeout: 30000 }));
    const chaoxing = new Chaoxing({ phone, password }, tiku, { speed: speed || 1, jobs: jobs || 3, _standaloneSession: standaloneSession });
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

      // 课程间随机延迟 10-30 秒
      if (ci > 0) {
        const delay = 10000 + Math.floor(Math.random() * 20000);
        await new Promise(r => setTimeout(r, delay));
      }

      const { points } = await chaoxing.getCoursePoint(course.courseId, course.clazzId, course.cpi);
      if (!points.length) continue;

      const processor = new JobProcessor(chaoxing, course, points, { speed, jobs });
      await processor.run();
    }

    await updateStatus('completed', JSON.stringify({ note: 'all_done' }));
  } catch (err) {
    await updateStatus('failed', JSON.stringify({ error: err.message }));
  }
}
