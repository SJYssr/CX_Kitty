#!/usr/bin/env node

import { login } from "./login.js";
import { navigateToCourse, fetchCourses } from "./courses.js";
import { closeBrowser } from "./browser.js";
import { log } from "./utils.js";
import config from "../config.js";

async function main() {
  const command = process.argv[2] || "help";
  
  console.log("\n  🐱 CX_Kitty v1.0.0 - 超星自动化工具");
  console.log("  ───────────────────────────────\n");
  
  switch (command) {
    case "login": {
      const phone = process.argv[3] || config.account.phone;
      const password = process.argv[4] || config.account.password;
      
      if (!phone || !password) {
        log("请提供手机号和密码", "error");
        log("用法: node src/index.js login <手机号> <密码>", "info");
        break;
      }
      
      const result = await login(phone, password);
      if (result.success) {
        log("Cookie 已保存", "success");
      }
      break;
    }
    
    case "courses": {
      const phone = process.argv[3] || config.account.phone;
      const password = process.argv[4] || config.account.password;
      
      if (!phone || !password) {
        log("请提供手机号和密码", "error");
        log("用法: node src/index.js courses <手机号> <密码>", "info");
        break;
      }
      
      const result = await login(phone, password);
      if (!result.success) {
        log("登录失败", "error");
        break;
      }
      
      // 进入课程页面
      await navigateToCourse(result.page);
      
      // 获取课程列表
      const courses = await fetchCourses(result.page);
      
      if (courses.length > 0) {
        log(`共找到 ${courses.length} 门课程:`, "success");
        courses.forEach((c, i) => {
          console.log(`  ${i + 1}. ${c.name}${c.teacher ? ` (${c.teacher})` : ""}`);
          if (c.url) console.log(`     链接: ${c.url}`);
        });
      } else {
        log("未找到课程，可能被页面结构挡住了", "warn");
        log("请检查 login-result.png 截图", "info");
      }
      
      break;
    }
    
    case "help":
    default:
      console.log("  命令:");
      console.log("    login <手机号> <密码>   登录超星学习通");
      console.log("    courses <手机号> <密码> 查看课程列表");
      console.log("    help                    显示帮助\n");
      break;
  }
  
  await closeBrowser();
}

main().catch(err => {
  log(`程序异常: ${err.message}`, "error");
  process.exit(1);
});
