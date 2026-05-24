import axios from "axios";
import { load } from "cheerio";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import cfg from "./config.js";
import { getEnc, getTimestamp } from "./crypto.js";

// ===== AES 加密 (用于登录) =====
function aesEncrypt(plaintext) {
  const key = Buffer.from(cfg.AESKey, "utf8");
  const iv = Buffer.from(cfg.AESKey, "utf8");
  const cipher = crypto.createCipheriv("aes-128-cbc", key, iv);
  // PKCS7 padding
  let encrypted = cipher.update(plaintext, "utf8", "base64");
  encrypted += cipher.final("base64");
  return encrypted;
}

// ===== Session / Cookie 管理 =====
let session = null;
const cookieFile = path.resolve(cfg.cookiePath);

function loadCookies() {
  try {
    if (fs.existsSync(cookieFile)) {
      const data = JSON.parse(fs.readFileSync(cookieFile, "utf8"));
      return data;
    }
  } catch(e) {}
  return {};
}

function saveCookies(cookies) {
  fs.writeFileSync(cookieFile, JSON.stringify(cookies, null, 2));
}

function getSession(isVideo = false) {
  const s = axios.create({
    timeout: 15000,
    withCredentials: true
  });
  
  const stored = loadCookies();
  if (stored.jar) {
    s.defaults.headers.Cookie = stored.jar;
  }
  s.defaults.headers = {
    ...s.defaults.headers,
    ...(isVideo ? cfg.videoHeaders : cfg.headers)
  };
  return s;
}

// ===== 登录 =====
export async function login(phone, password) {
  const s = axios.create({ timeout: 15000, maxRedirects: 0 });
  s.defaults.headers = { ...cfg.headers, "Content-Type": "application/x-www-form-urlencoded" };

  try {
    const encPhone = aesEncrypt(phone);
    const encPwd = aesEncrypt(password);

    const params = new URLSearchParams({
      fid: "-1",
      uname: encPhone,
      password: encPwd,
      refer: "https%3A%2F%2Fi.chaoxing.com",
      t: "true",
      forbidotherlogin: "0",
      validate: "",
      doubleFactorLogin: "0",
      independentId: "0"
    });

    const resp = await s.post("https://passport2.chaoxing.com/fanyalogin", params.toString());
    const data = resp.data;

    if (data.status === true) {
      // 保存cookies
      const cookieStr = resp.headers["set-cookie"]?.join("; ") || "";
      saveCookies({ jar: cookieStr });
      
      // 提取_uid
      const uid = cookieStr.match(/_uid=(\d+)/)?.[1] || "";
      session = { cookie: cookieStr, uid };
      console.log(`✅ 登录成功! uid=${uid}`);
      return { success: true, uid };
    } else {
      console.log(`❌ 登录失败: ${data.msg2 || data.message}`);
      return { success: false };
    }
  } catch (err) {
    console.log(`❌ 登录异常: ${err.message}`);
    return { success: false };
  }
}

// ===== 获取课程列表 =====
export async function getCourseList() {
  const s = getSession();
  try {
    const params = new URLSearchParams({
      courseType: "1",
      courseFolderId: "0",
      query: "",
      superstarClass: "0"
    });
    
    const resp = await s.post(
      "https://mooc2-ans.chaoxing.com/mooc2-ans/visit/courselistdata",
      params.toString(),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    const $ = load(resp.data);
    const courses = [];

    $("div.course.clearfix").each((_, el) => {
      const $el = $(el);
      const $h3 = $el.find(".course-info h3");
      const name = $h3.text().trim();
      if (!name) return;

      const courseId = $el.find("input.courseId").val();
      const clazzId = $el.find("input.clazzId").val();
      const cpi = $el.find("input.curPersonId").val();
      const teacher = $el.find("p.color3").attr("title") || "";
      
      // 判断是否已结束
      const isEnd = $el.text().includes("课程已结束");

      courses.push({ name, courseId, clazzId, cpi, teacher, isEnd });
    });

    return courses;
  } catch (err) {
    console.log(`❌ 获取课程失败: ${err.message}`);
    return [];
  }
}
