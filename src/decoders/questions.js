/**
 * 答题题目 HTML → 结构化数据解析器
 * @module decoders/questions
 */

import * as cheerio from 'cheerio';
import { decodeFontText, hasEncodedChars } from '../utils/font-decoder.js';

/** 题型码 → 类型字符串 */
const TYPE_MAP = {
  0: 'single',
  1: 'multiple',
  2: 'completion',
  3: 'judgement',
  4: 'shortanswer'
};

/**
 * 从 HTML 中提取 base64 编码的 TTF 字体
 * @param {string} html
 * @returns {Buffer|null}
 */
function extractTTF(html) {
  // 匹配 @font-face 中的 src: url(data:font/ttf;base64,...)
  const m = html.match(/src\s*:\s*url\(\s*['"]?data:\s*(?:font\/|application\/font-)[^;]+(?:;[^;]*)*;\s*base64\s*,\s*([^'")\s]+)\s*['"]?\s*\)/i);
  try {
    const b64 = m[1].replace(/\s/g, '');
    return Buffer.from(b64, 'base64');
  } catch {
    return null;
  }
}

/**
 * 解析答题页面 HTML，提取题目列表和表单数据，并处理字体加密
 * @param {string} html — /mooc-ans/api/work 返回的 HTML
 * @returns {{ formData: Object, questions: Array<{id: string, title: string, options: string[], type: string, answerField: string}> }}
 */
export function parseQuestions(html) {
  const $ = cheerio.load(html);
  const formData = {};
  const questions = [];

  // 提取表单字段 (所有 input 除了 answer 字段)
  $('form input').each((_, el) => {
    const name = $(el).attr('name');
    if (!name || name.includes('answer')) return;
    const val = $(el).attr('value') || $(el).val() || '';
    formData[name] = val;
  });

  // 提取每个题目
  $('div.singleQuesId').each((_, el) => {
    const $q = $(el);
    const dataProps = $q.data() || {};
    const questionId = dataProps.questionid || $q.attr('data') || '';

    // 获取题目标题
    const titleEl = $q.find('.Zy_TItle .clearfix');
    const title = (titleEl.text() || '').trim().replace(/\s+/g, ' ');

    // 获取题型: data 属性中的数字
    const typeCodeRaw = $q.find('.TiMu').attr('data') || $q.attr('data') || '';
    const typeCode = parseInt(typeCodeRaw, 10);
    const type = TYPE_MAP[typeCode] || 'single';

    // 获取选项
    const options = [];
    $q.find('ul li').each((_, li) => {
      const $li = $(li);

      // 跳过说明行
      if ($li.hasClass('ti-before') || $li.hasClass('ti-after')) return;

      let optText = ($li.attr('aria-label') || $li.text() || '').trim();
      if (!optText) return;

      // 处理判断题选项映射
      if (type === 'judgement') {
        optText = $li.find('label').text()?.trim() || optText;
      }

      options.push(optText);
    });

    questions.push({
      id: questionId,
      title,
      options,
      type,
      typeCode,
      typeCodeRaw,
      answerField: `answer${questionId}`,
      answerTypeField: `answertype${questionId}`
    });
  });

  // 尝试解码字体加密：只要有 TTF 字体就解码（无需 hasEncodedChars 预检）
  const ttfBuffer = extractTTF(html);
  if (ttfBuffer) {
    for (const q of questions) {
      q.title = decodeFontText(q.title, ttfBuffer);
      q.options = q.options.map(o => decodeFontText(o, ttfBuffer));
    }
  }

  return { formData, questions };
}
