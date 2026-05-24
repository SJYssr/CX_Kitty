/**
 * 答题任务处理器 — 委托 Chaoxing.studyWork
 * @module tasks/work
 */

import logger from '../utils/logger.js';
import { StudyResult } from '../core/study-result.js';

/**
 * 处理答题任务
 * @param {import('../core/chaoxing.js').Chaoxing} chaoxing
 * @param {Object} course
 * @param {Object} job
 * @param {Object} jobInfo
 * @returns {Promise<number>} — StudyResult
 */
export async function processWork(chaoxing, course, job, jobInfo) {
  logger.info(`[答题] ${job.name || job.jobid}`);
  return await chaoxing.studyWork(course, job, jobInfo);
}
