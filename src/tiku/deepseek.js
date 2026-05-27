/**
 * DeepSeek AI 答题 — 直接调用 DeepSeek API 进行答题
 * @module tiku/deepseek
 */

import { Tiku } from './tiku.js';
import logger from '../utils/logger.js';
import { font2map, decrypt as fontDecrypt } from './font-decrypt.js';

const DEEPSEEK_API = 'https://api.deepseek.com/v1/chat/completions';

/**
 * DeepSeek AI 答题
 */
export class TikuDeepSeek extends Tiku {
  /**
   * @param {string} [apiKey] — DeepSeek API Key
   * @param {string} [model] — 模型名，默认 deepseek-v4-pro
   */
  constructor(apiKey, model = 'deepseek-v4-pro') {
    super('deepseek', DEEPSEEK_API, apiKey || '');
    this._model = model;
  }

  /** 设置当前页面的自定义字体(base64), 用于字体级解密 */
  setFont(fontBase64) {
    if (!fontBase64) return;
    try {
      const fontData = Buffer.from(fontBase64, 'base64');
      this._glyfMap = font2map(fontData);
    } catch {}
  }

  /** 使用字体解密文本, 失败则退回到手动映射 */
  _decryptWithFont(text) {
    if (!text || !this._glyfMap || text.length < 2) return null;
    try {
      const result = fontDecrypt(this._glyfMap, text);
      if (result && result !== text) return result;
    } catch {}
    return null;
  }

  /** 尝试还原超星防爬替换的乱码字符 */
  _ungarble(text) {
    if (!text) return text;

    // 优先使用字体解密
    const fontResult = this._decryptWithFont(text);
    if (fontResult) return fontResult;

    // 备选: 手动映射表
    const g2o = new Map([
      ['啽', '业'], ['啾', '文'], ['啻', '的'], ['啿', '下'],
      ['喀', '一'], ['喁', '说'], ['咚', '不'], ['哒', '的'],
      ['喰', '食'], ['咭', '动'], ['噝', '关'], ['咮', '的'],
      ['咻', '的'], ['咟', '一'], ['咘', '个'], ['咞', '规'],
      ['嚀', '关'], ['蘢', '来'],
      ['孏', '不'], ['孡', '不'], ['孠', '属'], ['孲', '属'],
      ['孧', '组'], ['孍', '公'], ['孥', '组'], ['孱', '点'],
      ['搢', '属'], ['搣', '于'], ['搡', '中'], ['搨', '公'],
      ['搦', '共'], ['搤', '关'], ['搧', '畴'], ['搪', '系'],
      ['渧', '于'], ['渜', '系'], ['湽', '的'],
      ['戇', '行'], ['懹', '关'], ['戁', '系'], ['戉', '定'],
      ['戅', '义'], ['萌', '范'],
    ]);
    return [...text].map(c => g2o.get(c) || c).join('');
  }

  _buildPrompt(qInfo) {
    const title = this._ungarble(qInfo.title || '');
    const options = (qInfo.options || []).map(o => this._ungarble(o));
    const { type } = qInfo;

    let prompt = '你是一个专业的答题助手。题目中的部分汉字可能被替换成了形近字（防爬虫处理），请根据上下文和选项推断出正确的题目含义再作答。\n\n';

    switch (type) {
      case 'single':
        prompt += `题型：单选题\n题目：${title}\n`;
        if (options?.length) {
          prompt += '选项：\n' + options.map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`).join('\n');
        }
        prompt += '\n\n请直接输出正确选项的完整内容（原文照抄该选项的文字），不要输出字母，不要加任何解释。';
        break;
      case 'multiple':
        prompt += `题型：多选题\n题目：${title}\n`;
        if (options?.length) {
          prompt += '选项：\n' + options.map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`).join('\n');
        }
        prompt += '\n\n请直接输出所有正确选项的完整内容，每个选项的内容之间用 ### 分隔，不要输出字母，不要加任何解释。';
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

    await new Promise(resolve => setTimeout(resolve, 500));

    try {
      const body = {
        model: this._model,
        messages: [
          { role: 'system', content: '你是专业的答题助手。输出答案时严格遵循格式要求，不要加序号、字母、标点或任何解释。' },
          { role: 'user', content: this._buildPrompt(qInfo) }
        ],
        temperature: 0.05,
        max_tokens: 512,
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
        logger.warn(`DeepSeek API 请求失败: ${resp.status} ${errText.substring(0, 200)}`);
        return null;
      }

      const data = await resp.json();
      const rawAnswer = (data.choices?.[0]?.message?.content || '').trim();
      if (!rawAnswer) {
        logger.warn('DeepSeek 返回空答案');
        return null;
      }

      // 清理回答中的 markdown 格式（保留字母前缀和空白，由 work-handler 的 matchAnswerToOption 统一处理）
      let answer = rawAnswer
        .replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1')  // 去加粗/斜体
        .replace(/`{1,3}[^`]*`{1,3}/g, '')           // 去代码块/行内代码
        .trim();

      if (!answer) return null;

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
