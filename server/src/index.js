import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env') });

import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import fs from 'fs';
import pool from './db.js';
import accountRoutes from './routes/account.js';
import authRoutes from './routes/auth.js';
import studyRoutes from './routes/study.js';
import coursesRoutes from './routes/courses.js';
import systemRoutes from './routes/system.js';
import adminRoutes from './routes/admin.js';
import { sanitizeError } from './error.js';
import { ensureAdminsTable } from './models/admin.js';
import { ensureSettingsTable } from './models/settings.js';
import { requireAuth } from './middleware/auth.js';
import { StudyTask } from './models/study-task.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(morgan('dev'));

// 公开路由（无需认证）
app.use('/api', authRoutes);
app.use('/api', systemRoutes);
app.use('/api', adminRoutes);
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'OK', time: new Date().toISOString() });
});

// 需要认证的路由
app.use('/api', requireAuth, accountRoutes);
app.use('/api', requireAuth, studyRoutes);
app.use('/api', requireAuth, coursesRoutes);

// DeepSeek 余额查询（使用服务端保存的 API Key，不上传到前端）
app.get('/api/balance', requireAuth, async (req, res) => {
  try {
    const phone = req.user.phone;

    const [rows] = await pool.query(
      'SELECT deepseek_api_key FROM accounts WHERE phone = ?', [phone]
    );
    if (!rows.length || !rows[0].deepseek_api_key) {
      return res.json({ success: false, message: '未找到 API Key', balance: 0 });
    }

    const apiKey = rows[0].deepseek_api_key;
    const resp = await fetch('https://api.deepseek.com/user/balance', {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });

    if (!resp.ok) {
      return res.json({ success: false, message: '查询失败', balance: 0 });
    }

    const data = await resp.json();
    const balance = data.balance_infos?.reduce((sum, b) => sum + parseFloat(b.topped_up_balance || 0), 0) || 0;
    res.json({ success: true, balance });
  } catch (err) {
    res.json({ success: false, message: sanitizeError(err), balance: 0 });
  }
});

// 生产环境：前端构建产物托管在 / → 访问 :3001 直接打开前端
const distPath = path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(distPath, 'index.html'));
    }
  });
  console.log(`  前端静态: ${distPath}`);
}

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ success: false, message: sanitizeError(err) });
});

// 管理员表迁移 + 默认账户
ensureAdminsTable().catch(e => console.warn('  管理员表迁移失败:', e.message));
ensureSettingsTable().catch(e => console.warn('  系统设置表迁移失败:', e.message));

// 启动时清理残留的 running 任务（上次部署留下的）
StudyTask.cleanupStaleRunning().then(([r]) => {
  if (r?.affectedRows > 0) {
    console.log(`  清理了 ${r.affectedRows} 个残留的 running 任务`);
  }
}).catch(e => {
  console.warn('  清理残留任务失败:', e.message);
});

// 迁移：notify_email 唯一索引（防 TOCTOU 竞态）
pool.query(
  'ALTER TABLE accounts ADD UNIQUE INDEX idx_notify_email (notify_email)'
).catch(e => {
  if (!e.message.includes('Duplicate') && !e.message.includes('already exists')) {
    console.warn('  添加 notify_email 唯一索引失败:', e.message);
  }
});

// 迁移：session_token 列（顶号策略）
pool.query(
  'ALTER TABLE accounts ADD COLUMN session_token VARCHAR(64) DEFAULT NULL'
).catch(e => {
  if (!e.message.includes('Duplicate') && !e.message.includes('already exists')) {
    console.warn('  添加 session_token 列失败:', e.message);
  }
});

app.listen(PORT, () => {
  console.log(`🐱 CX_Kitty Server → http://localhost:${PORT}`);
  if (!fs.existsSync(distPath)) {
    console.log(`  ⚠️ 前端未构建，开发请运行: cd client && npm run dev`);
  }
});

// 定时清理：每小时删除 7 天前的旧任务及日志
setInterval(async () => {
  try {
    const { deletedLogs, deletedTasks } = await StudyTask.cleanupOldTasks(7);
    if (deletedTasks > 0 || deletedLogs > 0) {
      console.log(`🧹 定时清理: ${deletedTasks} 个旧任务, ${deletedLogs} 条旧日志`);
    }
  } catch (e) {
    console.warn('定时清理失败:', e.message);
  }
}, 3600000);
