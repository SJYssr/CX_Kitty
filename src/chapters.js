import { log, sleep } from "./utils.js";

/**
 * 进入课程详情并获取章节列表
 */
export async function fetchChapters(page, courseUrl) {
  log(`进入课程...`, "step");
  await page.goto(courseUrl, { waitUntil: "domcontentloaded", timeout: 20000 });
  await sleep(2000);

  // 点击"章节"tab
  const clicked = await page.evaluate(() => {
    const tab = Array.from(document.querySelectorAll("span, a, li, div"))
      .find(el => el.textContent.trim() === "章节");
    if (tab) { tab.click(); return true; }
    return false;
  });
  
  if (!clicked) {
    log("未找到章节tab", "warn");
    return [];
  }
  
  log("等待章节内容加载...", "step");
  await sleep(5000);

  // 找章节iframe
  let chapterFrame = null;
  for (const f of page.frames()) {
    if (f.url().includes("studentcourse")) {
      chapterFrame = f;
      break;
    }
  }

  if (!chapterFrame) {
    log("未找到章节iframe", "error");
    return [];
  }

  // 解析章节树
  const chapters = await chapterFrame.evaluate(() => {
    const units = document.querySelectorAll(".chapter_unit");
    
    return Array.from(units).map(unit => {
      // 章节标题（取第一个数字开头的文本）
      const titleEl = unit.querySelector(".chapter_td");
      const title = titleEl?.textContent?.trim()?.replace(/\s+/g, " ") || "";
      
      // 该章下的子项
      const items = unit.querySelectorAll(".chapter_item");
      const jobItems = Array.from(items).map(item => {
        const nameEl = item.querySelector(".catalog_name.newCatalog_name");
        const name = nameEl?.textContent?.trim()?.replace(/\s+/g, " ") || "";
        
        const isFinished = !!item.querySelector(".icon_yiwanc");
        
        // 找链接
        const link = item.querySelector("a[href]");
        
        // 任务点数量
        const taskEl = item.querySelector(".knowledgeJobCount");
        const taskCount = taskEl ? parseInt(taskEl.textContent) || 0 : 0;
        
        // 进度条
        const progressEl = item.querySelector(".catalog_ressbar_width");
        const progress = progressEl?.style?.width || "";
        
        return {
          name,
          isFinished,
          url: link?.href || "",
          taskCount,
          progress
        };
      }).filter(j => j.name.length > 0);

      // 统计该章任务数
      const allTasks = jobItems.reduce((s, j) => s + j.taskCount, 0);
      const doneTasks = jobItems.filter(j => j.isFinished).length;
      const pendingFromText = unit.textContent.match(/(\d+)个待完成任务点/);

      return {
        title,
        items: jobItems,
        totalTasks: allTasks,
        doneCount: doneTasks,
        pending: pendingFromText ? parseInt(pendingFromText[1]) : 0
      };
    }).filter(ch => ch.title.length > 0);
  });

  if (chapters.length === 0) {
    log("章节解析失败", "error");
    return [];
  }

  // 美观输出
  const totalPending = chapters.reduce((s, c) => s + c.pending, 0);
  log(`📚 ${chapters.length} 章, ${totalPending} 个待完成任务点:`, "success");
  
  chapters.forEach((ch, i) => {
    const status = ch.pending > 0 ? ` ⚠️ ${ch.pending}待完成` : " ✅ 已完成";
    console.log(`  ${String(i + 1).padEnd(3)}${ch.title}${status}`);
    
    ch.items.forEach(j => {
      const icon = j.name.includes("视频") ? "🎬" : 
                   j.name.includes("课件") ? "📖" : 
                   j.name.includes("教材") ? "📖" : 
                   j.name.includes("阅读") ? "📝" : "📎";
      const stat = j.isFinished ? " ✅" : j.taskCount > 0 ? ` ⚠️ (${j.taskCount}任务)` : "";
      console.log(`       ${icon} ${j.name}${stat}`);
    });
  });

  return chapters;
}

export default { fetchChapters };
