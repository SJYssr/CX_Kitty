/**
 * 图形验证码模块 — SVG 验证码生成与校验
 */

import svgCaptcha from 'svg-captcha';
import crypto from 'crypto';

const captchaMap = new Map();

// 每 10 分钟清理过期验证码
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of captchaMap) {
    if (now > val.expiresAt) captchaMap.delete(key);
  }
}, 600000);

/**
 * 生成图形验证码
 * @returns {{ svg: string, token: string }}
 */
export function generateCaptcha() {
  const captcha = svgCaptcha.create({
    size: 4,
    noise: 2,
    color: true,
    background: '#f0f0f0',
    fontSize: 56
  });

  const token = crypto.randomUUID();
  captchaMap.set(token, {
    code: captcha.text.toLowerCase(),
    expiresAt: Date.now() + 5 * 60 * 1000
  });

  return { svg: captcha.data, token };
}

/**
 * 校验图形验证码（一次性，校验后立即删除）
 * @param {string} token
 * @param {string} code
 * @returns {boolean}
 */
export function verifyCaptcha(token, code) {
  if (!token || !code) return false;
  const record = captchaMap.get(token);
  if (!record) return false;
  captchaMap.delete(token); // 一次性
  if (Date.now() > record.expiresAt) return false;
  return record.code === code.toLowerCase().trim();
}
