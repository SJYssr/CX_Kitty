/**
 * 测试 DeepSeek 题库的 prompt 构建和答案解析
 */
import { describe, it, expect, beforeAll } from 'vitest';

describe('TikuDeepSeek', () => {
  let TikuDeepSeek;

  beforeAll(async () => {
    const mod = await import('../tiku/deepseek.js');
    TikuDeepSeek = mod.TikuDeepSeek;
  });

  describe('_buildPrompt', () => {
    let tiku;

    beforeAll(() => {
      tiku = new TikuDeepSeek('sk-test');
    });

    it('单选题应包含选项字母标识', () => {
      const prompt = tiku._buildPrompt({
        title: '1+1等于几？',
        options: ['1', '2', '3', '4'],
        type: 'single'
      });
      expect(prompt).toContain('A. 1');
      expect(prompt).toContain('B. 2');
      expect(prompt).toContain('C. 3');
      expect(prompt).toContain('D. 4');
      expect(prompt).toContain('单选题');
    });

    it('多选题应包含所有选项', () => {
      const prompt = tiku._buildPrompt({
        title: '哪些是水果？',
        options: ['苹果', '桌子', '香蕉'],
        type: 'multiple'
      });
      expect(prompt).toContain('多选题');
      expect(prompt).toContain('A. 苹果');
      expect(prompt).toContain('B. 桌子');
      expect(prompt).toContain('C. 香蕉');
    });

    it('判断题应提示输出"正确"或"错误"', () => {
      const prompt = tiku._buildPrompt({
        title: '地球是圆的',
        options: [],
        type: 'judgement'
      });
      expect(prompt).toContain('判断题');
      expect(prompt).toContain('正确');
      expect(prompt).toContain('错误');
    });

    it('填空题应包含题目', () => {
      const prompt = tiku._buildPrompt({
        title: '中国的首都是____',
        options: [],
        type: 'completion'
      });
      expect(prompt).toContain('填空题');
    });

    it('简答题应包含题目', () => {
      const prompt = tiku._buildPrompt({
        title: '简述牛顿第一定律',
        options: [],
        type: 'shortanswer'
      });
      expect(prompt).toContain('简答题');
    });

    it('未知题型应使用默认格式', () => {
      const prompt = tiku._buildPrompt({
        title: '未知题',
        options: ['A', 'B'],
        type: 'unknown'
      });
      expect(prompt).not.toContain('题型：');
    });
  });

  describe('答案后处理（_query 内部逻辑模拟）', () => {
    let tiku;

    beforeAll(() => {
      tiku = new TikuDeepSeek('sk-test');
    });

    // 模拟 _query 中 answer 的清洗逻辑
    function cleanAnswer(raw, type) {
      let answer = raw
        .replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1')
        .replace(/`{1,3}[^`]*`{1,3}/g, '')
        .replace(/[，。！？、：；"「」【】《》\,\.\!\?\:\;\(\)#*_~`>\-]/g, '')
        .trim();

      if (type === 'single') {
        const letterMatch = answer.match(/[A-D]/);
        if (letterMatch) answer = letterMatch[0];
        else answer = answer.charAt(0);
      }
      if (type === 'multiple') {
        const letters = answer.match(/[A-D]/g);
        if (letters) answer = [...new Set(letters)].sort().join('');
      }
      if (type === 'judgement') {
        const m = answer.match(/正确|错误|对|错|true|false|True|False/);
        if (m) answer = m[0];
      }
      return answer;
    }

    it('简单返回 A 应解析为 A', () => {
      expect(cleanAnswer('A', 'single')).toBe('A');
    });

    it('Markdown 加粗 A 应解析为 A', () => {
      expect(cleanAnswer('**A**', 'single')).toBe('A');
    });

    it('多个字母中提取第一个匹配的字母', () => {
      expect(cleanAnswer('选B选项', 'single')).toBe('B');
    });

    it('带前缀说明的答案应解析为字母', () => {
      expect(cleanAnswer('答案：B', 'single')).toBe('B');
    });

    it('多选题 ABD 应保持 ABD', () => {
      expect(cleanAnswer('ABD', 'multiple')).toBe('ABD');
    });

    it('多选题逗号分隔应去重排序', () => {
      expect(cleanAnswer('A, B, D', 'multiple')).toBe('ABD');
    });

    it('多选题返回 BA 应排序为 AB', () => {
      expect(cleanAnswer('BA', 'multiple')).toBe('AB');
    });

    it('多选题重复字母应去重', () => {
      expect(cleanAnswer('AABBDD', 'multiple')).toBe('ABD');
    });

    it('判断题"正确"应识别', () => {
      expect(cleanAnswer('正确', 'judgement')).toBe('正确');
    });

    it('判断题"错误"应识别', () => {
      expect(cleanAnswer('错误', 'judgement')).toBe('错误');
    });

    it('判断题"对"应识别', () => {
      expect(cleanAnswer('对', 'judgement')).toBe('对');
    });

    it('去除标点符号', () => {
      const result = cleanAnswer('A。', 'single');
      expect(result).toBe('A');
    });
  });
});
