export default {
  AESKey: "u2oh6Vu^HWe4_AES",
  encSalt: "d_yHJ!$pdA~5",
  headers: {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Referer": "https://i.chaoxing.com",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "sec-ch-ua": "\"Chromium\";v=\"125\", \"Google Chrome\";v=\"125\", \"Not=A?Brand\";v=\"99\"",
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": "\"Windows\""
  },
  videoHeaders: {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Referer": "https://mooc1.chaoxing.com/ananas/modules/video/index.html",
    "Accept": "*/*",
    "Accept-Language": "zh-CN,zh;q=0.9",
    "sec-ch-ua": "\"Chromium\";v=\"125\", \"Google Chrome\";v=\"125\", \"Not=A?Brand\";v=\"99\"",
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": "\"Windows\""
  },
  cookiePath: "./cookies.json",

  rateLimit: 1200,
  globalThrottle: 200,
  maxRetries: 3,
  retryBaseDelay: 1500,
  cacheMaxRecords: 10000,
  cachePruneCount: 2000,
  sessionTimeoutMs: 30 * 60 * 1000,
  defaultJobs: 3,
  defaultSpeed: 1
};
