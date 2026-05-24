import axios from "axios";
import { wrapper } from "axios-cookiejar-support";
import { CookieJar } from "tough-cookie";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import cfg from "./config.js";

// Cookie jar - persists across requests
const jar = new CookieJar();
const client = wrapper(axios.create({ jar, withCredentials: true }));

const cookieFile = path.resolve(cfg.cookiePath);

function saveJar() {
  jar.toJSON().cookies.forEach(c => { /* just for safety */ });
}

export function aesEncrypt(plaintext) {
  const key = Buffer.from(cfg.AESKey, "utf8");
  const iv = Buffer.from(cfg.AESKey, "utf8");
  const cipher = crypto.createCipheriv("aes-128-cbc", key, iv);
  let enc = cipher.update(plaintext, "utf8", "base64");
  enc += cipher.final("base64");
  return enc;
}

// ===== 登录 =====
export async function login(phone, password) {
  try {
    const encPhone = aesEncrypt(phone);
    const encPwd = aesEncrypt(password);
    const params = new URLSearchParams({
      fid: "-1", uname: encPhone, password: encPwd,
      refer: "https%3A%2F%2Fi.chaoxing.com", t: "true",
      forbidotherlogin: "0", validate: "", doubleFactorLogin: "0", independentId: "0"
    });

    const resp = await client.post("https://passport2.chaoxing.com/fanyalogin", params.toString(), {
      headers: { ...cfg.headers, "Content-Type": "application/x-www-form-urlencoded" }
    });

    if (resp.data.status === true) {
      // Save cookies
      const cookies = await jar.getCookies("https://chaoxing.com");
      const uid = cookies.find(c => c.key === "_uid")?.value || "";
      fs.writeFileSync(cookieFile, JSON.stringify(await jar.toJSON()));
      console.log(`✅ 登录成功! uid=${uid}`);
      return { success: true, uid };
    } else {
      console.log(`❌ 登录失败: ${resp.data.msg2 || resp.data.message}`);
      return { success: false };
    }
  } catch (err) {
    console.log(`❌ 登录异常: ${err.message}`);
    return { success: false };
  }
}

// ===== 加载已保存的cookie =====
export function loadJar() {
  if (fs.existsSync(cookieFile)) {
    const data = JSON.parse(fs.readFileSync(cookieFile, "utf8"));
    jar.removeAllCookiesSync();
    CookieJar.fromJSON(JSON.stringify(data)).then(j => {
      j.getCookies("https://chaoxing.com").then(cookies => {
        cookies.forEach(c => jar.setCookie(c.cookieString(), "https://chaoxing.com"));
      });
    });
  }
}

// ===== 获取课程列表 =====
export async function getCourseList() {
  try {
    const params = new URLSearchParams({
      courseType: "1", courseFolderId: "0", query: "", superstarClass: "0"
    });
    const resp = await client.post(
      "https://mooc2-ans.chaoxing.com/mooc2-ans/visit/courselistdata",
      params.toString(),
      { headers: { ...cfg.headers, "Content-Type": "application/x-www-form-urlencoded" } }
    );

    const { load } = await import("cheerio");
    const $ = load(resp.data);
    const courses = [];
    $("div.course.clearfix").each((_, el) => {
      const $el = $(el);
      const name = $el.find(".course-info h3").text().trim();
      if (!name) return;
      courses.push({
        name,
        courseId: $el.find("input.courseId").val(),
        clazzId: $el.find("input.clazzId").val(),
        cpi: $el.find("input.curPersonId").val(),
        teacher: $el.find("p.color3").attr("title") || "",
        isEnd: $el.text().includes("课程已结束")
      });
    });
    return courses;
  } catch (err) {
    console.log(`❌ 获取课程失败: ${err.message}`);
    return [];
  }
}

export { client, jar };
