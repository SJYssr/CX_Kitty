import cfg from "./config.js";
import { getEnc } from "./crypto.js";
import { client } from "./api.js";

export let uid = "";

export async function initSession(phone, pwd) {
  const { aesEncrypt } = await import("./api.js");
  const params = new URLSearchParams({
    fid: "-1", uname: aesEncrypt(phone), password: aesEncrypt(pwd),
    refer: "https%3A%2F%2Fi.chaoxing.com", t: "true",
    forbidotherlogin: "0", validate: "", doubleFactorLogin: "0", independentId: "0"
  });
  const resp = await client.post("https://passport2.chaoxing.com/fanyalogin", params.toString(), {
    headers: { ...cfg.headers, "Content-Type": "application/x-www-form-urlencoded" }
  });
  if (resp.data?.status !== true) throw new Error("登录失败");
  const cookies = await client.defaults.jar.getCookies("https://chaoxing.com");
  uid = cookies.find(c => c.key === "_uid")?.value || "";
  await client.get("https://mooc2-ans.chaoxing.com/mooc2-ans/visit/interaction", { headers: cfg.headers }).catch(() => {});
}

// ===== 章节列表 =====
export async function getCoursePoints(courseId, clazzId, cpi) {
  const { load } = await import("cheerio");
  const url = `https://mooc2-ans.chaoxing.com/mooc2-ans/mycourse/studentcourse?courseid=${courseId}&clazzid=${clazzId}&cpi=${cpi}&ut=s`;
  const resp = await client.get(url, { headers: cfg.headers });
  const $ = load(resp.data);
  const points = [];
  $("div.chapter_unit").each((_, unit) => {
    const title = $(unit).find(".catalog_name.newCatalog_name").first().text().trim().replace(/\s+/g, " ");
    const items = [];
    $(unit).find("div.chapter_item[id^=cur]").each((_, el) => {
      const $el = $(el);
      const id = $el.attr("id")?.replace("cur", "");
      const name = $el.attr("title") || $el.find(".catalog_title").text().trim().replace(/\s+/g, " ");
      const onclick = $el.attr("onclick") || "";
      const mid = onclick.match(/toOld\(['"]([^'"]+)['"],\s*['"]([^'"]+)['"]/);
      if (id && name) items.push({ id, name, knowledgeId: mid?.[2] || "", courseId: mid?.[1] || "" });
    });
    if (title) points.push({ title, items });
  });
  return points;
}

// ===== 任务卡片（提取完整字段） =====
export async function getJobCards(clazzId, courseId, cpi, knowledgeId) {
  const url = `https://mooc1.chaoxing.com/mooc-ans/knowledge/cards?clazzid=${clazzId}&courseid=${courseId}&knowledgeid=${knowledgeId}&num=0&ut=s&cpi=${cpi}&v=20160407-3&mooc2=1`;
  try {
    const resp = await client.get(url, { headers: cfg.videoHeaders });
    const html = resp.data;
    if (!html.includes("mArg")) return [];
    const m = html.match(/mArg\s*=\s*(\{[\s\S]*?\});/);
    if (!m) return [];
    const data = JSON.parse(m[1]);
    const atts = data.attachments || [];
    const jobs = [];
    for (const att of atts) {
      if (!att.jobid && !att.property?.jobid) continue;
      const prop = att.property || {};
      // rt: 从otherinfo解析 -rt_d(0.9) 或 -rt_1(1)
      let rt = prop.rt || "";
      if (!rt) {
        const rm = att.otherInfo?.match(/-rt_([1d])/);
        if (rm) rt = rm[1] === "d" ? "0.9" : "1";
      }
      jobs.push({
        jobid: att.jobid || prop.jobid || "",
        otherinfo: att.otherInfo || prop.otherInfo || att.otherinfo || "",
        objectid: att.objectId || prop.objectid || att.objectid || "",
        cardTitle: prop.title || att.title || "视频",
        type: att.type || prop.type || "",
        jtoken: att.jtoken || prop.jtoken || "",
        playTime: att.playTime || 0,
        rt,
        attDuration: att.attDuration || "",
        attDurationEnc: att.attDurationEnc || "",
        videoFaceCaptureEnc: att.videoFaceCaptureEnc || "",
        knowledgeid: knowledgeId
      });
    }
    return jobs;
  } catch (e) { return []; }
}

// ===== 获取视频状态 =====
export async function getVideoStatus(objectid) {
  const fid = "4311";
  const url = `https://mooc1.chaoxing.com/ananas/status/${objectid}?k=${fid}&flag=normal&_dc=${Date.now()}`;
  try {
    const resp = await client.get(url, { headers: cfg.videoHeaders });
    if (resp.data?.status === "success") {
      return { dtoken: resp.data.dtoken, duration: resp.data.duration };
    }
    return null;
  } catch (e) { return null; }
}

// ===== 视频心跳 =====
export async function videoProgressLog(course, job, dtoken, duration, playingTime, isdrag = 3) {
  const enc = getEnc(course.clazzId, uid, job.jobid, job.objectid, playingTime, duration);
  const params = {
    clazzId: course.clazzId,
    playingTime,
    duration,
    clipTime: `0_${duration}`,
    objectId: job.objectid,
    otherInfo: job.otherinfo,
    courseId: course.courseId,
    jobid: job.jobid,
    userid: uid,
    isdrag,
    view: "pc",
    enc,
    dtype: "Video",
    _t: Date.now()
  };
  // 关键附加参数
  if (job.rt) params.rt = job.rt;
  if (job.attDuration) params.attDuration = job.attDuration;
  if (job.attDurationEnc) params.attDurationEnc = job.attDurationEnc;
  if (job.videoFaceCaptureEnc) params.videoFaceCaptureEnc = job.videoFaceCaptureEnc;

  const baseUrl = `https://mooc1.chaoxing.com/mooc-ans/multimedia/log/a/${course.cpi}/${dtoken}`;

  // 有rt直接发，否则循环尝试
  const rtValues = job.rt ? [job.rt] : ["0.9", "1"];
  for (const rt of rtValues) {
    params.rt = rt;
    params._t = Date.now();
    try {
      const resp = await client.get(baseUrl, { params, headers: cfg.videoHeaders });
      if (resp.status === 200) return { passed: resp.data.isPassed, status: 200 };
    } catch (e) {
      if (e.response?.status === 403) continue;
      return { passed: false, status: e.response?.status || 0 };
    }
  }
  return { passed: false, status: 403 };
}

// ===== 刷视频 =====
export async function watchVideo(job, course, speed = 1.0) {
  // 获取视频信息
  const status = await getVideoStatus(job.objectid);
  if (!status) { console.log(`  ❌ 无法获取视频信息`); return false; }

  const dur = status.duration;
  const tok = status.dtoken;
  console.log(`  📹 ${dur}秒`);

  // 首次心跳检查是否已完成（isdrag=4 表示初始检查）
  let r = await videoProgressLog(course, job, tok, dur, dur, 4);
  if (r.passed) { console.log(`  ✅ 已完成`); return true; }

  // 从已播放进度开始
  const startPlay = Math.floor((job.playTime || 0) / 1000);
  let played = startPlay;
  let forbiddenCount = 0;
  const maxForbidden = 2;

  while (played < dur) {
    r = await videoProgressLog(course, job, tok, dur, Math.floor(played));
    
    if (r.status === 403) {
      forbiddenCount++;
      if (forbiddenCount > maxForbidden) { console.log(`\n  ⚠️ 403重试失败`); break; }
      // 刷新dtoken
      const refreshed = await getVideoStatus(job.objectid);
      if (refreshed) tok = refreshed.dtoken;
      await new Promise(r => setTimeout(r, 3000));
      continue;
    }
    forbiddenCount = 0;

    if (r.passed) { console.log(`\n  ✅ 完成!`); break; }

    // 随机等待30-90秒
    const wait = Math.min(Math.floor(Math.random() * 61) + 30, dur - played);
    const start = Date.now();
    await new Promise(resolve => {
      const id = setInterval(() => {
        const elapsed = (Date.now() - start) / 1000;
        const pos = Math.min(played + elapsed * speed, dur);
        const pct = Math.round(pos / dur * 100);
        const bar = "#".repeat(Math.round(pct / 100 * 40)).padEnd(40, " ");
        process.stdout.write(`\r${job.cardTitle || "视频"} |${bar}| ${pct}%`);
        if (elapsed >= wait) { clearInterval(id); resolve(); }
      }, 300);
    });
    played += wait;
  }

  process.stdout.write("\r".padEnd(60, " ") + "\r");
  console.log(`  ${job.cardTitle || "视频"} (${played}/${dur}s)`);
  return r?.passed || false;
}
