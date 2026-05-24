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
 */
export async function fetchCourses(page) {
  log("正在抓取课程列表...", "step");

  const courses = await page.evaluate(() => {
    const items = document.querySelectorAll(".course-list .course.clearfix");
    
    return Array.from(items).map(el => {
      const infoEl = el.querySelector(".course-info");
      
      // 课程名
      const nameEl = infoEl?.querySelector("h3");
      const name = nameEl?.textContent?.trim() || "";
      
      // 学校
      const schoolEl = infoEl?.querySelector("p.margint10");
      const school = schoolEl?.textContent?.trim() || "";
      
      // 教师
      const teacherEl = infoEl?.querySelector("p.line2.color3");
      const teacher = teacherEl?.textContent?.trim() || "";
      
      // 隐藏字段
      const clazzId = el.querySelector("input.clazzId")?.value || "";
      const courseId = el.querySelector("input.courseId")?.value || "";
      const cpi = el.querySelector("input.curPersonId")?.value || "";
      
      // 课程链接
      const link = el.querySelector("a.color1");
      const url = link?.href || "";
      
      // 进度
      const progressEl = el.querySelector(".btm-cover .fl.l-txt");
      const percentEl = el.querySelector(".btm-cover .fr");
      const progress = progressEl ? progressEl.textContent.trim() : "";
      const percent = percentEl ? percentEl.textContent.trim() : "";
      
      // 课程状态（是否已结束）
      const isEnd = el.textContent.includes("课程已结束");
      
      // 封面图
      const coverImg = el.querySelector(".course-cover img")?.src || "";
      
      return {
        name,
        school: school === name ? "" : school, // 去重
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

  if (courses.length === 0) {
    log("未找到课程数据", "warn");
    return [];
  }

  log(`共 ${courses.length} 门课程:`, "success");
  courses.forEach((c, i) => {
    const ended = c.isEnd ? " [已结束]" : "";
    const prog = c.progress ? ` [${c.progress} ${c.percent}]${ended}` : ended;
    console.log(`  ${i + 1}. ${c.name}  —  ${c.teacher}${prog}`);
  });

  return courses;
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
