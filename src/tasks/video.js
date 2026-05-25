/**
 * 视频任务处理器 — 委托 Chaoxing.studyVideo
 * @module tasks/video
 */

import logger from '../utils/logger.js';
import { StudyResult } from '../core/study-result.js';

/**
 * 处理视频任务
 * @param {import('../core/chaoxing.js').Chaoxing} chaoxing
 * @param {Object} course
 * @param {Object} job
 * @param {Object} jobInfo
 * @param {Object} [options]
 * @param {number} [options.speed=1] — 倍速
 * @returns {Promise<number>} — StudyResult
 */
export async function processVideo(chaoxing, course, job, jobInfo, options = {}) {
  const type = job.type === 'audio' ? 'Audio' : 'Video';
  const speed = options.speed || 1;

  logger.info(`[视频] ${job.name || job.jobid} (${type})`);

  const result = await chaoxing.studyVideo(course, job, jobInfo, speed, type);

  return result;
}
