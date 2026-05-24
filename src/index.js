#!/usr/bin/env node

import { login } from "./login.js";
import { navigateToCourse, fetchCourses } from "./courses.js";
import { closeBrowser } from "./browser.js";
import { autoWatchVideo, simulateWatch } from "./video.js";
import { log, sleep } from "./utils.js";
import config from "../config.js";

async function main() {
  const command = process.argv[2] || "help";
  
  console.log("\n  🐱 CX_Kitty v1.0.0 - 超星自动化工具");
  console.log("  ───────────────────────────────\n");
  
  const phone = process.argv[3] || config.account.phone;
  const password = process.argv[4] || config.account.password;
  const courseIndex = parseInt(process.argv[5] || "2") - 1; // 默认第2门
  
  if (!phone || !password) {
    log("请提供手机号和密码", "error");
    log("用法: node src/index.js <命令> <手机号> <密码> [课程序号]", "info");
    process.exit(1);
  }

  switch (command) {
    case "login": {
      const result = await login(phone, password);
      if (result.success) log("登录成功", "success");
      break;
    }
    
    case "courses": {
      const result = await login(phone, password);
      if (!result.success) { log("登录失败", "error"); break; }
      await navigateToCourse(result.page);
      await fetchCourses(result.page, true);
      break;
    }

    case "chapters":
    case "watch": {
      const result = await login(phone, password);
      if (!result.success) { log("登录失败", "error"); break; }
      
      const page = result.page;
      await navigateToCourse(page);
      const courses = await fetchCourses(page, true);
      
      if (!courses[courseIndex]) {
        log(`没有第 ${courseIndex + 1} 门课程`, "error");
        break;
      }
      
      const course = courses[courseIndex];
      log(`\n===== ${course.name} =====`, "step");

      // 进课程详情
      await page.goto(course.url, { waitUntil: "domcontentloaded", timeout: 20000 });
      await sleep(2000);

      // 点章节tab
      await page.evaluate(() => {
        const tab = Array.from(document.querySelectorAll("span, a, li, div"))
          .find(el => el.textContent.trim() === "章节");
        if (tab) tab.click();
      });
      await sleep(5000);

      // 找章节iframe
      let cf = null;
      for (const f of page.frames()) {
        if (f.url().includes("studentcourse")) { cf = f; break; }
      }
      if (!cf) { log("未找到章节iframe", "error"); break; }

      // 获取所有视频知识ID
      const clazzId = course.clazzId;
      const videoItems = await cf.evaluate((_clazzId) => {
        const items = Array.from(document.querySelectorAll(".chapter_item"));
        return items
          .filter(el => el.textContent.includes("视频"))
          .map(el => {
            const onclick = el.getAttribute("onclick") || "";
            const match = onclick.match(/toOld\(['"]([^'"]+)['"],\s*['"]([^'"]+)['"]/);
            return {
              name: el.textContent.trim().replace(/\s+/g, " ").slice(0, 40),
              isFinished: el.textContent.includes("已完成"),
              courseId: match?.[1] || "",
              knowledgeId: match?.[2] || "",
              clazzId: _clazzId
            };
          });
      }, clazzId);

      if (videoItems.length === 0) {
        log("未找到视频任务", "error");
        break;
      }

      // 显示视频任务
      log(`找到 ${videoItems.length} 个视频任务:`, "success");
      videoItems.forEach((v, i) => {
        const status = v.isFinished ? " ✅" : " ⚠️";
        log(`  ${i+1}. ${v.name}${status}`, "info");
      });

      if (command === "chapters") break;

      // watch mode: 自动刷所有未完成的视频
      const pendingVideos = videoItems.filter(v => !v.isFinished);
      log(`\n开始刷 ${pendingVideos.length} 个未完成视频...`, "step");

      for (let i = 0; i < pendingVideos.length; i++) {
        const v = pendingVideos[i];
        log(`\n[${i+1}/${pendingVideos.length}] ${v.name}`, "step");

        const heartbeatParams = await autoWatchVideo(page, cf, course, v.knowledgeId);
        
        if (heartbeatParams) {
          await simulateWatch(page, heartbeatParams);
          
          // 回到章节页面继续
          await page.goto(course.url, { waitUntil: "domcontentloaded", timeout: 20000 });
          await sleep(2000);
          await page.evaluate(() => {
            const tab = Array.from(document.querySelectorAll("span, a, li, div"))
              .find(el => el.textContent.trim() === "章节");
            if (tab) tab.click();
          });
          await sleep(5000);
          for (const f of page.frames()) {
            if (f.url().includes("studentcourse")) { cf = f; break; }
          }
        }
      }

      break;
    }
    
    case "help":
    default:
      console.log("  命令:");
      console.log("    login <手机号> <密码>                登录");
      console.log("    courses <手机号> <密码>              查看进行中的课程");
      console.log("    chapters <手机号> <密码> [课程序号]    查看课程章节与视频任务");
      console.log("    watch <手机号> <密码> [课程序号]      自动刷视频\n");
      break;
  }
  
  await closeBrowser();
}

main().catch(err => {
  log(`程序异常: ${err.message}`, "error");
  process.exit(1);
});
