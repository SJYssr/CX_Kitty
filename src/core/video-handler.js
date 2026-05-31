/**
 * 视频任务处理器 — 独立于 Chaoxing 主类
 * @module core/video-handler
 */
import logger from '../utils/logger.js';
import { renderVideoProgress } from '../utils/progress-bar.js';
import { getEnc, getTimestamp } from './cipher.js';
import { StudyResult } from './study-result.js';
import cfg from '../config.js';

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function randomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

/**
 * 处理视频任务 (墙钟推进 + 1秒轮询 + 持续心跳直到服务端确认完成)
 * @param {import('./chaoxing.js').Chaoxing} cx — Chaoxing 实例
 * @param {Object} course
 * @param {Object} job
 * @param {Object} jobInfo
 * @param {number} [speed=1]
 * @param {string} [type='Video']
 * @returns {Promise<number>} StudyResult
 */
export async function studyVideo(cx, course, job, jobInfo, speed = 1, type = 'Video') {
  const actualSpeed = speed || cx.speed;
  if (!job.objectid) {
    logger.info(`${job.name || '视频'} 无 objectId，跳过`);
    return StudyResult.SUCCESS;
  }

  const _isTerminated = () => cx.__terminated === true || cx._abortController?.signal?.aborted === true;
  if (_isTerminated()) return StudyResult.SUCCESS;

  const status = await _getVideoStatus(cx, job.objectid);
  if (!status) {
    logger.error(`无法获取视频状态: ${job.name}`);
    return StudyResult.ERROR;
  }

  const { dtoken, duration } = status;
  const jobName = job.name || '视频';
  if (duration <= 0) { logger.warn(`视频时长为0: ${jobName}`); return StudyResult.SUCCESS; }

  // 初始完整进度检查
  const initResult = await videoProgressLog(cx, course, job, jobInfo, dtoken, duration, duration, type, 4);
  if (initResult.passed) { logger.info(`${jobName} 已完成`); return StudyResult.SUCCESS; }

  // download 类型处理
  if (!dtoken) {
    if ((await videoProgressLog(cx, course, job, jobInfo, '', duration, duration, type, 4)).passed) return StudyResult.SUCCESS;
    if (await _completeDownloadJob(cx, course, job, jobInfo, duration, type)) return StudyResult.SUCCESS;
    logger.info(`${jobName} 下载视频无法完成，跳过`);
    return StudyResult.SUCCESS;
  }

  // === 主循环 (墙钟推进 + 1秒轮询 + 持续心跳直到服务端确认) ===
  const THRESHOLD = 1;
  let playTime = Math.floor((job.playTime || 0) / 1000);
  let lastLogTime = 0;
  let lastIter = Date.now() / 1000;
  let waitTime = randomInt(30, 90);
  let currentDtoken = dtoken;
  let passed = false;
  let lastProgressEmit = -10;  // 负数确保首次立即推送，之后每 10 秒节流

  logger.info(`${jobName} 开始, 总时长: ${duration}秒`);

  // 立即推送初始进度（仅在确认需要播放之后）
  if (cx._onProgress) {
    try { await cx._onProgress({ type: 'video_progress', name: jobName, currentTime: Math.floor(playTime), duration }); } catch {}
    lastProgressEmit = playTime;
  }

  // 通知前端清理视频进度条（early return 路径复用）
  const _notifyVideoDone = () => {
    if (cx._onProgress) {
      try { cx._onProgress({ type: 'video_done', name: jobName }); } catch {}
    }
  };

  while (!passed) {
    if (_isTerminated()) { _notifyVideoDone(); return StudyResult.SUCCESS; }

    // 每 waitTime 秒视频时间发送一次心跳, 或到达 duration 时也发送 (可能需要多次才能完成)
    if (playTime - lastLogTime >= waitTime || playTime >= duration) {
      // 模拟正常播放: 首次 isdrag=0(点击播放), 中间 isdrag=0(正常上报), 结束时 isdrag=2(播放完毕)
      const _isdrag = playTime >= duration ? 2 : 0;
      const result = await videoProgressLog(cx, course, job, jobInfo, currentDtoken, duration, Math.floor(playTime), type, _isdrag);
      if (result.status === -1) { _notifyVideoDone(); return StudyResult.SUCCESS; }
      if (result.status === 403) {
        logger.warn(`${jobName} 403, 跳过`); _notifyVideoDone(); return StudyResult.FORBIDDEN;
      }
      passed = result.passed;
      if (passed) { logger.info(`${jobName} 完成`); _notifyVideoDone(); return StudyResult.SUCCESS; }
      if (!passed && result.status !== 200) { _notifyVideoDone(); return StudyResult.ERROR; }

      waitTime = randomInt(30, 90);
      lastLogTime = playTime;
    }

    // 墙钟时间推进 playTime (速率受 speed 影响)
    const now = Date.now() / 1000;
    const dt = (now - lastIter) * actualSpeed;
    lastIter = now;
    playTime = Math.min(duration, playTime + dt);

    const progressStr = renderVideoProgress(jobName, Math.floor(playTime), duration);
    if (process.stdout.clearLine) process.stdout.clearLine(0);
    process.stdout.write(`\r${progressStr}`);

    // 视频进度推送（节流5秒），前端展示播放进度
    if (cx._onProgress && playTime - lastProgressEmit >= 5) {
      lastProgressEmit = playTime;
      try {
        await cx._onProgress({ type: 'video_progress', name: jobName, currentTime: Math.floor(playTime), duration });
      } catch {} // 不阻塞视频循环
    }

    await sleep(THRESHOLD * 1000);
  }

  // 正常完成（循环退出）— 通知前端移除进度条
  _notifyVideoDone();

  logger.info(`${jobName} 完成`);
  return StudyResult.SUCCESS;
}

