import { log, sleep, randomSleep } from "./utils.js";
import axios from "axios";
import { URL } from "url";

/**
 * 进入视频知识页面并自动刷视频
 */
export async function autoWatchVideo(page, cf, course, knowledgeId) {
  log(`进入视频知识: knowledgeId=${knowledgeId}`, "step");

  // 收集心跳请求参数
  let heartbeatParams = null;
  page.on("request", req => {
    const url = req.url();
    if (url.includes("multimedia/log/a/")) {
      try {
        const parsed = new URL(url);
        heartbeatParams = {
          fullUrl: url,
          pathname: parsed.pathname,
          playingTime: parseInt(parsed.searchParams.get("playingTime") || "0"),
          duration: parseInt(parsed.searchParams.get("duration") || "0"),
          clazzId: parsed.searchParams.get("clazzId") || "",
          objectId: parsed.searchParams.get("objectId") || "",
          clipTime: parsed.searchParams.get("clipTime") || "",
          cpi: parsed.pathname.match(/\/a\/(\d+)\//)?.[1] || ""
        };
      } catch(e) {}
    }
  });

  // 点击视频项
  await cf.evaluate((kid) => {
    const items = Array.from(document.querySelectorAll(".chapter_item"));
    const target = items.find(el => {
      const onclick = el.getAttribute("onclick") || "";
      return onclick.includes(kid);
    });
    if (target) target.click();
  }, knowledgeId);

  await sleep(6000);

  // 等心跳发出来
  await sleep(5000);

  if (!heartbeatParams) {
    log("未捕获到心跳请求，尝试播放视频触发...", "warn");

    // 找视频iframe播放
    for (const f of page.frames()) {
      if (f.url().includes("video/index")) {
        log("播放视频...", "step");
        await f.evaluate(() => {
          const v = document.querySelector("video");
          if (v) {
            v.muted = true;
            v.play().catch(() => {});
          }
          document.querySelector(".vjs-big-play-button, .vjs-play-control")?.click();
        });
        break;
      }
    }

    await sleep(10000);
  }

  if (!heartbeatParams) {
    log("仍然未捕获心跳，使用备用方案直接从页面提取参数", "warn");

    // 从页面提取参数
    const params = await page.evaluate(() => {
      const scripts = Array.from(document.querySelectorAll("script"));
      let hash = "", objectId = "", cpi = "", clazzId = "", courseId = "";
      let duration = 0;

      for (const s of scripts) {
        const t = s.textContent || "";
        let m;

        // 尝试从log URL找hash
        m = t.match(/multimedia\/log\/a\/(\d+)\/([a-f0-9]+)/);
        if (m) { cpi = m[1]; hash = m[2]; }

        m = t.match(/objectId["']?\s*[:=]\s*["']([^"']+)["']/);
        if (m) objectId = m[1];

        m = t.match(/clazzId["']?\s*[:=]\s*["'](\d+)["']/);
        if (m) clazzId = m[1];

        m = t.match(/courseId["']?\s*[:=]\s*["'](\d+)["']/);
        if (m) courseId = m[1];

        m = t.match(/duration["']?\s*[:=]\s*(\d+)/);
        if (m) duration = parseInt(m[1]);
      }

      // 从页面源码找ananas/status的hash (objectId)
      if (!objectId) {
        const body = document.body.innerHTML;
        const m = body.match(/ananas\/status\/([a-f0-9]+)/);
        if (m) objectId = m[1];
      }

      // 从URL参数找
      const url = new URL(location.href);
      if (!clazzId) clazzId = url.searchParams.get("clazzid") || "";
      if (!courseId) courseId = url.searchParams.get("courseId") || "";
      if (!cpi) cpi = url.searchParams.get("cpi") || "";

      return { hash, objectId, cpi, clazzId, courseId, duration };
    });

    heartbeatParams = params;
  }

  if (!heartbeatParams?.objectId && !heartbeatParams?.hash) {
    log("无法获取视频参数", "error");
    return null;
  }

  log(`视频参数:`, "info");
  log(`  objectId: ${heartbeatParams.objectId}`, "info");
  log(`  hash: ${heartbeatParams.pathname?.split("/").pop() || heartbeatParams.hash}`, "info");
  log(`  duration: ${heartbeatParams.duration || "?"}s`, "info");
  log(`  cpi: ${heartbeatParams.cpi || heartbeatParams.pathname?.match(/\/a\/(\d+)\//)?.[1]}`, "info");
  log(`  clazzId: ${heartbeatParams.clazzId}`, "info");

  return heartbeatParams;
}

/**
 * 直接调用心跳API模拟视频观看
 */
export async function simulateWatch(page, params) {
  const cpi = params.cpi || params.pathname?.match(/\/a\/(\d+)\//)?.[1];
  const hash = params.hash || params.pathname?.split("/").pop();
  const clazzId = params.clazzId;
  const objectId = params.objectId;
  const duration = params.duration || 193; // 默认时长

  if (!cpi || !hash || !clazzId || !objectId) {
    log(`参数不全: cpi=${cpi} hash=${hash} clazzId=${clazzId} objectId=${objectId}`, "error");
    return false;
  }

  // 先获取cookie
  const cookies = await page.context().cookies();
  const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join("; ");

  log(`开始模拟观看视频 (${duration}秒)...`, "step");

  let played = 0;
  const step = Math.max(1, Math.floor(duration / 20)); // 20步走完

  while (played < duration) {
    played = Math.min(played + step, duration);

    // 模拟随机波动
    const actualPlayed = played + Math.floor(Math.random() * 3) - 1;

    const url = `/mooc-ans/multimedia/log/a/${cpi}/${hash}` +
      `?clazzId=${clazzId}&playingTime=${Math.max(0, actualPlayed)}` +
      `&duration=${duration}&clipTime=0_${duration}` +
      `&objectId=${objectId}&otherInfo=`;

    try {
      const resp = await page.evaluate(async (url) => {
        const r = await fetch(url, { credentials: "include" });
        return { ok: r.ok, status: r.status, text: await r.text().catch(() => "") };
      }, url);

      if (resp.ok) {
        log(`✅ ${Math.min(played, duration)}/${duration}s (${Math.round(played/duration*100)}%)`, "info");
      } else {
        log(`⚠️ 心跳返回 ${resp.status}`, "warn");
      }
    } catch (e) {
      log(`心跳请求失败: ${e.message}`, "warn");
    }

    // 随机间隔 3-6秒（模拟人类观看行为）
    await randomSleep(3000, 6000);
  }

  log(`🎉 视频观看完成! ${duration}/${duration}s`, "success");
  return true;
}

export default { autoWatchVideo, simulateWatch };
