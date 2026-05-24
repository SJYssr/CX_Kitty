#!/usr/bin/env node
import { login, getCourseList } from "./api.js";
import { getCoursePoints, getJobCards, watchVideo, watchDocument, setSession } from "./video.js";
import { getEnc } from "./crypto.js";
import fs from "fs";
import config from "./config.js";

async function main() {
  const cmd = process.argv[2] || "help";
  const phone = process.argv[3] || "";
  const pwd = process.argv[4] || "";
  const idx = parseInt(process.argv[5] || "2") - 1;

  console.log("\n  🐱 CX_Kitty v1.2 - 纯API版\n");

  if (!phone || !pwd) {
    console.log("  login    <手机> <密码>        登录");
    console.log("  courses  <手机> <密码>        课程列表");
    console.log("  watch    <手机> <密码> [序号] 刷课\n");
    return;
  }

  // 登录
  const auth = await login(phone, pwd);
  if (!auth.success) return;
  const raw = JSON.parse(fs.readFileSync(config.cookiePath, "utf8"));
  setSession(raw.jar || "", auth.uid);

  // 课程
  const courses = await getCourseList();
  const active = courses.filter(c => !c.isEnd);
  if (cmd === "courses") {
    active.forEach((c, i) => console.log(`  ${i+1}. ${c.name}  ${c.teacher}`));
    return;
  }
  if (!active[idx]) { console.log("课程不存在"); return; }

  const course = active[idx];
  console.log(`\n===== ${course.name} =====`);

  // 章节 → 知识点
  const points = await getCoursePoints(course.courseId, course.clazzId, course.cpi);
  console.log(`${points.length} 个章节`);

  // 扫描所有任务
  let totalJobs = [];
  for (const ch of points) {
    for (const item of ch.items) {
      const jobs = await getJobCards(course.clazzId, course.courseId, course.cpi, item.knowledgeId);
      for (const j of jobs) {
        j.chapterTitle = ch.title;
        j.knowledgeName = item.name;
      }
      totalJobs = totalJobs.concat(jobs);
    }
  }

  if (!totalJobs.length) { console.log("没有需要处理的任务"); return; }

  // 分类
  const videos = totalJobs.filter(j => j.type === "video" || (!j.type && j.dtoken));
  const docs = totalJobs.filter(j => j.type === "document" || (!j.type && j.jobid?.startsWith("doc")));
  const works = totalJobs.filter(j => j.type === "work" || j.jobid?.startsWith("work"));

  console.log(`\n视频: ${videos.length}, 文档: ${docs.length}, 作业: ${works.length}`);

  // 刷视频
  for (let i = 0; i < videos.length; i++) {
    const v = videos[i];
    console.log(`\n[${i+1}/${videos.length}] ${v.knowledgeName || v.cardTitle}`);
    const ok = await watchVideo(v, course, auth.uid);
  }

  // 刷文档
  for (const d of docs) {
    console.log(`\n📄 ${d.cardTitle}`);
    await watchDocument(d, course);
  }

  console.log(`\n🎉 完成! ${videos.length}个视频, ${docs.length}个文档`);
}

main().catch(err => console.error(err.message || err));
