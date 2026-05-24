import axios from "axios";
import { load } from "cheerio";
import cfg from "./config.js";
import { getEnc } from "./crypto.js";

let uid = "";
let cookieStr = "";

export function setSession(cookies, _uid) {
  cookieStr = cookies;
  uid = _uid;
}

function makeSession(isVideo = false) {
  const s = axios.create({ timeout: 15000 });
  s.defaults.headers = { ...(isVideo ? cfg.videoHeaders : cfg.headers), Cookie: cookieStr };
  return s;
}

export function getRandomWait() {
  return Math.floor(Math.random() * 61) + 30;
}

function getFid() {
  const m = cookieStr.match(/fid=(\d+)/);
  return m ? m[1] : "4311";
}

// ===== 章节列表 =====
export async function getCoursePoints(courseId, clazzId, cpi) {
  const s = makeSession();
  const url = `https://mooc2-ans.chaoxing.com/mooc2-ans/mycourse/studentcourse?courseid=${courseId}&clazzid=${clazzId}&cpi=${cpi}&ut=s`;
  const resp = await s.get(url);
  const $ = load(resp.data);
  const points = [];

  $("div.chapter_unit").each((_, unit) => {
    const title = $(unit).find(".chapter_td").text().trim().replace(/\s+/g, " ");
    const items = [];
    $(unit).find("li").each((_, li) => {
      const $div = $(li).find("div[id^=cur]");
      if (!$div.length) return;
      const id = $div.attr("id")?.replace("cur", "");
      const $a = $div.find("a.clicktitle");
      const name = $a.text().trim().replace(/\s+/g, " ");
      const onclick = $a.attr("onclick") || "";
      const mid = onclick.match(/toOld\(['"]([^'"]+)['"],\s*['"]([^'"]+)['"]/);
      if (id && name) items.push({ id, name, knowledgeId: mid?.[2] || "", courseId: mid?.[1] || "" });
    });
    if (title) points.push({ title, items });
  });
  return points;
}

// ===== 任务卡片 =====
export async function getJobCards(clazzId, courseId, cpi, knowledgeId) {
  const s = makeSession();
  for (const num of ["0", "1", "2"]) {
    const url = `https://mooc1.chaoxing.com/mooc-ans/knowledge/cards?clazzid=${clazzId}&courseid=${courseId}&knowledgeid=${knowledgeId}&num=${num}&ut=s&cpi=${cpi}&v=20160407-3&mooc2=1`;
    try {
      const resp = await s.get(url);
      const html = resp.data;
      if (!html.includes("mArg=")) continue;
      const m = html.match(/mArg=\{(.*?)\};/);
      if (!m) continue;
      const data = JSON.parse("{" + m[1] + "}");
      if (!data?.defaults) continue;
      const def = data.defaults;
      const jobs = [];
      for (const card of Object.values(data.cards || {})) {
        const job = {
          cardid: def.cardid || "",
          ktoken: def.ktoken || "", mtEnc: def.mtEnc || "", defenc: def.defenc || "",
          cpi: def.cpi || cpi,
          jobid: card.jobid || card.jobId || "",
          otherinfo: card.otherinfo || card.otherInfo || "",
          objectid: card.objectid || card.objectId || "",
          cardTitle: card.cardTitle || card.title || card.cardtitle || "",
          type: card.type || "", enc: card.enc || "", jtoken: card.jtoken || "",
          knowledgeid: knowledgeId
        };
        if (card.attachments) {
          const att = Array.isArray(card.attachments) ? card.attachments[0] : card.attachments;
          if (att?.property) {
            job.dtoken = att.property.dtoken || "";
            job.duration = parseInt(att.property.duration) || 0;
            job.objectid = att.property.objectid || att.objectid || job.objectid;
          }
        }
        jobs.push(job);
      }
      return jobs;
    } catch (e) { continue; }
  }
  return [];
}

// ===== 视频状态 =====
export async function getVideoStatus(objectId) {
  const s = makeSession(true);
  const fid = getFid();
  const url = `https://mooc1.chaoxing.com/ananas/status/${objectId}?k=${fid}&flag=normal&_dc=${Date.now()}`;
  try {
    const resp = await s.get(url);
    const d = resp.data;
    return { duration: d.duration || 0, dtoken: d.dtoken || "", crc: d.crc || "", key: d.key || "", status: d.status };
  } catch (e) {
    return { duration: 0, dtoken: "", crc: "", key: "", status: "error" };
  }
}

// ===== 心跳 → 返回 {isPassed} =====
export async function sendHeartbeat(clazzId, userid, jobid, objectId, playingTime, duration, otherinfo, courseId, cpi, dtoken, type = "Video") {
  const s = makeSession(true);
  const enc = getEnc(clazzId, userid, jobid, objectId, playingTime, duration);
  const mid = otherinfo?.includes("courseId")
    ? `otherInfo=${encodeURIComponent(otherinfo)}&`
    : `otherInfo=${encodeURIComponent(otherinfo)}&courseId=${courseId}&`;

  for (const rt of ["0.9", "1"]) {
    const url = `https://mooc1.chaoxing.com/mooc-ans/multimedia/log/a/${cpi}/${dtoken}?` +
      `clazzId=${clazzId}&playingTime=${playingTime}&duration=${duration}&clipTime=0_${duration}&` +
      `objectId=${objectId}&${mid}jobid=${jobid}&userid=${userid}&isdrag=3&view=pc&enc=${enc}&` +
      `rt=${rt}&dtype=${type}&_t=${Date.now()}`;
    try {
      const resp = await s.get(url);
      if (resp.status === 200) return resp.data;
    } catch (e) {
      if (e.response?.status === 403) continue;
    }
  }
  return false;
}

// ===== 进度条 =====
function showProgress(name, current, waitSec, total, speed) {
  const start = Date.now();
  return new Promise(resolve => {
    const id = setInterval(() => {
      const elapsed = (Date.now() - start) / 1000;
      const pos = Math.min(current + elapsed * speed, total);
      const pct = Math.round(pos / total * 100);
      const bar = "#".repeat(Math.round(pct / 100 * 40)).padEnd(40, " ");
      process.stdout.write(`\r📺 ${name} |${bar}| ${pct}%  ${fmt(pos)}/${fmt(total)}`);
      if (elapsed >= waitSec) { clearInterval(id); resolve(); }
    }, 300);
  });
}

function fmt(s) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  return h ? `${h}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}` :
         `${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
}

// ===== 刷视频 =====
export async function watchVideo(job, course, _uid, speed = 1.0) {
  const { clazzId, courseId, cpi } = course;
  const { jobid, objectid, otherinfo, cardTitle } = job;

  const status = await getVideoStatus(objectid);
  if (status.status !== "success" || !status.duration) {
    console.log(`  ❌ 无法获取视频信息`);
    return false;
  }

  const dur = status.duration;
  const tok = status.dtoken;
  const userid = _uid || uid;

  console.log(`  📹 总时长: ${dur}秒`);

  let played = 0;
  let isFinished = false;

  while (!isFinished) {
    const resp = await sendHeartbeat(clazzId, userid, jobid, objectid, played, dur, otherinfo, courseId, cpi, tok);
    if (resp === false) { console.log(`\n  ⚠️ 心跳403`); break; }
    if (resp.isPassed) { console.log(`\n  ✅ isPassed=true → 完成!`); break; }

    let wait = getRandomWait();
    if (played + wait >= dur) { wait = dur - played; isFinished = true; }

    const name = cardTitle || "视频";
    await showProgress(name, played, wait, dur, speed);
    played += wait;
  }

  process.stdout.write("\r".padEnd(60, " ") + "\r");
  console.log(`  ✅ ${cardTitle || "视频"} (${dur}s)`);
  return true;
}

// ===== 刷文档 =====
export async function watchDocument(job, course) {
  const s = makeSession();
  const kid = job.otherinfo?.match(/nodeId_(.*?)-/)?.[1] || "";
  const url = `https://mooc1.chaoxing.com/ananas/job/document?jobid=${job.jobid}&knowledgeid=${kid}&courseid=${course.courseId}&clazzid=${course.clazzId}&jtoken=${job.jtoken}&_dc=${Date.now()}`;
  try { await s.get(url); console.log(`  ✅ 文档完成`); return true; }
  catch (e) { console.log(`  ❌ 文档: ${e.message}`); return false; }
}
