import { load } from "cheerio";
import cfg from "./config.js";
import { getEnc } from "./crypto.js";
import { client, jar } from "./api.js";

let uid = "";

export function setSession(_uid) {
  uid = _uid;
}

export function getRandomWait() {
  return Math.floor(Math.random() * 61) + 30;
}

async function getFid() {
  const cookies = await jar.getCookies("https://chaoxing.com");
  return cookies.find(c => c.key === "fid")?.value || "4311";
}

// ===== 章节列表 =====
export async function getCoursePoints(courseId, clazzId, cpi) {
  const url = `https://mooc2-ans.chaoxing.com/mooc2-ans/mycourse/studentcourse?courseid=${courseId}&clazzid=${clazzId}&cpi=${cpi}&ut=s`;
  try {
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
  } catch (err) {
    console.log(`  ❌ 章节: ${err.message}`);
    return [];
  }
}

// ===== 任务卡片 =====
export async function getJobCards(clazzId, courseId, cpi, knowledgeId) {
  for (const num of ["0", "1", "2"]) {
    const url = `https://mooc1.chaoxing.com/mooc-ans/knowledge/cards?clazzid=${clazzId}&courseid=${courseId}&knowledgeid=${knowledgeId}&num=${num}&ut=s&cpi=${cpi}&v=20160407-3&mooc2=1`;
    try {
      const resp = await client.get(url, { headers: cfg.videoHeaders });
      const html = resp.data;
      if (typeof html !== "string" || !html.includes("mArg")) continue;

      const m = html.match(/mArg\s*=\s*(\{[\s\S]*?\});/);
      if (!m) continue;

      const data = JSON.parse(m[1]);
      const def = data.defaults || {};
      const atts = data.attachments || [];
      const jobs = [];

      for (const att of atts) {
        if (!att.jobid && !att.property?.jobid) continue;
        const prop = att.property || {};
        jobs.push({
          jobid: att.jobid || prop.jobid || "",
          otherinfo: att.otherInfo || prop.otherInfo || att.otherinfo || "",
          objectid: att.objectId || prop.objectid || att.objectid || "",
          cardTitle: prop.title || att.title || "视频",
          type: att.type || prop.type || "",
          dtoken: prop.dtoken || "",
          duration: prop.duration ? parseInt(prop.duration) : (att.attDuration || 0),
          jtoken: att.jtoken || prop.jtoken || "",
          enc: att.enc || prop.enc || "",
          ktoken: def.ktoken || "",
          cpi: def.cpi || cpi,
          knowledgeid: knowledgeId
        });
      }
      if (jobs.length) return jobs;
    } catch (e) { continue; }
  }
  return [];
}

// ===== 获取视频状态 =====
export async function getVideoStatus(objectId) {
  const fid = await getFid();
  const url = `https://mooc1.chaoxing.com/ananas/status/${objectId}?k=${fid}&flag=normal&_dc=${Date.now()}`;
  try {
    const resp = await client.get(url, { headers: cfg.videoHeaders });
    const d = resp.data;
    return { duration: d.duration || 0, dtoken: d.dtoken || "", crc: d.crc || "", status: d.status || "success" };
  } catch (e) {
    return { duration: 0, dtoken: "", crc: "", status: "error" };
  }
}

// ===== 心跳 =====
export async function sendHeartbeat(clazzId, userid, jobid, objectId, playingTime, duration, otherinfo, courseId, cpi, dtoken, type = "Video") {
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
      const resp = await client.get(url, { headers: cfg.videoHeaders });
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
      process.stdout.write(`\r${name} |${bar}| ${pct}%  ${fmt(pos)}/${fmt(total)}`);
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
  const userid = _uid || uid;

  let dur = job.duration;
  let tok = job.dtoken;

  if (!tok || !dur) {
    const status = await getVideoStatus(objectid);
    if (status.status !== "success") { console.log(`  ❌ 视频信息失败`); return false; }
    dur = status.duration;
    tok = status.dtoken;
  }

  if (!dur || !tok) { console.log(`  ❌ 无效视频信息`); return false; }

  console.log(`  📹 ${dur}秒`);

  let played = 0;
  let isFinished = false;

  while (!isFinished) {
    const resp = await sendHeartbeat(clazzId, userid, jobid, objectid, played, dur, otherinfo, courseId, cpi, tok);
    if (resp === false) { console.log(`\n  ⚠️ 心跳失败`); break; }
    if (resp.isPassed) { console.log(`\n  ✅ 完成!`); break; }

    let wait = getRandomWait();
    if (played + wait >= dur) { wait = dur - played; isFinished = true; }

    await showProgress(cardTitle || "视频", played, wait, dur, speed);
    played += wait;
  }

  process.stdout.write("\r".padEnd(60, " ") + "\r");
  console.log(`  ✅ ${cardTitle || "视频"} (${dur}s)`);
  return true;
}

// ===== 刷文档 =====
export async function watchDocument(job, course) {
  const kid = job.otherinfo?.match(/nodeId_(.*?)-/)?.[1] || "";
  const url = `https://mooc1.chaoxing.com/ananas/job/document?jobid=${job.jobid}&knowledgeid=${kid}&courseid=${course.courseId}&clazzid=${course.clazzId}&jtoken=${job.jtoken}&_dc=${Date.now()}`;
  try { await client.get(url, { headers: cfg.headers }); console.log(`  ✅ 文档完成`); return true; }
  catch (e) { console.log(`  ❌ 文档: ${e.message}`); return false; }
}
