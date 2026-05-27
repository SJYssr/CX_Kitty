/**
 * 人脸识别自动提交模块
 * 参照 Python 版 CxKitty (SocialSisterYi/CxKitty) SessionWraper 层透明拦截架构实现
 * @module core/face-detection
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as cheerio from 'cheerio';
import logger from '../utils/logger.js';
import cfg from '../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FACES_DIR = path.resolve(__dirname, '../../faces');

// === API 端点 ===

const API_GET_PAN_TOKEN = 'https://pan-yz.chaoxing.com/api/token/uservalid';
const API_UPLOAD_FACE = 'https://pan-yz.chaoxing.com/upload';
const API_FACE_IMAGE = 'https://passport2-api.chaoxing.com/api/getUserFaceid';
const API_FACE_SUBMIT = 'https://mooc1-api.chaoxing.com/mooc-ans/knowledge/uploadInfo';
const API_FACE_SUBMIT_NEW = 'https://mooc1-api.chaoxing.com/mooc-ans/facephoto/clientfacecheckstatus';

// 移动端 UA — 人脸相关接口需要使用 APP UA
const MOBILE_UA = 'Dalvik/2.1.0 (Linux; U; Android 11; MI11 Build/SKQ1.211006.001) (device:MI11) Language/zh_CN com.chaoxing.mobile/ChaoXingStudy_3_6.3.9_android_phone_10824_250';

// === 工具函数 ===

/**
 * inf_enc 签名 — 对应 Python inf_enc_sign()
 * 将参数 URL 编码后拼接 DESKey，再 MD5 作为 inf_enc 字段
 */
function infEncSign(params) {
  const query = new URLSearchParams(params).toString() + '&DESKey=Z(AfY@XS';
  const infEnc = crypto.createHash('md5').update(query).digest('hex');
  return { ...params, inf_enc: infEnc };
}

/**
 * 给图片 buffer 添加随机 LSB 噪声，破坏文件 hash 以绕过风控
 * 对应 Python: cv2 随机像素干扰 (0-5 个像素, ±2)
 */
function addNoiseToImageBuffer(buffer) {
  const result = Buffer.from(buffer);
  const safeStart = 100; // 跳过 JPEG header
  const safeEnd = Math.max(safeStart + 1, result.length - 10); // 避开 EOI marker
  const modifications = Math.floor(Math.random() * 5);
  for (let i = 0; i < modifications; i++) {
    const pos = safeStart + Math.floor(Math.random() * (safeEnd - safeStart));
    result[pos] = (result[pos] + (Math.floor(Math.random() * 3) - 1)) & 0xFF;
  }
  return result;
}

function ensureFacesDir() {
  if (!fs.existsSync(FACES_DIR)) {
    fs.mkdirSync(FACES_DIR, { recursive: true });
  }
}

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// === 人脸图片管理 ===

/**
 * 根据 uid 查找本地人脸图片
 * 匹配规则: {uid}.jpg, {uid}_1.jpg, {uid}_2.jpg ...
 * 对应 Python: get_face_path_by_puid()
 */
export function getFacePathByUid(uid) {
  if (!fs.existsSync(FACES_DIR)) return null;
  const pattern = new RegExp(`^${escapeRegex(uid)}(_\\d+)?\\.jpg$`);
  const matched = [];
  for (const f of fs.readdirSync(FACES_DIR)) {
    if (pattern.test(f)) matched.push(path.join(FACES_DIR, f));
  }
  if (matched.length === 0) return null;
  return matched[Math.floor(Math.random() * matched.length)];
}

/**
 * 从超星拉取预上传的人脸图片 URL
 * 对应 Python: ChaoXINGAPI.fetch_face()
 */
export async function fetchPreUploadedFace(cx) {
  try {
    const uid = await cx.getUid();
    if (!uid) return null;

    const enc = crypto.createHash('md5').update(`${uid}uWwjeEKsri`).digest('hex');
    const params = infEncSign({
      enc,
      token: '4faa8662c59590c6f43ae9fe5b002b42',
      _time: String(Date.now()),
    });

    await cx.rateLimiter.acquire({ random: { min: 0, max: 1000 } });
    const resp = await cx.axios.get(API_FACE_IMAGE, {
      params,
      headers: { ...cfg.headers, 'User-Agent': MOBILE_UA },
      timeout: 10000,
    });

    const data = resp.data;
    if (data.result !== 1) {
      logger.warn(`预上传人脸获取失败: ${data.msg || '未知错误'}`);
      return null;
    }
    if (data.data && data.data.http) {
      logger.info(`预上传人脸获取成功: ${data.data.http}`);
      return data.data.http;
    }
    logger.info('用户未预上传人脸');
    return null;
  } catch (e) {
    if (e.code === 'ERR_CANCELED' || e.code === 'ERR_ABORTED') return null;
    logger.warn(`预上传人脸请求异常: ${e.message}`);
    return null;
  }
}

/**
 * 下载人脸图片到本地
 */
