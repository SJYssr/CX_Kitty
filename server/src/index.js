import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import pool from './db.js';
import accountRoutes from './routes/account.js';
import studyRoutes from './routes/study.js';
import { sanitizeError } from './error.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(morgan('dev'));

// API 路由
app.use('/api', accountRoutes);
app.use('/api', studyRoutes);

app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'OK', time: new Date().toISOString() });
});

// DeepSeek 余额查询（使用服务端保存的 API Key，不上传到前端）
app.get('/api/balance', async (req, res) => {
  try {
    const phone = req.query.phone;
    if (!phone) return res.json({ success: false, message: '缺少手机号' });

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

// 启动时清理残留的 running 任务（上次部署留下的）
pool.query(
  "UPDATE study_tasks SET status = 'terminated', finished_at = NOW() WHERE status = 'running'"
).then(r => {
  if (r[0]?.affectedRows > 0) {
    console.log(`  清理了 ${r[0].affectedRows} 个残留的 running 任务`);
  }
}).catch(e => {
  console.warn('  清理残留任务失败:', e.message);
});

app.listen(PORT, () => {
  console.log(`🐱 CX_Kitty Server → http://localhost:${PORT}`);
  if (!fs.existsSync(distPath)) {
    console.log(`  ⚠️ 前端未构建，开发请运行: cd client && npm run dev`);
  }
});
