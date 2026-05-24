#!/usr/bin/env node
import { login, getCourseList } from "./api.js";
import { getCoursePoints, getJobCards, watchVideo, setSession } from "./video.js";
import { load } from "cheerio";
import fs from "fs";
import config from "./config.js";

async function main() {
  const cmd = process.argv[2] || "help";
  const phone = process.argv[3] || "";
  const pwd = process.argv[4] || "";
  const idx = parseInt(process.argv[5] || "2") - 1;

  console.log("\n  🐱 CX_Kitty v1.2 - 纯API版 (无浏览器)\n");

  if (cmd === "help" || !phone || !pwd) {
    console.log("  login    <手机> <密码>         登录");
    console.log("  courses  <手机> <密码>         课程列表");
    console.log("  watch    <手机> <密码> [序号]  刷视频\n");
    return;
  }

  // 登录
  const auth = await login(phone, pwd);
  if (!auth.success) return;

  // 读取cookie并设置session
  const raw = JSON.parse(fs.readFileSync(config.cookiePath, "utf8"));
  const cookieStr = raw.jar || raw.cookie || "";
  setSession(cookieStr, auth.uid);

  // 获取课程
  const courses = await getCourseList();
  const active = courses.filter(c => !c.isEnd);

  if (cmd === "courses") {
    console.log(`\n进行中 ${active.length} 门:`);
    active.forEach((c, i) => console.log(`  ${i+1}. ${c.name}  ${c.teacher}`));
    return;
  }

  if (!active[idx]) { console.log("课程不存在"); return; }
  const course = active[idx];
  console.log(`\n===== ${course.name} =====`);

  // 获取章节
  console.log("获取章节...");
  const points = await getCoursePoints(course.courseId, course.clazzId, course.cpi);
  console.log(`  ${points.length} 个章节`);

  // 扫描视频任务
  console.log("扫描视频任务...");
  const videos = [];

  for (const ch of points) {
    for (const item of ch.items) {
      if (!item.name.includes("视频")) continue;
      console.log(`  检查: ${item.name}`);
      const jobs = await getJobCards(course.clazzId, course.courseId, course.cpi, item.knowledgeId);
      for (const job of jobs) {
        if (job.type === "video" || job.cardTitle?.includes("video") || item.name.includes("视频")) {
          videos.push({ ...item, ...job, clazzId: course.clazzId });
        }
      }
    }
  }

  if (videos.length === 0) {
    console.log("未找到视频任务");
    return;
  }

  console.log(`\n${videos.length} 个视频任务:`);
  videos.forEach((v, i) => console.log(`  ${i+1}. ${v.name || v.cardTitle}`));

  // 刷视频
  for (let i = 0; i < videos.length; i++) {
    const v = videos[i];
    console.log(`\n[${i+1}/${videos.length}] ${v.name || v.cardTitle}`);
    await watchVideo(v, course, auth.uid);
  }

  console.log(`\n🎉 全部完成! ${videos.length} 个视频 ✅`);
}

main().catch(err => console.error(err.message || err));
