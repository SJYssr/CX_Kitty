import { login } from "./src/login.js";
import { navigateToCourse, fetchCourses } from "./src/courses.js";
import { closeBrowser } from "./src/browser.js";
import { log, sleep } from "./src/utils.js";

const result = await login("18836196959", "sjy20040608");
if (!result.success) { log("登录失败", "error"); process.exit(1); }

const page = result.page;

await navigateToCourse(page);
const courses = await fetchCourses(page, true);

const course = courses[1];
log(`进入课程: ${course.name}`, "step");
await page.goto(course.url, { waitUntil: "domcontentloaded", timeout: 20000 });
await sleep(2000);

// 页面上所有 frame
const frames = page.frames();
log(`共 ${frames.length} 个 frame`, "info");
for (let i = 0; i < frames.length; i++) {
  try {
    const info = await frames[i].evaluate(() => ({
      url: location.href.slice(0, 120),
      title: document.title?.slice(0, 60),
      width: document.body?.scrollWidth
    }));
    log(`Frame ${i}: ${info.url} | ${info.title}`, "info");
  } catch(e) {}
}

// 点击"章节"后监听请求
const requests = [];
page.on("request", req => {
  const url = req.url();
  if (url.includes("chapter") || url.includes("catalog") || url.includes("knowledge") || url.includes("courseId")) {
    requests.push(url.slice(0, 150));
  }
});

await page.evaluate(() => {
  const tab = Array.from(document.querySelectorAll("span, a, li, div"))
    .find(el => el.textContent.trim() === "章节");
  if (tab) {
    tab.click();
    return "点击成功";
  }
  return "没找到章节tab";
});

log("等待章节加载...", "step");
await sleep(5000);

const afterClickInfo = await page.evaluate(() => {
  // 看有没有新出现的 iframe
  const iframes = document.querySelectorAll("iframe");
  // 看有没有新内容区域
  const contentArea = document.querySelector("#chapter_content, .chapter-content, .catalog-content, #catalog, .posCatalog_level, .posCatalog_chapter, [class*=catalog], [class*=chapter]");
  // 看有没有class包含active的tab
  const activeTab = document.querySelector(".active, .cur, .current, [class*=active]");
  
  return {
    iframeCount: iframes.length,
    contentAreaHTML: contentArea ? contentArea.outerHTML.slice(0, 500).replace(/\s+/g, " ") : "未找到内容区域",
    activeTab: activeTab?.textContent?.trim()?.slice(0, 30) || "无",
    bodyChildren: document.body.children.length,
    scripts: document.querySelectorAll("script").length
  };
});

console.log("\n=== 点击后状态 ===");
console.log(`iframe: ${afterClickInfo.iframeCount}个`);
console.log(`活动tab: ${afterClickInfo.activeTab}`);
console.log(`body子元素: ${afterClickInfo.bodyChildren}`);
console.log(`脚本数: ${afterClickInfo.scripts}`);

console.log("\n=== 捕获的请求 ===");
requests.forEach(r => console.log(`  ${r}`));

// 检查是否有新frame出现
await sleep(2000);
const allFrames = page.frames();
console.log(`\n=== 全部 frames (${allFrames.length}) ===`);
for (let i = 0; i < allFrames.length; i++) {
  try {
    const url = allFrames[i].url();
    console.log(`  ${i}: ${url.slice(0, 150)}`);
  } catch(e) {}
}

// 打印所有可见文字
const text = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").trim());
console.log(`\n=== 页面全文 ===\n${text.slice(0, 1000)}`);

await closeBrowser();
