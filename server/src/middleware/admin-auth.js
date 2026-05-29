import { adminSessions } from '../routes/admin.js';

export function requireAdmin(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token || !adminSessions.has(token)) {
    return res.status(401).json({ success: false, message: '管理员未登录' });
  }
  req.admin = adminSessions.get(token);
  next();
}
