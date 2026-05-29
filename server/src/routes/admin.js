import { Router } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { sanitizeError } from '../error.js';
import { Admin } from '../models/admin.js';
import { requireAdmin } from '../middleware/admin-auth.js';
import { getAllSettings, setSetting } from '../models/settings.js';
import pool from '../db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FACES_DIR = path.resolve(__dirname, '../../../faces');

const router = Router();

// 内存中的 admin session 表
const adminSessions = new Map();

router.post('/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.json({ success: false, message: '请输入用户名和密码' });
    }

    const admin = await Admin.verifyPassword(username, password);
    if (!admin) {
      return res.json({ success: false, message: '用户名或密码错误' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    adminSessions.set(token, { id: admin.id, username: admin.username, loginAt: Date.now() });

    res.json({ success: true, token });
  } catch (err) {
    res.json({ success: false, message: sanitizeError(err) });
  }
});

router.get('/admin/verify', (req, res) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token || !adminSessions.has(token)) {
    return res.json({ success: false });
  }
  res.json({ success: true });
});

// 修改管理员密码
router.post('/admin/change-password', requireAdmin, async (req, res) => {
  try {
    const { username, newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.json({ success: false, message: '密码至少6位' });
    }
    await Admin.changePassword(username, newPassword);
    res.json({ success: true, message: '密码已修改' });
  } catch (err) {
    res.json({ success: false, message: sanitizeError(err) });
  }
});

// 获取所有用户列表（管理员专用）
router.get('/admin/users', requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, phone, name, puid, sex, school, stu_id, status, created_at, updated_at, ' +
      'deepseek_api_key, deepseek_model, enable_answering, auto_submit, cover_rate, ' +
      'notify_email, default_speed, default_jobs ' +
      'FROM accounts ORDER BY id DESC'
    );
    res.json({ success: true, users: rows });
  } catch (err) {
    res.json({ success: false, message: sanitizeError(err) });
  }
});

// 系统设置
router.get('/admin/settings', requireAdmin, async (req, res) => {
  try {
    const settings = await getAllSettings();
    res.json({ success: true, settings });
  } catch (err) {
    res.json({ success: false, message: sanitizeError(err) });
  }
});

router.post('/admin/settings', requireAdmin, async (req, res) => {
  try {
    const { key, value } = req.body;
    if (!key) return res.json({ success: false, message: '缺少参数' });
    await setSetting(key, value || '');
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, message: sanitizeError(err) });
  }
});

// 获取用户人脸图片（管理员专用，支持 query token）
router.get('/admin/face/:puid', (req, res) => {
  const header = req.headers.authorization || '';
  let token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) token = req.query.token || '';
  if (!token || !adminSessions.has(token)) {
    return res.status(401).json({ success: false });
  }
  const imgPath = path.join(FACES_DIR, `${req.params.puid}.jpg`);
  if (!fs.existsSync(imgPath)) {
    return res.status(404).json({ success: false, message: '无人脸图片' });
  }
  res.sendFile(imgPath);
});

export { adminSessions };
export default router;
