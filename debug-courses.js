import { login } from "./src/login.js";
import { closeBrowser } from "./src/browser.js";
import { log, sleep } from "./src/utils.js";

const result = await login("18836196959", "sjy20040608");
if (!result.success) {
  log("登录失败", "error");
  process.exit(1);
}

const page = result.page;

// 访问课程页面
log("访问课程主页...", "step");
await page.goto("https://i.chaoxing.com/base", { waitUntil: "networkidle", timeout: 20000 });
await sleep(3000);

// 截个图
await page.screenshot({ path: "base-page.png", fullPage: true });
log("截图: base-page.png", "info");

// 分析页面结构
const info = await page.evaluate(() => {
  // 所有链接
  const links = Array.from(document.querySelectorAll("a")).map(a => ({
    text: a.textContent.trim().slice(0, 50),
    href: a.href,
    class: a.className.slice(0, 60)
  })).filter(l => l.text.length > 0);

  // 所有可见的div和区块
  const sections = Array.from(document.querySelectorAll("div[class*=\"course\"], div[id*=\"course\"], div[class*=\"class\"], div[id*=\"class\"], div[class*=\"mycourse\"], div[class*=\"list\"], div[class*=\"main\"]")).map(d => ({
    id: d.id,
    class: d.className.slice(0, 80),
    text: d.textContent.trim().slice(0, 80),
    childCount: d.children.length
  })).filter(d => d.text.length > 0);

  // 找课程区域
  const courseArea = document.querySelector("#course, .course-list, .mycourse, [class*=course], [class*=curriculum]");
  
  // 查看页面主要结构
  const mainDivs = Array.from(document.querySelectorAll("body > div, body > section, body > main")).map(d => ({
    tag: d.tagName,
    id: d.id,
    class: d.className.slice(0, 60),
    childCount: d.children.length,
    textPrefix: d.textContent.trim().slice(0, 60)
  }));

  return {
    title: document.title,
    url: location.href,
    links: links.slice(0, 30),
    sections: sections.slice(0, 20),
    hasCourseArea: !!courseArea,
    courseAreaHTML: courseArea ? courseArea.outerHTML.slice(0, 1000) : "N/A",
    mainDivs: mainDivs.slice(0, 20)
  };
});

console.log("\n=== 页面标题:", info.title);
console.log("=== URL:", info.url);

console.log("\n=== 主要区块 ===");
info.mainDivs.forEach(d => console.log(`  ${d.tag} #${d.id} .${d.class} | ${d.childCount}个子元素 | "${d.textPrefix}"`));

console.log("\n=== 可能包含课程的区块 ===");
info.sections.forEach(d => console.log(`  .${d.class} | "${d.text}"`));

console.log("\n=== 课程相关链接 ===");
info.links.filter(l => l.text.includes("课") || l.text.includes("course") || l.text.includes("class")).forEach(l => console.log(`  "${l.text}" -> ${l.href}`));

console.log("\n=== 全部链接 ===");
info.links.forEach(l => console.log(`  "${l.text}" -> ${l.href.slice(0, 100)}`));

await closeBrowser();
