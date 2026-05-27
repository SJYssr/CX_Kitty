import { Router } from 'express';
import crypto from 'crypto';
import { generateCode, verifyCode } from '../verify-code.js';
import { sendVerifyCode } from '../../../src/notify/email.js';
import { generateCaptcha, verifyCaptcha } from '../captcha.js';
import { sanitizeError } from '../error.js';
import { Account } from '../models/account.js';
import bcrypt from 'bcryptjs';
import { createStandalone } from '../../../src/core/factory.js';

const router = Router();

// 获取图形验证码
router.get('/captcha', (req, res) => {
  const { svg, token } = generateCaptcha();
  res.json({ success: true, svg, token });
});

router.post('/login', async (req, res) => {
  try {
    const { phone, password, captchaToken, captchaCode } = req.body;
    if (!phone || !password) return res.json({ success: false, message: '请填写完整' });
    if (!/^1\d{10}$/.test(phone)) return res.json({ success: false, message: '手机号格式不正确' });

    // 1. 先校验图形验证码（防刷、防暴力破解）
    if (!verifyCaptcha(captchaToken, captchaCode)) {
      return res.json({ success: false, message: '验证码错误或已过期' });
    }

    // 2. 查本地账号
    const [rows] = await Account.findForLogin(phone);
    if (!rows.length) {
      return res.json({ success: false, message: '该账号未注册，请先注册' });
    }

    // 3. 校验密码
    if (!(await bcrypt.compare(password, rows[0].password))) {
      return res.json({ success: false, message: '学习通账号或密码错误，请核实' });
    }

    // 4. 登录超星获取会话（刷课需要）
    const chaoxing = createStandalone({ phone, password });

    const loginResult = await chaoxing.login(false);
    if (!loginResult.status) return res.json({ success: false, message: loginResult.msg || '超星登录失败' });

    // 登录成功后获取并保存用户详细信息
    try {
      const ssoInfo = await chaoxing.getSSOInfo();
      if (ssoInfo && ssoInfo.puid) {
        await Account.updateSSOInfo(phone, ssoInfo);
      } else {
        // SSO 接口失败时降级到 HTML 解析方式
        const info = await chaoxing.getUserInfo();
        if (info.name) {
          await Account.updateName(phone, info.name);
        }
      }
    } catch (e) {
      console.warn('获取用户信息失败:', e?.message || e);
    }

    // 5. 生成 session token（顶号：新登录覆盖旧 token）
    const token = crypto.randomBytes(32).toString('hex');
    await Account.setSessionToken(phone, token);

    res.json({ success: true, token });
  } catch (err) {
    res.json({ success: false, message: sanitizeError(err) });
  }
});

/** 发送邮箱验证码 */
router.post('/send-verify-code', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.json({ success: false, message: '请输入邮箱' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.json({ success: false, message: '邮箱格式不正确' });
    }

    // 检查邮箱是否已被其他账号绑定
    const [emailUsed] = await Account.isEmailUsed(email);
    if (emailUsed.length > 0) {
      return res.json({ success: false, message: '该邮箱已被其他账号绑定' });
    }

    const code = generateCode(email);
    const ok = await sendVerifyCode(email, code);

    if (!ok) return res.json({ success: false, message: '验证码发送失败，请检查邮箱是否正确' });
    res.json({ success: true, message: '验证码已发送' });
  } catch (err) {
    res.json({ success: false, message: sanitizeError(err) });
  }
});

/** 验证 token 是否有效（客户端检测顶号） */
router.get('/auth/verify', async (req, res) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return res.json({ success: false, message: '未登录' });

  const [rows] = await Account.findByToken(token);
  res.json({ success: rows.length > 0 });
});

/** 注册 */
router.post('/register', async (req, res) => {
  try {
    const { phone, password, email, code } = req.body;
    if (!phone || !password || !email || !code) {
      return res.json({ success: false, message: '请填写完整信息' });
    }
    if (!/^1\d{10}$/.test(phone)) return res.json({ success: false, message: '手机号格式不正确' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.json({ success: false, message: '邮箱格式不正确' });

    // 1. 先查是否已注册
    const [existing] = await Account.findByPhone(phone, 'id');
    if (existing.length > 0) {
      return res.json({ success: false, message: '该手机号已注册，请直接登录' });
    }

    // 2. 邮箱重复校验（快速失败，避免浪费超星登录耗时）
    const [emailUsed] = await Account.isEmailUsed(email);
    if (emailUsed.length > 0) {
      return res.json({ success: false, message: '该邮箱已被其他账号绑定' });
    }

    // 3. 校验超星账号密码
    try {
      const cx = createStandalone({ phone, password }, { fastMode: true });
      const cxLogin = await cx.login(false);
      if (!cxLogin.status) throw new Error(cxLogin.msg);
    } catch {
      return res.json({ success: false, message: '学习通账号或密码错误，请核实' });
    }

    // 4. 最后校验验证码（一次性消耗，放在最后）
    if (!verifyCode(email, code)) {
      return res.json({ success: false, message: '验证码错误或已过期' });
    }

    // 5. 全部通过，写入数据库
    const hashed = await bcrypt.hash(password, 10);
    await Account.insertBasic(phone, hashed, email);

    res.json({ success: true, message: '注册成功' });
  } catch (err) {
    res.json({ success: false, message: sanitizeError(err) });
  }
});

export default router;
