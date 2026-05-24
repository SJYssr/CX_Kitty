#!/usr/bin/env node
import { login } from "./login.js";
import { navigateToCourse, fetchCourses } from "./courses.js";
import { autoWatchVideo } from "./video.js";
import { closeBrowser } from "./browser.js";
import { log, sleep } from "./utils.js";
import config from "../config.js";

async function main() {
  const cmd = process.argv[2] || "help";
  const phone = process.argv[3] || config.account.phone;
  const pwd = process.argv[4] || config.account.password;
  const idx = parseInt(process.argv[5] || "2") - 1;

  console.log("\n  🐱 CX_Kitty v1.0.0 - 超星学习通后端服务\n");

  if (cmd === "help") {
    console.log("login   <手机> <密码>              登录");
    console.log("courses <手机> <密码>              课程列表");
    console.log("chapters <手机> <密码> [序号]      视频任务");
    console.log("watch   <手机> <密码> [序号]      自动刷视频\n");
    return;
  }

  if (!phone || !pwd) { log("请提供手机号和密码", "error"); return; }

  const doLogin = async () => {
    const r = await login(phone, pwd);
    if (!r.success) process.exit(1);
    return r;
  };

  if (cmd === "login") { await doLogin(); return; }

  const { page, course } = await (async () => {
    const r = await doLogin();
    const p = r.page;
    await navigateToCourse(p);
    const courses = await fetchCourses(p, true);
    if (!courses[idx]) { log("课程不存在", "error"); process.exit(1); }
    return { page: p, course: courses[idx] };
  })();

  log(`===== ${course.name} =====`, "step");
  await page.goto(course.url, { waitUntil: "domcontentloaded", timeout: 20000 });
  await sleep(2000);
  await page.evaluate(() => {
    document.querySelectorAll("span, a, li, div").forEach(el => {
      if (el.textContent.trim() === "章节") el.click();
    });
  });
  await sleep(5000);

  let cf = null;
  for (const f of page.frames()) {
    if (f.url().includes("studentcourse")) { cf = f; break; }
  }
  if (!cf) { log("未找到章节", "error"); return; }

  await cf.evaluate(() => {
    document.querySelectorAll(".catalog_title.chapter_Thats_bnt").forEach(el => el.click());
  });
  await sleep(2000);

  const cid = course.clazzId;
  const items = await cf.evaluate((_cid) => {
    return Array.from(document.querySelectorAll(".chapter_item"))
      .filter(el => el.textContent.includes("视频"))
      .map(el => {
        const oc = el.getAttribute("onclick") || "";
        const m = oc.match(/toOld\(["]([^"]+)["],\s*["]([^"]+)["]/);
        return {
          name: el.textContent.trim().replace(/\s+/g, " ").slice(0, 40),
          done: el.textContent.includes("已完成"),
          courseId: m?.[1] || "",
          kid: m?.[2] || "",
          clazzId: _cid
        };
      });
  }, cid);

  if (!items.length) { log("无视频任务", "error"); return; }
  log(`${items.length} 个视频任务:`, "success");
  items.forEach((v, i) => log(`  ${i+1}. ${v.name}${v.done ? " ✅" : " ⚠️"}`, "info"));
  if (cmd === "chapters") return;

  const pending = items.filter(v => !v.done);
  log(`\n开始刷 ${pending.length} 个视频...`, "step");

  for (let i = 0; i < pending.length; i++) {
    const v = pending[i];
    log(`[${i+1}/${pending.length}] ${v.name}`, "step");
    await autoWatchVideo(page, cf, course, v.kid);
    if (i < pending.length - 1) {
      log("下一视频...", "step");
      await page.goto(course.url, { waitUntil: "domcontentloaded", timeout: 20000 });
      await sleep(2000);
      await page.evaluate(() => {
        document.querySelectorAll("span, a, li, div").forEach(el => {
          if (el.textContent.trim() === "章节") el.click();
        });
      });
      await sleep(5000);
      for (const f of page.frames()) {
        if (f.url().includes("studentcourse")) { cf = f; break; }
      }
    }
  }
  log(`\n全部完成! ${pending.length} 个视频 ✅`, "success");
}

main().catch(err => { log(err.message, "error"); process.exit(1); }).finally(() => closeBrowser());
