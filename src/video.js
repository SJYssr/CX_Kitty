import { log, sleep } from "./utils.js";

/**
 * 自动刷视频 - 利用页面自身的JS发心跳
 * 核心原理：打开视频页面 → 快进到95% → 等页面自动发心跳
 */
export async function autoWatchVideo(page, cf, course, knowledgeId) {
  log(`进入视频: ${knowledgeId}`, "step");

  let heartbeatCount = 0;
  let lastPlayingTime = 0;
  let videoDuration = 0;

  const handler = (req) => {
    const url = req.url();
    if (url.includes("multimedia/log/a/")) {
      heartbeatCount++;
      try {
        const u = new URL(url);
        const pt = parseInt(u.searchParams.get("playingTime") || "0");
        if (pt > lastPlayingTime) lastPlayingTime = pt;
        if (!videoDuration) videoDuration = parseInt(u.searchParams.get("duration") || "0");
      } catch(e) {}
    }
  };
  page.on("request", handler);

  // 点击视频项
  await cf.evaluate((kid) => {
    const items = Array.from(document.querySelectorAll(".chapter_item"));
    const target = items.find(el => (el.getAttribute("onclick") || "").includes(kid));
    if (target) target.click();
  }, knowledgeId);

  await sleep(6000);

  // 等第一次心跳
  await sleep(5000);
  
  if (heartbeatCount === 0) {
    log("未收到初始心跳，尝试触发播放...", "warn");
    for (const f of page.frames()) {
      if (f.url().includes("video/index")) {
        await f.evaluate(() => {
          const v = document.querySelector("video");
          if (v) { v.muted = true; v.play().catch(() => {}); }
          document.querySelector(".vjs-big-play-button")?.click();
        });
        break;
      }
    }
    await sleep(5000);
  }

  if (heartbeatCount === 0) {
    log("视频页面可能无心跳发送机制", "error");
    page.removeListener("request", handler);
    return false;
  }

  log(`已捕获心跳: playingTime=${lastPlayingTime}/${videoDuration}`, "success");

  // 快进视频到95%
  for (const f of page.frames()) {
    if (f.url().includes("video/index")) {
      const targetTime = Math.floor(videoDuration * 0.95);
      log(`快进到 ${targetTime}/${videoDuration}...`, "step");
      
      await f.evaluate((target) => {
        const v = document.querySelector("video");
        if (v && v.duration) {
          v.muted = true;
          v.currentTime = target;
          v.play().catch(() => {});
        }
      }, targetTime);
      
      // 触发几个timeupdate事件
      await f.evaluate(() => {
        const v = document.querySelector("video");
        if (v) {
          v.dispatchEvent(new Event("timeupdate"));
          v.dispatchEvent(new Event("play"));
        }
      });
      break;
    }
  }

  // 等页面发心跳（最多等15秒）
  const beforeCount = heartbeatCount;
  for (let i = 0; i < 5; i++) {
    await sleep(3000);
    if (heartbeatCount > beforeCount) {
      const currentPT = lastPlayingTime;
      const pct = videoDuration > 0 ? Math.round(currentPT / videoDuration * 100) : 0;
      log(`心跳已更新: ${currentPT}/${videoDuration}s (${pct}%) ✅`, "success");
      break;
    }
    log(`等心跳...(${i+1}/5)`, "info");
  }

  // 如果视频短，再发一次到100%
  if (lastPlayingTime < videoDuration) {
    log("发起最终心跳...", "step");
    for (const f of page.frames()) {
      if (f.url().includes("video/index")) {
        await f.evaluate((dur) => {
          const v = document.querySelector("video");
          if (v) v.currentTime = dur;
        }, videoDuration);
        await sleep(5000);
        break;
      }
    }
  }

  page.removeListener("request", handler);
  log(`共 ${heartbeatCount} 次心跳, 最终播放进度: ${lastPlayingTime}/${videoDuration}`, "success");
  return true;
}

export default { autoWatchVideo };
