/**
 * Fork 子进程：用独立 SessionManager 登录超星并获取课程列表
 * 通过 process.send() 返回结果
 */
async function main() {
  const [,, phone, password] = process.argv;
  if (!phone || !password) {
    process.send({ success: false, message: '参数不全' });
    process.exit(1);
  }

  try {
    const { Chaoxing } = await import('../../src/core/chaoxing.js');
    const { SessionManager } = await import('../../src/core/session.js');

    new SessionManager();
    const chaoxing = new Chaoxing({ phone, password }, null, { speed: 1, jobs: 3 });
    const loginResult = await chaoxing.login(false);

    if (!loginResult.status) {
      process.send({ success: false, message: loginResult.msg || '登录失败' });
      process.exit(1);
    }

    const courses = await chaoxing.getCourseList();
    process.send({ success: true, courses });
    process.exit(0);
  } catch (err) {
    process.send({ success: false, message: err.message });
    process.exit(1);
  }
}

main();
