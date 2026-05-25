/**
 * Chaoxing API 总类 — 登录、课程、视频心跳、答题等核心功能
 * @module core/chaoxing
 */

import { SessionManager } from './session.js';
import { aesEncrypt, getEnc, getTimestamp } from './cipher.js';
import { RateLimiter } from './ratelimiter.js';
import { StudyResult } from './study-result.js';
import { parseCourseList } from '../decoders/course-list.js';
import { parseCoursePoint } from '../decoders/course-point.js';
import { parseCourseCard } from '../decoders/course-card.js';
import { renderVideoProgress } from '../utils/progress-bar.js';
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
    this.rateLimiter = new RateLimiter(500);

    this._uid = null;
    this._fid = DEFAULT_FID;
    this._taskId = null;
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
      const encPhone = aesEncrypt(phone);
      const encPwd = aesEncrypt(password);

      const params = new URLSearchParams({
        fid: '-1',
        uname: encPhone,
        password: encPwd,
        refer: 'https%3A%2F%2Fi.chaoxing.com',
        t: 'true',
        forbidotherlogin: '0',
        validate: '',
        doubleFactorLogin: '0',
        independentId: '0'
      });

      await this.rateLimiter.acquire();

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
        await this.session.saveCookies();
        const cookies = await this.session.jar.getCookies('https://chaoxing.com');
        const uid = cookies.find(c => c.key === '_uid')?.value || '';
        this._uid = uid;
        logger.info(`登录成功 uid=${uid}`);
        return { status: true, msg: '登录成功', uid };
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
    const cookies = await this.session.jar.getCookies('https://chaoxing.com');
    const uidCookie = cookies.find(c => c.key === '_uid');
    if (!uidCookie) return false;

    try {
      await this.rateLimiter.acquire();

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
    const cookies = await this.session.jar.getCookies('https://chaoxing.com');
    const uidCookie = cookies.find(c => c.key === '_uid' || c.key === 'UID');
    this._uid = uidCookie ? uidCookie.value : '';
    return this._uid;
  }

  /** MD5 签名 (委托给 cipher) */
  getEnc(clazzId, userid, jobid, objectId, playingTime, duration) {
    return getEnc(clazzId, userid, jobid, objectId, playingTime, duration);
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
      await this.rateLimiter.acquire();
      const resp = await this.axios.post(
        'https://mooc2-ans.chaoxing.com/mooc2-ans/visit/courselistdata',
        new URLSearchParams({ courseType: '1', courseFolderId: '0', query: '', superstarClass: '0' }).toString(),
        { headers: { ...cfg.headers, 'Content-Type': 'application/x-www-form-urlencoded' } }
      );

      // 2. 获取交互页 (获取二级文件夹)
      await this.rateLimiter.acquire();
      await this.axios.get('https://mooc2-ans.chaoxing.com/mooc2-ans/visit/interaction', {
        headers: cfg.headers
      }).catch(() => {});

      // 3. 重新请求主列表 (交互后 session 建立)
      await this.rateLimiter.acquire();
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
   * 获取课程章节列表
   * @param {string} courseId
   * @param {string} clazzId
   * @param {string} cpi
   * @returns {Promise<{hasLocked: boolean, points: Array}>}
   */
  async getCoursePoint(courseId, clazzId, cpi) {
    try {
      const url = `https://mooc2-ans.chaoxing.com/mooc2-ans/mycourse/studentcourse?courseid=${courseId}&clazzid=${clazzId}&cpi=${cpi}&ut=s`;

      await this.rateLimiter.acquire();
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
        await this.rateLimiter.acquire();
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
      return null;
    } catch (_) {
      return null;
    }
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
   * 完整视频模拟观看
   * @param {Object} course
   * @param {Object} job
   * @param {Object} jobInfo
   * @param {number} [speed=1]
   * @param {string} [type='Video']
   * @returns {Promise<number>} — StudyResult
   */
  async studyVideo(course, job, jobInfo, speed = 1, type = 'Video') {
    const actualSpeed = speed || this.speed;

    // 1. 获取视频状态
    const status = await this._getVideoStatus(job.objectid);
    if (!status) {
      logger.error(`无法获取视频状态: ${job.name}`);
      return StudyResult.ERROR;
    }

    const { dtoken, duration } = status;
    const jobName = job.name || '视频';

    if (duration <= 0) {
      logger.warn(`视频时长为0: ${jobName}`);
      return StudyResult.SUCCESS;
    }

    // 2. 先发一次完整进度检查是否已通过 (isdrag=4)
    const initResult = await this.videoProgressLog(course, job, jobInfo, dtoken, duration, duration, type, 4);
    if (initResult.passed) {
      logger.info(`${jobName} 已完成`);
      return StudyResult.SUCCESS;
    }

    // 3. 从已有播放进度开始
    const startPlay = Math.floor((job.playTime || 0) / 1000);
    let playTime = startPlay;
    let lastLogTime = 0;
    const waitTime = randomInt(30, 90);
    let lastIter = Date.now();
    let forbiddenCount = 0;
    const maxForbidden = 2;
    let currentDtoken = dtoken;

    while (true) {
      const now = Date.now();

      // 判断是否需要上报
      if ((playTime - lastLogTime >= waitTime) || playTime >= duration) {
        const result = await this.videoProgressLog(
          course, job, jobInfo, currentDtoken, duration,
          Math.floor(playTime), type, 3
        );

        if (result.status === 403) {
          forbiddenCount++;
          if (forbiddenCount > maxForbidden) {
            logger.warn(`${jobName} 403 恢复失败`);
            return StudyResult.FORBIDDEN;
          }
          // 恢复 session
          const refreshed = await this._recoverAfterForbidden(job, type);
          if (refreshed) currentDtoken = refreshed.dtoken;
          await sleep(3000);
          lastIter = Date.now();
          lastLogTime = playTime;
          continue;
        }

        forbiddenCount = 0;
        lastLogTime = playTime;

        if (result.passed) {
          // 清除进度条行
          if (process.stdout.clearLine) {
            process.stdout.clearLine(0);
            process.stdout.cursorTo(0);
          }
          logger.info(`${jobName} 完成`);
          return StudyResult.SUCCESS;
        }
      }

      if (playTime >= duration) break;

      // 时间推进 (按倍速)
      const dt = (Date.now() - lastIter) * actualSpeed / 1000;
      playTime = Math.min(duration, playTime + dt);
      lastIter = Date.now();

      // 渲染进度条
      const progressStr = renderVideoProgress(jobName, Math.floor(playTime), duration);
      if (process.stdout.clearLine) {
        process.stdout.clearLine(0);
      }
      process.stdout.write(`\r${progressStr}`);

      await sleep(1000);
    }

    // 最后再试一次完整上报
    const finalResult = await this.videoProgressLog(
      course, job, jobInfo, currentDtoken, duration, duration, type, 3
    );

    if (process.stdout.clearLine) {
      process.stdout.clearLine(0);
      process.stdout.cursorTo(0);
    }

    if (finalResult.passed) {
      logger.info(`${jobName} 完成`);
      return StudyResult.SUCCESS;
    }

    return StudyResult.ERROR;
  }

  /**
   * 文档任务
   * @param {Object} course
   * @param {Object} job
   * @returns {Promise<number>} — StudyResult
   */
  async studyDocument(course, job, jobInfo) {
    try {
      const kid = (this._currentKnowledgeId || job.knowledgeid || (jobInfo && jobInfo.knowledgeid) || '');
      const url = `https://mooc1.chaoxing.com/ananas/job/document?jobid=${job.jobid}&knowledgeid=${kid}&courseid=${course.courseId}&clazzid=${course.clazzId}&jtoken=${job.jtoken || ''}&_dc=${Date.now()}`;

      await this.rateLimiter.acquire();
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

      await this.rateLimiter.acquire();
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
   * 答题任务
   * @param {Object} course
   * @param {Object} job
   * @param {Object} jobInfo
   * @returns {Promise<number>} — StudyResult
   */
  async studyWork(course, job, jobInfo) {
    // 如果未配置答题模块，跳过
    if (!this.tiku || this.tiku.DISABLE) {
      logger.info(`答题跳过 (未配置答题模块): ${job.name || job.jobid}`);
      return StudyResult.SUCCESS;
    }

    const knowledgeid = jobInfo ? jobInfo.knowledgeid : (course.knowledgeid || '');

    try {
      // 1. 获取题目页面
      const workUrl = `https://mooc1.chaoxing.com/mooc-ans/api/work?courseid=${course.courseId}&clazzid=${course.clazzId}&knowledgeid=${knowledgeid}&jtoken=${job.jtoken || ''}&_dc=${Date.now()}`;

      await this.rateLimiter.acquire();
      const resp = await this.axios.get(workUrl, { headers: cfg.headers, timeout: 15000 });

      const html = typeof resp.data === 'string' ? resp.data : '';

      // 2. 解析题目
      const { parseQuestions } = await import('../decoders/questions.js');
      const { formData, questions } = parseQuestions(html);

      if (!questions.length) {
        logger.info(`答题无题目: ${job.name || job.jobid}`);
        return StudyResult.SUCCESS;
      }

      // 3. 逐题查询答案
      let foundQuestions = 0;
      const totalQuestions = questions.length;

      for (const q of questions) {
        try {
          const answer = await this.tiku.query({
            title: q.title,
            options: q.options,
            type: q.type
          });

          if (answer) {
            foundQuestions++;
            // 根据题型设置答案
            if (q.type === 'judgement') {
              const judgementResult = this.tiku.judgementSelect
                ? this.tiku.judgementSelect(answer.answer)
                : null;
              if (judgementResult !== null) {
                formData[q.answerField] = judgementResult ? 'true' : 'false';
              }
            } else if (q.type === 'completion' || q.type === 'shortanswer') {
              formData[q.answerField] = answer.answer;
            } else {
              // single / multiple: 映射到选项索引
              const answerStr = this._mapAnswerToIndex(answer.answer, q);
              formData[q.answerField] = answerStr;
            }
          } else {
            // 随机选择
            formData[q.answerField] = this._randomAnswer(q);
          }
        } catch (_) {
          formData[q.answerField] = this._randomAnswer(q);
        }
      }

      const coverage = totalQuestions > 0 ? foundQuestions / totalQuestions : 0;
      logger.info(`答题覆盖率: ${(coverage * 100).toFixed(0)}% (${foundQuestions}/${totalQuestions})`);

      // 4. 判断是否直接提交
      const submit = this.tiku.SUBMIT;
      const coverRate = this.tiku.COVER_RATE;
      const pyFlag = (submit && coverage >= coverRate) ? '' : '1';

      // 5. 提交
      formData.pyFlag = pyFlag;
      formData.token = jobInfo ? (jobInfo.ktoken || '') : '';
      formData.key = jobInfo ? (jobInfo.mtEnc || jobInfo.defenc || '') : '';

      const params = new URLSearchParams(formData);
      await this.rateLimiter.acquire();
      const submitResp = await this.axios.post(
        'https://mooc1.chaoxing.com/mooc-ans/api/work',
        params.toString(),
        {
          headers: { ...cfg.headers, 'Content-Type': 'application/x-www-form-urlencoded' },
          timeout: 15000
        }
      );

      if (submitResp.status === 200) {
        const resultText = typeof submitResp.data === 'string' ? submitResp.data : JSON.stringify(submitResp.data);

        if (resultText.includes('success') || resultText.includes('成功') || resultText.includes('true')) {
          logger.info(`答题完成: ${job.name || job.jobid}`);
          return StudyResult.SUCCESS;
        }

        if (resultText.includes('未通过') || resultText.includes('错误') || resultText.includes('false')) {
          logger.warn(`答题未通过: ${job.name || job.jobid}`);
        }
      }

      return StudyResult.SUCCESS; // 提交成功即使未通过也算完成
    } catch (err) {
      logger.error(`答题失败: ${err.message}`);
      return StudyResult.ERROR;
    }
  }

  /**
   * 处理空章节 (没有任务但需要标记进度)
   * @param {Object} course
   * @param {Object} point
   * @returns {Promise<number>}
   */
  async studyEmptyPage(course, point) {
    // 空章节直接标记完成
    try {
      await this.rateLimiter.acquire();
      await this.axios.get(
        `https://mooc1.chaoxing.com/mooc-ans/knowledge/cards?clazzid=${course.clazzId}&courseid=${course.courseId}&knowledgeid=${point.id}&num=0&ut=s&cpi=${course.cpi}`,
        { headers: cfg.videoHeaders, timeout: 10000 }
      );
      return StudyResult.SUCCESS;
    } catch (_) {
      return StudyResult.ERROR;
    }
  }

  /**
   * 答案映射: 字母 → 选项索引
   * @private
   */
  _mapAnswerToIndex(answer, question) {
    const options = question.options || [];
    const type = question.type;

    if (type === 'single') {
      const idx = answer.toUpperCase().charCodeAt(0) - 65; // A=0, B=1 ...
      if (idx >= 0 && idx < options.length) return String(idx);
      return '0';
    }

    if (type === 'multiple') {
      // 多选: 答案如 "ABD" → "0,2,3"
      const indices = [];
      for (const ch of answer.toUpperCase()) {
        const idx = ch.charCodeAt(0) - 65;
        if (idx >= 0 && idx < options.length) indices.push(idx);
      }
      return indices.sort().join(',');
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

    if (type === 'single' || type === 'judgement') {
      return optsLen > 0 ? String(randomInt(0, optsLen - 1)) : '0';
    }
    if (type === 'multiple') {
      const count = randomInt(1, Math.min(optsLen, 4));
      const indices = new Set();
      while (indices.size < count) {
        indices.add(randomInt(0, optsLen - 1));
      }
      return [...indices].sort().join(',');
    }
    if (type === 'completion' || type === 'shortanswer') {
      return '答案';
    }
    return '0';
  }
}
