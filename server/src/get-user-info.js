import { Chaoxing } from '../../src/core/chaoxing.js';
import { SessionManager } from '../../src/core/session.js';

const [phone, password] = process.argv.slice(2);
if (!phone || !password) { process.send?.({ success: false, message: '缺少参数' }); process.exit(1); }

async function main() {
  new SessionManager();
  const chaoxing = new Chaoxing({ phone, password });
  const loginResult = await chaoxing.login(false);
  if (!loginResult.status) { process.send?.({ success: false, message: '登录失败: ' + loginResult.msg }); process.exit(1); }
  const info = await chaoxing.getUserInfo();
  process.send?.({ success: true, info });
  process.exit(0);
}
main().catch(err => { process.send?.({ success: false, message: err.message }); process.exit(1); });
