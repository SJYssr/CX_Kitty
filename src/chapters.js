import { log, sleep } from "./utils.js";

/**
 * 进入课程详情并获取章节列表
 */
export async function fetchChapters(page, courseUrl) {
  log(`进入课程: ${courseUrl.slice(0, 80)}...`, "step");
  await page.goto(courseUrl, { waitUntil: "domcontentloaded", timeout: 20000 });
  await sleep(2000);

  // 点击"章节"tab
  await page.evaluate(() => {
    const tab = Array.from(document.querySelectorAll("span, a, li, div"))
      .find(el => el.textContent.trim() === "章节");
    if (tab) tab.click();
  });
  
  log("等待章节内容加载...", "step");
  await sleep(5000);

  // 找章节iframe
  let chapterFrame = null;
  for (const f of page.frames()) {
    const url = f.url();
    if (url.includes("studentcourse")) {
      chapterFrame = f;
      break;
    }
  }

  if (!chapterFrame) {
    log("未找到章节iframe", "error");
    return [];
  }

  // 从iframe中解析章节
  const chapters = await chapterFrame.evaluate(() => {
    const result = [];
    const chapters = document.querySelectorAll(".posCatalog_chapter");

    chapters.forEach((ch) => {
      // 章节标题
      const titleEl = ch.querySelector(".catalog_name, .name, .chapter_name, .catalog-name, .posCatalog_name");
      const title = titleEl?.textContent?.trim()?.replace(/\s+/g, " ") || "";

      if (!title || title.length < 3) return;

      // 该章节下的任务统计
      const totalJobs = ch.querySelectorAll(".posCatalog_jobs .job, [class*=job]");
      const completedJobs = ch.querySelectorAll(".jobFinished, .finish, .finishTotal, [class*=finish]");
      
      // 找出该章节下各任务的详情
      const jobs = Array.from(ch.querySelectorAll(".posCatalog_jobs .job, [class*=job], .posCatalog_level"))
        .map(job => {
          const jobNameEl = job.querySelector(".catalog_name, .name, .job_name, a, span");
          const jobStatusEl = job.querySelector(".jobFinished, .finish, .finishTotal, .state, .status, [class*=finish]");
          const jobLink = job.querySelector("a[href]");
          
          let jobName = jobNameEl?.textContent?.trim()?.replace(/\s+/g, " ") || "";
          const isFinished = job.textContent.includes("已完成");
          const isVideo = jobName.includes("视频") || job.querySelector("img[src*=video], [class*=ico-video]");
          
          return {
            name: jobName,
            isFinished,
            isVideo: !!isVideo,
            url: jobLink?.href || ""
          };
        })
        .filter(j => j.name.length > 2);

      // 统计
      const pending = ch.textContent.match(/(\d+)个待完成任务点/);
      const completed = ch.textContent.match(/(\d+)\/(\d+)/);
      
      result.push({
        title,
        jobs,
        pending: pending ? parseInt(pending[1]) : 0,
        jobCount: jobs.length,
        hasVideo: jobs.some(j => j.isVideo)
      });
    });

    return result;
  });

  if (chapters.length === 0) {
    // 兜底：纯文本解析
    const text = await chapterFrame.evaluate(() => document.body.innerText.replace(/\s+/g, " ").trim());
    log("章节结构解析失败，原始文本:", "warn");
    log(text.slice(0, 500), "info");
    return [];
  }

  // 显示
  log(`📚 ${chapters.length} 个章节:`, "success");
  chapters.forEach((ch, i) => {
    const pend = ch.pending > 0 ? ` ⚠️ ${ch.pending}个待完成` : " ✅";
    console.log(`  ${String(i + 1).padEnd(3)}${ch.title}${pend}`);
    ch.jobs.forEach(j => {
      const icon = j.isVideo ? "🎬" : j.name.includes("课件") || j.name.includes("教材") ? "📖" : j.name.includes("阅读") || j.name.includes("作业") ? "📝" : "📎";
      const status = j.isFinished ? " ✅" : j.isVideo ? " ⚠️" : "";
      console.log(`       ${icon} ${j.name}${status}`);
    });
  });

  return chapters;
}

export default { fetchChapters };
