/**
 * 文档任务处理器 — 委托 Chaoxing.studyDocument
 * @module tasks/document
 */

import logger from '../utils/logger.js';
import { StudyResult } from '../core/study-result.js';

/**
 * 处理文档任务
 * @param {import('../core/chaoxing.js').Chaoxing} chaoxing
 * @param {Object} course
 * @param {Object} job
 * @param {Object} [jobInfo]
 * @returns {Promise<number>} — StudyResult
 */
export async function processDocument(chaoxing, course, job, jobInfo) {
  logger.info(`[文档] ${job.name || job.jobid}`);
  return await chaoxing.studyDocument(course, job, jobInfo);
}
