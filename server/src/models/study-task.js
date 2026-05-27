/**
 * StudyTask DAO — 刷课任务相关的数据库操作
 * @module models/study-task
 */
import pool from '../db.js';

export class StudyTaskDAO {
  constructor(pool) {
    this.pool = pool;
  }

  /** 根据 id 查任务 */
  findById(taskId) {
    return this.pool.query('SELECT id, course_ids, status, speed, jobs, started_at, finished_at, progress, error FROM study_tasks WHERE id = ?', [taskId]);
  }

  /** 根据 id + phone 查任务（验证归属） */
  findByIdAndPhone(taskId, phone) {
    return this.pool.query(
      'SELECT id FROM study_tasks WHERE id = ? AND account_id = (SELECT id FROM accounts WHERE phone = ?)',
      [taskId, phone]
    );
  }

  /** 查用户的任务列表（最新 5 条） */
  findByPhone(phone) {
    return this.pool.query(
      'SELECT id, course_ids, speed, jobs, status, progress, started_at, finished_at, error FROM study_tasks WHERE account_id = (SELECT id FROM accounts WHERE phone = ?) ORDER BY id DESC LIMIT 5',
      [phone]
    );
  }

  /** 查所有任务（管理用，安全 LIMIT） */
  findAll() {
    return this.pool.query(
      'SELECT id, course_ids, speed, jobs, status, progress, started_at, finished_at, error FROM study_tasks ORDER BY id DESC LIMIT 5'
    );
  }

  /** 查运行中的任务数 */
  countRunning() {
    return this.pool.query("SELECT COUNT(*) AS count FROM study_tasks WHERE status = 'running'");
  }

  /** 创建任务 */
  create(accountId, courseIds) {
    return this.pool.query(
      `INSERT INTO study_tasks (account_id, course_ids, speed, jobs, status, started_at)
       VALUES (?, ?, 1, 1, 'running', NOW())`,
      [accountId, courseIds ? JSON.stringify(courseIds) : null]
    );
  }

  /** 更新任务状态 */
  updateStatus(taskId, status, progress) {
    return this.pool.query(
      'UPDATE study_tasks SET status = ?, progress = ?, finished_at = NOW() WHERE id = ?',
      [status, progress || '{}', taskId]
    );
  }

  /** 更新进度 */
  updateProgress(taskId, progress) {
    return this.pool.query('UPDATE study_tasks SET progress = ? WHERE id = ?', [JSON.stringify(progress), taskId]);
  }

  /** 终止账号所有运行中任务 */
  terminateRunningByAccount(accountId) {
    return this.pool.query(
      'UPDATE study_tasks SET status = ?, finished_at = NOW() WHERE account_id = ? AND status = ?',
      ['terminated', accountId, 'running']
    );
  }

  /** 终止单个运行中任务 */
  terminateById(taskId) {
    return this.pool.query(
      'UPDATE study_tasks SET status = ?, finished_at = NOW() WHERE id = ? AND status = ?',
      ['terminated', taskId, 'running']
    );
  }

  /** 清理所有残留运行任务（启动时） */
  cleanupStaleRunning() {
    return this.pool.query("UPDATE study_tasks SET status = 'terminated', finished_at = NOW() WHERE status = 'running'");
  }

  /** 读取进度 JSON */
  readProgress(taskId) {
    return this.pool.query('SELECT progress FROM study_tasks WHERE id = ?', [taskId]);
  }

  /** 查状态 */
  getStatus(taskId) {
    return this.pool.query('SELECT status FROM study_tasks WHERE id = ?', [taskId]);
  }

  /** 查 started_at, finished_at */
  getTimestamps(taskId) {
    return this.pool.query('SELECT started_at, finished_at FROM study_tasks WHERE id = ?', [taskId]);
  }

  /** 获取用户最新 5 条任务 id */
  getRecentIds(accountId) {
    return this.pool.query('SELECT id FROM study_tasks WHERE account_id = ? ORDER BY id DESC LIMIT 5', [accountId]);
  }

  /** 删除账号的旧任务（保留最新 5 条） */
  deleteOldByAccount(accountId, cutoffId) {
    return this.pool.query('DELETE FROM study_tasks WHERE account_id = ? AND id < ?', [accountId, cutoffId]);
  }

  /** 插入任务日志 */
  insertLog(taskId, time, text) {
    return this.pool.query('INSERT INTO task_logs (task_id, time, text) VALUES (?, ?, ?)', [taskId, time, text]);
  }

  /** 查任务日志 */
  getLogs(taskId) {
    return this.pool.query('SELECT time, text FROM task_logs WHERE task_id = ? ORDER BY id ASC', [taskId]);
  }

  /** 删除旧任务日志 */
  deleteOldLogs(accountId, cutoffId) {
    return this.pool.query(
      'DELETE FROM task_logs WHERE task_id IN (SELECT id FROM study_tasks WHERE account_id = ? AND id < ?)',
      [accountId, cutoffId]
    );
  }

  /** 更新任务为失败（后台异步用） */
  markFailed(taskId, errorMsg) {
    return this.pool.query(
      'UPDATE study_tasks SET status = ?, error = ?, finished_at = NOW() WHERE id = ?',
      ['failed', errorMsg, taskId]
    );
  }
}

export const StudyTask = new StudyTaskDAO(pool);
