/**
 * 学习任务结果枚举常量
 * @module core/study-result
 */

/** 单个任务执行结果 */
export const StudyResult = Object.freeze({
  SUCCESS: 0,
  FORBIDDEN: 1,
  ERROR: 2,
  TIMEOUT: 3
});

/** 章节处理结果 */
export const ChapterResult = Object.freeze({
  SUCCESS: 0,
  ERROR: 1,
  NOT_OPEN: 2,
  PENDING: 3
});
