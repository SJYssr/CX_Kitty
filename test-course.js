import { login } from "./src/login.js";
import { navigateToCourse, fetchCourses } from "./src/courses.js";
import { fetchChapters } from "./src/chapters.js";
import { closeBrowser } from "./src/browser.js";
import { log, sleep } from "./src/utils.js";

const result = await login("18836196959", "sjy20040608");
if (!result.success) { log("登录失败", "error"); process.exit(1); }

const page = result.page;

await navigateToCourse(page);
const courses = await fetchCourses(page, true);

if (courses.length >= 2) {
  const course = courses[1];
  log(`选中: ${course.name} - ${course.teacher}`, "step");
  await fetchChapters(page, course.url);
}

await closeBrowser();
