/**
 * Chaoxing API 总类 — 登录、课程、视频心跳、答题等核心功能
 * @module core/chaoxing
 */

import { SessionManager } from './session.js';
import { aesEncrypt, getEnc, getTimestamp } from './cipher.js';
import { studyVideo as videoHandler } from './video-handler.js';
import { studyWork as workHandler } from './work-handler.js';
import { RateLimiter } from './ratelimiter.js';
import { StudyResult } from './study-result.js';
import { parseCourseList } from '../decoders/course-list.js';
import { parseCoursePoint } from '../decoders/course-point.js';
import { parseCourseCard } from '../decoders/course-card.js';
import logger from '../utils/logger.js';
import cfg from '../config.js';

// ===================== 默认配置 =====================

const DEFAULT_FID = '4311';

// ===================== 工具函数 =====================

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ===================== Chaoxing =====================

/**
 * 超星学习通 API 客户端
 */
export class Chaoxing {
  /**
   * @param {Object} account — { phone, password }
   * @param {Object} [tiku] — 题库实例 (Tiku)
   * @param {Object} [options]
   * @param {number} [options.speed=1] — 倍速
   * @param {number} [options.jobs=3] — 并行任务数
   * @param {string} [options.notopenAction='continue'] — 未开放章节处理: retry|continue
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
          const cfg = err.config;
          if (!cfg) throw err;
          if (cfg._retry === undefined) cfg._retry = 0;
          const retryable = !err.response || err.code === 'ECONNABORTED' || err.code === 'ECONNRESET' || (err.response && err.response.status >= 500);
          if (retryable && cfg._retry < MAX) {
            cfg._retry++;
            await new Promise(r => setTimeout(r, cfg._retry * 1500 + Math.random() * 1000));
            return this.axios(cfg);
          }
          throw err;
        }
      );
    }

    this.rateLimiter = new RateLimiter(1200);
    if (options.fastMode) this.rateLimiter.setFastMode(true);
    // 全局节流：所有实例共用，控制整体请求频率 < 1.5 req/s
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

  // ===================== 登录 =====================

  /**
   * 登录
   * @param {boolean} [loginWithCookies=false] — 是否优先用 cookies 登录
   * @returns {Promise<{status: boolean, msg: string}>}
   */
  async login(loginWithCookies = false) {
    if (loginWithCookies) {
      // 先验证 cookie 是否有效
      const valid = await this._validateCookieSession();
      if (valid) {
        logger.info('Cookie 登录成功');
        return { status: true, msg: 'cookie 登录成功' };
      }
      logger.info('Cookie 失效，回退账号密码登录');
    }

    // 账号密码登录
    const { phone, password } = this.account;
    if (!phone || !password) {
      return { status: false, msg: '未配置账号密码' };
    }

    try {
      const params = new URLSearchParams({
        fid: '-1',
        uname: phone,
        password: password,
        refer: 'https://i.chaoxing.com',
        t: 'true',
        forbidotherlogin: '0',
        validate: '',
        doubleFactorLogin: '0',
        independentId: '0'
      });

      await this.rateLimiter.acquire({ random: { min: 500, max: 3000 } });

      const resp = await this.axios.post(
        'https://passport2.chaoxing.com/fanyalogin',
        params.toString(),
        {
          headers: {
            ...cfg.headers,
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      if (resp.data && resp.data.status === true) {
        // 有 session 就持久化 cookie，没有就是独立 session（多账号模式）
        if (this.session) {
          await this.session.saveCookies();
          const cookies = await this.session.jar.getCookies('https://chaoxing.com');
          const uid = cookies.find(c => c.key === '_uid')?.value || '';
          this._uid = uid;
        } else {
          // 从独立 session 的 jar 中获取 uid
          try {
            const cookies = await this.axios.defaults.jar.getCookies('https://chaoxing.com');
            const uid = cookies.find(c => c.key === '_uid')?.value || '';
            this._uid = uid;
          } catch {}
        }
        logger.info(`登录成功 uid=${this._uid}`);
        return { status: true, msg: '登录成功', uid: this._uid };
      } else {
        const msg = (resp.data && (resp.data.msg2 || resp.data.message)) || '未知错误';
        logger.error(`登录失败: ${msg}`);
        return { status: false, msg };
      }
    } catch (err) {
      logger.error(`登录异常: ${err.message}`);
      return { status: false, msg: err.message };
    }
  }

  /**
   * 验证 cookie 会话是否有效
   * @returns {Promise<boolean>}
   */
  async _validateCookieSession() {
    // 独立 session 不需要验证 cookie
    if (!this.session) return false;
    const cookies = await this.session.jar.getCookies('https://chaoxing.com');
    const uidCookie = cookies.find(c => c.key === '_uid');
    if (!uidCookie) return false;

    try {
      await this.rateLimiter.acquire({ random: { min: 500, max: 3000 } });

      const resp = await this.axios.post(
        'https://mooc2-ans.chaoxing.com/mooc2-ans/visit/courselistdata',
        new URLSearchParams({ courseType: '1', courseFolderId: '0', query: '', superstarClass: '0' }).toString(),
        { headers: { ...cfg.headers, 'Content-Type': 'application/x-www-form-urlencoded' } }
      );

      const body = typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data);
      // 有效会话不包含 login 或 passport2
      if (body.includes('login') || body.includes('passport2')) return false;
      return true;
    } catch (_) {
      return false;
    }
  }

  // ===================== 工具 =====================

  /** 从 cookie 获取 fid，默认 4311 */
  getFid() {
    return this._fid;
  }

  /** 从 cookie 获取 uid */
  async getUid() {
    if (this._uid) return this._uid;
    const jar = this.session ? this.session.jar : this.axios?.defaults?.jar;
    if (!jar) return '';
    const cookies = await jar.getCookies('https://chaoxing.com');
    const uidCookie = cookies.find(c => c.key === '_uid' || c.key === 'UID');
    this._uid = uidCookie ? uidCookie.value : '';
    return this._uid;
  }

  /** MD5 签名 (委托给 cipher) */
  getEnc(clazzId, userid, jobid, objectId, playingTime, duration) {
    return getEnc(clazzId, userid, jobid, objectId, playingTime, duration);
  }

  /** 快速模式：跳过限速延迟 */
  setFastMode(on) {
    this.rateLimiter.setFastMode(on);
  }

  /** 时间戳 */
  getTimestamp() {
    return getTimestamp();
  }

  // ===================== 课程 =====================

  /**
   * 获取课程列表
   * @returns {Promise<Array<{clazzId: string, courseId: string, cpi: string, title: string, desc: string, teacher: string}>>}
   */
  async getCourseList() {
    try {
      // 1. 先获取主列表
      await this.rateLimiter.acquire({ random: { min: 500, max: 3000 } });
      const resp = await this.axios.post(
        'https://mooc2-ans.chaoxing.com/mooc2-ans/visit/courselistdata',
        new URLSearchParams({ courseType: '1', courseFolderId: '0', query: '', superstarClass: '0' }).toString(),
        { headers: { ...cfg.headers, 'Content-Type': 'application/x-www-form-urlencoded' } }
      );

      // 2. 获取交互页 (获取二级文件夹)
      await this.rateLimiter.acquire({ random: { min: 500, max: 3000 } });
      await this.axios.get('https://mooc2-ans.chaoxing.com/mooc2-ans/visit/interaction', {
        headers: cfg.headers
      }).catch(() => {});

      // 3. 重新请求主列表 (交互后 session 建立)
      await this.rateLimiter.acquire({ random: { min: 500, max: 3000 } });
      const resp2 = await this.axios.post(
        'https://mooc2-ans.chaoxing.com/mooc2-ans/visit/courselistdata',
        new URLSearchParams({ courseType: '1', courseFolderId: '0', query: '', superstarClass: '0' }).toString(),
        { headers: { ...cfg.headers, 'Content-Type': 'application/x-www-form-urlencoded' } }
      );

      const html = typeof resp2.data === 'string' ? resp2.data : '';
      const courses = parseCourseList(html);

      logger.info(`获取到 ${courses.length} 门课程`);
      return courses;
    } catch (err) {
      logger.error(`获取课程失败: ${err.message}`);
      return [];
    }
  }

  /**
   * 获取用户个人信息（姓名、学号、学校等）
   * @returns {Promise<Object>}
   */
  async getUserInfo() {
    const phone = this.account?.phone || '';
    const uid = await this.getUid();
    const fid = this.getFid();

    let name = '';

    // 从 interaction 页面获取姓名
    try {
      const resp = await this.axios.get('https://mooc2-ans.chaoxing.com/mooc2-ans/visit/interaction', {
        headers: cfg.headers, timeout: 8000
      });
      const html = typeof resp.data === 'string' ? resp.data : '';
      const nm = html.match(/realname["']?\s*[:=]\s*["']([^"']+)["']/);
      if (nm) name = nm[1];
      if (!name) {
        const el = html.match(/<a[^>]*class=["']user-info["'][^>]*>([^<]+)<\/a>/);
        if (el) name = el[1].trim();
      }
    } catch {}

    // 从个人中心页面获取姓名
    if (!name) {
      try {
        const resp = await this.axios.get('https://i.chaoxing.com/', {
          headers: cfg.headers, timeout: 8000
        });
        const html = typeof resp.data === 'string' ? resp.data : '';
        const patterns = [
          /realname["']?\s*[:=]\s*["']([^"']+)["']/,
          /<p[^>]*class=["']user-?name["'][^>]*>([^<]+)<\/p>/,
          /<span[^>]*class=["']user-?name["'][^>]*>([^<]+)<\/span>/
        ];
        for (const p of patterns) {
          const m = html.match(p);
          if (m) { name = m[1].trim(); break; }
        }
      } catch {}
    }

    return { phone, uid, fid, name };
  }

  /**
   * 获取课程章节列表
   * @param {string} courseId
   * @param {string} clazzId
   * @param {string} cpi
   * @returns {Promise<{hasLocked: boolean, points: Array}>}
   */
  async getCoursePoint(courseId, clazzId, cpi) {
    try {
      const url = `https://mooc2-ans.chaoxing.com/mooc2-ans/mycourse/studentcourse?courseid=${courseId}&clazzid=${clazzId}&cpi=${cpi}&ut=s`;

      await this.rateLimiter.acquire({ random: { min: 500, max: 3000 } });
      const resp = await this.axios.get(url, { headers: cfg.headers });

      const html = typeof resp.data === 'string' ? resp.data : '';
      const result = parseCoursePoint(html);

      logger.info(`章节解析: ${result.points.length} 个章节`);
      return result;
    } catch (err) {
      logger.error(`获取章节失败: ${err.message}`);
      return { hasLocked: false, points: [] };
    }
  }

  /**
   * 获取任务卡片列表
   * @param {Object} course — { courseId, clazzId, cpi }
   * @param {Object} point — { id } (章节id = knowledgeid)
   * @returns {Promise<{jobs: Array, jobInfo: Object, notOpen: boolean}>}
   */
  async getJobList(course, point) {
    const allJobs = [];
    let jobInfo = null;
    let maxRetries = 6;

    // 记录当前章节 knowledgeid
    this._currentKnowledgeId = point.id;

    // 轮询 num=0~5 直到获取到 jobInfo 或有 attachment
    for (let num = 0; num < maxRetries; num++) {
      const url = `https://mooc1.chaoxing.com/mooc-ans/knowledge/cards?clazzid=${course.clazzId}&courseid=${course.courseId}&knowledgeid=${point.id}&num=${num}&ut=s&cpi=${course.cpi}&v=2025-0424-1038-3&mooc2=1`;

      try {
        await this.rateLimiter.acquire({ random: { min: 500, max: 3000 } });
        const resp = await this.axios.get(url, { headers: cfg.videoHeaders });
        const html = typeof resp.data === 'string' ? resp.data : '';

        const parsed = parseCourseCard(html);
        if (!parsed) {
          if (num === 0) return { jobs: [], jobInfo: null, notOpen: false };
          break;
        }

        if (parsed.notOpen) {
          return { jobs: [], jobInfo: null, notOpen: true };
        }

        if (parsed.jobInfo) jobInfo = parsed.jobInfo;
        allJobs.push(...parsed.jobs);

        // 如果已经有 jobInfo 且有 ktoken，继续尝试获取更多任务
        if (jobInfo && jobInfo.ktoken && num >= 1) {
          // 最多尝试到 num=5
        }
      } catch (_) {
        logger.warn('获取 course point 任务失败: ' + (_.message || _));
        break;
      }
    }

    // 给每个 job 挂上 knowledgeid
    for (const j of allJobs) {
      j.knowledgeid = (jobInfo && jobInfo.knowledgeid) || point.id;
    }

    return { jobs: allJobs, jobInfo, notOpen: false };
  }

  // ===================== 视频心跳 =====================

  /**
   * 获取视频状态 (dtoken, duration)
   * @param {string} objectId
   * @returns {Promise<{dtoken: string, duration: number}|null>}
   */
  async _getVideoStatus(objectId) {
    const fid = this.getFid();
    const url = `https://mooc1.chaoxing.com/ananas/status/${objectId}?k=${fid}&flag=normal&_dc=${Date.now()}`;

    for (let retry = 0; retry < 3; retry++) {
      if (retry > 0) await new Promise(r => setTimeout(r, 3000));
      try {
        await this.rateLimiter.acquire({ random: { min: 0, max: 2000 } });
        const resp = await this.axios.get(url, { headers: cfg.videoHeaders, timeout: 15000 });

        if (resp.data && resp.data.status === 'success') {
          return {
            dtoken: resp.data.dtoken || '',
            duration: resp.data.duration || 0,
            crc: resp.data.crc || '',
            key: resp.data.key || ''
          };
        }

        // 如果返回的是下载链接(非标准ananas视频)，模拟完成
        if (resp.data && resp.data.download) {
          logger.info(`下载视频响应: ${JSON.stringify(resp.data)}`);
          // 仍尝试发送心跳来真正完成视频（duration=1模拟播放1秒）
          return {
            dtoken: '',
            duration: 1,
            crc: '',
            key: ''
          };
        }

        // 打印响应内容便于调试
        logger.warn(`视频状态异常: ${resp.status} ${typeof resp.data === 'string' ? resp.data.slice(0,100) : JSON.stringify(resp.data).slice(0,100)}`);
      } catch (e) {
        logger.warn(`视频状态请求异常: ${e.message}`);
      }
    }
    return null;
  }

  /**
   * 视频心跳上报
   * @param {Object} course
   * @param {Object} job
   * @param {Object} jobInfo
   * @param {string} dtoken
   * @param {number} duration
   * @param {number} playingTime
   * @param {string} [type='Video']
   * @param {number} [isdrag=3]
   * @returns {Promise<{passed: boolean, status: number}>}
   */
  async videoProgressLog(course, job, jobInfo, dtoken, duration, playingTime, type = 'Video', isdrag = 3) {
    const userid = await this.getUid();
    const enc = getEnc(course.clazzId, userid, job.jobid, job.objectid, playingTime, duration);

    const params = {
      clazzId: course.clazzId,
      playingTime,
      duration,
      clipTime: `0_${duration}`,
      objectId: job.objectid,
      otherInfo: job.otherinfo || '',
      courseId: course.courseId,
      jobid: job.jobid,
      userid,
      isdrag,
      view: 'pc',
      enc,
      dtype: type,
      _t: getTimestamp()
    };

    // 附加字段
    if (job.rt) params.rt = job.rt;
    if (job.attDuration) params.attDuration = job.attDuration;
    if (job.attDurationEnc) params.attDurationEnc = job.attDurationEnc;
    if (job.videoFaceCaptureEnc) params.videoFaceCaptureEnc = job.videoFaceCaptureEnc;

    const baseUrl = `https://mooc1.chaoxing.com/mooc-ans/multimedia/log/a/${course.cpi}/${dtoken}`;
    const rtValues = job.rt ? [job.rt] : ['0.9', '1'];

    for (const rt of rtValues) {
      params.rt = rt;
      params._t = getTimestamp();

      try {
        await this.rateLimiter.acquire({ random: { min: 0, max: 2000 } });
        const resp = await this.axios.get(baseUrl, {
          params,
          headers: cfg.videoHeaders,
          timeout: 15000
        });

        if (resp.status === 200) {
          return {
            passed: resp.data && resp.data.isPassed === true,
            status: 200
          };
        }
      } catch (err) {
        if (err.response && err.response.status === 403) continue;
        return { passed: false, status: err.response ? err.response.status : 0 };
      }
    }

    return { passed: false, status: 403 };
  }

  /**
   * 刷新视频状态 (403 后使用)
   * @param {Object} job
   * @param {string} [type='Video']
   * @returns {Promise<{dtoken: string, duration: number}|null>}
   */
  async _refreshVideoStatus(job, type = 'Video') {
    return await this._getVideoStatus(job.objectid);
  }

  /**
   * 403 恢复: 更新 session → 重新获取视频状态
   * @param {Object} job
   * @param {string} [type='Video']
   * @returns {Promise<{dtoken: string, duration: number}|null>}
   */
  async _recoverAfterForbidden(job, type = 'Video') {
    // 1. 更新 cookies
    SessionManager.updateCookies();

    // 2. 刷新视频状态
    let status = await this._refreshVideoStatus(job, type);
    if (status) return status;

    // 3. 如果有密码，尝试重新登录
    if (this.account.password) {
      logger.info('重新登录...');
      const loginResult = await this.login(false);
      if (loginResult.status) {
        SessionManager.updateCookies();
        status = await this._refreshVideoStatus(job, type);
      }
    }

    return status;
  }

  // ===================== 学习任务 =====================

  /**
   * 完整视频模拟观看 — 委托 video-handler.js
   * @param {Object} course
   * @param {Object} job
   * @param {Object} jobInfo
   * @param {number} [speed=1]
   * @param {string} [type='Video']
   * @returns {Promise<number>} — StudyResult
   */
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

  /**
   * 阅读任务
   * @param {Object} course
   * @param {Object} job
   * @param {Object} jobInfo
   * @returns {Promise<number>} — StudyResult
   */
  async studyRead(course, job, jobInfo) {
    try {
      // 阅读任务：GET 标记完成
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

  /**
   * 答题任务 — 委托 work-handler.js
   * @param {Object} course
   * @param {Object} job
   * @param {Object} jobInfo
   * @returns {Promise<number>} — StudyResult
   */
  async studyWork(course, job, jobInfo) {
    return workHandler(this, course, job, jobInfo);
  }
  async studyEmptyPage(course, point) {
    // 空章节直接标记完成
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

  /**
   * 答案映射: 字母 → 选项索引
   * @private
   */
  _mapAnswerToLetter(answer, question) {
    const options = question.options || [];
    const type = question.type;

    if (type === 'single') {
      return (answer || 'A').toUpperCase().charAt(0);
    }

    if (type === 'multiple') {
      return answer.toUpperCase().split('').sort().join(',');
    }

    return answer;
  }

  /**
   * 随机答案
   * @private
   */
  _randomAnswer(question) {
    const type = question.type;
    const optsLen = (question.options || []).length;

    if (type === 'judgement') {
      return Math.random() > 0.5 ? 'true' : 'false';
    }
    if (type === 'single') {
      return String.fromCharCode(65 + Math.floor(Math.random() * Math.max(optsLen, 4)));
    }
    if (type === 'multiple') {
      const count = randomInt(1, Math.min(optsLen, 4));
      const letters = new Set();
      while (letters.size < count) {
        letters.add(String.fromCharCode(65 + randomInt(0, Math.max(optsLen, 4) - 1)));
      }
      return [...letters].sort().join(',');
    }
    if (type === 'completion' || type === 'shortanswer') {
      return '答案';
    }
    return '0';
  }
}