export async function downloadFaceImage(cx, url, savePath) {
  try {
    const resp = await cx.axios.get(url, { responseType: 'arraybuffer', timeout: 15000 });
    ensureFacesDir();
    fs.writeFileSync(savePath, Buffer.from(resp.data));
    logger.info(`人脸图片已保存: ${savePath}`);
    return true;
  } catch (e) {
    logger.warn(`人脸图片下载失败: ${e.message}`);
    return false;
  }
}

/**
 * 确保有可用的人脸图片
 * 优先本地查找 → 尝试从超星拉取预上传的人脸
 */
export async function ensureFaceImage(cx) {
  const uid = await cx.getUid();
  if (!uid) { logger.warn('无法获取用户uid，跳过人脸识别'); return null; }

  let facePath = getFacePathByUid(uid);
  if (facePath) { logger.info(`使用本地人脸图片: ${facePath}`); return facePath; }

  if (cfg.fetchUploadedFace !== false) {
    logger.info('未找到本地人脸图片，尝试从超星拉取预上传人脸...');
    const faceUrl = await fetchPreUploadedFace(cx);
    if (faceUrl) {
      ensureFacesDir();
      const savePath = path.join(FACES_DIR, `${uid}.jpg`);
      const ok = await downloadFaceImage(cx, faceUrl, savePath);
      if (ok) return savePath;
    }
  }

  logger.warn('无人脸图片可用，请将人脸照片(.jpg)放入 faces/ 目录，或在超星APP上传人脸');
  return null;
}

// === 人脸上传与提交 ===

/**
 * 获取云盘上传 token
 * 对应 Python: FaceDetectionDto.get_upload_token()
 */
export async function getUploadToken(cx) {
  try {
    await cx.rateLimiter.acquire({ random: { min: 0, max: 1000 } });
    const resp = await cx.axios.get(API_GET_PAN_TOKEN, {
      headers: { ...cfg.headers, 'User-Agent': MOBILE_UA },
      timeout: 10000,
    });
    const data = resp.data;
    if (data.result !== true) { logger.error('获取云盘token失败'); return null; }
    logger.debug(`云盘token获取成功: ${data._token}`);
    return data._token;
  } catch (e) {
    if (e.code === 'ERR_CANCELED' || e.code === 'ERR_ABORTED') return null;
    logger.error(`云盘token获取异常: ${e.message}`);
    return null;
  }
}

/**
 * 上传人脸图片到超星云盘 (含随机噪声破坏 hash)
 * 对应 Python: FaceDetectionDto.upload_face_img()
 */
