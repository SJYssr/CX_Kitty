/**
 * 题库基类 + CacheDAO
 * @module tiku/tiku
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import cfg from '../config.js';
import logger from '../utils/logger.js';

const _require = createRequire(import.meta.url);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../../data');

// 确保 data 目录存在
if (!fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (e) {
    logger.warn('创建 data 目录失败: ' + e.message);
  }
}

const CACHE_DB = path.resolve(DATA_DIR, 'cache.db');

// ===================== CacheDAO =====================

/**
 * SQLite 缓存 DAO
 * 线程安全 — better-sqlite3 WAL 模式支持并发读写
 */
export class CacheDAO {
  /**
   * @param {string} [dbPath] — 数据库文件路径，默认 data/cache.db
   */
  constructor(dbPath) {
    this._dbPath = dbPath || CACHE_DB;
    this._db = null;
    this._init();
  }

  /** @private */
  _init() {
    if (this._db) return;
    try {
      // 动态 import 解决 ESM 兼容
      const Database = require_better_sqlite3();
      this._db = new Database(this._dbPath);
      // WAL 模式，提升并发性能
      this._db.pragma('journal_mode = WAL');
      this._db.pragma('synchronous = NORMAL');

      // 建表
      this._db.exec(`
        CREATE TABLE IF NOT EXISTS answer_cache (
          key TEXT PRIMARY KEY,
          answer TEXT NOT NULL,
          type TEXT,
          created_at TEXT DEFAULT (datetime('now', 'localtime'))
        )
      `);

      // 自动清理：超过阈值时删除最旧的记录
      const count = this._db.prepare('SELECT COUNT(*) AS cnt FROM answer_cache').get();
      if (count.cnt > cfg.cacheMaxRecords) {
        this._db.prepare(
          `DELETE FROM answer_cache WHERE rowid IN (
            SELECT rowid FROM answer_cache ORDER BY created_at ASC LIMIT ?
          )`
        ).run(cfg.cachePruneCount);
        logger.info('缓存清理: 删除 ' + cfg.cachePruneCount + ' 条旧记录');
      }
    } catch (e) {
      logger.error('CacheDAO 初始化失败: ' + e.message);
      throw e;
    }
  }

  /**
   * 从缓存获取答案
   * @param {{ title: string, options: string[], type: string }} question
   * @returns {Object|null}
   */
  get(question) {
    const key = this._makeKey(question);
    try {
      const row = this._db.prepare('SELECT answer FROM answer_cache WHERE key = ?').get(key);
      return row ? JSON.parse(row.answer) : null;
    } catch (e) {
      logger.warn('缓存读取失败: ' + e.message);
      return null;
    }
  }

  /**
   * 写入缓存
   * @param {{ title: string, options: string[], type: string }} question
   * @param {Object} answer
   */
  set(question, answer) {
    const key = this._makeKey(question);
    try {
      this._db.prepare(
        'INSERT OR REPLACE INTO answer_cache (key, answer, type) VALUES (?, ?, ?)'
      ).run(key, JSON.stringify(answer), question.type || '');
    } catch (e) {
      logger.warn('缓存写入失败: ' + e.message);
    }
  }

  /**
   * 关闭数据库连接
   */
  close() {
    try {
      if (this._db) {
        this._db.close();
        this._db = null;
      }
    } catch (e) {
      logger.warn('关闭数据库失败: ' + e.message);
    }
  }

  /** @private */
  _makeKey(question) {
    const title = (question.title || '').replace(/\s+/g, '');
    return `${title}::${(question.options || []).join('|')}`;
  }
}

/** @private 内联 require 兼容 better-sqlite3 ESM 加载 */
function require_better_sqlite3() {
  return _require('better-sqlite3');
}

// ===================== Tiku 基类 =====================

/** 默认判断题正向选项 */
const DEFAULT_TRUE_LIST = ['正确', '对', '√', '是', 'T', 'True', 'true', 'A', '对。'];
/** 默认判断题负向选项 */
const DEFAULT_FALSE_LIST = ['错误', '错', '×', '否', '不对', '不正确', 'F', 'False', 'false', 'B', '错。'];

/**
 * 题库基类
 */
export class Tiku {
  SUBMIT = false;
  COVER_RATE = 0.8;

  /**
   * @param {string} name — 题库名称
   * @param {string} [api] — API 地址
   * @param {string|string[]} [token] — 认证 token
   */
  constructor(name, api, token) {
    this.name = name;
    this.api = api;
    this.token = token;
    this.trueList = [...DEFAULT_TRUE_LIST];
    this.falseList = [...DEFAULT_FALSE_LIST];
    this.cache = new CacheDAO();
  }

  /**
   * 用配置初始化
   * @param {Object} config — { SUBMIT, COVER_RATE, trueList, falseList }
   */
  initTiku(config = {}) {
    if (config.SUBMIT !== undefined) this.SUBMIT = config.SUBMIT;
    if (config.COVER_RATE !== undefined) this.COVER_RATE = config.COVER_RATE;
    if (config.trueList) this.trueList = config.trueList;
    if (config.falseList) this.falseList = config.falseList;
  }

  /**
   * 查询答案 (先缓存，后 AI)
   * @param {{ title: string, options: string[], type: string }} qInfo
   * @returns {Promise<Object|null>} — { answer, text? }
   */
  async query(qInfo) {
    if (this.DISABLE) return null;

    // 预处理: 去除题目编号 "1." 前缀和分数 "(5分)" 后缀
    const cleanTitle = (qInfo.title || '')
      .replace(/^\d+[、.．)\s]*/, '')
      .replace(/\(\d+分\)$/, '')
      .trim();

    const normalized = { ...qInfo, title: cleanTitle };

    // 先查缓存
    const cached = await this.cache.get(normalized);
    if (cached) return cached;

    // 调用子类查询
    try {
      const result = await this._query(normalized);
      if (result) {
        // 校验答案类型是否匹配
        const valid = this._validateAnswer(result, normalized);
        if (valid) {
          await this.cache.set(normalized, result);
          return result;
        }
      }
    } catch (_) {
      logger.warn('AI 查询失败: ' + (_.message || _));
    }

    return null;
  }

  /**
   * 子类实现: 实际查询题库
   * @param {{ title: string, options: string[], type: string }} qInfo
   * @returns {Promise<Object|null>}
   */
  async _query(qInfo) {
    throw new Error('_query not implemented');
  }

  /**
   * 判断题答案映射
   * @param {string} answer — 题库返回的答案文本
   * @returns {boolean|null} — true/false 或 null
   */
  judgementSelect(answer) {
    const val = (answer || '').trim();
    if (this.trueList.some(t => val === t)) return true;
    if (this.falseList.some(f => val === f)) return false;
    return null;
  }

  /**
   * 校验答案是否匹配题型
   * @private
   */
  _validateAnswer(result, qInfo) {
    if (!result) return false;
    const answer = result.answer || '';
    const type = qInfo.type;

    if (type === 'judgement') {
      return this.judgementSelect(answer) !== null;
    }
    if (type === 'completion' || type === 'shortanswer') {
      return answer.length > 0 && answer !== 'A';
    }
    // single / multiple: 答案是字母组合
    return /^[A-Za-z]+$/.test(answer) && answer.length <= qInfo.options.length;
  }
}
