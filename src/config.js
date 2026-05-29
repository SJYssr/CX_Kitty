import crypto from 'crypto';

// 对齐 Python CxKitty: 每次启动随机生成移动端 UA，避免固定指纹被风控
// Python 版默认使用 APP UA + X-Requested-With，因为部分接口为 APP 独占
const APP_VERSION = 'com.chaoxing.mobile/ChaoXingStudy_3_6.3.9_android_phone_10824_250';

export function getRandomMobileUA() {
  const androidVer = 9 + Math.floor(Math.random() * 4);        // Android 9~12
  const deviceModel = 'MI' + (10 + Math.floor(Math.random() * 3)); // MI10~MI12
  const imei = crypto.randomBytes(16).toString('hex');         // 32位随机 IMEI
  return [
    `Dalvik/2.1.0 (Linux; U; Android ${androidVer}; ${deviceModel} Build/SKQ1.210216.001)`,
    `(device:${deviceModel})`,
    'Language/zh_CN',
    APP_VERSION,
    `(@Kalimdor)_${imei}`,
  ].join(' ');
}

const MOBILE_UA = getRandomMobileUA();

export default {
  AESKey: "u2oh6Vu^HWe4_AES",
  encSalt: "d_yHJ!$pdA~5",
  // 对齐 Python: 全局默认使用 APP UA，因为一些接口为 APP 独占
  headers: {
    "User-Agent": MOBILE_UA,
    "X-Requested-With": "com.chaoxing.mobile",
    "Referer": "https://i.chaoxing.com",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
  },
  videoHeaders: {
    "User-Agent": MOBILE_UA,
    "X-Requested-With": "com.chaoxing.mobile",
    "Referer": "https://mooc1.chaoxing.com/ananas/modules/video/index.html",
    "Accept": "*/*",
    "Accept-Language": "zh-CN,zh;q=0.9",
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
  defaultSpeed: 1,

  // 人脸识别配置
  faceImagePath: './faces',
  fetchUploadedFace: true
};
