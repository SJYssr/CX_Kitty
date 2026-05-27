/**
 * 答题任务处理器 — 独立于 Chaoxing 主类
 * @module core/work-handler
 */
import logger from '../utils/logger.js';
import cfg from '../config.js';
import { StudyResult } from './study-result.js';

// ===================== 答案匹配工具 =====================

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
 * difflib.SequenceMatcher.ratio() 的 JS 实现
 * 计算 2 * 匹配字符数 / (len(a) + len(b))，对中文文本匹配效果优于 Jaccard
 * 参考 Python difflib.SequenceMatcher.ratio() 和 Samueli924/chaoxing
 */
function sequenceMatcherRatio(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;

  // 找到最长公共子序列 (LCS) 的长度
  const m = a.length;
  const n = b.length;
  // 使用滚动数组优化空间
  const dp = new Array(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    let prev = 0;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      if (a[i - 1] === b[j - 1]) {
        dp[j] = prev + 1;
      } else {
        dp[j] = Math.max(dp[j], dp[j - 1]);
      }
      prev = temp;
    }
  }
  const matches = dp[n];
  return (2.0 * matches) / (m + n);
}

/** 统一异体字符和去除标点，降低匹配差异 */
function normalizeForMatch(text) {
  if (!text) return '';
  return text
    .replace(/[⻛]/g, '风')
    .replace(/[⻔]/g, '门')
    .replace(/[⻋]/g, '车')
    .replace(/[⻢]/g, '马')
    .replace(/[，。！？；：、,.!?;:()（）\[\]【】"'"'""\-_/\\|\s]+/g, '')
    .toLowerCase();
}

/** 去除选项前的字母编号，用于内容匹配 */
function stripOptionPrefix(option) {
  return (option || '').replace(/^[A-Za-z]\s*[.、:：)?）]?\s*/, '').trim();
}

const SIMILARITY_THRESHOLD = 0.8;

/**
 * 将答案文本匹配到单个选项，返回选项字母，未匹配返回 null
 *
 * 匹配策略（参考 Samueli924/chaoxing）：
 * 1. 裸字母直接返回
 * 2. 精确/包含匹配（原文 + 去字母前缀后）
 * 3. 子序列匹配
 * 4. SequenceMatcher 相似度兜底
 */
function matchAnswerToOption(answer, options) {
  if (!answer || !options?.length) return null;

  // 如果答案本身就是一个选项字母（如 "A" / "B、"），直接返回该字母
  const bareLetter = answer.trim().match(/^[A-Da-d]$/);
  if (bareLetter) return bareLetter[0].toUpperCase();

  // 去除答案中的字母前缀
  const cleanAnswer = answer.replace(/^[A-Da-d][、.，,)\s]*/, '').trim();
  if (!cleanAnswer) return null;

  // 1) 精确/包含匹配 — 原文
  for (let i = 0; i < options.length; i++) {
    const opt = options[i].trim();
    if (!opt) continue;
    if (opt === cleanAnswer || opt.includes(cleanAnswer) || cleanAnswer.includes(opt)) {
      return String.fromCharCode(65 + i);
    }
  }

  // 1b) 精确/包含匹配 — 移除选项字母前缀后再比较
  for (let i = 0; i < options.length; i++) {
    const stripped = stripOptionPrefix(options[i]);
    if (!stripped) continue;
    if (stripped === cleanAnswer || stripped.includes(cleanAnswer) || cleanAnswer.includes(stripped)) {
      return String.fromCharCode(65 + i);
    }
  }

  // 2) 子序列匹配
  let bestSubIdx = -1;
  let bestSubLen = 0;
  for (let i = 0; i < options.length; i++) {
    const opt = stripOptionPrefix(options[i]);
    if (isSubsequence(cleanAnswer, opt) && cleanAnswer.length > bestSubLen) {
      bestSubIdx = i;
      bestSubLen = cleanAnswer.length;
    }
  }
  if (bestSubIdx >= 0) return String.fromCharCode(65 + bestSubIdx);

  // 3) SequenceMatcher 相似度兜底匹配
  const normAnswer = normalizeForMatch(cleanAnswer);
  if (!normAnswer) return null;

  let bestIdx = -1;
  let bestScore = 0;
  for (let i = 0; i < options.length; i++) {
    const normOpt = normalizeForMatch(stripOptionPrefix(options[i]));
    if (!normOpt) continue;
    const score = sequenceMatcherRatio(normAnswer, normOpt);
    if (score > bestScore) { bestScore = score; bestIdx = i; }
  }
  if (bestScore >= SIMILARITY_THRESHOLD && bestIdx >= 0) {
    logger.debug(`相似度兜底匹配: ${String.fromCharCode(65 + bestIdx)} (score=${bestScore.toFixed(2)})`);
    return String.fromCharCode(65 + bestIdx);
  }

  return null;
}

/**
 * 将答案文本匹配到多个选项（多选），返回排序后的字母串，未匹配返回 null
 *
 * 匹配策略（参考 Samueli924/chaoxing）：
 * 1. 裸字母直接提取
 * 2. 按分隔符拆分答案后逐部分匹配
 * 3. 整体兜底匹配
 */
