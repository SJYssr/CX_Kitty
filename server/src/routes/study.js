import { Router } from 'express';
import pool from '../db.js';
import { runStudy } from '../study-runner.js';
import bus from '../log-bus.js';
import { sanitizeError } from '../error.js';

const router = Router();

// 启动刷课任务
router.post('/study/start', async (req, res) => {
  try {
    const {
      phone, password, courseIds
    } = req.body;

    if (!phone || !password) return res.json({ success: false, message: '请填写完整' });

    // 从 DB 读取账号配置（答题开关、自动提交、模型、DeepSeek Key）
    let [accounts] = await pool.query(
      'SELECT id, deepseek_api_key, deepseek_model, enable_answering, auto_submit FROM accounts WHERE phone = ?', [phone]
    );
    if (!accounts.length) {
      const [insertRes] = await pool.query(
        'INSERT INTO accounts (phone, password, status) VALUES (?, ?, ?)',
        [phone, password, 'active']
      );
      accounts = [{ id: insertRes.insertId, deepseek_api_key: '', deepseek_model: 'deepseek-v4-pro', enable_answering: 1, auto_submit: 0 }];
    }

    const deepseekApiKey = accounts[0].deepseek_api_key || '';
    const deepseekModel = accounts[0].deepseek_model || 'deepseek-v4-pro';
    const enableAnswering = accounts[0].enable_answering !== 0;
    const autoSubmit = !!accounts[0].auto_submit;

    // 如果开启了答题但没有 API Key，返回错误
    if (enableAnswering && !deepseekApiKey) {
      return res.json({ success: false, message: '请先在配置中设置 DeepSeek API Key 后再启动刷课' });
    }

    // 终止该账号所有正在运行的任务
    await pool.query(
      'UPDATE study_tasks SET status = ?, finished_at = NOW() WHERE account_id = ? AND status = ?',
      ['terminated', accounts[0].id, 'running']
    );

    // 创建新任务记录
    const [result] = await pool.query(
      `INSERT INTO study_tasks (account_id, course_ids, speed, jobs, status, started_at)
       VALUES (?, ?, 1, 1, 'running', NOW())`,
      [accounts[0].id, courseIds ? JSON.stringify(courseIds) : null]
    );

    // 每个用户只保留最新 2 条记录
    const [toKeep] = await pool.query(
      'SELECT id FROM study_tasks WHERE account_id = ? ORDER BY id DESC LIMIT 2',
      [accounts[0].id]
    );
    if (toKeep.length > 0) {
      // 先删对应的 task_logs
      await pool.query(
        'DELETE FROM task_logs WHERE task_id IN (SELECT id FROM study_tasks WHERE account_id = ? AND id NOT IN (?))',
        [accounts[0].id, toKeep.map(r => r.id)]
      );
      await pool.query(
        'DELETE FROM study_tasks WHERE account_id = ? AND id NOT IN (?)',
        [accounts[0].id, toKeep.map(r => r.id)]
      );
    }
    const taskId = result.insertId;

    // 后台运行（不阻塞 HTTP）
    runStudy({ phone, password, courseIds, speed: 1, jobs: 1, deepseekApiKey, deepseekModel, autoSubmit, enableAnswering, taskId, pool })
      .catch(err => {
        pool.query(
          'UPDATE study_tasks SET status = ?, error = ?, finished_at = NOW() WHERE id = ?',
          ['failed', err.message || String(err), taskId]
        ).catch(() => {});
      });

    res.json({ success: true, taskId });
  } catch (err) {
    res.json({ success: false, message: sanitizeError(err) });
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
    res.json({ success: false, message: sanitizeError(err) });
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
    res.json({ success: false, message: sanitizeError(err) });
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
    res.json({ success: false, message: sanitizeError(err) });
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

  // 检查 phone 参数验证用户对该任务的归属
  const phone = req.query.phone;
  if (phone) {
    pool.query(
      'SELECT id FROM study_tasks WHERE id = ? AND account_id = (SELECT id FROM accounts WHERE phone = ?)',
      [taskId, phone]
    ).then(([rows]) => {
      if (!rows.length) {
        res.writeHead(403);
        res.end('forbidden');
        return;
      }
    }).catch(() => {});
  }

  let destroyed = false;

  const writeSafe = (data) => {
    if (!destroyed && !res.writableEnded) {
      try { res.write(data); } catch { destroyed = true; }
    }
  };

  const onLog = (entry) => {
    writeSafe(`data: ${JSON.stringify(entry)}\n\n`);
  };

  bus.on('log:' + taskId, onLog);

  // 30秒心跳保活
  const keepAlive = setInterval(() => {
    writeSafe(': ping\n\n');
  }, 30000);

  const cleanup = () => {
    destroyed = true;
    clearInterval(keepAlive);
    bus.off('log:' + taskId, onLog);
  };

  req.on('close', cleanup);
  req.on('error', cleanup);
});

// 从 task_logs 表获取历史日志
router.get('/study/logs-db/:taskId', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT time, text FROM task_logs WHERE task_id = ? ORDER BY id ASC',
      [req.params.taskId]
    );
    if (rows.length > 0) {
      return res.json({ success: true, logs: rows });
    }
    // 没有独立日志 → 从 progress 字段读取
    const [tasks] = await pool.query(
      'SELECT progress FROM study_tasks WHERE id = ?',
      [req.params.taskId]
    );
    if (tasks.length > 0 && tasks[0].progress && tasks[0].progress !== 'NULL') {
      try {
        const p = JSON.parse(tasks[0].progress);
        if (Array.isArray(p.logs)) {
          return res.json({ success: true, logs: p.logs });
        }
      } catch {}
    }
    res.json({ success: true, logs: [] });
  } catch (err) {
    res.json({ success: false, message: sanitizeError(err), logs: [] });
  }
});

export default router;
