/**
 * 认证中间件 — 通过 session_token 验证身份（顶号策略）
 */
import { Account } from '../models/account.js';

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  let token = header.startsWith('Bearer ') ? header.slice(7) : '';
  // EventSource 不支持自定义 header，回退到 query 参数
  if (!token) token = req.query.token || '';

  if (!token) {
    return res.status(401).json({ success: false, message: '未登录' });
  }

  Account.findByToken(token).then(([rows]) => {
    if (!rows.length) {
      return res.status(401).json({ success: false, message: '登录已过期，请重新登录' });
    }
    req.user = rows[0];
    next();
  }).catch(err => {
    console.error('auth middleware error:', err?.message || err);
    res.status(500).json({ success: false, message: '认证服务异常' });
  });
}
