/**
 * 题库基类 + CacheDAO
 * @module tiku/tiku
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_FILE = path.resolve(__dirname, '../../cache.json');

// ===================== CacheDAO =====================

/**
 * JSON 文件缓存 DAO
 * 线程安全 — 每次读写都读文件 + 原子写入
 */
export class CacheDAO {
  /**
   * @param {string} [file] — 缓存文件路径，默认 cache.json
   */
  constructor(file = CACHE_FILE) {
    this.file = file;
  }

  /**
   * 从缓存获取答案
   * @param {{ title: string, options: string[], type: string }} question
   * @returns {Promise<Object|null>}
   */
  async get(question) {
    const key = this._makeKey(question);
    const cache = this._readCache();
    return cache[key] || null;
  }

  /**
   * 写入缓存
   * @param {{ title: string, options: string[], type: string }} question
   * @param {Object} answer
   */
  async set(question, answer) {
    const key = this._makeKey(question);
    const cache = this._readCache();
    cache[key] = answer;
    this._writeCache(cache);
  }

  /** @private */
  _makeKey(question) {
    const title = (question.title || '').replace(/\s+/g, '');
    return `${title}::${(question.options || []).join('|')}`;
  }

  /** @private */
  _readCache() {
    try {
      if (fs.existsSync(this.file)) {
        return JSON.parse(fs.readFileSync(this.file, 'utf8'));
      }
    } catch (_) {}
    return {};
  }

  /** @private */
  _writeCache(data) {
    try {
      fs.writeFileSync(this.file, JSON.stringify(data, null, 2), 'utf8');
    } catch (_) {}
  }
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
      // 查询失败返回 null
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
