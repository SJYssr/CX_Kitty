import { Router } from 'express';
import { fork } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = Router();

// 获取课程列表 — fork 子进程隔离 SessionManager 单例
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

// 启动刷课任务
router.post('/study/start', async (req, res) => {
  try {
    const {
      phone, password,
      courseIds, speed = 1, jobs = 3,
      deepseekApiKey = '', deepseekModel = 'deepseek-v4-flash',
      enableAnswering = true, autoSubmit = false
    } = req.body;

    if (!phone || !password) return res.json({ success: false, message: '请填写完整' });

    // 先查/创建 account
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

    const [result] = await pool.query(
      `INSERT INTO study_tasks (account_id, course_ids, speed, jobs, status, started_at)
       VALUES (?, ?, ?, ?, 'running', NOW())`,
      [accounts[0].id, courseIds ? JSON.stringify(courseIds) : null, speed, jobs]
    );
    const taskId = result.insertId;

    const cliPath = path.resolve(__dirname, '../../../src/index.js');
    const args = ['-u', phone, '-p', password, '-s', String(speed), '-j', String(jobs), '--task-id', String(taskId)];
    if (courseIds?.length) args.push('-l', courseIds.join(','));

    // AI 配置
    if (!enableAnswering) {
      args.push('--tk-disable');
    } else {
      if (autoSubmit) args.push('--tk-submit');
      if (deepseekModel && deepseekModel !== 'deepseek-v4-flash') {
        args.push('--tk-model', deepseekModel);
      }
    }

    // 只传该用户的 API key
    const childEnv = { ...process.env };
    if (deepseekApiKey) {
      childEnv.DEEPSEEK_API_KEY = deepseekApiKey;
    }

    const child = fork(cliPath, args, {
      env: childEnv,
      stdio: ['pipe', 'pipe', 'pipe', 'ipc']
    });

    let output = '';
    child.stdout?.on('data', d => output += d.toString());
    child.stderr?.on('data', d => output += d.toString());

    child.on('exit', async (code) => {
      await pool.query(
        'UPDATE study_tasks SET status = ?, progress = ?, finished_at = NOW() WHERE id = ?',
        [code === 0 ? 'completed' : 'failed',
         JSON.stringify({ exitCode: code, output: output.slice(0, 5000) }), taskId]
      );
    });

    child.on('error', async (err) => {
      await pool.query(
        'UPDATE study_tasks SET status = ?, error = ?, finished_at = NOW() WHERE id = ?',
        ['failed', err.message, taskId]
      );
    });

    child.on('message', async (msg) => {
      if (msg.type === 'chapter_progress') {
        try {
          const [existing] = await pool.query(
            'SELECT progress FROM study_tasks WHERE id = ?', [taskId]
          );
          let progData = { courses: {}, timestamp: new Date().toISOString() };
          if (existing[0]?.progress) {
            try { progData = JSON.parse(existing[0].progress); } catch {}
          }
          if (!progData.courses) progData.courses = {};
          progData.courses[msg.courseId] = {
            title: msg.courseTitle,
            total: msg.total,
            completed: msg.completed
          };
          progData.timestamp = new Date().toISOString();
          await pool.query(
            'UPDATE study_tasks SET progress = ? WHERE id = ?',
            [JSON.stringify(progData), taskId]
          );
        } catch (e) { /* ignore */ }
      }
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
