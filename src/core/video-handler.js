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
 * 处理视频任务
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

  // 加载时从 cx 获取终止检查函数
  const _isTerminated = () => cx.__terminated === true || cx._abortController?.signal?.aborted === true;

  // 检查是否被终止
  if (_isTerminated()) {
    logger.info(`${job.name || '视频'} 任务已终止，跳过`);
    return StudyResult.SUCCESS;
  }

  const status = await _getVideoStatus(cx, job.objectid);
  if (!status) {
    logger.error(`无法获取视频状态: ${job.name}`);
    return StudyResult.ERROR;
  }

  const { dtoken, duration } = status;
  const jobName = job.name || '视频';

  if (duration <= 0) {
    logger.warn(`视频时长为0: ${jobName}`);
    return StudyResult.SUCCESS;
  }

  const initResult = await videoProgressLog(cx, course, job, jobInfo, dtoken, duration, duration, type, 4);
  if (initResult.passed) {
    logger.info(`${jobName} 已完成`);
    return StudyResult.SUCCESS;
  }

  if (!dtoken) {
    const dlInit = await videoProgressLog(cx, course, job, jobInfo, '', duration, duration, type, 4);
    if (dlInit.passed) { logger.info(`${jobName} 下载视频心跳完成`); return StudyResult.SUCCESS; }
    const completed = await _completeDownloadJob(cx, course, job, jobInfo, duration, type);
    if (completed) { logger.info(`${jobName} 下载视频标记完成`); return StudyResult.SUCCESS; }
    logger.info(`${jobName} 下载视频无法完成，跳过`);
    return StudyResult.SUCCESS;
  }

  const startPlay = Math.floor((job.playTime || 0) / 1000);
  let playTime = startPlay;
  let lastLogTime = 0;
  const waitTime = randomInt(30, 90);
  let lastIter = Date.now();
  let forbiddenCount = 0;
  const maxForbidden = 2;
  let currentDtoken = dtoken;

  while (true) {
    // 每次循环检查是否被终止
    if (_isTerminated()) {
      logger.warn(`${jobName} 任务已终止，退出视频循环`);
      return StudyResult.SUCCESS;
    }

    if ((playTime - lastLogTime >= waitTime) || playTime >= duration) {
      const result = await videoProgressLog(cx, course, job, jobInfo, currentDtoken, duration, Math.floor(playTime), type, 3);
      // 任务被中止
      if (result.status === -1) {
        logger.warn(`${jobName} 任务已中止，退出视频循环`);
        return StudyResult.SUCCESS;
      }
      if (result.status === 403) {
        forbiddenCount++;
        if (forbiddenCount > maxForbidden) { logger.warn(`${jobName} 403 恢复失败`); return StudyResult.FORBIDDEN; }
        const refreshed = await _recoverAfterForbidden(cx, job, type);
        if (refreshed) currentDtoken = refreshed.dtoken;
        await sleep(3000); lastIter = Date.now(); lastLogTime = playTime; continue;
      }
      forbiddenCount = 0; lastLogTime = playTime;
      if (result.passed) {
        if (process.stdout.clearLine) process.stdout.clearLine(0);
        logger.info(`${jobName} 完成`);
        return StudyResult.SUCCESS;
      }
    }
    const dt = (Date.now() - lastIter) * actualSpeed / 1000;
    playTime = Math.min(duration, playTime + dt);
    lastIter = Date.now();

    const progressStr = renderVideoProgress(jobName, Math.floor(playTime), duration);
    if (process.stdout.clearLine) process.stdout.clearLine(0);
    process.stdout.write(`\r${progressStr}`);

    if (playTime >= duration) { await sleep(3000); playTime = duration; }
    else { await sleep(1000); }
  }
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
      // 任务被中止时提前退出
      if (err.code === 'ERR_CANCELED' || err.code === 'ERR_ABORTED' || err.name === 'CanceledError') {
        return { passed: false, status: -1 }; // status=-1 表示中止
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
    const result = await videoProgressLog(cx, course, job, jobInfo, '', duration || 1, duration || 1, type, 3);
    return result.passed;
  } catch (e) { logger.warn(`下载视频心跳失败: ${e.message}`); }
  return false;
}

async function _recoverAfterForbidden(cx, job, type) {
  logger.warn(`尝试恢复 403 会话: ${job.jobid}`);
  try {
    const SessionManager = (await import('./session.js')).SessionManager;
    SessionManager.updateCookies();
    if (cx.session) {
      cx.axios = SessionManager.getSession();
    } else {
      // 独立 session 模式下重新创建
    }
  } catch {}
  try {
    return await _refreshVideoStatus(cx, job, type);
  } catch { return null; }
}

async function _refreshVideoStatus(cx, job, type) {
  if (job.objectid) {
    const status = await _getVideoStatus(cx, job.objectid);
    if (status) return status;
  }
  return null;
}
