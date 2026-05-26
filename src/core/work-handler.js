/**
 * 答题任务处理器 — 独立于 Chaoxing 主类
 * @module core/work-handler
 */
import logger from '../utils/logger.js';
import cfg from '../config.js';
import { StudyResult } from './study-result.js';
import { createRequire } from 'module';
const _require = createRequire(import.meta.url);

/**
 * 处理答题任务
 * @param {import('./chaoxing.js').Chaoxing} cx — Chaoxing 实例
 * @param {Object} course
 * @param {Object} job
 * @param {Object} jobInfo
 * @returns {Promise<number>} StudyResult
 */
export async function studyWork(cx, course, job, jobInfo) {
  if (!cx.tiku || cx.tiku.DISABLE) {
    logger.info(`答题跳过 (未配置答题模块): ${job.name || job.jobid}`);
    return StudyResult.SUCCESS;
  }

  const knowledgeid = jobInfo ? jobInfo.knowledgeid : (course.knowledgeid || '');

  try {
    const workId = (job.jobid || '').replace('work-', '');
    const workParams = new URLSearchParams({
      api: '1', workId, jobid: job.jobid || '', originJobId: job.jobid || '',
      needRedirect: 'true', skipHeader: 'true', knowledgeid: knowledgeid || '',
      ktoken: (jobInfo && jobInfo.ktoken) || '', cpi: (jobInfo && jobInfo.cpi) || course.cpi || '',
      ut: 's', clazzId: course.clazzId || '', courseid: course.courseId || '',
      type: '', enc: job.enc || '', mooc2: '1'
    });

    const headers = { ...cfg.headers, Referer: 'https://mooc1.chaoxing.com/mooc-ans/' };
    await cx.rateLimiter.acquire({ random: { min: 500, max: 3000 } });

    let html = await _fetchWorkPage(cx, workParams, headers);
    if (!html) return StudyResult.ERROR;

    // 如果 tiku 支持字体解密, 从 HTML 中提取自定义字体
    if (typeof cx.tiku.setFont === 'function') {
      const fontMatch = html.match(/data:font\/woff;base64,([A-Za-z0-9+/=]+)/);
      if (fontMatch) cx.tiku.setFont(fontMatch[1]);
    }

    const { parseQuestions } = await import('../decoders/questions.js');
    const { formData, questions } = parseQuestions(html);

    if (!questions.length) {
      logger.info(`答题无题目: ${job.name || job.jobid}`);
      return StudyResult.SUCCESS;
    }

    let foundQuestions = 0;
    const totalQuestions = questions.length;
    formData.answerwqbid = questions.map(q => q.id).join(',') + ',';

    const answers = [];
    for (const q of questions) {
      formData[q.answerTypeField] = q.typeCodeRaw;
      try {
        const answer = await cx.tiku.query({ title: q.title, options: q.options, type: q.type });
        if (answer) { foundQuestions++; answers.push({ q, answer: answer.answer, found: true }); }
        else { answers.push({ q, answer: null, found: false }); }
      } catch (_) {
        logger.warn('答题查询失败: ' + (_.message || _));
        answers.push({ q, answer: null, found: false });
      }
    }

    const coverage = totalQuestions > 0 ? foundQuestions / totalQuestions : 0;
    logger.info(`答题覆盖率: ${(coverage * 100).toFixed(0)}% (${foundQuestions}/${totalQuestions})`);

    const submit = cx.tiku.SUBMIT;
    const coverRate = cx.tiku.COVER_RATE;
    const shouldSubmit = cx.rollbackTimes >= 1 || (submit && coverage >= coverRate);
    const pyFlag = shouldSubmit ? '' : '1';

    for (const { q, answer: ans, found } of answers) {
      if (pyFlag === '1' && !found) {
        formData[q.answerField] = '';
      } else if (ans) {
        if (q.type === 'judgement') {
          const jr = cx.tiku.judgementSelect?.(ans);
          formData[q.answerField] = jr !== null ? (jr ? 'true' : 'false') : _randomAnswer(cx, q);
        } else if (q.type === 'completion' || q.type === 'shortanswer') {
          formData[q.answerField] = ans;
        } else {
          formData[q.answerField] = _mapAnswerToIndex(cx, ans, q);
        }
      } else {
        formData[q.answerField] = _randomAnswer(cx, q);
      }
    }

    formData.pyFlag = pyFlag;
    formData.token = jobInfo ? (jobInfo.ktoken || '') : '';
    formData.key = jobInfo ? (jobInfo.mtEnc || jobInfo.defenc || '') : '';

    const params = new URLSearchParams(formData);
    await cx.rateLimiter.acquire({ random: { min: 500, max: 3000 } });
    const submitResp = await cx.axios.post(
      'https://mooc1.chaoxing.com/mooc-ans/work/addStudentWorkNew',
      params.toString(),
      { headers: { ...cfg.headers, 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest', 'Accept': 'application/json, text/javascript, */*; q=0.01',
          'Origin': 'https://mooc1.chaoxing.com' }, timeout: 15000 }
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
    return StudyResult.SUCCESS;
  } catch (err) {
    logger.error(`答题失败: ${err.message}`);
    return StudyResult.ERROR;
  }
}

async function _fetchWorkPage(cx, workParams, headers) {
  try {
    await cx.rateLimiter.acquire({ random: { min: 500, max: 3000 } });
    const resp = await cx.axios.get('https://mooc1.chaoxing.com/mooc-ans/api/work?' + workParams.toString(), { headers, timeout: 15000 });
    if (resp.status === 200) return typeof resp.data === 'string' ? resp.data : '';
  } catch {}
  // 重试一次
  try {
    const loginResult = await cx.login(false);
    if (!loginResult.status) return null;
    await cx.rateLimiter.acquire({ random: { min: 500, max: 3000 } });
    const resp = await cx.axios.get('https://mooc1.chaoxing.com/mooc-ans/api/work?' + workParams.toString(), { headers, timeout: 15000 });
    if (resp.status === 200) return typeof resp.data === 'string' ? resp.data : '';
  } catch { return null; }
  return null;
}

function _randomAnswer(cx, q) {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  return letters.substring(0, q.options?.length || 4).split('').sort(() => Math.random() - 0.5).join('');
}

function _mapAnswerToIndex(cx, ans, q) {
  if (q.type === 'single') {
    const idx = (ans || '').charCodeAt(0) - 65;
    return String(idx + 1);
  }
  if (q.type === 'multiple') {
    const indices = [...(ans || '')].map(c => c.charCodeAt(0) - 65 + 1).filter(n => n > 0 && n <= (q.options?.length || 100));
    return indices.join('');
  }
  return ans || '';
}
