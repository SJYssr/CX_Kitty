import { login } from "./src/login.js";
import { navigateToCourse } from "./src/courses.js";
import { closeBrowser } from "./src/browser.js";
import { log, sleep } from "./src/utils.js";

const result = await login("18836196959", "sjy20040608");
if (!result.success) { log("登录失败", "error"); process.exit(1); }

const page = result.page;
await navigateToCourse(page);

// 深入解析课程卡片
const info = await page.evaluate(() => {
  const items = document.querySelectorAll(".course-list .course.clearfix");
  const courses = [];
  
  items.forEach((el, i) => {
    // course-info 详细结构
    const infoEl = el.querySelector(".course-info");
    const children = infoEl ? Array.from(infoEl.childNodes).map(n => ({
      type: n.nodeType,  // 1=element, 3=text
      text: (n.textContent || "").trim().slice(0, 60),
      tag: n.tagName || ""
    })) : [];
    
    // 在 .course-info 里找 span/p 等带课程名的元素
    const nameSpans = infoEl ? Array.from(infoEl.querySelectorAll("*")).map(s => ({
      tag: s.tagName,
      text: s.textContent.trim().slice(0, 60),
      class: s.className.slice(0, 40)
    })) : [];

    // 找链接
    const links = Array.from(el.querySelectorAll("a")).map(a => ({
      text: a.textContent.trim().slice(0, 30),
      href: (a.href || "").slice(0, 120),
      onclick: (a.getAttribute("onclick") || "").slice(0, 80)
    }));

    // 封面图
    const img = el.querySelector("img");
    
    // 整体 HTML
    const html = el.outerHTML.replace(/\s+/g, " ").slice(0, 600);
    
    courses.push({
      index: i,
      classList: el.className,
      infoChildren: children,
      nameSpans: nameSpans,
      links: links.slice(0, 5),
      coverImg: img?.src || "",
      html: html
    });
  });

  return courses;
});

info.forEach(c => {
  console.log(`\n=== 课程 ${c.index + 1} ===`);
  console.log(`Class: ${c.classList}`);
  console.log(`  info子节点:`, JSON.stringify(c.infoChildren));
  console.log(`  内部元素:`, JSON.stringify(c.nameSpans));
  console.log(`  链接:`);
  c.links.forEach(l => console.log(`    "${l.text}" -> ${l.href}`));
  console.log(`  HTML: ${c.html.slice(0, 400)}`);
});

await closeBrowser();
