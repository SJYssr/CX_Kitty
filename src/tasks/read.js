/**
 * 阅读任务处理器 — 委托 Chaoxing.studyRead
 * @module tasks/read
 */

import logger from '../utils/logger.js';
import { StudyResult } from '../core/study-result.js';

/**
 * 处理阅读任务
 * @param {import('../core/chaoxing.js').Chaoxing} chaoxing
 * @param {Object} course
 * @param {Object} job
 * @param {Object} jobInfo
 * @returns {Promise<number>} — StudyResult
 */
export async function processRead(chaoxing, course, job, jobInfo) {
  logger.info(`[阅读] ${job.title || job.jobid}`);
  return await chaoxing.studyRead(course, job, jobInfo);
}
