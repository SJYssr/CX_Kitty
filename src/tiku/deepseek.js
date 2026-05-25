/**
 * DeepSeek AI 答题 — 直接调用 DeepSeek API 进行答题
 * @module tiku/deepseek
 */

import { Tiku } from './tiku.js';
import logger from '../utils/logger.js';

const DEEPSEEK_API = 'https://api.deepseek.com/v1/chat/completions';

/**
 * DeepSeek AI 答题
 */
export class TikuDeepSeek extends Tiku {
  /**
   * @param {string} [apiKey] — DeepSeek API Key
   * @param {string} [model] — 模型名，默认 deepseek-v4-flash
   */
  constructor(apiKey, model = 'deepseek-v4-flash') {
    super('deepseek', DEEPSEEK_API, apiKey || '');
    this._model = model;
  }

  _buildPrompt(qInfo) {
    const { title, options, type } = qInfo;
    let prompt = '你是一个专业的答题助手。请回答以下题目，只输出答案，不要Markdown格式，不要加粗，不要代码块，不要任何解释。\n\n';

    switch (type) {
      case 'single':
        prompt += `题型：单选题\n题目：${title}\n`;
        if (options?.length) {
          prompt += '选项：\n' + options.map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`).join('\n');
        }
        prompt += '\n\n请直接输出正确选项的字母（如 A），不要输出任何其他内容。';
        break;
      case 'multiple':
        prompt += `题型：多选题\n题目：${title}\n`;
        if (options?.length) {
          prompt += '选项：\n' + options.map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`).join('\n');
        }
        prompt += '\n\n请输出所有正确选项的字母，按顺序排列（如 ABD），不要输出任何其他内容。';
        break;
      case 'judgement':
        prompt += `题型：判断题\n题目：${title}\n\n请直接输出"正确"或"错误"，不要输出任何其他内容。`;
        break;
      case 'completion':
        prompt += `题型：填空题\n题目：${title}\n\n请直接输出填空答案，不要输出任何其他内容。`;
        break;
      case 'shortanswer':
        prompt += `题型：简答题\n题目：${title}\n\n请直接输出答案，不要输出任何其他内容。`;
        break;
      default:
        prompt += `题目：${title}\n选项：${(options || []).join(' | ')}\n\n请直接输出答案。`;
    }
    return prompt;
  }

  /** @override */
  async _query(qInfo) {
    const apiKey = this.token;
    if (!apiKey) {
      logger.error('DeepSeek API Key 未设置');
      return null;
    }

    await new Promise(resolve => setTimeout(resolve, 800));

    try {
      const body = {
        model: this._model,
        messages: [
          { role: 'system', content: '你是专业的答题助手。只输出最终答案，不要推理过程，不要Markdown格式，不要加粗，不要代码块，不要任何多余字符。' },
          { role: 'user', content: this._buildPrompt(qInfo) }
        ],
        temperature: 0.05,
        max_tokens: 1024,
        stream: false
      };

      const resp = await fetch(DEEPSEEK_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30000)
      });

      if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        logger.warn(`DeepSeek API 请求失败: ${resp.status} ${errText}`);
        return null;
      }

      const data = await resp.json();
      const rawAnswer = (data.choices?.[0]?.message?.content || '').trim();
      if (!rawAnswer) {
        logger.warn('DeepSeek 返回空答案');
        return null;
      }

      let answer = rawAnswer
  .replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1')         // 去除 **加粗** 和 *斜体*
  .replace(/`{1,3}[^`]*`{1,3}/g, '')                 // 去除 ```代码块``` 和 `行内代码`
  .replace(/[，。！？、：；"「」【】《》\,\.\!\?\:\;\(\)#*_~`>\-]/g, '')
  .trim();

      if (qInfo.type === 'single') {
        const letterMatch = answer.match(/[A-D]/);
        if (letterMatch) answer = letterMatch[0]; else answer = answer.charAt(0);
      }
      if (qInfo.type === 'multiple') {
        const letters = answer.match(/[A-D]/g);
        if (letters) answer = [...new Set(letters)].sort().join('');
      }
      if (qInfo.type === 'judgement') {
        const m = answer.match(/正确|错误|对|错|true|false|True|False/);
        if (m) answer = m[0];
      }

      logger.info(`DeepSeek 答题: ${qInfo.title.slice(0, 30)}... → ${answer}`);
      return { answer };

    } catch (err) {
      logger.warn(`DeepSeek API 异常: ${err.message}`);
      return null;
    }
  }

  /** @override */
  async check_llm_connection() {
    const apiKey = this.token;
    if (!apiKey) return false;
    try {
      const resp = await fetch(DEEPSEEK_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: this._model,
          messages: [{ role: 'user', content: '你好' }],
          max_tokens: 5
        }),
        signal: AbortSignal.timeout(15000)
      });
      return resp.ok;
    } catch (_) { return false; }
  }
}
