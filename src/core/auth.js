/**
 * 超星 Auth 模块 — 登录、会话、用户信息
 */
import cfg from '../config.js';
import logger from '../utils/logger.js';

export async function login(instance, loginWithCookies = false) {
  if (loginWithCookies) {
    const valid = await _validateCookieSession(instance);
    if (valid) {
      logger.info('Cookie 登录成功');
      return { status: true, msg: 'cookie 登录成功' };
    }
    logger.info('Cookie 失效，回退账号密码登录');
  }

  const { phone, password } = instance.account;
  if (!phone || !password) {
    return { status: false, msg: '未配置账号密码' };
  }

  try {
    const params = new URLSearchParams({
      fid: '-1',
      uname: phone,
      password: password,
      refer: 'https://i.chaoxing.com',
      t: 'true',
      forbidotherlogin: '0',
      validate: '',
      doubleFactorLogin: '0',
      independentId: '0'
    });

    await instance.rateLimiter.acquire({ random: { min: 500, max: 3000 } });

    const resp = await instance.axios.post(
      'https://passport2.chaoxing.com/fanyalogin',
      params.toString(),
      {
        headers: {
          ...cfg.headers,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    if (resp.data && resp.data.status === true) {
      if (instance.session) {
        await instance.session.saveCookies();
        const cookies = await instance.session.jar.getCookies('https://chaoxing.com');
        const uid = cookies.find(c => c.key === '_uid')?.value || '';
        instance._uid = uid;
      } else {
        try {
          const cookies = await instance.axios.defaults.jar.getCookies('https://chaoxing.com');
          const uid = cookies.find(c => c.key === '_uid')?.value || '';
          instance._uid = uid;
        } catch {}
      }
      logger.info(`登录成功 uid=${instance._uid}`);
      return { status: true, msg: '登录成功', uid: instance._uid };
    } else {
      const msg = (resp.data && (resp.data.msg2 || resp.data.message)) || '未知错误';
      logger.error(`登录失败: ${msg}`);
      return { status: false, msg };
    }
  } catch (err) {
    logger.error(`登录异常: ${err.message}`);
    return { status: false, msg: err.message };
  }
}

async function _validateCookieSession(instance) {
  if (!instance.session) return false;
  const cookies = await instance.session.jar.getCookies('https://chaoxing.com');
  const uidCookie = cookies.find(c => c.key === '_uid');
  if (!uidCookie) return false;

  try {
    await instance.rateLimiter.acquire({ random: { min: 500, max: 3000 } });

    const resp = await instance.axios.post(
      'https://mooc2-ans.chaoxing.com/mooc2-ans/visit/courselistdata',
      new URLSearchParams({ courseType: '1', courseFolderId: '0', query: '', superstarClass: '0' }).toString(),
      { headers: { ...cfg.headers, 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const body = typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data);
    if (body.includes('login') || body.includes('passport2')) return false;
    return true;
  } catch (_) {
    return false;
  }
}

export function getFid(instance) {
  return instance._fid;
}

export async function getUid(instance) {
  if (instance._uid) return instance._uid;
  const jar = instance.session ? instance.session.jar : instance.axios?.defaults?.jar;
  if (!jar) return '';
  const cookies = await jar.getCookies('https://chaoxing.com');
  const uidCookie = cookies.find(c => c.key === '_uid' || c.key === 'UID');
  instance._uid = uidCookie ? uidCookie.value : '';
  return instance._uid;
}

export async function getUserInfo(instance) {
  const phone = instance.account?.phone || '';
  const uid = await getUid(instance);
  const fid = getFid(instance);

  let name = '';

  try {
    const resp = await instance.axios.get('https://mooc2-ans.chaoxing.com/mooc2-ans/visit/interaction', {
      headers: cfg.headers, timeout: 8000
    });
    const html = typeof resp.data === 'string' ? resp.data : '';
    const nm = html.match(/realname["']?\s*[:=]\s*["']([^"']+)["']/);
    if (nm) name = nm[1];
    if (!name) {
      const el = html.match(/<a[^>]*class=["']user-info["'][^>]*>([^<]+)<\/a>/);
      if (el) name = el[1].trim();
    }
  } catch {}

  if (!name) {
    try {
      const resp = await instance.axios.get('https://i.chaoxing.com/', {
        headers: cfg.headers, timeout: 8000
      });
      const html = typeof resp.data === 'string' ? resp.data : '';
      const patterns = [
        /realname["']?\s*[:=]\s*["']([^"']+)["']/,
        /<p[^>]*class=["']user-?name["'][^>]*>([^<]+)<\/p>/,
        /<span[^>]*class=["']user-?name["'][^>]*>([^<]+)<\/span>/
      ];
      for (const p of patterns) {
        const m = html.match(p);
        if (m) { name = m[1].trim(); break; }
      }
    } catch {}
  }

  return { phone, uid, fid, name };
}
