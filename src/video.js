import { log, sleep } from "./utils.js";

/**
 * 真实观看视频 - 通过video.js API逐步推进进度
 */
export async function autoWatchVideo(page, cf, course, knowledgeId, speed = 2) {
  log(`进入视频: ${knowledgeId}`, "step");

  let heartbeatCount = 0;
  let currentPlayingTime = 0;
  let videoDuration = 0;
  let lastReportedTime = 0;
  let stalledCount = 0;

  // 监听心跳
  const handler = (req) => {
    const url = req.url();
    if (url.includes("multimedia/log/a/")) {
      heartbeatCount++;
      try {
        const u = new URL(url);
        const pt = parseInt(u.searchParams.get("playingTime") || "0");
        const dur = parseInt(u.searchParams.get("duration") || "0");
        if (pt > currentPlayingTime) currentPlayingTime = pt;
        if (dur > videoDuration) videoDuration = dur;
      } catch(e) {}
    }
  };
  page.on("request", handler);

  // 打开视频
  await cf.evaluate((kid) => {
    const items = Array.from(document.querySelectorAll(".chapter_item"));
    const target = items.find(el => (el.getAttribute("onclick") || "").includes(kid));
    if (target) target.click();
  }, knowledgeId);

  await sleep(8000);

  // 触发播放
  if (heartbeatCount === 0) {
    log("触发播放...", "step");
    for (const f of page.frames()) {
      if (f.url().includes("video/index")) {
        await f.evaluate(() => {
          const v = document.querySelector("#video");
          if (v) v.muted = true;
          // 通过video.js API
          const player = window.videojs?.(v || ".video-js");
          if (player) {
            player.play();
          } else {
            v?.play().catch(() => {});
          }
          document.querySelector(".vjs-big-play-button, .vjs-play-control")?.click();
        });
        break;
      }
    }
    await sleep(5000);
  }

  // 从心跳获取视频信息
  if (videoDuration === 0 && heartbeatCount > 0) {
    // 从iframe获取video时长
    for (const f of page.frames()) {
      if (f.url().includes("video/index")) {
        const raw = await f.evaluate(() => {
          const v = document.querySelector("#video");
          return { dur: v?.duration || 0, ct: v?.currentTime || 0 };
        });
        if (raw.dur > 0) videoDuration = raw.dur;
        if (raw.ct > currentPlayingTime) currentPlayingTime = raw.ct;
        break;
      }
    }
  }

  if (videoDuration === 0) {
    log("无法获取视频时长", "error");
    page.removeListener("request", handler);
    return false;
  }

  log(`视频: ${videoDuration}s, 已看: ${currentPlayingTime}s`, "info");
  log(`开始模拟观看 (${speed}x)...`, "step");

  // 逐步推进，每次通过video.js API设置时间
  const stepSec = speed * 5;  // 每次推进的秒数
  const waitMs = 4000;        // 每轮等待时间

  while (currentPlayingTime < videoDuration - 1) {
    const target = Math.min(Math.floor(currentPlayingTime + stepSec), videoDuration);

    // 用video.js API设置播放进度
    for (const f of page.frames()) {
      if (f.url().includes("video/index")) {
        await f.evaluate((t) => {
          const v = document.querySelector("#video");
          if (!v) return;
          
          // video.js player API
          let player = v.player || window.videojs?.(v) || window.videojs?.(".video-js");
          if (player && typeof player.currentTime === "function") {
            player.currentTime(t);
          } else {
            v.currentTime = t;
          }
          
          // 触发事件
          v.dispatchEvent(new Event("timeupdate", { bubbles: true }));
          setTimeout(() => v.dispatchEvent(new Event("timeupdate", { bubbles: true })), 100);
        }, target);
        break;
      }
    }

    await sleep(waitMs);

    // 检查心跳是否更新
    if (heartbeatCount > 0 && currentPlayingTime > lastReportedTime) {
      lastReportedTime = currentPlayingTime;
      stalledCount = 0;
      const pct = Math.round(currentPlayingTime / videoDuration * 100);
      log(`⏳ ${currentPlayingTime}/${videoDuration}s (${pct}%)`, "info");
    } else {
      stalledCount++;
      if (stalledCount >= 3) {
        log("进度卡住，尝试强制触发...", "warn");
        for (const f of page.frames()) {
          if (f.url().includes("video/index")) {
            await f.evaluate((t) => {
              const v = document.querySelector("#video");
              if (!v) return;
              v.currentTime = t;
              v.dispatchEvent(new Event("play"));
              v.dispatchEvent(new Event("timeupdate"));
            }, target);
            break;
          }
        }
        stalledCount = 0;
        await sleep(4000);
      }
    }
  }

  // 最终100%
  for (const f of page.frames()) {
    if (f.url().includes("video/index")) {
      await f.evaluate((dur) => {
        const v = document.querySelector("#video");
        const player = v?.player || window.videojs?.(v);
        if (player) player.currentTime(dur);
        else if (v) v.currentTime = dur;
      }, videoDuration);
      break;
    }
  }
  await sleep(5000);

  const finalPct = Math.round(currentPlayingTime / videoDuration * 100);
  log(`完成: ${currentPlayingTime}/${videoDuration}s (${finalPct}%) | ${heartbeatCount}次心跳 ✅`, "success");

  page.removeListener("request", handler);
  return true;
}

export default { autoWatchVideo };
