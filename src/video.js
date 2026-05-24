import { log, sleep } from "./utils.js";

/**
 * 自动刷视频 - 推进video进度，让页面自己发心跳上报
 */
export async function autoWatchVideo(page, cf, course, knowledgeId, speed = 3) {
  log(`进入视频: ${knowledgeId}`, "step");

  let videoDuration = 0;
  let playingTime = 0;
  let heartbeatCount = 0;

  // 从 ananas/status 获取时长
  const respHandler = async (resp) => {
    if (resp.url().includes("ananas/status/") && !videoDuration) {
      try { const d = JSON.parse(await resp.text()); if (d?.duration) videoDuration = d.duration; } catch(e) {}
    }
  };
  page.on("response", respHandler);

  // 监控心跳进度
  const reqHandler = (req) => {
    if (req.url().includes("multimedia/log/a/")) {
      heartbeatCount++;
      try {
        const pt = parseInt(new URL(req.url()).searchParams.get("playingTime") || "0");
        if (pt > playingTime) playingTime = pt;
      } catch(e) {}
    }
  };
  page.on("request", reqHandler);

  // 点击视频
  await cf.evaluate((kid) => {
    const items = Array.from(document.querySelectorAll(".chapter_item"));
    const t = items.find(el => (el.getAttribute("onclick") || "").includes(kid));
    if (t) t.click();
  }, knowledgeId);

  await sleep(8000);

  // 等时长（最多20秒）
  for (let i = 0; i < 10 && !videoDuration; i++) await sleep(2000);
  if (!videoDuration) {
    for (const f of page.frames()) {
      if (f.url().includes("video/index")) {
        videoDuration = await f.evaluate(() => document.querySelector("video")?.duration || 0);
        break;
      }
    }
  }
  if (!videoDuration) { log("无法获取视频时长", "error"); return false; }

  log(`视频时长: ${videoDuration}s`, "info");

  // 找video元素，开始推进进度
  for (const f of page.frames()) {
    if (!f.url().includes("video/index")) continue;

    await f.evaluate((dur) => {
      const v = document.getElementsByTagName("video")[0];
      if (!v) return;

      // 直接从当前进度开始
      let ct = v.currentTime || 0;

      // 每隔1秒推进3秒
      window._simInterval = setInterval(() => {
        ct = Math.min(ct + 3, dur);
        try { v.currentTime = ct; } catch(e) {}
        v.dispatchEvent(new Event("timeupdate", { bubbles: true }));
        if (ct >= dur) clearInterval(window._simInterval);
      }, 1000);

      v.muted = true;
      v.play().catch(() => {});
    }, videoDuration);

    log(`播放中 (${speed}x)...`, "step");
    break;
  }

  // 等进度到100%
  const maxWait = Math.min(Math.ceil(videoDuration / speed) * 1000 + 30000, 180000);
  let waited = 0, lastCount = 0;

  while (waited < maxWait) {
    await sleep(5000);
    waited += 5000;
    if (heartbeatCount > lastCount) {
      lastCount = heartbeatCount;
      log(`⏳ ${playingTime}/${videoDuration}s (${Math.round(playingTime/videoDuration*100)}%)`, "info");
    }
    if (playingTime >= videoDuration - 1) { log("✅", "success"); break; }
  }

  // 收尾
  for (const f of page.frames()) {
    if (!f.url().includes("video/index")) continue;
    await f.evaluate(() => {
      if (window._simInterval) clearInterval(window._simInterval);
      const v = document.querySelector("video");
      if (v) { try { v.currentTime = v.duration || 0; } catch(e) {} v.dispatchEvent(new Event("timeupdate")); }
    });
    await sleep(5000);
    break;
  }

  log(`完成: ${Math.round(playingTime)}/${videoDuration}s ${heartbeatCount}次心跳 ✅`, "success");
  page.removeListener("response", respHandler);
  page.removeListener("request", reqHandler);
  return true;
}

export default { autoWatchVideo };
