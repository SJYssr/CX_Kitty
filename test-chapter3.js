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

// 点击 章节 tab
await page.evaluate(() => {
  const tab = Array.from(document.querySelectorAll("span, a, li, div"))
    .find(el => el.textContent.trim() === "章节");
  if (tab) tab.click();
});

log("等待章节iframe加载...", "step");
await sleep(5000);

// 找章节iframe
const allFrames = page.frames();
let chapterFrame = null;
for (const f of allFrames) {
  const url = f.url();
  if (url.includes("studentcourse") || url.includes("mycourse/studentcourse")) {
    chapterFrame = f;
    log(`找到章节Frame: ${url.slice(0, 120)}`, "success");
    break;
  }
}

if (chapterFrame) {
  const chapters = await chapterFrame.evaluate(() => {
    // 解析章节结构
    const chapters = document.querySelectorAll(".chapter-item, .chapterUnit, .posCatalog_chapter, [class*=chapter]");
    if (chapters.length > 0) {
      return Array.from(chapters).slice(0, 50).map(el => ({
        name: el.textContent.trim().replace(/\s+/g, " ").slice(0, 80),
        class: el.className.slice(0, 50)
      }));
    }

    // 所有一级标题
    const items = document.querySelectorAll(".catalog-item, .posCatalog_level, [class*=level], [class*=catalog]");
    if (items.length > 0) {
      return Array.from(items).slice(0, 50).map(el => ({
        name: el.textContent.trim().replace(/\s+/g, " ").slice(0, 80),
        class: el.className.slice(0, 50)
      }));
    }

    // 所有链接
    return Array.from(document.querySelectorAll("a[href]"))
      .filter(a => a.textContent.trim().length > 2 && a.href.includes("mooc"))
      .map(a => ({
        name: a.textContent.trim().slice(0, 60),
        href: a.href.slice(0, 100)
      }))
      .slice(0, 50);
  });

  console.log(`\n=== 章节内容 (${chapters.length}条) ===`);
  chapters.forEach(c => {
    console.log(`  ${c.name}`);
  });
  
  // 也打印所有文字
  const text = await chapterFrame.evaluate(() => document.body.innerText.replace(/\s+/g, " ").trim().slice(0, 2000));
  console.log(`\n=== Frame 全文 ===\n${text}`);
}

await closeBrowser();
