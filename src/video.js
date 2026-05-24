import { log, sleep } from "./utils.js";

async function findVideoFrame(page) {
  for (const f of page.frames()) {
    if (f.url().includes("video/index")) return f;
  }
  return null;
}

/**
 * 真实观看 - 从ananas/status API获取时长 + 劫持currentTime
 */
export async function autoWatchVideo(page, cf, course, knowledgeId, speed = 3) {
  log(`进入视频: ${knowledgeId}`, "step");

  let heartbeatCount = 0;
  let videoDuration = 0;
  let currentPlayed = 0;

  // 拦截 ananas/status 获取视频时长
  page.on("response", async (resp) => {
    const url = resp.url();
    if (url.includes("ananas/status/") && !videoDuration) {
      try {
        const body = await resp.text();
        const data = JSON.parse(body);
        if (data?.duration) videoDuration = data.duration;
      } catch(e) {}
    }
  });

  // 监听心跳
  page.on("request", (req) => {
    const url = req.url();
    if (url.includes("multimedia/log/a/")) {
      heartbeatCount++;
      try {
        const u = new URL(url);
        const pt = parseInt(u.searchParams.get("playingTime") || "0");
        const dur = parseInt(u.searchParams.get("duration") || "0");
        if (pt > currentPlayed) currentPlayed = pt;
        if (dur > videoDuration) videoDuration = dur;
      } catch(e) {}
    }
  });

  // 点击视频
  await cf.evaluate((kid) => {
    const items = Array.from(document.querySelectorAll(".chapter_item"));
    const t = items.find(el => (el.getAttribute("onclick") || "").includes(kid));
    if (t) t.click();
  }, knowledgeId);

  // 等时长（最多20秒）
  for (let i = 0; i < 10; i++) {
    await sleep(2000);
    if (videoDuration > 0) {
      log(`视频时长: ${videoDuration}s`, "info");
      break;
    }
  }

  if (!videoDuration) {
    log("无法获取视频时长", "error");
    return false;
  }

  // 劫持currentTime
  const vf = await findVideoFrame(page);
  if (vf) {
    await vf.evaluate((dur) => {
      const v = document.getElementById("video");
      if (!v || !v.tagName || v.tagName !== "VIDEO") {
        // Try videojs API
        const player = window.videojs?.("video") || window.videojs?.(".video-js");
        if (player && player.el_) {
          hijackPlayer(player, dur);
          return;
        }
        return;
      }

      let fakeTime = Math.max(0, v.currentTime || 0);

      Object.defineProperty(v, "currentTime", {
        get: () => fakeTime,
        set: (val) => { if (val > fakeTime) fakeTime = Math.min(val, dur); },
        configurable: true
      });

      window._playInterval = setInterval(() => {
        fakeTime = Math.min(fakeTime + 3, dur);
        v.dispatchEvent(new Event("timeupdate"));
        if (fakeTime >= dur) clearInterval(window._playInterval);
      }, 1000);

      // 直接设置 muted
      v.muted = true;
      // 通过 videojs API 播放
      try { player?.play(); } catch(e) {}
      try { v.play(); } catch(e) {}
      // 点播放按钮
      document.querySelector(".vjs-big-play-button")?.click();
      document.querySelector(".vjs-play-control")?.click();

      function hijackPlayer(player, dur) {
        let fakeTime = player.currentTime() || 0;
        const origCT = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "currentTime");
        
        const media = player.el_.querySelector("video");
        if (media) {
          Object.defineProperty(media, "currentTime", {
            get: () => fakeTime,
            set: (v) => { if (v > fakeTime) fakeTime = Math.min(v, dur); },
            configurable: true
          });
          
          window._playInterval = setInterval(() => {
            fakeTime = Math.min(fakeTime + 3, dur);
            media.dispatchEvent(new Event("timeupdate"));
            if (fakeTime >= dur) clearInterval(window._playInterval);
          }, 1000);
          
          media.muted = true;
          player.play();
        }
      }
    }, videoDuration);

    log(`播放中 (${speed}x, ~${Math.ceil(videoDuration/speed)}秒)...`, "step");
  }

  // 等心跳
  const maxWait = Math.min(Math.ceil(videoDuration / speed) * 1000 + 15000, 180000);
  let waited = 0, lastCount = 0;

  while (waited < maxWait) {
    await sleep(5000);
    waited += 5000;
    if (heartbeatCount > lastCount) {
      lastCount = heartbeatCount;
      const pct = Math.round(currentPlayed / videoDuration * 100);
      log(`⏳ ${currentPlayed}/${videoDuration}s (${pct}%) ${heartbeatCount}次心跳`, "info");
    }
    if (currentPlayed >= videoDuration) break;
  }

  log(`完成: ${currentPlayed}/${videoDuration}s (${Math.round(currentPlayed/videoDuration*100)}%) ${heartbeatCount}次心跳 ✅`, "success");
  return true;
}

export default { autoWatchVideo };
