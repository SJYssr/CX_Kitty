/**
 * Account DAO — 账号相关的数据库操作
 * @module models/account
 */
import pool from '../db.js';

export const Account = {
  /** 根据手机号查找账号 */
  findByPhone(phone, columns = 'id, phone, name, password, deepseek_api_key, deepseek_model, enable_answering, auto_submit, notify_email') {
    return pool.query(`SELECT ${columns} FROM accounts WHERE phone = ?`, [phone]);
  },

  /** 查找账号（仅 id 和密码）— 登录用 */
  findForLogin(phone) {
    return pool.query('SELECT id, password FROM accounts WHERE phone = ?', [phone]);
  },

  /** 检查邮箱是否已被其他账号绑定 */
  isEmailUsed(email, excludePhone) {
    if (excludePhone) {
      return pool.query('SELECT id FROM accounts WHERE notify_email = ? AND phone != ?', [email, excludePhone]);
    }
    return pool.query('SELECT id FROM accounts WHERE notify_email = ?', [email]);
  },

  /** 根据 phone 获取 notify_email */
  getNotifyEmail(phone) {
    return pool.query('SELECT notify_email FROM accounts WHERE phone = ?', [phone]);
  },

  /** 获取 DeepSeek API Key */
  getApiKey(phone) {
    return pool.query('SELECT deepseek_api_key FROM accounts WHERE phone = ?', [phone]);
  },

  /** 更新账号姓名 */
  updateName(phone, name) {
    return pool.query('UPDATE accounts SET name=? WHERE phone=?', [name, phone]);
  },

  /** 动态更新账号字段 */
  updateFields(phone, updates, params) {
    return pool.query(`UPDATE accounts SET ${updates.join(', ')} WHERE phone = ?`, [...params, phone]);
  },

  /** 创建账号 */
  create({ phone, password, notifyEmail, deepseekApiKey, deepseekModel, enableAnswering, autoSubmit }) {
    return pool.query(
      `INSERT INTO accounts (phone, password, notify_email, deepseek_api_key, deepseek_model, enable_answering, auto_submit)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [phone, password, notifyEmail || null, deepseekApiKey || '', deepseekModel || 'deepseek-v4-flash',
       enableAnswering !== undefined ? (enableAnswering ? 1 : 0) : 1,
       autoSubmit !== undefined ? (autoSubmit ? 1 : 0) : 0]
    );
  },

  /** 直接插入（注册用，仅基础字段） */
  insertBasic(phone, hashedPassword, email) {
    return pool.query(
      'INSERT INTO accounts (phone, password, notify_email, status) VALUES (?, ?, ?, ?)',
      [phone, hashedPassword, email, 'active']
    );
  }
};
