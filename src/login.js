import config from "../config.js";
import { newPage, closeBrowser } from "./browser.js";
import { log, sleep, now } from "./utils.js";

export async function login(phone, password) {
  const page = await newPage();
  
  try {
    log("打开登录页...", "step");
    await page.goto(config.domains.login, { waitUntil: "networkidle", timeout: 20000 });
    await sleep(2000);
    
    // 检查是否需要验证码
    const needVcode = await page.evaluate(() => document.getElementById("needVcode")?.value);
    if (needVcode === "true" || needVcode === "1") {
      log("需要验证码！尝试继续...", "warn");
    }
    
    // 输入账号密码
    log("输入账号...", "step");
    await page.fill("#phone", phone);
    await sleep(500);
    
    log("输入密码...", "step");
    await page.fill("#pwd", password);
    await sleep(800);
    
    // 点击登录
    log("点击登录按钮...", "step");
    
    const [response] = await Promise.all([
      page.waitForResponse(resp => resp.url().includes("fanyalogin"), { timeout: 15000 }).catch(() => null),
      page.click("#loginBtn")
    ]);
    
    await sleep(3000);
    
    // 检查结果
    const currentUrl = page.url();
    const title = await page.title();
    
    if (currentUrl.includes("base") || title.includes("个人空间")) {
      const userName = await page.evaluate(() => {
        const el = document.querySelector(".name, .username, [class*=user], .user-info");
        return el ? el.textContent.trim() : "未知";
      }).catch(() => "未知");
      
      log(`登录成功！[${now()}]`, "success");
      log(`用户: ${userName}`, "info");
      
      // 获取 cookie
      const cookies = await page.context().cookies();
      
      return {
        success: true,
        userName,
        cookies,
        page
      };
    } else {
      const bodyText = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").trim().slice(0, 200));
      log(`登录失败: ${bodyText}`, "error");
      await page.screenshot({ path: "login_failed.png" });
      return { success: false, page };
    }
    
  } catch (err) {
    log(`登录异常: ${err.message}`, "error");
    try { await page.screenshot({ path: "login_error.png" }); } catch(e) {}
    return { success: false, page };
  }
}

// 命令行直接登录
export async function loginCLI() {
  const phone = config.account.phone || process.argv[3];
  const password = config.account.password || process.argv[4];
  
  if (!phone || !password) {
    log("用法: npm start login <手机号> <密码>", "warn");
    log("或配置 config.js 中的 account", "info");
    return;
  }
  
  const result = await login(phone, password);
  if (result.success) {
    log("Cookie 已获取，可继续其他操作", "success");
  }
  
  await closeBrowser();
}
