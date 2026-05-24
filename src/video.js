import axios from "axios";
import { load } from "cheerio";
import cfg from "./config.js";
import { getEnc, getTimestamp } from "./crypto.js";

let uid = "";
let session = null;
let cookieStr = "";

function makeSession() {
  const s = axios.create({ timeout: 15000 });
  s.defaults.headers = { ...cfg.videoHeaders, Cookie: cookieStr };
  return s;
}

export function setSession(cookies, _uid) {
  cookieStr = cookies;
  uid = _uid;
  session = makeSession();
}

// ===== 获取章节列表 =====
export async function getCoursePoints(courseId, clazzId, cpi) {
  const s = makeSession();
  try {
    const url = `https://mooc2-ans.chaoxing.com/mooc2-ans/mycourse/studentcourse?courseid=${courseId}&clazzid=${clazzId}&cpi=${cpi}&ut=s`;
    const resp = await s.get(url);
    const $ = load(resp.data);
    const points = [];

    $("div.chapter_unit").each((_, unit) => {
      const title = $(unit).find(".chapter_td").text().trim().replace(/\s+/g, " ");
      const items = [];
      
      $(unit).find("li a.clicktitle").each((_, a) => {
        const $a = $(a);
        const name = $a.text().trim().replace(/\s+/g, " ");
        const onclick = $a.attr("onclick") || "";
        const mid = onclick.match(/toOld\(['"]([^'"]+)['"],\s*['"]([^'"]+)['"]/);
        items.push({
          name,
          knowledgeId: mid?.[2] || "",
          courseId: mid?.[1] || ""
        });
      });

      if (title) points.push({ title, items });
    });

    return points;
  } catch (err) {
    console.log(`❌ 获取章节失败: ${err.message}`);
    return [];
  }
}

// ===== 获取任务卡片 (视频信息) =====
export async function getJobCards(clazzId, courseId, cpi, knowledgeId) {
  const s = makeSession();
  try {
    // 尝试num=0,1,2
    for (const num of ["0", "1", "2"]) {
      const url = `https://mooc1.chaoxing.com/mooc-ans/knowledge/cards?clazzid=${clazzId}&courseid=${courseId}&knowledgeid=${knowledgeId}&num=${num}&ut=s&cpi=${cpi}&v=20160407-3&mooc2=1`;
      const resp = await s.get(url);
      const html = resp.data;

      if (typeof html === "string" && html.includes("mArg=")) {
        const m = html.match(/mArg=\{(.*?)\};/);
        if (m) {
          let data;
          try { data = JSON.parse("{" + m[1] + "}"); } catch(e) { continue; }
          
          if (!data?.defaults) continue;

          const defaults = data.defaults;
          const cards = data.cards || [];
          const jobs = [];

          for (const [key, card] of Object.entries(cards)) {
            const job = {
              cardid: defaults.cardid || card.cardid || "",
              ktoken: defaults.ktoken || "",
              mtEnc: defaults.mtEnc || "",
              defenc: defaults.defenc || "",
              cpi: defaults.cpi || cpi,

              jobid: card.jobid || card.jobId || "",
              otherinfo: card.otherinfo || card.otherInfo || "",
              objectid: card.objectid || card.objectId || "",
              cardTitle: card.cardTitle || card.title || card.cardtitle || "",
              type: card.type || ""
            };
            
            // 提取dtoken从attachments
            if (card.attachments) {
              const att = Array.isArray(card.attachments) ? card.attachments[0] : card.attachments;
              if (att && att.property) {
                job.dtoken = att.property.dtoken || "";
                job.duration = parseInt(att.property.duration) || 0;
                job.objectid = att.property.objectid || att.objectid || job.objectid;
              }
            }

            jobs.push(job);
          }

          return jobs;
        }
      }
    }
    return [];
  } catch (err) {
    console.log(`❌ 获取任务卡片失败: ${err.message}`);
    return [];
  }
}

// ===== 获取视频时长和dtoken (从status API) =====
export async function getVideoStatus(objectId) {
  const s = makeSession();
  try {
    const url = `https://mooc1.chaoxing.com/ananas/status/${objectId}?k=4311&flag=normal&ro=0&_dc=${Date.now()}`;
    const resp = await s.get(url);
    const data = resp.data;
    return {
      duration: data.duration || 0,
      dtoken: data.dtoken || "",
      objectId: objectId
    };
  } catch (err) {
    return { duration: 0, dtoken: "", objectId };
  }
}

// ===== 发送视频心跳 =====
export async function sendHeartbeat(params) {
  const s = makeSession();
  const { clazzId, userid, jobid, objectId, playingTime, duration, otherinfo, courseId, cpi, dtoken, _type } = params;
  
  const enc = getEnc(clazzId, userid, jobid, objectId, playingTime, duration);
  const midText = otherinfo
    ? `otherInfo=${otherinfo}&`
    : `otherInfo=${otherinfo}&courseId=${courseId}&`;

  // 尝试rt=0.9和rt=1
  for (const rt of ["0.9", "1"]) {
    const url = `https://mooc1.chaoxing.com/mooc-ans/multimedia/log/a/${cpi}/${dtoken}?` +
      `clazzId=${clazzId}&` +
      `playingTime=${playingTime}&` +
      `duration=${duration}&` +
      `clipTime=0_${duration}&` +
      `objectId=${objectId}&` +
      `${midText}` +
      `jobid=${jobid}&` +
      `userid=${userid}&` +
      `isdrag=3&` +
      `view=pc&` +
      `enc=${enc}&` +
      `rt=${rt}&` +
      `dtype=${_type || "Video"}&` +
      `_t=${Date.now()}`;

    try {
      const resp = await s.get(url);
      if (resp.status === 200) return true;
    } catch(e) {}
  }
  return false;
}

// ===== 完整刷视频流程 =====
export async function watchVideo(job, course, userid) {
  const { clazzId, courseId, cpi } = course;
  const { jobid, objectid, otherinfo, dtoken } = job;

  console.log(`\n🎬 获取视频信息...`);

  // 如果dtoken为空，从status API获取
  let dur = job.duration;
  let tok = dtoken;
  let oid = objectid;

  if (!tok || !dur) {
    const status = await getVideoStatus(oid);
    dur = status.duration;
    tok = status.dtoken;
    oid = status.objectId;
  }

  if (!dur || !tok) {
    console.log(`❌ 无法获取视频时长`);
    return false;
  }

  console.log(`📹 视频: ${dur}s, dtoken: ${tok.slice(0, 12)}...`);

  // 每隔3秒发送一次心跳，1倍速
  let played = 0;
  let successCount = 0;

  while (played < dur) {
    played = Math.min(played + 3, dur);

    const ok = await sendHeartbeat({
      clazzId, userid, jobid: jobid || job.jobid,
      objectId: oid,
      playingTime: played,
      duration: dur,
      otherinfo: otherinfo || job.otherinfo,
      courseId,
      cpi,
      dtoken: tok
    });

    if (ok) {
      successCount++;
      const pct = Math.round(played / dur * 100);
      process.stdout.write(`\r⏳ ${played}/${dur}s (${pct}%) 心跳x${successCount}`);
    }

    await new Promise(r => setTimeout(r, 3000));
  }

  console.log(`\n✅ ${dur}/${dur}s 完成! 共${successCount}次心跳`);
  return true;
}
