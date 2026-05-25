import { Router } from 'express';
import crypto from 'crypto';
import pool from '../db.js';

const router = Router();

// 保存/更新账号（含 AI 配置）
router.post('/account/save', async (req, res) => {
  try {
    const { phone, password, deepseekApiKey, deepseekModel, enableAnswering, autoSubmit, defaultSpeed, defaultJobs } = req.body;
    if (!phone || !password) return res.json({ success: false, message: '手机号和密码不能为空' });

    const hashed = crypto.createHash('md5').update(password).digest('hex');
    const [existing] = await pool.query('SELECT id FROM accounts WHERE phone = ?', [phone]);

    if (existing.length > 0) {
      const updates = ['password = ?'];
      const params = [hashed];
      if (deepseekApiKey !== undefined) { updates.push('deepseek_api_key = ?'); params.push(deepseekApiKey); }
      if (deepseekModel !== undefined) { updates.push('deepseek_model = ?'); params.push(deepseekModel); }
      if (enableAnswering !== undefined) { updates.push('enable_answering = ?'); params.push(enableAnswering ? 1 : 0); }
      if (autoSubmit !== undefined) { updates.push('auto_submit = ?'); params.push(autoSubmit ? 1 : 0); }
      if (defaultSpeed !== undefined) { updates.push('default_speed = ?'); params.push(defaultSpeed); }
      if (defaultJobs !== undefined) { updates.push('default_jobs = ?'); params.push(defaultJobs); }
      params.push(phone);
      await pool.query(`UPDATE accounts SET ${updates.join(', ')} WHERE phone = ?`, params);
      return res.json({ success: true, account: { id: existing[0].id, phone } });
    }

    const [r] = await pool.query(
      `INSERT INTO accounts (phone, password, deepseek_api_key, deepseek_model, enable_answering, auto_submit)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [phone, hashed, deepseekApiKey || '', deepseekModel || 'deepseek-v4-flash',
       enableAnswering !== undefined ? (enableAnswering ? 1 : 0) : 1,
       autoSubmit !== undefined ? (autoSubmit ? 1 : 0) : 0,
       defaultSpeed || 1.0, defaultJobs || 1]
    );
    res.json({ success: true, account: { id: r.insertId, phone } });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// 获取账号配置（含 AI 配置）
router.get('/account/config', async (req, res) => {
  try {
    const phone = req.query.phone;
    if (!phone) return res.json({ success: false, message: '缺少手机号' });

    const [rows] = await pool.query(
      'SELECT id, phone, deepseek_api_key, deepseek_model, enable_answering, auto_submit, default_speed, default_jobs FROM accounts WHERE phone = ?',
      [phone]
    );
    if (!rows.length) return res.json({ success: false, message: '账号不存在' });

    res.json({
      success: true,
      config: {
        ...rows[0],
        deepseek_api_key: rows[0].deepseek_api_key || '',
        enable_answering: !!rows[0].enable_answering,
        auto_submit: !!rows[0].auto_submit,
        default_speed: rows[0].default_speed || 1.0,
        default_jobs: rows[0].default_jobs || 1
      }
    });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

export default router;
