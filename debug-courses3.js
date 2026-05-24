import { login } from "./src/login.js";
import { closeBrowser } from "./src/browser.js";
import { log, sleep } from "./src/utils.js";

const result = await login("18836196959", "sjy20040608");
if (!result.success) { log("登录失败", "error"); process.exit(1); }

const page = result.page;

// 进入课程页面
const sToken = await page.evaluate(() => {
  const match = document.body.innerHTML.match(/[?&]s=([a-f0-9]{32})/);
  return match ? match[1] : null;
});

const courseUrl = sToken
  ? `https://mooc2-ans.chaoxing.com/visit/interaction?s=${sToken}`
  : "https://mooc2-ans.chaoxing.com/visit/interaction";

await page.goto(courseUrl, { waitUntil: "networkidle", timeout: 20000 });
await sleep(3000);

await page.screenshot({ path: "course-page.png", fullPage: true });
log("截图: course-page.png", "info");

// 详细解析整个页面结构
const fullInfo = await page.evaluate(() => {
  // 所有有意义的 div
  const allDivs = Array.from(document.querySelectorAll("div[class], section[class]"))
    .filter(d => d.textContent.trim().length > 0)
    .map(d => ({
      class: d.className.slice(0, 100),
      id: d.id,
      childCount: d.children.length,
      text: d.textContent.trim().replace(/\s+/g, " ").slice(0, 100)
    }))
    .slice(0, 60);

  // 所有图片（可能包含课程封面）
  const imgs = Array.from(document.querySelectorAll("img"))
    .map(img => ({
      src: img.src.slice(0, 150),
      alt: img.alt?.slice(0, 40) || "",
      width: img.width,
      height: img.height
    }))
    .filter(img => img.width > 50)
    .slice(0, 15);

  // 看是否有 "我学的课" 下面有什么
  const myCoursesDiv = Array.from(document.querySelectorAll("*"))
    .find(el => el.textContent.includes("我学的课"));

  const myCoursesHTML = myCoursesDiv 
    ? myCoursesDiv.outerHTML.replace(/\s+/g, " ").slice(0, 2000) 
    : "未找到";

  // 看看有没有"查看更多"之类的按钮
  const actionButtons = Array.from(document.querySelectorAll("a, button, span, div"))
    .filter(el => {
      const t = el.textContent.trim();
      return ["更多", "查看", "全部", "展开", "我的课程", "course"].some(k => t.includes(k));
    })
    .map(el => ({
      text: el.textContent.trim().slice(0, 30),
      tag: el.tagName,
      class: el.className.slice(0, 80),
      href: el.href || ""
    }));

  return {
    title: document.title,
    url: location.href,
    divs: allDivs,
    imgs: imgs,
    myCoursesHTML: myCoursesHTML,
    actionButtons: actionButtons
  };
});

console.log("\n=== 所有div区块 ===");
fullInfo.divs.forEach(d => {
  console.log(`  .${d.class} | ${d.childCount}子 | "${d.text.slice(0, 60)}"`);
});

console.log("\n=== 图片 ===");
fullInfo.imgs.forEach(img => console.log(`  ${img.alt} | ${img.src}`));

console.log("\n=== 操作按钮 ===");
fullInfo.actionButtons.forEach(b => console.log(`  ${b.tag} .${b.class} "${b.text}"`));

console.log("\n=== 我学的课 区域 HTML ===");
console.log(fullInfo.myCoursesHTML.slice(0, 1500));

await closeBrowser();
