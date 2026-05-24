/**
 * AES-128-CBC 加密工具 (Key = IV = "u2oh6Vu^HWe4_AES")
 * @module core/cipher
 */

import crypto from 'crypto';

const AES_KEY = 'u2oh6Vu^HWe4_AES';
const ENC_SALT = 'd_yHJ!$pdA~5';
const ALGORITHM = 'aes-128-cbc';

function getKeyBuffer() {
  return Buffer.from(AES_KEY, 'utf8');
}

/**
 * AES-128-CBC PKCS7 加密，返回 base64
 * @param {string} plaintext — 明文
 * @returns {string} base64 密文
 */
export function aesEncrypt(plaintext) {
  const key = getKeyBuffer();
  const cipher = crypto.createCipheriv(ALGORITHM, key, key);
  let enc = cipher.update(plaintext, 'utf8', 'base64');
  enc += cipher.final('base64');
  return enc;
}

/**
 * AES-128-CBC 解密，返回 utf8 明文
 * @param {string} ciphertext — base64 密文
 * @returns {string} 明文
 */
export function aesDecrypt(ciphertext) {
  const key = getKeyBuffer();
  const decipher = crypto.createDecipheriv(ALGORITHM, key, key);
  let dec = decipher.update(ciphertext, 'base64', 'utf8');
  dec += decipher.final('utf8');
  return dec;
}

/**
 * MD5 签名 — 视频心跳 enc 参数
 * @param {string} clazzId
 * @param {string} userid
 * @param {string} jobid
 * @param {string} objectId
 * @param {number} playingTime — 秒
 * @param {number} duration — 秒
 * @returns {string} MD5 hex
 */
export function getEnc(clazzId, userid, jobid, objectId, playingTime, duration) {
  const raw = `[${clazzId}][${userid}][${jobid}][${objectId}][${playingTime * 1000}][${ENC_SALT}][${duration * 1000}][0_${duration}]`;
  return crypto.createHash('md5').update(raw).digest('hex');
}

/**
 * 时间戳字符串
 * @returns {string} Date.now()
 */
export function getTimestamp() {
  return String(Date.now());
}