export async function uploadFaceImage(cx, token, puid, imagePath) {
  try {
    const rawBuffer = fs.readFileSync(imagePath);
    const noisyBuffer = addNoiseToImageBuffer(rawBuffer);

    // 手动构造 multipart/form-data，避免额外依赖
    const boundary = `----FormBoundary${crypto.randomBytes(16).toString('hex')}`;
    const filename = `${Date.now()}.jpg`;
    const header = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: image/jpeg\r\n\r\n`,
      'utf8'
    );
    const footer = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
    const body = Buffer.concat([header, noisyBuffer, footer]);

    const url = `${API_UPLOAD_FACE}?uploadtype=face&_token=${encodeURIComponent(token)}&puid=${encodeURIComponent(puid)}`;

    await cx.rateLimiter.acquire({ random: { min: 500, max: 2000 } });
    const resp = await cx.axios.post(url, body, {
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      timeout: 30000,
    });

    const data = resp.data;
    if (data.result !== true) {
      logger.error(`人脸上传失败: ${JSON.stringify(data)}`);
      return null;
    }
    logger.info(`人脸上传成功: objectId=${data.objectId}`);
    return data.objectId;
  } catch (e) {
    if (e.code === 'ERR_CANCELED' || e.code === 'ERR_ABORTED') return null;
    logger.error(`人脸上传异常: ${e.message}`);
    return null;
  }
}

/**
 * 提交人脸识别 (新接口)
 * 对应 Python: FaceDetectionDto.submit_face_new()
 */
export async function submitFaceNew(cx, { classId, courseId, knowledgeId, cpi, objectId }) {
  try {
    await cx.rateLimiter.acquire({ random: { min: 0, max: 1000 } });
    const resp = await cx.axios.get(API_FACE_SUBMIT_NEW, {
      params: {
        courseId,
        clazzId: classId,
        cpi: cpi || '',
        chapterId: knowledgeId,
        objectId,
        type: 1,
      },
      headers: cfg.headers,
      timeout: 15000,
    });
    const data = resp.data;
    if (data.status !== true) {
      logger.error(`人脸识别(new)提交失败: ${data.msg || '未知错误'}`);
      return false;
    }
    logger.info('人脸识别(new)提交成功');
    return true;
  } catch (e) {
    if (e.code === 'ERR_CANCELED' || e.code === 'ERR_ABORTED') return false;
    logger.error(`人脸识别(new)提交异常: ${e.message}`);
    return false;
  }
}

/**
 * 提交人脸识别 (旧接口, 降级方案)
 * 对应 Python: FaceDetectionDto.submit_face()
 */
export async function submitFaceOld(cx, { classId, courseId, knowledgeId, objectId }) {
  try {
    await cx.rateLimiter.acquire({ random: { min: 0, max: 1000 } });
    const resp = await cx.axios.post(API_FACE_SUBMIT,
      new URLSearchParams({
        clazzId: classId,
        courseId,
        knowledgeId,
        uuid: '',
        qrcEnc: '',
        objectId,
      }).toString(),
      {
        headers: { ...cfg.headers, 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 15000,
      }
    );
    const data = resp.data;
    if (data.status !== true) {
      logger.error(`人脸识别(旧)提交失败: ${data.msg || '未知错误'}`);
      return false;
    }
    logger.info('人脸识别(旧)提交成功');
    return true;
  } catch (e) {
    if (e.code === 'ERR_CANCELED' || e.code === 'ERR_ABORTED') return false;
    logger.error(`人脸识别(旧)提交异常: ${e.message}`);
    return false;
  }
}

// === 人脸检查页检测与解析 ===

/**
 * 检测 HTTP 响应是否为超星人脸识别重定向页
 * 对应 Python: get_special_type() → SpecialPageType.FACE
 * 特征: body.grayBg + script 内包含 /knowledge/startface
 */
export function isFaceCheckPage(resp) {
  try {
    const contentType = resp.headers['content-type'] || '';
    if (!contentType.includes('text/html')) return false;
    const html = typeof resp.data === 'string' ? resp.data : '';
    if (!html) return false;
    return /body\.grayBg/.test(html) && /\/knowledge\/startface/.test(html);
  } catch {
    return false;
  }
}

/**
 * 从人脸检查页 HTML 中提取参数
 * 对应 Python: SessionWraper.__handle_face_detection() 中的 URL 解析
 */
export function parseFaceCheckParams(html, origUrl) {
  try {
    const $ = cheerio.load(html);
    const scriptText = $('body.grayBg script').first().text();
    if (!scriptText) return null;

    // 匹配 "/knowledge/startface?xxx"
    const urlMatch = scriptText.match(/\/knowledge\/startface\?([^"]+)/);
    if (!urlMatch) return null;

    const faceUrl = new URL(`https://mooc1.chaoxing.com/knowledge/startface?${urlMatch[1]}`);
    const classId = faceUrl.searchParams.get('clazzid') || '';
    let courseId = faceUrl.searchParams.get('courseid') || '';
    const knowledgeId = faceUrl.searchParams.get('knowledgeid') || '';
    const cpi = faceUrl.searchParams.get('cpi') || '';

    // 若 face URL 中没有 courseId，尝试从原始请求 URL 中提取
    if (!courseId && origUrl) {
      try {
        const orig = new URL(origUrl, 'https://mooc1.chaoxing.com');
        courseId = orig.searchParams.get('courseid') || orig.searchParams.get('courseId') || '';
      } catch {}
    }

    if (!classId || !courseId || !knowledgeId) {
      logger.warn(`人脸检查页参数不完整: classId=${classId} courseId=${courseId} knowledgeId=${knowledgeId}`);
      return null;
    }

    return { classId, courseId, knowledgeId, cpi };
  } catch (e) {
    logger.warn(`人脸检查页解析异常: ${e.message}`);
    return null;
  }
}

// === 主编排函数 ===

/**
 * 解决人脸识别 — 完整流程
 * 1. 确保有人脸图片 (本地查找 / 超星拉取)
 * 2. 获取云盘上传 token
 * 3. 上传人脸 (含随机噪声破坏 hash)
 * 4. 提交人脸识别 (新接口 → 旧接口降级)
 *
 * 对应 Python: SessionWraper.__handle_face_detection() 里的处理链
 */
export async function resolveFaceDetection(cx, { classId, courseId, knowledgeId, cpi }) {
  const uid = await cx.getUid();
  if (!uid) { logger.warn('无法获取uid，跳过人脸识别'); return false; }

  logger.info(`开始处理人脸识别: courseId=${courseId} classId=${classId} knowledgeId=${knowledgeId}`);

  // 1. 确保有人脸图片
  const facePath = await ensureFaceImage(cx);
  if (!facePath) return false;

  // 2. 获取上传 token
  const token = await getUploadToken(cx);
  if (!token) return false;

  // 3. 上传人脸
  const objectId = await uploadFaceImage(cx, token, uid, facePath);
  if (!objectId) return false;

  // 4. 提交人脸识别 — 先新后旧
  let ok = await submitFaceNew(cx, { classId, courseId, knowledgeId, cpi, objectId });
  if (!ok) {
    logger.info('新接口提交失败，尝试旧接口降级...');
    ok = await submitFaceOld(cx, { classId, courseId, knowledgeId, objectId });
  }

  if (ok) {
    logger.info('人脸识别解决成功');
  } else {
    logger.warn('人脸识别解决失败，该任务可能需要手动完成');
  }
  return ok;
}

export default {
  getFacePathByUid,
  fetchPreUploadedFace,
  downloadFaceImage,
  ensureFaceImage,
  getUploadToken,
  uploadFaceImage,
  submitFaceNew,
  submitFaceOld,
  isFaceCheckPage,
  parseFaceCheckParams,
  resolveFaceDetection,
};
