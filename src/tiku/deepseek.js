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

  /** 设置当前页面的自定义字体(Buffer), 用于字体级解密 */
  setFont(fontBuffer) {
    if (!fontBuffer) return;
    try {
      this._glyfMap = font2map(fontBuffer);
    } catch {}
  }

  /** 使用字体解密文本, 失败则退回到手动映射 */
  _decryptWithFont(text) {
    if (!text || !this._glyfMap) return null;
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

    // 统一异体字符 (参考 Samueli924/chaoxing)
    const variantMap = new Map([
      ['⻛', '风'], ['⻔', '门'], ['⻋', '车'], ['⻢', '马'],
      ['ㄬ', '广'], // Bopomofo U+312C 替代
    ]);

    // 手动映射表 — 超星形近字替换
    const g2o = new Map([
      // 原有映射
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
      // 新增 — 从缓存数据分析出的形近字对（仅包括确认是乱码的罕见字）
      ['臣', '自'], ['赤', '身'], ['皿', '目'], ['血', '行'],
      ['害', '碍'], ['雨', '面'], ['石', '示'], ['毋', '与'],
      ['曰', '月'], ['无', '日'], ['罗', '网'], ['艮', '即'],
      ['圭', '主'], ['厅', '历'], ['何', '向'], ['厌', '实'],
      ['屲', '公'], ['汗', '法'], ['彸', '役'], ['宧', '定'],
      ['萠', '范'], ['旾', '春'], ['硋', '碍'], ['禝', '社'],
      ['盿', '目'], ['砐', '破'], ['笝', '符'], ['罓', '网'],
      ['罜', '群'], ['胮', '服'], ['芔', '草'], ['苚', '范'],
      ['菐', '范'], ['薍', '范'], ['蜄', '规'], ['衟', '行'],
      ['袬', '表'], ['詺', '识'], ['誩', '说'], ['謒', '说'],
      ['賋', '资'], ['躳', '身'], ['郱', '关'], ['鄸', '关'],
      ['釿', '断'], ['闫', '闻'], ['阙', '关'], ['陙', '关'],
      ['冇', '有'], ['叧', '另'], ['収', '收'], ['吂', '名'],
      ['吇', '叫'], ['咊', '和'], ['坿', '附'], ['壐', '玺'],
      ['宐', '宜'], ['寙', '宿'], ['岪', '佛'], ['忎', '感'],
      ['戜', '战'], ['挕', '播'], ['捸', '建'], ['掦', '提'],
      ['揑', '握'], ['搮', '操'], ['斍', '觉'], ['朎', '明'],
      ['檑', '机'], ['毖', '毕'], ['沜', '部'], ['泋', '治'],
      ['泴', '治'], ['涁', '治'], ['炻', '知'], ['烪', '知'],
      ['珟', '现'], ['瑴', '现'], ['甽', '由'], ['盅', '由'],
      ['砞', '研'], ['稥', '程'], ['窧', '究'], ['篏', '等'],
      ['簆', '等'], ['綀', '经'], ['纋', '经'], ['纴', '经'],
      ['罣', '网'], ['肧', '服'], ['腞', '服'], ['膧', '服'],
      ['荁', '范'], ['辵', '行'],
    ]);

    return [...text].map(c => variantMap.get(c) || g2o.get(c) || c).join('');
  }

  /** 去除选项前的字母编号，让 AI 专注内容本身 */
  _stripOptionLetters(option) {
    return option.replace(/^[A-Za-z]\s*[.、:：)?）]?\s*/, '').trim();
  }

  _buildPrompt(qInfo) {
    const title = this._ungarble(qInfo.title || '');
    // 先还原乱码，再去除选项自带的字母前缀，最后统一加干净前缀
    const options = (qInfo.options || []).map(o => this._stripOptionLetters(this._ungarble(o)));
    const { type } = qInfo;

    const typeLabel = { single: '单选题', multiple: '多选题', judgement: '判断题', completion: '填空题', shortanswer: '简答题' };
    const prefix = typeLabel[type] || '题目';

    let prompt = `【${prefix}】\n题目：${title}\n`;

    if (options.length > 0 && (type === 'single' || type === 'multiple')) {
      prompt += '选项：\n' + options.map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`).join('\n') + '\n';
    }

    prompt += '\n请以JSON格式输出正确答案，格式如下：';

    switch (type) {
      case 'single':
        prompt += '\n{"Answer": ["A"]}\n只输出一个选项字母（A/B/C/D），不要输出选项内容。示例：{"Answer": ["C"]}';
        break;
      case 'multiple':
        prompt += '\n{"Answer": ["A", "C"]}\n输出所有正确选项的字母，多个字母放入数组。示例：{"Answer": ["A", "B", "D"]}';
        break;
      case 'judgement':
        prompt += '\n{"Answer": ["正确"]} 或 {"Answer": ["错误"]}';
        break;
      case 'completion':
      case 'shortanswer':
        prompt += '\n{"Answer": ["答案内容"]}';
        break;
      default:
        prompt += '\n{"Answer": ["答案"]}';
    }

    prompt += '\n\n严格只输出JSON，不要用Markdown代码块包裹，不要加任何解释。';
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
          { role: 'system', content: '你是专业的答题助手。请根据题目和选项选择正确答案，以JSON格式输出。严格遵循输出格式，不要输出任何多余内容。' },
          { role: 'user', content: this._buildPrompt(qInfo) }
        ],
        temperature: 0.05,
        max_tokens: 2048,
        stream: false
      };

      // DeepSeek V4 默认启用思考模式，导致 content 可能为空
      // 参考 Samueli924/chaoxing: 显式禁用 thinking
      if (this._model && this._model.toLowerCase().startsWith('deepseek-v4')) {
        body.extra_body = { thinking: { type: 'disabled' } };
      }

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
        logger.warn('DeepSeek 返回空答案 (可能 thinking 模式导致 content 为空)');
        return null;
      }

      // 解析 JSON 格式答案 — AI 直接输出字母
      let answer;
      try {
        const cleanJson = rawAnswer
          .replace(/```(?:json)?\s*([\s\S]*?)\s*```/g, '$1')
          .trim();
        const parsed = JSON.parse(cleanJson);

        if (parsed.Answer && Array.isArray(parsed.Answer) && parsed.Answer.length > 0) {
          const type = qInfo.type;

          if (type === 'single') {
            // 从 JSON 数组第一个元素中提取字母 A-D
            const first = parsed.Answer[0];
            const letterMatch = String(first).match(/[A-Da-d]/);
            answer = letterMatch ? letterMatch[0].toUpperCase() : String(first).trim();
          } else if (type === 'multiple') {
            // 从 JSON 数组所有元素中提取字母
            const letters = parsed.Answer
              .flatMap(a => [...String(a).toUpperCase()].filter(ch => ch >= 'A' && ch <= 'D'));
            answer = letters.length > 0 ? [...new Set(letters)].sort().join('') : parsed.Answer.join('\n').trim();
          } else {
            // 判断/填空/简答 — 直接用文本
            answer = parsed.Answer.join('\n').trim();
          }
        } else {
          answer = rawAnswer;
        }
      } catch {
        // JSON 解析失败，回退到原文提取
        answer = rawAnswer;
        const type = qInfo.type;
        if (type === 'single') {
          const letterMatch = answer.match(/[A-Da-d]/);
          answer = letterMatch ? letterMatch[0].toUpperCase() : answer;
        } else if (type === 'multiple') {
          const letters = [...answer.toUpperCase()].filter(ch => ch >= 'A' && ch <= 'D');
          if (letters.length > 0) answer = [...new Set(letters)].sort().join('');
        }
      }

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
          messages: [{ role: 'user', content: '请回复"连接成功"' }],
          max_tokens: 32
        }),
        signal: AbortSignal.timeout(15000)
      });
      return resp.ok;
    } catch (_) { return false; }
  }
}
