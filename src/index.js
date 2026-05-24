#!/usr/bin/env node
import { login, getCourseList, client } from "./api.js";
import { getCoursePoints, getJobCards, watchVideo, watchDocument, setSession } from "./video.js";
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

  const auth = await login(phone, pwd);
  if (!auth.success) return;
  setSession(auth.uid);

  const courses = await getCourseList();
  const active = courses.filter(c => !c.isEnd);
  if (cmd === "courses") {
    active.forEach((c, i) => console.log(`  ${i+1}. ${c.name}  ${c.teacher}`));
    return;
  }
  if (!active[idx]) { console.log("课程不存在"); return; }

  const course = active[idx];
  console.log(`\n===== ${course.name} =====`);

  // 建立会话 (getCourseList的POST可能搞乱session, 再访问一次)
  const head = { "User-Agent": config.headers["User-Agent"] };
  await client.get("https://mooc2-ans.chaoxing.com/mooc2-ans/visit/interaction", { headers: head }).catch(() => {});

  const points = await getCoursePoints(course.courseId, course.clazzId, course.cpi);
  console.log(`${points.length} 个章节`);

  // 再建立会话
  await client.get("https://mooc2-ans.chaoxing.com/mooc2-ans/visit/interaction", { headers: head }).catch(() => {});

  let totalJobs = [];
  for (const ch of points) {
    for (const item of ch.items) {
      const jobs = await getJobCards(course.clazzId, course.courseId, course.cpi, item.knowledgeId);
      for (const j of jobs) j.knowledgeName = item.name;
      totalJobs = totalJobs.concat(jobs);
    }
  }

  if (!totalJobs.length) { console.log("无任务"); return; }

  const videos = totalJobs.filter(j => j.type === "video" || (!j.type && j.dtoken));
  const docs = totalJobs.filter(j => j.type === "document" || (!j.type && j.jobid?.startsWith("doc")));
  console.log(`\n视频: ${videos.length}, 文档: ${docs.length}`);

  for (let i = 0; i < videos.length; i++) {
    const v = videos[i];
    console.log(`\n[${i+1}/${videos.length}] ${v.knowledgeName || v.cardTitle}`);
    await watchVideo(v, course, auth.uid);
  }
  for (const d of docs) {
    console.log(`\n📄 ${d.cardTitle}`);
    await watchDocument(d, course);
  }

  console.log(`\n🎉 完成! ${videos.length}个视频`);
}

main().catch(err => console.error(err.message || err));
