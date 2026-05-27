import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { sanitizeError } from '../error.js';
import { Account } from '../models/account.js';
import { createStandalone } from '../../../src/core/factory.js';

const router = Router();

// 保存/更新账号（含 AI 配置）
router.post('/account/save', async (req, res) => {
  try {
    const { password, deepseekApiKey, deepseekModel, enableAnswering, autoSubmit, notifyEmail } = req.body;
    const phone = req.user.phone;
    if (!password) return res.json({ success: false, message: '密码不能为空' });

    // 邮箱格式 + 重复校验
    if (notifyEmail) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(notifyEmail)) {
        return res.json({ success: false, message: '邮箱格式不正确' });
      }
      const [emailUsers] = await Account.isEmailUsed(notifyEmail, phone);
      if (emailUsers.length > 0) {
        return res.json({ success: false, message: '该邮箱已被其他账号绑定' });
      }
    }

    const hashed = await bcrypt.hash(password, 10);
    const [existing] = await Account.findByPhone(phone, 'id');

    if (existing.length > 0) {
      const updates = ['password = ?'];
      const params = [hashed];
      if (deepseekApiKey !== undefined) { updates.push('deepseek_api_key = ?'); params.push(deepseekApiKey); }
      if (deepseekModel !== undefined) { updates.push('deepseek_model = ?'); params.push(deepseekModel); }
      if (enableAnswering !== undefined) { updates.push('enable_answering = ?'); params.push(enableAnswering ? 1 : 0); }
      if (autoSubmit !== undefined) { updates.push('auto_submit = ?'); params.push(autoSubmit ? 1 : 0); }
      if (notifyEmail !== undefined) { updates.push('notify_email = ?'); params.push(notifyEmail || null); }

      await Account.updateFields(phone, updates, params);
      return res.json({ success: true, account: { id: existing[0].id, phone } });
    }

    const [r] = await Account.create({ phone, password: hashed, notifyEmail, deepseekApiKey, deepseekModel, enableAnswering, autoSubmit });
    res.json({ success: true, account: { id: r.insertId, phone } });
  } catch (err) {
    res.json({ success: false, message: sanitizeError(err) });
  }
});

// 获取账号配置
router.get('/account/config', async (req, res) => {
  try {
    const phone = req.user.phone;

    const [rows] = await Account.findByPhone(phone, 'id, phone, name, deepseek_api_key, deepseek_model, enable_answering, auto_submit, notify_email');
    if (!rows.length) return res.json({ success: false, message: '账号不存在' });

    const key = rows[0].deepseek_api_key || '';
    const masked = key.length > 8 ? key.slice(0, 5) + '****' + key.slice(-4) : key ? 'sk-****' : '';

    res.json({
      success: true,
      config: {
        id: rows[0].id,
        phone: rows[0].phone,
        name: rows[0].name || '',
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

// 获取/刷新用户个人信息
router.post('/account/info', async (req, res) => {
  try {
    const { password } = req.body;
    const phone = req.user.phone;
    if (!password) return res.json({ success: false, message: '缺少密码' });

    const chaoxing = createStandalone({ phone, password }, { fastMode: true });

    const loginResult = await chaoxing.login(false);
    if (!loginResult.status) return res.json({ success: false, message: loginResult.msg || '登录失败' });

    const info = await chaoxing.getUserInfo();

    if (info.name) {
      await Account.updateName(phone, info.name).catch(() => {});
    }

    res.json({ success: true, info });
  } catch (err) {
    res.json({ success: false, message: sanitizeError(err) });
  }
});

export default router;
