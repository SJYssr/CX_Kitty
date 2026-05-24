import { log, sleep } from "./utils.js";

/**
 * 进入课程互动页面
 */
export async function navigateToCourse(page) {
  log("进入课程页面...", "step");

  if (!page.url().includes("chaoxing.com/base")) {
    await page.goto("https://i.chaoxing.com/base", { 
      waitUntil: "networkidle", timeout: 20000 
    });
    await sleep(2000);
  }

  const sToken = await page.evaluate(() => {
    const match = document.body.innerHTML.match(/[?&]s=([a-f0-9]{32})/);
    return match ? match[1] : null;
  }).catch(() => null);

  const courseUrl = sToken
    ? `https://mooc2-ans.chaoxing.com/visit/interaction?s=${sToken}`
    : "https://mooc2-ans.chaoxing.com/visit/interaction";

  log(`访问课程页...`, "step");
  await page.goto(courseUrl, { waitUntil: "networkidle", timeout: 20000 });
  await sleep(3000);

  return page.url();
}

/**
 * 获取课程列表
 * @param {Page} page - Playwright page
 * @param {boolean} activeOnly - 只返回进行中的课程
 */
export async function fetchCourses(page, activeOnly = true) {
  log("正在抓取课程列表...", "step");

  const courses = await page.evaluate(() => {
    const items = document.querySelectorAll(".course-list .course.clearfix");
    
    return Array.from(items).map(el => {
      const infoEl = el.querySelector(".course-info");
      
      const nameEl = infoEl?.querySelector("h3");
      const name = nameEl?.textContent?.trim() || "";
      
      const schoolEl = infoEl?.querySelector("p.margint10");
      const school = schoolEl?.textContent?.trim() || "";
      
      const teacherEl = infoEl?.querySelector("p.line2.color3");
      const teacher = teacherEl?.textContent?.trim() || "";
      
      const clazzId = el.querySelector("input.clazzId")?.value || "";
      const courseId = el.querySelector("input.courseId")?.value || "";
      const cpi = el.querySelector("input.curPersonId")?.value || "";
      
      const link = el.querySelector("a.color1");
      const url = link?.href || "";
      
      const progressEl = el.querySelector(".btm-cover .fl.l-txt");
      const percentEl = el.querySelector(".btm-cover .fr");
      const progress = progressEl ? progressEl.textContent.trim() : "";
      const percent = percentEl ? percentEl.textContent.trim() : "";
      
      const isEnd = el.textContent.includes("课程已结束");
      
      const coverImg = el.querySelector(".course-cover img")?.src || "";
      
      return {
        name,
        school: school === name ? "" : school,
        teacher,
        url,
        clazzId,
        courseId,
        cpi,
        progress,
        percent,
        isEnd,
        cover: coverImg
      };
    }).filter(c => c.name.length > 0);
  });

  // 过滤：只看进行中的
  let filtered = courses;
  if (activeOnly) {
    filtered = courses.filter(c => !c.isEnd);
  }
  
  const endedCount = courses.length - filtered.length;

  if (filtered.length === 0) {
    log("未找到课程数据", "warn");
    return [];
  }

  const label = activeOnly ? `进行中 ${filtered.length} 门` : `共 ${courses.length} 门`;
  log(`${label}${endedCount > 0 ? ` (已过滤 ${endedCount} 门已结束)` : ""}:`, "success");
  
  filtered.forEach((c, i) => {
    const prog = c.progress ? ` [${c.progress} ${c.percent}]` : "";
    // 标红没进度的
    const hasZero = c.progress && c.percent === "0%" ? " ⚠️" : "";
    const showProg = c.progress ? ` [${c.progress} ${c.percent}]${hasZero}` : "";
    console.log(`  ${String(i + 1).padEnd(3)}${c.name.padEnd(30)}${c.teacher.padEnd(12)}${showProg}`);
  });

  return filtered;
}

/**
 * 进入某门课程的详情页
 */
export async function enterCourse(page, courseIndex) {
  const course = await page.evaluate((idx) => {
    const items = document.querySelectorAll(".course-list .course.clearfix");
    if (idx >= items.length) return null;
    const el = items[idx];
    const link = el.querySelector("a.color1");
    return {
      url: link?.href || "",
      name: el.querySelector(".course-info h3")?.textContent?.trim() || "",
      clazzId: el.querySelector("input.clazzId")?.value || "",
      courseId: el.querySelector("input.courseId")?.value || "",
    };
  }, courseIndex);

  if (!course || !course.url) {
    log(`第 ${courseIndex + 1} 门课程无法找到链接`, "error");
    return null;
  }

  log(`进入课程: ${course.name}`, "step");
  await page.goto(course.url, { waitUntil: "networkidle", timeout: 20000 });
  await sleep(3000);
  return course;
}

export default { navigateToCourse, fetchCourses, enterCourse };
