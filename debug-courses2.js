import { login } from "./src/login.js";
import { closeBrowser } from "./src/browser.js";
import { log, sleep } from "./src/utils.js";

const result = await login("18836196959", "sjy20040608");
if (!result.success) { log("登录失败", "error"); process.exit(1); }

const page = result.page;

// 访问课程主页
await page.goto("https://i.chaoxing.com/base", { waitUntil: "networkidle", timeout: 20000 });
await sleep(3000);

const info = await page.evaluate(() => {
  // 所有可见的元素
  const navLinks = Array.from(document.querySelectorAll("a, span, li, div"))
    .filter(el => el.textContent.trim().length > 0 && el.offsetParent !== null)
    .map(el => ({
      tag: el.tagName,
      id: el.id,
      class: el.className.slice(0, 60),
      text: el.textContent.trim().slice(0, 30),
      href: el.href || el.getAttribute("href") || el.getAttribute("onclick")?.slice(0, 60)
    }))
    .filter((el, i, arr) => arr.findIndex(e => e.text === el.text) === i) // 去重
    .slice(0, 50);

  // 查所有 onclick / data-* 属性
  const onclickAttrs = Array.from(document.querySelectorAll("[onclick]"))
    .map(el => ({
      tag: el.tagName,
      onclick: el.getAttribute("onclick")?.slice(0, 100),
      text: el.textContent.trim().slice(0, 30)
    }))
    .filter((el, i, arr) => arr.findIndex(e => e.onclick === el.onclick) === i)
    .slice(0, 20);

  // 尝试找菜单/导航
  const menus = Array.from(document.querySelectorAll("[class*=menu], [id*=menu], [class*=nav], [id*=nav], [class*=sidebar], .mCSB_container, .mCustomScrollbar"))
    .map(el => ({
      class: el.className.slice(0, 80),
      id: el.id,
      html: el.innerHTML.trim().replace(/\s+/g, " ").slice(0, 500)
    }));

  return {
    navLinks,
    onclickAttrs,
    menus
  };
});

console.log("=== 导航链接 ===");
info.navLinks.forEach(l => console.log(`  ${l.tag} #${l.id} text="${l.text}" href="${l.href}" class="${l.class}"`));

console.log("\n=== onclick 属性 ===");
info.onclickAttrs.forEach(l => console.log(`  onclick="${l.onclick}" text="${l.text}"`));

console.log("\n=== 菜单/导航区域 ===");
info.menus.forEach(m => console.log(`  .${m.class}\n  ${m.html}\n`));

await closeBrowser();
