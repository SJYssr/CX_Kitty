/**
 * Chaoxing API 总类 — 登录、课程、视频、答题等核心功能
 * 方法由各模块 mixin 注入: auth.js / course.js / video.js
 * @module core/chaoxing
 */

import { SessionManager } from './session.js';
import { getEnc, getTimestamp } from './cipher.js';
import { studyVideo as videoHandler } from './video-handler.js';
import { studyWork as workHandler } from './work-handler.js';
import { RateLimiter } from './ratelimiter.js';
import { StudyResult } from './study-result.js';
import { applyAuth } from './auth.js';
import { applyCourse } from './course.js';
import { applyVideo } from './video.js';
import logger from '../utils/logger.js';
import cfg from '../config.js';

const DEFAULT_FID = '4311';

export class Chaoxing {
  /**
   * @param {Object} account — { phone, password }
   * @param {Object} [tiku] — 题库实例
   * @param {Object} [options]
   * @param {number} [options.speed=1]
   * @param {number} [options.jobs=3]
   */
  constructor(account, tiku, options = {}) {
    this.account = account;
    this.tiku = tiku || null;
    this.speed = options.speed || 1;
    this.jobs = options.jobs || 3;
    this.notopenAction = options.notopenAction || 'continue';

    // 支持传入独立 session（多账号并发时使用）
    if (options._standaloneSession) {
      this.session = null;
      this.axios = options._standaloneSession;
    } else {
      this.session = SessionManager.getInstance();
      this.axios = SessionManager.getSession();
    }

    // 网络错误自动重试拦截器
    if (this.axios) {
      const MAX = 3;
      this.axios.interceptors.response.use(
        r => r,
        async err => {
          const reqCfg = err.config;
          if (!reqCfg) throw err;
          if (reqCfg._retry === undefined) reqCfg._retry = 0;
          const retryable = !err.response || err.code === 'ECONNABORTED' || err.code === 'ECONNRESET' || (err.response && err.response.status >= 500);
          if (retryable && reqCfg._retry < MAX) {
            reqCfg._retry++;
            await new Promise(r => setTimeout(r, reqCfg._retry * 1500 + Math.random() * 1000));
            return this.axios(reqCfg);
          }
          throw err;
        }
      );
    }

    this.rateLimiter = new RateLimiter(1200);
    if (options.fastMode) this.rateLimiter.setFastMode(true);
    if (options._globalThrottle) {
      this._globalThrottle = options._globalThrottle;
      const origAcquire = this.rateLimiter.acquire.bind(this.rateLimiter);
      this.rateLimiter.acquire = async (opts) => {
        await origAcquire(opts);
        if (this._globalThrottle) await this._globalThrottle.acquire();
      };
    }

    this._uid = null;
    this._fid = DEFAULT_FID;
    this._taskId = null;
    this.rollbackTimes = 0;
  }

  /** MD5 签名 (委托给 cipher) */
  getEnc(clazzId, userid, jobid, objectId, playingTime, duration) {
    return getEnc(clazzId, userid, jobid, objectId, playingTime, duration);
  }

  setFastMode(on) {
    this.rateLimiter.setFastMode(on);
  }

  getTimestamp() {
    return getTimestamp();
  }

  // ===================== 学习任务（委托给独立 handler） =====================

  async studyVideo(course, job, jobInfo, speed = 1, type = 'Video') {
    return videoHandler(this, course, job, jobInfo, speed, type);
  }

  async studyDocument(course, job, jobInfo) {
    try {
      const kid = (this._currentKnowledgeId || job.knowledgeid || (jobInfo && jobInfo.knowledgeid) || '');
      const url = `https://mooc1.chaoxing.com/ananas/job/document?jobid=${job.jobid}&knowledgeid=${kid}&courseid=${course.courseId}&clazzid=${course.clazzId}&jtoken=${job.jtoken || ''}&_dc=${Date.now()}`;

      await this.rateLimiter.acquire({ random: { min: 500, max: 3000 } });
      const resp = await this.axios.get(url, { headers: cfg.headers, timeout: 15000 });

      if (resp.status === 200) {
        logger.info(`文档完成: ${job.name || job.jobid}`);
        return StudyResult.SUCCESS;
      }
      return StudyResult.ERROR;
    } catch (err) {
      logger.error(`文档失败: ${err.message}`);
      return StudyResult.ERROR;
    }
  }

  async studyRead(course, job, jobInfo) {
    try {
      const knowledgeid = jobInfo ? jobInfo.knowledgeid : (course.knowledgeid || '');
      const url = `https://mooc1.chaoxing.com/ananas/job/read?jobid=${job.jobid}&knowledgeid=${knowledgeid}&courseid=${course.courseId}&clazzid=${course.clazzId}&jtoken=${job.jtoken || ''}&_dc=${Date.now()}`;

      await this.rateLimiter.acquire({ random: { min: 500, max: 3000 } });
      const resp = await this.axios.get(url, { headers: cfg.headers, timeout: 15000 });

      if (resp.status === 200) {
        logger.info(`阅读完成: ${job.title || job.jobid}`);
        return StudyResult.SUCCESS;
      }
      return StudyResult.ERROR;
    } catch (err) {
      logger.error(`阅读失败: ${err.message}`);
      return StudyResult.ERROR;
    }
  }

  async studyWork(course, job, jobInfo) {
    return workHandler(this, course, job, jobInfo);
  }

  async studyEmptyPage(course, point) {
    try {
      await this.rateLimiter.acquire({ random: { min: 500, max: 3000 } });
      await this.axios.get(
        `https://mooc1.chaoxing.com/mooc-ans/knowledge/cards?clazzid=${course.clazzId}&courseid=${course.courseId}&knowledgeid=${point.id}&num=0&ut=s&cpi=${course.cpi}`,
        { headers: cfg.videoHeaders, timeout: 10000 }
      );
      return StudyResult.SUCCESS;
    } catch (_) {
      logger.warn('空章节标记失败: ' + (_.message || _));
      return StudyResult.ERROR;
    }
  }

  // ===================== 答题工具 =====================

  _mapAnswerToLetter(answer, question) {
    const options = question.options || [];
    const type = question.type;
    if (type === 'single') return (answer || 'A').toUpperCase().charAt(0);
    if (type === 'multiple') return answer.toUpperCase().split('').sort().join(',');
    return answer;
  }

  _randomAnswer(question) {
    const type = question.type;
    const optsLen = (question.options || []).length;
    if (type === 'judgement') return Math.random() > 0.5 ? 'true' : 'false';
    if (type === 'single') return String.fromCharCode(65 + Math.floor(Math.random() * Math.max(optsLen, 4)));
    if (type === 'multiple') {
      const count = Math.floor(Math.random() * Math.min(optsLen, 4)) + 1;
      const letters = new Set();
      while (letters.size < count) {
        letters.add(String.fromCharCode(65 + Math.floor(Math.random() * Math.max(optsLen, 4))));
      }
      return [...letters].sort().join(',');
    }
    if (type === 'completion' || type === 'shortanswer') return '答案';
    return '0';
  }
}

// Apply mixin modules (auth, course, video)
applyAuth(Chaoxing);
applyCourse(Chaoxing);
applyVideo(Chaoxing);
