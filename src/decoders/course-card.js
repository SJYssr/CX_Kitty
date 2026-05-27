/**
 * 任务卡片 mArg 提取与解析器
 * @module decoders/course-card
 */

import logger from '../utils/logger.js';

/**
 * 从 HTML 中提取 mArg JSON 并解析为任务列表
 * @param {string} html — 知识卡片页面 HTML
 * @returns {{ jobs: Array<Object>, jobInfo: Object, notOpen: boolean }|null}
 */
export function parseCourseCard(html) {
  if (!html.includes('mArg')) return null;

  // 检查章节未开放
  const notOpen = html.includes('章节未开放') || html.includes('该章节未开放');
  if (notOpen) return { jobs: [], jobInfo: null, notOpen: true };

  const m = html.match(/mArg\s*=\s*(\{[\s\S]*?\});/);
  if (!m) return { jobs: [], jobInfo: null, notOpen: false };

  let data;
  try {
    data = JSON.parse(m[1]);
  } catch (_) {
    logger.warn('课程卡片 mArg JSON 解析失败: ' + (_.message || _));
    return { jobs: [], jobInfo: null, notOpen: false };
  }

  const defaults = data.defaults || {};
  const attachments = data.attachments || [];

  const jobInfo = {
    ktoken: defaults.ktoken || '',
    mtEnc: defaults.mtEnc || '',
    reportTimeInterval: defaults.reportTimeInterval || 60,
    defenc: defaults.defenc || '',
    cardid: defaults.cardid || '',
    cpi: defaults.cpi || '',
    qnenc: defaults.qnenc || '',
    knowledgeid: defaults.knowledgeid || ''
  };

  const jobs = [];
  for (const att of attachments) {
    if (att.isPassed === true) continue;

    const prop = att.property || {};

    // 清理 otherInfo: 只保留到第一个 & 之前
    let otherInfo = att.otherInfo || prop.otherInfo || att.otherinfo || '';
    const ampIdx = otherInfo.indexOf('&');
    if (ampIdx > 0) otherInfo = otherInfo.substring(0, ampIdx);

    const jobType = att.type || prop.type || '';

    if (jobType === 'video' || (!jobType && (att.objectId || prop.objectid))) {
      const rtRaw = prop.rt || '';
      let rt = rtRaw;
      if (!rt) {
        const rm = otherInfo.match(/-rt_([1d])/);
        if (rm) rt = rm[1] === 'd' ? '0.9' : '1';
      }
      jobs.push({
        type: 'video',
        jobid: att.jobid || prop.jobid || '',
        otherinfo: otherInfo,
        objectid: att.objectId || prop.objectid || att.objectid || '',
        name: prop.name || prop.title || att.title || att.name || '视频',
        playTime: att.playTime || prop.playtime || 0,
        rt,
        mid: att.mid || prop.mid || '',
        aid: att.aid || prop.aid || '',
        attDuration: att.attDuration || '',
        attDurationEnc: att.attDurationEnc || '',
        videoFaceCaptureEnc: att.videoFaceCaptureEnc || ''
      });
    } else if (jobType === 'document') {
      jobs.push({
        type: 'document',
        jobid: att.jobid || prop.jobid || '',
        otherinfo: otherInfo,
        jtoken: att.jtoken || prop.jtoken || '',
        mid: att.mid || prop.mid || '',
        enc: att.enc || prop.enc || '',
        aid: att.aid || prop.aid || '',
        objectid: att.objectId || prop.objectid || ''
      });
    } else if (jobType === 'workid' || jobType === 'work') {
      jobs.push({
        type: 'workid',
        jobid: att.jobid || prop.jobid || '',
        otherinfo: otherInfo,
        mid: att.mid || prop.mid || '',
        enc: att.enc || prop.enc || '',
        aid: att.aid || prop.aid || ''
      });
    } else if (jobType === 'read') {
      jobs.push({
        type: 'read',
        title: prop.title || att.title || '',
        id: prop.id || att.id || '',
        jobid: att.jobid || prop.jobid || '',
        jtoken: att.jtoken || prop.jtoken || '',
        mid: att.mid || prop.mid || '',
        otherinfo: otherInfo,
        enc: att.enc || prop.enc || '',
        aid: att.aid || prop.aid || ''
      });
    } else if (jobType === 'live') {
      jobs.push({
        type: 'live',
        jobid: att.jobid || prop.jobid || '',
        name: prop.title || att.title || '',
        otherinfo: otherInfo,
        property: prop,
        mid: att.mid || prop.mid || '',
        objectid: att.objectId || prop.objectid || '',
        aid: att.aid || prop.aid || '',
        liveId: prop.liveId || '',
        streamName: prop.streamName || ''
      });
    }
    // 未知类型跳过
  }

  return { jobs, jobInfo, notOpen: false };
}
