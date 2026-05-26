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
    } catch (e) { /* ignore */ }
  };

  // 检查任务是否被终止（新任务替换了旧任务时）
  const checkTerminated = async () => {
    if (_terminated) return true;
    try {
      const [rows] = await pool.query('SELECT status FROM study_tasks WHERE id = ?', [taskId]);
      return rows.length > 0 && rows[0].status === 'terminated';
    } catch { return false; }
  };

  const writeProgress = async (msg) => {
    try {
      if (msg.type === 'log' && msg.text) {
        // 任务被终止后不再发射事件和写DB
        if (_terminated) return;

        const entry = { t: new Date().toLocaleTimeString('zh-CN', { hour12: false }), text: msg.text };
        bus.emit('log:' + taskId, entry);
        // 只追加日志，不碰 courses - 使用 JSON_SET 直接操作
        await pool.query(
          `UPDATE study_tasks SET progress = JSON_SET(
            COALESCE(progress, '{}'),
            '$.timestamp', ?,
            '$.logs', COALESCE(JSON_ARRAY_APPEND(JSON_EXTRACT(progress, '$.logs'), '$', CAST(? AS JSON)), JSON_ARRAY(CAST(? AS JSON)))
          ) WHERE id = ?`,
          [new Date().toISOString(), JSON.stringify(entry), JSON.stringify(entry), taskId]
        ).catch(() => {});
        return;
      }

      if (msg.total > 0) {
        // 章节进度：只更新 courses，不碰 logs
        const cid = String(msg.courseId).replace(/[^a-zA-Z0-9_]/g, '');
        if (!cid) return;
        const courseData = JSON.stringify({ title: msg.courseTitle, total: msg.total, completed: msg.completed });
        await pool.query(
          `UPDATE study_tasks SET progress = JSON_SET(
            JSON_SET(COALESCE(progress, '{}'), '$.courses', COALESCE(JSON_EXTRACT(progress, '$.courses'), CAST('{}' AS JSON))),
            '$.timestamp', ?,
            '$.courses."${cid}"', CAST(? AS JSON)
          ) WHERE id = ?`,
          [new Date().toISOString(), courseData, taskId]
        ).catch(() => {});
        return;
      }

      // 心跳：只更新时间戳
      await pool.query(
        `UPDATE study_tasks SET progress = JSON_SET(COALESCE(progress, '{}'), '$.timestamp', ?) WHERE id = ?`,
        [new Date().toISOString(), taskId]
      ).catch(() => {});
    } catch (e) { /* ignore */ }
  };

  try {
    const tiku = (params.enableAnswering !== false) ? (() => {
      const t = new TikuDeepSeek(deepseekApiKey || '', deepseekModel || 'deepseek-v4-pro');
      t.initTiku({ SUBMIT: !!autoSubmit, COVER_RATE: 0.8 });
      return t;
    })() : null;

    // 每个任务创建独立的 session，避免串号
    const jar = new CookieJar();
    const standaloneSession = wrapper(axios.create({ jar, withCredentials: true, timeout: 30000 }));
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
