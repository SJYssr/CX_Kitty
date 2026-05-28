import { Router } from 'express';
import { runStudy } from '../study-runner.js';
import bus from '../log-bus.js';
import { sanitizeError } from '../error.js';
import { Account } from '../models/account.js';
import { StudyTask } from '../models/study-task.js';

const router = Router();

// 启动刷课任务
router.post('/study/start', async (req, res) => {
  try {
    let { password, courseIds } = req.body;
    const phone = req.user.phone;
    const accountId = req.user.id;
    courseIds = [...new Set(courseIds)];

    if (!password) return res.json({ success: false, message: '请填写密码' });

    // 从 DB 读取账号配置（答题开关、自动提交、模型、DeepSeek Key、并发数、倍速）
    const [accounts] = await Account.findByPhone(phone, 'id, deepseek_api_key, deepseek_model, enable_answering, auto_submit, cover_rate, default_jobs, default_speed');
    if (!accounts.length) {
      return res.json({ success: false, message: '该账号未注册，请先注册' });
    }

    const deepseekApiKey = accounts[0].deepseek_api_key || '';
    const deepseekModel = accounts[0].deepseek_model || 'deepseek-v4-pro';
    const enableAnswering = accounts[0].enable_answering !== 0;
    const autoSubmit = !!accounts[0].auto_submit;
    const coverRate = accounts[0].cover_rate ?? 0.8;
    const jobs = accounts[0].default_jobs ?? 1;
    const speed = accounts[0].default_speed ?? 1;

    // 如果开启了答题但没有 API Key，返回错误
    if (enableAnswering && !deepseekApiKey) {
      return res.json({ success: false, message: '请先在配置中设置 DeepSeek API Key 后再启动刷课' });
    }

    // 终止该账号所有正在运行的任务
    await StudyTask.terminateRunningByAccount(accountId);

    // 创建新任务记录
    const [result] = await StudyTask.create(accountId, courseIds, speed, jobs);

    // 每个用户只保留最新 5 条记录
    const [rows] = await StudyTask.getRecentIds(accountId);
    if (rows.length >= 5) {
      const cutoffId = rows[rows.length - 1].id;
      await StudyTask.deleteOldLogs(accountId, cutoffId);
      await StudyTask.deleteOldByAccount(accountId, cutoffId);
    }
    const taskId = result.insertId;

    // 后台运行（不阻塞 HTTP）
    runStudy({ phone, password, courseIds, speed, jobs, deepseekApiKey, deepseekModel, autoSubmit, coverRate, enableAnswering, taskId })
      .catch(err => {
        console.error('[study/start] runStudy 失败:', err?.message || err);
        StudyTask.markFailed(taskId, err.message || String(err)).catch(e => {
          console.error('[study/start] 更新任务状态失败:', e?.message || e);
        });
      });

    res.json({ success: true, taskId });
  } catch (err) {
    res.json({ success: false, message: sanitizeError(err) });
  }
});

router.get('/study/status/:taskId', async (req, res) => {
  try {
    const [rows] = await StudyTask.findById(req.params.taskId);
    res.json({ success: true, task: rows[0] || null });
  } catch (err) {
    res.json({ success: false, message: sanitizeError(err) });
  }
});

// 终止任务
router.post('/study/terminate/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    await StudyTask.terminateById(taskId);
    bus.emit('terminate:' + taskId);
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, message: sanitizeError(err) });
  }
});

router.get('/study/tasks', async (req, res) => {
  try {
    const [rows] = await StudyTask.findByPhone(req.user.phone);
    res.json({ success: true, tasks: rows });
  } catch (err) {
    res.json({ success: false, message: sanitizeError(err) });
  }
});

// 实时日志 SSE
router.get('/study/logs/:taskId', async (req, res) => {
  const taskId = req.params.taskId;

  // 验证任务归属
  const phone = req.user.phone;
  try {
    const [rows] = await StudyTask.findByIdAndPhone(taskId, phone);
    if (!rows.length) {
      return res.status(403).json({ success: false, message: 'forbidden' });
    }
  } catch {
    return res.status(500).json({ success: false, message: 'auth error' });
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.write(':\n\n');

  let destroyed = false;

  const writeSafe = (data) => {
    if (!destroyed && !res.writableEnded) {
      try { res.write(data); } catch { destroyed = true; }
    }
  };

  const onLog = (entry) => {
    writeSafe(`data: ${JSON.stringify({ type: 'log', ...entry })}\n\n`);
  };

  const onVideo = (data) => {
    writeSafe(`data: ${JSON.stringify({ type: 'video_progress', ...data })}\n\n`);
  };

  bus.on('log:' + taskId, onLog);
  bus.on('video:' + taskId, onVideo);

  // 连接时立即推送缓存中的所有活跃视频进度
  const cachedVideos = bus.getActiveVideos(taskId);
  if (cachedVideos.length > 0) {
    writeSafe(`data: ${JSON.stringify({ type: 'video_progress', videos: cachedVideos })}\n\n`);
  }

  // 30秒心跳保活
  const keepAlive = setInterval(() => {
    writeSafe(': ping\n\n');
  }, 30000);

  const cleanup = () => {
    destroyed = true;
    clearInterval(keepAlive);
    bus.off('log:' + taskId, onLog);
    bus.off('video:' + taskId, onVideo);
  };

  req.on('close', cleanup);
  req.on('error', cleanup);
});

// 从 task_logs 表获取历史日志
router.get('/study/logs-db/:taskId', async (req, res) => {
  try {
    const [rows] = await StudyTask.getLogs(req.params.taskId);
    if (rows.length > 0) {
      return res.json({ success: true, logs: rows });
    }
    // 没有独立日志 → 从 progress 字段读取
    const [tasks] = await StudyTask.readProgress(req.params.taskId);
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