async function _getVideoStatus(cx, objectId) {
  const fid = cx.getFid();
  const url = `https://mooc1.chaoxing.com/ananas/status/${objectId}?k=${fid}&flag=normal&_dc=${Date.now()}`;
  for (let retry = 0; retry < 3; retry++) {
    if (retry > 0) await sleep(3000);
    try {
      await cx.rateLimiter.acquire({ random: { min: 0, max: 2000 } });
      const resp = await cx.axios.get(url, { headers: cfg.videoHeaders, timeout: 15000 });
      if (resp.data && resp.data.status === 'success') {
        return { dtoken: resp.data.dtoken || '', duration: resp.data.duration || 0, crc: resp.data.crc || '', key: resp.data.key || '' };
      }
      if (resp.data && resp.data.download) {
        logger.info(`下载视频响应: ${JSON.stringify(resp.data)}`);
        return { dtoken: '', duration: 1, crc: '', key: '' };
      }
      logger.warn(`视频状态异常: ${resp.status} ${typeof resp.data === 'string' ? resp.data.slice(0, 100) : JSON.stringify(resp.data).slice(0, 100)}`);
    } catch (e) {
      if (e.code === 'ERR_CANCELED' || e.code === 'ERR_ABORTED') return null;
      logger.warn(`视频状态请求异常: ${e.message}`);
    }
  }
  return null;
}

export async function videoProgressLog(cx, course, job, jobInfo, dtoken, duration, playingTime, type = 'Video', isdrag = 3) {
  const userid = await cx.getUid();
  const enc = getEnc(course.clazzId, userid, job.jobid, job.objectid, playingTime, duration);
  const params = {
    clazzId: course.clazzId, playingTime, duration, clipTime: `0_${duration}`,
    objectId: job.objectid, otherInfo: job.otherinfo || '', courseId: course.courseId,
    jobid: job.jobid, userid, isdrag, view: 'pc', enc, dtype: type, _t: getTimestamp()
  };
  if (job.rt) params.rt = job.rt;
  if (job.attDuration) params.attDuration = job.attDuration;
  if (job.attDurationEnc) params.attDurationEnc = job.attDurationEnc;
  if (job.videoFaceCaptureEnc) params.videoFaceCaptureEnc = job.videoFaceCaptureEnc;

  const baseUrl = `https://mooc1.chaoxing.com/mooc-ans/multimedia/log/a/${course.cpi}/${dtoken}`;
  const rtValues = job.rt ? [job.rt] : ['0.9', '1'];
  for (const rt of rtValues) {
    params.rt = rt; params._t = getTimestamp();
    try {
      await cx.rateLimiter.acquire({ random: { min: 0, max: 2000 } });
      const resp = await cx.axios.get(baseUrl, { params, headers: cfg.videoHeaders, timeout: 15000 });
      if (resp.status === 200) return { passed: resp.data && resp.data.isPassed === true, status: 200 };
    } catch (err) {
      if (err.code === 'ERR_CANCELED' || err.code === 'ERR_ABORTED' || err.name === 'CanceledError') {
        return { passed: false, status: -1 };
      }
      if (err.response && err.response.status === 403) continue;
      return { passed: false, status: err.response ? err.response.status : 0 };
    }
  }
  return { passed: false, status: 403 };
}

async function _completeDownloadJob(cx, course, job, jobInfo, duration, type = 'Video') {
  const userid = await cx.getUid();
  const fid = cx.getFid();
  const enc = getEnc(course.clazzId, userid, job.jobid, job.objectid, duration || 1, duration || 1);
  try {
    const resp = await cx.axios.post('https://mooc1.chaoxing.com/mooc-ans/mycourse/update-video-course-summary', null, {
      params: { uid: userid, schoolId: fid, moocClassId: course.clazzId, moocCourseId: course.courseId,
        chapterId: (jobInfo && jobInfo.knowledgeid) || '', objectId: job.objectid,
        videoProgress: duration || 1, totalVideoDuration: duration || 1, enc },
      headers: cfg.videoHeaders, timeout: 15000
    });
    if (resp.status === 200) return true;
  } catch (e) { logger.warn(`update-video-course-summary 失败: ${e.message}`); }
  try {
    const result = await videoProgressLog(cx, course, job, jobInfo, '', duration || 1, duration || 1, type, 2);
    return result.passed;
  } catch (e) { logger.warn(`下载视频心跳失败: ${e.message}`); }
  return false;
}
