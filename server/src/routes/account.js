import { Router } from 'express';
import bcrypt from 'bcryptjs';
import pool from '../db.js';
import axios from 'axios';
import { sanitizeError } from '../error.js';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';

const router = Router();

// 保存/更新账号（含 AI 配置）
router.post('/account/save', async (req, res) => {
  try {
    const { phone, password, deepseekApiKey, deepseekModel, enableAnswering, autoSubmit, notifyEmail } = req.body;
    if (!phone || !password) return res.json({ success: false, message: '手机号和密码不能为空' });

    // 邮箱重复校验
    if (notifyEmail !== undefined && notifyEmail) {
      const [emailUsers] = await pool.query(
        'SELECT id FROM accounts WHERE notify_email = ? AND phone != ?',
        [notifyEmail, phone]
      );
      if (emailUsers.length > 0) {
        return res.json({ success: false, message: '该邮箱已被其他账号绑定' });
      }
    }

    const hashed = await bcrypt.hash(password, 10);
    const [existing] = await pool.query('SELECT id FROM accounts WHERE phone = ?', [phone]);

    if (existing.length > 0) {
      const updates = ['password = ?'];
      const params = [hashed];
      if (deepseekApiKey !== undefined) { updates.push('deepseek_api_key = ?'); params.push(deepseekApiKey); }
      if (deepseekModel !== undefined) { updates.push('deepseek_model = ?'); params.push(deepseekModel); }
      if (enableAnswering !== undefined) { updates.push('enable_answering = ?'); params.push(enableAnswering ? 1 : 0); }
      if (autoSubmit !== undefined) { updates.push('auto_submit = ?'); params.push(autoSubmit ? 1 : 0); }
      if (notifyEmail !== undefined) { updates.push('notify_email = ?'); params.push(notifyEmail || null); }

      params.push(phone);
      await pool.query(`UPDATE accounts SET ${updates.join(', ')} WHERE phone = ?`, params);
      return res.json({ success: true, account: { id: existing[0].id, phone } });
    }

    const [r] = await pool.query(
      `INSERT INTO accounts (phone, password, notify_email, deepseek_api_key, deepseek_model, enable_answering, auto_submit)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [phone, hashed, notifyEmail || null, deepseekApiKey || '', deepseekModel || 'deepseek-v4-flash',
       enableAnswering !== undefined ? (enableAnswering ? 1 : 0) : 1,
       autoSubmit !== undefined ? (autoSubmit ? 1 : 0) : 0]
    );
    res.json({ success: true, account: { id: r.insertId, phone } });
  } catch (err) {
    res.json({ success: false, message: sanitizeError(err) });
  }
});

// 获取账号配置（含 AI 配置）— 不再返回明文 API Key
router.get('/account/config', async (req, res) => {
  try {
    const phone = req.query.phone;
    if (!phone) return res.json({ success: false, message: '缺少手机号' });

    const [rows] = await pool.query(
      'SELECT id, phone, deepseek_api_key, deepseek_model, enable_answering, auto_submit, notify_email FROM accounts WHERE phone = ?',
      [phone]
    );
    if (!rows.length) return res.json({ success: false, message: '账号不存在' });

    const key = rows[0].deepseek_api_key || '';
    const masked = key.length > 8 ? key.slice(0, 5) + '****' + key.slice(-4) : key ? 'sk-****' : '';

    res.json({
      success: true,
      config: {
        id: rows[0].id,
        phone: rows[0].phone,
        deepseek_model: rows[0].deepseek_model || 'deepseek-v4-flash',
        enable_answering: !!rows[0].enable_answering,
        auto_submit: !!rows[0].auto_submit,
        notify_email: rows[0].notify_email || '',
        has_deepseek_key: !!key,
        deepseek_key_masked: masked
      }
    });
  } catch (err) {
    res.json({ success: false, message: sanitizeError(err) });
  }
});

// 获取/刷新用户个人信息（进程内，无需 fork）
router.post('/account/info', async (req, res) => {
  try {
    const { phone, password } = req.body;
    if (!phone || !password) return res.json({ success: false, message: '缺少手机号或密码' });

    const jar = new CookieJar();
    const standalone = wrapper(axios.create({ jar, withCredentials: true, timeout: 30000 }));
    const { Chaoxing } = await import('../../../src/core/chaoxing.js');
    const chaoxing = new Chaoxing({ phone, password }, null, { speed: 1, jobs: 3, fastMode: true, _standaloneSession: standalone });

    const loginResult = await chaoxing.login(false);
    if (!loginResult.status) return res.json({ success: false, message: loginResult.msg || '登录失败' });

    const info = await chaoxing.getUserInfo();

    if (info.name) {
      await pool.query(
        'UPDATE accounts SET name=? WHERE phone=?',
        [info.name, phone]
      ).catch(() => {});
    }

    res.json({ success: true, info });
  } catch (err) {
    res.json({ success: false, message: sanitizeError(err) });
  }
});

export default router;
