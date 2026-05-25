import { Router } from 'express';
import pool from '../db.js';
import { runStudy } from '../study-runner.js';
import bus from '../log-bus.js';
import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';

const router = Router();

// 获取课程列表 — fork 子进程隔离 SessionManager 单例
// 系统状态
router.get('/system/task-count', async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT COUNT(*) AS count FROM study_tasks WHERE status = 'running'"
    );
    res.json({ success: true, count: rows[0].count, max: 100 });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

router.post('/courses', async (req, res) => {
  try {
    const { phone, password } = req.body;
    if (!phone || !password) return res.json({ success: false, message: '请填写完整' });

    const jar = new CookieJar();
    const standalone = wrapper(axios.create({ jar, withCredentials: true, timeout: 30000 }));
    const { Chaoxing } = await import('../../../src/core/chaoxing.js');
    const chaoxing = new Chaoxing({ phone, password }, null, { speed: 1, jobs: 3, _standaloneSession: standalone });

    const loginResult = await chaoxing.login(false);
    if (!loginResult.status) return res.json({ success: false, message: loginResult.msg || '登录失败' });

    const courses = await chaoxing.getCourseList();
    res.json({ success: true, courses });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// 启动刷课任务（进程内运行，无需 fork）
router.post('/study/start', async (req, res) => {
  try {
    const {
      phone, password, courseIds, speed = 1, jobs = 3,
      deepseekApiKey = '', autoSubmit = false, enableAnswering = true
    } = req.body;

    if (!phone || !password) return res.json({ success: false, message: '请填写完整' });

    // 查/创建 account
    let [accounts] = await pool.query(
      'SELECT id FROM accounts WHERE phone = ?', [phone]
    );
    if (!accounts.length) {
      const [insertRes] = await pool.query(
        'INSERT INTO accounts (phone, password, deepseek_api_key, status) VALUES (?, ?, ?, ?)',
        [phone, password, deepseekApiKey || '', 'active']
      );
      accounts = [{ id: insertRes.insertId }];
    }

    // 终止该账号所有正在运行的任务
    await pool.query(
      'UPDATE study_tasks SET status = ?, finished_at = NOW() WHERE account_id = ? AND status = ?',
      ['terminated', accounts[0].id, 'running']
    );

    // 创建新任务记录
    const [result] = await pool.query(
      `INSERT INTO study_tasks (account_id, course_ids, speed, jobs, status, started_at)
       VALUES (?, ?, ?, ?, 'running', NOW())`,
      [accounts[0].id, courseIds ? JSON.stringify(courseIds) : null, speed, jobs]
    );

    // 每个用户只保留最新 2 条记录
    const [toKeep] = await pool.query(
      'SELECT id FROM study_tasks WHERE account_id = ? ORDER BY id DESC LIMIT 2',
      [accounts[0].id]
    );
    if (toKeep.length > 0) {
      await pool.query(
        'DELETE FROM study_tasks WHERE account_id = ? AND id NOT IN (?)',
        [accounts[0].id, toKeep.map(r => r.id)]
      );
    }
    const taskId = result.insertId;

    // 后台运行（不阻塞 HTTP）
    runStudy({ phone, password, courseIds, speed, jobs, deepseekApiKey, autoSubmit, enableAnswering, taskId, pool })
      .catch(err => {
        pool.query(
          'UPDATE study_tasks SET status = ?, error = ?, finished_at = NOW() WHERE id = ?',
          ['failed', err.message || String(err), taskId]
        ).catch(() => {});
      });

    res.json({ success: true, taskId });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

router.get('/study/status/:taskId', async (req, res) => {
  try {
    const phone = req.query.phone || '';
    let sql = 'SELECT id, course_ids, status, speed, jobs, started_at, finished_at, progress, error FROM study_tasks WHERE id = ?';
    const params = [req.params.taskId];
    if (phone) {
      sql += ' AND account_id = (SELECT id FROM accounts WHERE phone = ?)';
      params.push(phone);
    }
    const [rows] = await pool.query(sql, params);
    res.json({ success: true, task: rows[0] || null });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// 终止任务
router.post('/study/terminate/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    await pool.query(
      'UPDATE study_tasks SET status = ?, finished_at = NOW() WHERE id = ? AND status = ?',
      ['terminated', taskId, 'running']
    );
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

router.get('/study/tasks', async (req, res) => {
  try {
    const phone = req.query.phone || '';
    let sql = 'SELECT id, course_ids, speed, jobs, status, progress, started_at, finished_at, error FROM study_tasks';
    let params = [];
    if (phone) {
      sql += ' WHERE account_id = (SELECT id FROM accounts WHERE phone = ?)';
      params.push(phone);
    }
    sql += ' ORDER BY id DESC LIMIT 2';
    const [rows] = await pool.query(sql, params);
    res.json({ success: true, tasks: rows });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// 实时日志 SSE
router.get('/study/logs/:taskId', (req, res) => {
  const taskId = req.params.taskId;
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.write(':\n\n'); // 初始化

  const onLog = (entry) => {
    try { res.write(`data: ${JSON.stringify(entry)}\n\n`); } catch {}
  };

  bus.on('log:' + taskId, onLog);

  // 30秒心跳保活，防止Node.js默认2分钟超时断线
  const keepAlive = setInterval(() => {
    try { res.write(': ping\n\n'); } catch { clearInterval(keepAlive); }
  }, 30000);

  req.on('close', () => {
    clearInterval(keepAlive);
    bus.off('log:' + taskId, onLog);
  });
});

export default router;
