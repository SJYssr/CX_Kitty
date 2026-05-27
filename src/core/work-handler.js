/**
 * 答题任务处理器 — 独立于 Chaoxing 主类
 * 答案匹配逻辑参考 Samueli924/chaoxing 项目
 * @module core/work-handler
 */
import logger from '../utils/logger.js';
import cfg from '../config.js';
import { StudyResult } from './study-result.js';

// ===================== 答案匹配工具 (参考 chaoxing is_subsequence + best_option_by_similarity) =====================

/**
 * 判断 sub 是否是 full 的子序列（字符按顺序出现，不必连续）
 */
function isSubsequence(sub, full) {
  if (!sub || !full) return false;
  let i = 0;
  for (const ch of full) {
    if (ch === sub[i]) i++;
    if (i >= sub.length) return true;
  }
  return false;
}

/**
 * 字符串相似度 (Jaccard 字符集，适合中文文本比较)
 */
function stringSimilarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const setA = new Set([...a]);
  const setB = new Set([...b]);
  let intersection = 0;
  for (const c of setA) { if (setB.has(c)) intersection++; }
  const union = setA.size + setB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

const SIMILARITY_THRESHOLD = 0.55;

/**
 * 将答案文本匹配到单个选项，返回选项字母，未匹配返回 null
 * 先尝试子序列匹配，再尝试模糊匹配
 */
function matchAnswerToOption(answer, options) {
  if (!answer || !options?.length) return null;

  // 去除答案中的字母前缀
  const cleanAnswer = answer.replace(/^[A-Da-d][、.，,)\s]*/, '').trim();
  if (!cleanAnswer) return null;

  // 1) 精确/包含匹配
  for (let i = 0; i < options.length; i++) {
    const opt = options[i].trim();
    if (!opt) continue;
    if (opt === cleanAnswer || opt.includes(cleanAnswer) || cleanAnswer.includes(opt)) {
      return String.fromCharCode(65 + i);
    }
  }

  // 2) 子序列匹配
  let bestSubIdx = -1;
  let bestSubLen = 0;
  for (let i = 0; i < options.length; i++) {
    const opt = options[i].trim();
    if (isSubsequence(cleanAnswer, opt) && cleanAnswer.length > bestSubLen) {
      bestSubIdx = i;
      bestSubLen = cleanAnswer.length;
    }
  }
  if (bestSubIdx >= 0) return String.fromCharCode(65 + bestSubIdx);

  // 3) 模糊相似度匹配
  let bestIdx = -1;
  let bestScore = 0;
  for (let i = 0; i < options.length; i++) {
    const score = stringSimilarity(cleanAnswer, options[i].trim());
    if (score > bestScore) { bestScore = score; bestIdx = i; }
  }
  if (bestScore >= SIMILARITY_THRESHOLD && bestIdx >= 0) return String.fromCharCode(65 + bestIdx);

  return null;
}

/**
 * 将答案文本匹配到多个选项（多选），返回排序后的字母串，未匹配返回 null
 */
