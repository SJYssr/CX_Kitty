/**
 * 超星 Video 模块 — 视频状态、心跳上报、403 恢复
 */
import { getEnc, getTimestamp } from './cipher.js';
import { SessionManager } from './session.js';
import logger from '../utils/logger.js';
import cfg from '../config.js';

/** @param {Function} ChaoxingClass */
export function applyVideo(ChaoxingClass) {
  const proto = ChaoxingClass.prototype;

  proto._getVideoStatus = async function (objectId) {
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

        if (resp.data && resp.data.download) {
          logger.info(`下载视频响应: ${JSON.stringify(resp.data)}`);
          return { dtoken: '', duration: 1, crc: '', key: '' };
        }

        logger.warn(`视频状态异常: ${resp.status} ${typeof resp.data === 'string' ? resp.data.slice(0, 100) : JSON.stringify(resp.data).slice(0, 100)}`);
      } catch (e) {
        logger.warn(`视频状态请求异常: ${e.message}`);
      }
    }
    return null;
  };

  proto.videoProgressLog = async function (course, job, jobInfo, dtoken, duration, playingTime, type = 'Video', isdrag = 3) {
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
  };

  proto._refreshVideoStatus = async function (job, type = 'Video') {
    return await this._getVideoStatus(job.objectid);
  };

  proto._recoverAfterForbidden = async function (job, type = 'Video') {
    SessionManager.updateCookies();

    let status = await this._refreshVideoStatus(job, type);
    if (status) return status;

    if (this.account.password) {
      logger.info('重新登录...');
      const loginResult = await this.login(false);
      if (loginResult.status) {
        SessionManager.updateCookies();
        status = await this._refreshVideoStatus(job, type);
      }
    }

    return status;
  };
}
