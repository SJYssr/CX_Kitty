import { Router } from 'express';
import { sanitizeError } from '../error.js';
import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';

const router = Router();

router.post('/courses', async (req, res) => {
  try {
    const { phone, password } = req.body;
    if (!phone || !password) return res.json({ success: false, message: '请填写完整' });

    const jar = new CookieJar();
    const standalone = wrapper(axios.create({ jar, withCredentials: true, timeout: 30000 }));
    const { Chaoxing } = await import('../../../src/core/chaoxing.js');
    const chaoxing = new Chaoxing({ phone, password }, null, { speed: 1, jobs: 3, _standaloneSession: standalone });

    const loginResult = await chaoxing.login(false);
    if (!loginResult.status) return res.json({ success: false, message: loginResult.msg || '登录失败' });

    const courses = await chaoxing.getCourseList();
    res.json({ success: true, courses });
  } catch (err) {
    res.json({ success: false, message: sanitizeError(err) });
  }
});

export default router;
