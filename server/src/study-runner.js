/**
 * 进程内刷课运行器（替代 fork）
 * @module server/study-runner
 */

import { Chaoxing } from '../../src/core/chaoxing.js';
import { SessionManager } from '../../src/core/session.js';
import { JobProcessor } from '../../src/tasks/processor.js';
import { TikuDeepSeek } from '../../src/tiku/deepseek.js';

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
      await pool.query(
        'UPDATE study_tasks SET status = ?, progress = ?, finished_at = NOW() WHERE id = ?',
        [status, progress || '{}', taskId]
      );
    } catch (e) { /* ignore */ }
  };

  const writeProgress = async (msg) => {
    try {
      const [existing] = await pool.query('SELECT progress FROM study_tasks WHERE id = ?', [taskId]);
      let progData = { courses: {}, timestamp: new Date().toISOString() };
      if (existing[0]?.progress) {
        try { progData = JSON.parse(existing[0].progress); } catch {}
      }
      if (!progData.courses) progData.courses = {};
      // total > 0 时才是真正的章节进度更新，否则只刷新时间戳（心跳）
      if (msg.total > 0) {
        progData.courses[msg.courseId] = {
          title: msg.courseTitle,
          total: msg.total,
          completed: msg.completed
        };
      }
      progData.timestamp = new Date().toISOString();
      await pool.query('UPDATE study_tasks SET progress = ? WHERE id = ?', [JSON.stringify(progData), taskId]);
    } catch (e) { /* ignore progress errors */ }
  };

  try {
    const tiku = new TikuDeepSeek(deepseekApiKey || '');
    tiku.initTiku({ SUBMIT: !!autoSubmit, COVER_RATE: 0.8 });

    new SessionManager();
    const chaoxing = new Chaoxing({ phone, password }, tiku, { speed: speed || 1, jobs: jobs || 3 });
    chaoxing._taskId = taskId;
    chaoxing._onProgress = writeProgress;

    const loginResult = await chaoxing.login(true);
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

    for (const course of targetCourses) {
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