function matchAnswerToMultipleOptions(answer, options) {
  if (!answer || !options?.length) return null;

  const cleanAnswer = answer.replace(/\s+/g, '').trim();
  if (!cleanAnswer) return null;

  // 按分隔符拆分答案
  const parts = cleanAnswer.split(/[#]{2,}|[,;，；、\n|]+/).map(p => p.trim()).filter(Boolean);

  const letters = new Set();
  for (const part of parts) {
    const letter = matchAnswerToOption(part, options);
    if (letter) letters.add(letter);
  }

  // 如果拆分匹配失败（可能是 LLM 没加分隔符），尝试整体匹配
  if (letters.size === 0) {
    for (let i = 0; i < options.length; i++) {
      const opt = options[i].trim();
      if (isSubsequence(opt, cleanAnswer) || stringSimilarity(opt, cleanAnswer) >= SIMILARITY_THRESHOLD) {
        letters.add(String.fromCharCode(65 + i));
      }
    }
  }

  return letters.size > 0 ? [...letters].sort().join('') : null;
}

// ===================== 随机答案 =====================

function _randomAnswer(q) {
  const optsLen = (q.options || []).length || 4;
  if (q.type === 'judgement') return Math.random() > 0.5 ? 'true' : 'false';
  if (q.type === 'single') return String.fromCharCode(65 + Math.floor(Math.random() * Math.min(optsLen, 4)));
  if (q.type === 'multiple') {
    const count = Math.floor(Math.random() * Math.min(optsLen - 1, 3)) + 1;
    const letters = new Set();
    while (letters.size < count) letters.add(String.fromCharCode(65 + Math.floor(Math.random() * optsLen)));
    return [...letters].sort().join('');
  }
  if (q.type === 'completion' || q.type === 'shortanswer') return '';
  return '1';
}

// ===================== 主流程 =====================

/**
 * 处理答题任务
 * @param {import('./chaoxing.js').Chaoxing} cx — Chaoxing 实例
 * @param {Object} course
 * @param {Object} job
 * @param {Object} jobInfo
 * @returns {Promise<number>} StudyResult
 */
export async function studyWork(cx, course, job, jobInfo) {
  const jobName = job.name || job.jobid || '';

  if (!cx.tiku || cx.tiku.DISABLE) {
    logger.info(`答题跳过 (未配置答题模块): ${jobName}`);
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
        const result = await cx.tiku.query({ title: q.title, options: q.options, type: q.type });
        if (result) {
          foundQuestions++;
          answers.push({ q, answer: result.answer, found: true });
        } else {
          answers.push({ q, answer: null, found: false });
        }
      } catch (_) {
        logger.warn('答题查询失败: ' + (_.message || _));
        answers.push({ q, answer: null, found: false });
      }
    }

    const coverage = totalQuestions > 0 ? foundQuestions / totalQuestions : 0;
    logger.info(`答题覆盖率: ${(coverage * 100).toFixed(0)}% (${foundQuestions}/${totalQuestions})`);

    // 提交决策 (参考 chaoxing: Tiku.get_submit_params + coverage check)
    const submit = cx.tiku.SUBMIT;
    const coverRate = cx.tiku.COVER_RATE;
    const shouldSubmit = submit && coverage >= coverRate;
    const pyFlag = shouldSubmit ? '' : '1';

    for (const { q, answer: ansText, found } of answers) {
      if (pyFlag === '1' && !found) {
        formData[q.answerField] = '';
        continue;
      }

      if (ansText && found) {
        if (q.type === 'judgement') {
          const jr = cx.tiku.judgementSelect?.(ansText);
          formData[q.answerField] = jr !== null ? (jr ? 'true' : 'false') : _randomAnswer(q);
        } else if (q.type === 'completion' || q.type === 'shortanswer') {
          formData[q.answerField] = ansText;
        } else if (q.type === 'multiple') {
          const letters = matchAnswerToMultipleOptions(ansText, q.options);
          formData[q.answerField] = letters || _randomAnswer(q);
        } else {
          // single — 匹配答案文本到选项，返回字母
          const letter = matchAnswerToOption(ansText, q.options);
          if (letter) {
            formData[q.answerField] = letter;
          } else {
            const letterMatch = (ansText || '').match(/^[A-Da-d]$/);
            formData[q.answerField] = letterMatch ? letterMatch[0].toUpperCase() : _randomAnswer(q);
          }
        }
      } else {
        formData[q.answerField] = _randomAnswer(q);
      }
    }

    formData.pyFlag = pyFlag;
    // token/key 使用 HTML 表单中提取的值，不覆盖（ktoken/mtEnc 是 URL 参数，不能用作提交 token）

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
        logger.info(`答题完成: ${jobName}`);
        return StudyResult.SUCCESS;
      }
      if (resultText.includes('未通过') || resultText.includes('错误') || resultText.includes('false')) {
        logger.warn(`答题未通过: ${jobName} — ${resultText.substring(0, 100)}`);
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
