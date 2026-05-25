import { Router } from 'express';
import { fork } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../db.js';
import { runStudy } from '../study-runner.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = Router();

// 获取课程列表 — fork 子进程隔离 SessionManager 单例
// 系统状态
router.get('/system/status', async (req, res) => {
  try {
    const [taskRows] = await pool.query("SELECT COUNT(*) AS count FROM study_tasks WHERE status = 'running'");
    const [userRows] = await pool.query('SELECT COUNT(*) AS count FROM accounts');
    res.json({ success: true, runningTasks: taskRows[0].count, maxTasks: 100, totalUsers: userRows[0].count });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

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

    const child = fork(path.resolve(__dirname, '../get-courses.js'), [phone, password], {
      stdio: ['pipe', 'pipe', 'pipe', 'ipc']
    });

    const timeout = setTimeout(() => {
      child.kill();
      res.json({ success: false, message: '登录超时' });
    }, 30000);

    child.on('message', (msg) => {
      clearTimeout(timeout);
      res.json(msg);
    });

    child.on('exit', (code) => {
      clearTimeout(timeout);
      if (!res.headersSent) {
        res.json({ success: false, message: `子进程退出 (code=${code})` });
      }
    });

    child.on('error', () => {
      clearTimeout(timeout);
      if (!res.headersSent) {
        res.json({ success: false, message: '子进程异常' });
      }
    });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// 启动刷课任务（进程内运行，无需 fork）
router.post('/study/start', async (req, res) => {
  try {
    const {
      phone, password, courseIds, speed = 1, jobs = 3,
      deepseekApiKey = '', autoSubmit = false
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
    const taskId = result.insertId;

    // 后台运行（不阻塞 HTTP）
    runStudy({ phone, password, courseIds, speed, jobs, deepseekApiKey, autoSubmit, taskId, pool })
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
    const [rows] = await pool.query(
      'SELECT id, course_ids, status, speed, jobs, started_at, finished_at, progress, error FROM study_tasks WHERE id = ?',
      [req.params.taskId]
    );
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
    sql += ' ORDER BY id DESC LIMIT 20';
    const [rows] = await pool.query(sql, params);
    res.json({ success: true, tasks: rows });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

export default router;
