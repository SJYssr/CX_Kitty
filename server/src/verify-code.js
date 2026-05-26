/**
 * 邮箱验证码 — 内存存储，5 分钟过期
 */
const codes = new Map();

// 每 10 分钟清理过期 code
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of codes) {
    if (now > val.expiresAt) codes.delete(key);
  }
}, 600000);

/**
 * 生成并缓存验证码
 * @param {string} email
 * @returns {string} 6 位验证码
 */
export function generateCode(email) {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  codes.set(email, { code, expiresAt: Date.now() + 5 * 60 * 1000 });
  return code;
}

/**
 * 验证码校验（验证后立即删除，防重复使用）
 * @param {string} email
 * @param {string} code
 * @returns {boolean}
 */
export function verifyCode(email, code) {
  const record = codes.get(email);
  if (!record) return false;
  if (Date.now() > record.expiresAt) { codes.delete(email); return false; }
  if (record.code !== code) return false;
  codes.delete(email); // 一次性
  return true;
}