function matchAnswerToMultipleOptions(answer, options) {
  if (!answer || !options?.length) return null;

  const trimAnswer = answer.trim();

  // 如果答案只是连续字母如 "AB" / "A,B,C"，直接提取字母
  if (/^[A-Da-d](?:[,;，；、\s]+[A-Da-d])+$/.test(trimAnswer) || /^[A-Da-d]{2,4}$/.test(trimAnswer)) {
    const letters = [...trimAnswer.toUpperCase()].filter(ch => ch >= 'A' && ch <= 'D');
    if (letters.length > 0) return [...new Set(letters)].sort().join('');
  }

  const cleanAnswer = trimAnswer.replace(/\s+/g, '');
  if (!cleanAnswer) return null;

  // 按分隔符拆分答案
  const splitChars = /[#]{2,}|[,;，；、\n|]+/;
  const parts = cleanAnswer.split(splitChars).map(p => p.trim()).filter(Boolean);

  const letters = new Set();
  for (const part of parts) {
    const letter = matchAnswerToOption(part, options);
    if (letter) letters.add(letter);
  }

  // 如果拆分匹配失败（可能是 LLM 没加分隔符），尝试整体匹配
  if (letters.size === 0) {
    for (let i = 0; i < options.length; i++) {
      const stripped = stripOptionPrefix(options[i]);
      if (isSubsequence(stripped, cleanAnswer)) {
        letters.add(String.fromCharCode(65 + i));
      }
    }
    // 兜底：用相似度匹配
    if (letters.size === 0) {
      const normAnswer = normalizeForMatch(cleanAnswer);
      for (let i = 0; i < options.length; i++) {
        const normOpt = normalizeForMatch(stripOptionPrefix(options[i]));
        if (!normOpt) continue;
        if (sequenceMatcherRatio(normAnswer, normOpt) >= SIMILARITY_THRESHOLD) {
          letters.add(String.fromCharCode(65 + i));
        }
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

    const { parseQuestions } = await import('../decoders/questions.js');
    const { formData, questions, ttfBuffer } = parseQuestions(html);

    // 统一字体解密：parseQuestions 提取的 TTF 字体同时喂给 tiku（参考 Samueli924/chaoxing）
    if (typeof cx.tiku.setFont === 'function' && ttfBuffer) {
      cx.tiku.setFont(ttfBuffer);
    }

    if (!questions.length) {
      logger.info(`答题无题目: ${job.name || job.jobid}`);
      return StudyResult.SUCCESS;
    }

    let matchedCount = 0;
    const totalQuestions = questions.length;
    formData.answerwqbid = questions.map(q => q.id).join(',') + ',';

    // 第一遍：查询 DeepSeek 获取所有答案
    const rawAnswers = [];
    for (const q of questions) {
      formData[q.answerTypeField] = q.typeCodeRaw;
      try {
        const result = await cx.tiku.query({ title: q.title, options: q.options, type: q.type });
        rawAnswers.push({ q, answer: result ? result.answer : null, found: !!result });
      } catch (_) {
        logger.warn('答题查询失败: ' + (_.message || _));
        rawAnswers.push({ q, answer: null, found: false });
      }
    }

    // 第二遍：匹配答案到选项，同时统计真正匹配成功的题数
    for (const { q, answer: ansText, found } of rawAnswers) {
      if (!ansText || !found) {
        formData[q.answerField] = '';
        continue;
      }

      let matched = false;
      if (q.type === 'judgement') {
        const jr = cx.tiku.judgementSelect?.(ansText);
        if (jr !== null) {
          formData[q.answerField] = jr ? 'true' : 'false';
          matched = true;
        }
      } else if (q.type === 'completion' || q.type === 'shortanswer') {
        formData[q.answerField] = ansText;
        matched = ansText.length > 0;
      } else if (q.type === 'multiple') {
        const letters = matchAnswerToMultipleOptions(ansText, q.options);
        if (letters) {
          formData[q.answerField] = letters;
          matched = true;
        }
      } else {
        // single
        const letter = matchAnswerToOption(ansText, q.options);
        if (letter) {
          formData[q.answerField] = letter;
          matched = true;
        } else {
          // 兜底：如果答案本身就是裸字母
          const letterMatch = (ansText || '').match(/^[A-Da-d]$/);
          if (letterMatch) {
            formData[q.answerField] = letterMatch[0].toUpperCase();
            matched = true;
          }
        }
      }

      if (matched) matchedCount++;
    }

    const coverage = totalQuestions > 0 ? matchedCount / totalQuestions : 0;
    logger.info(`答题覆盖率: ${(coverage * 100).toFixed(0)}% (${matchedCount}/${totalQuestions})`);

    // 提交决策：覆盖率达标才提交，否则仅保存
    const submit = cx.tiku.SUBMIT;
    const coverRate = cx.tiku.COVER_RATE;
    const shouldSubmit = submit && coverage >= coverRate;
    formData.pyFlag = shouldSubmit ? '' : '1';

    // 对于未匹配的题，填充随机答案（仅提交模式需要）
    if (shouldSubmit) {
      for (const { q } of rawAnswers) {
        if (!formData[q.answerField] || formData[q.answerField] === '') {
          formData[q.answerField] = _randomAnswer(q);
        }
      }
    }
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
      const pyLabel = formData.pyFlag === '1' ? '保存' : '提交';
      let resJson;
      try {
        resJson = typeof submitResp.data === 'string' ? JSON.parse(submitResp.data) : submitResp.data;
      } catch {
        resJson = null;
      }
      if (resJson && resJson.status) {
        logger.info(`${pyLabel}答题成功: ${jobName} — ${resJson.msg || ''}`);
        return StudyResult.SUCCESS;
      }
      if (resJson && !resJson.status) {
        logger.warn(`${pyLabel}答题失败: ${jobName} — ${resJson.msg || JSON.stringify(resJson).substring(0, 100)}`);
        return StudyResult.ERROR;
      }
      logger.warn(`答题响应格式异常: ${jobName}`);
      return StudyResult.ERROR;
    }
    logger.warn(`答题提交异常 HTTP ${submitResp.status}: ${jobName}`);
    return StudyResult.ERROR;
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
