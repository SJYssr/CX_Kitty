import { Router } from 'express';
import { sanitizeError } from '../error.js';
import { createStandalone } from '../../../src/core/factory.js';

const router = Router();

router.post('/courses', async (req, res) => {
  try {
    const { phone, password } = req.body;
    if (!phone || !password) return res.json({ success: false, message: '请填写完整' });

    const chaoxing = createStandalone({ phone, password });

    const loginResult = await chaoxing.login(false);
    if (!loginResult.status) return res.json({ success: false, message: loginResult.msg || '登录失败' });

    const courses = await chaoxing.getCourseList();
    res.json({ success: true, courses });
  } catch (err) {
    res.json({ success: false, message: sanitizeError(err) });
  }
});

export default router;
