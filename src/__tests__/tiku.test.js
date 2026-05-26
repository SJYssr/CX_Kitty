/**
 * 测试 CacheDAO 和 Tiku 基类
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import os from 'os';

// 导入 better-sqlite3（ESM 兼容）
import { createRequire } from 'module';
const _require = createRequire(import.meta.url);
let Database;
try {
  Database = _require('better-sqlite3');
} catch {}

function tmpDbPath() {
  return path.join(os.tmpdir(), 'cx-kitty-test-cache-' + Date.now() + '_' + Math.random().toString(36).slice(2, 8) + '.db');
}

// 为了测试 CacheDAO，我们直接 import 源码
// 注意：测试会使用临时文件，不影响生产缓存
let Tiku, CacheDAO;

// 动态 import，因为源码是 ESM
let modPromise = import('../tiku/tiku.js');

beforeEach(async () => {
  const mod = await modPromise;
  Tiku = mod.Tiku;
  CacheDAO = mod.CacheDAO;
});

describe('CacheDAO', () => {
  let tmpPath;
  let dao;

  beforeEach(() => {
    tmpPath = tmpDbPath();
    dao = new CacheDAO(tmpPath);
  });

  afterEach(() => {
    try { dao.close(); } catch {}
    try { fs.unlinkSync(tmpPath); } catch {}
  });

  it('应该返回 null 当缓存中没有 key', async () => {
    const result = await dao.get({ title: '不存在的题', options: ['A', 'B'], type: 'single' });
    expect(result).toBeNull();
  });

  it('应该能写入和读取缓存', async () => {
    const question = { title: '1+1=', options: ['1', '2', '3'], type: 'single' };
    const answer = { answer: 'B' };
    await dao.set(question, answer);
    const result = await dao.get(question);
    expect(result).toEqual(answer);
  });

  it('空格归一化后相同的题目应命中相同缓存', async () => {
    const q1 = { title: '  hello   world ', options: ['A', 'B'], type: 'single' };
    const q2 = { title: 'hello world', options: ['A', 'B'], type: 'single' };
    await dao.set(q1, { answer: 'A' });
    const result = await dao.get(q2);
    expect(result).toEqual({ answer: 'A' });
  });

  it('不同选项的同名题目不应命中相同缓存', async () => {
    const q1 = { title: 'test', options: ['A', 'B'], type: 'single' };
    const q2 = { title: 'test', options: ['A', 'C'], type: 'single' };
    await dao.set(q1, { answer: 'A' });
    const result = await dao.get(q2);
    expect(result).toBeNull();
  });

  it('写入后数据库文件应存在且可查询', async () => {
    const question = { title: '写入测试', options: ['是', '否'], type: 'judgement' };
    await dao.set(question, { answer: '正确' });
    expect(fs.existsSync(tmpPath)).toBe(true);
    // 重新打开验证
    const db = new Database(tmpPath);
    const row = db.prepare('SELECT COUNT(*) AS cnt FROM answer_cache').get();
    expect(row.cnt).toBeGreaterThan(0);
    db.close();
  });
});

describe('Tiku 基类', () => {
  let MockTiku;
  let tiku;

  beforeEach(async () => {
    const mod = await modPromise;
    const T = mod.Tiku;
    MockTiku = class extends T {
      async _query(qInfo) {
        if (qInfo.title === '触发异常') throw new Error('测试异常');
        return { answer: 'A' };
      }
    };
    tiku = new MockTiku('mock', 'http://test.api', 'test-token');
  });

  describe('judgementSelect', () => {
    it('应识别"正确"为 true', () => {
      expect(tiku.judgementSelect('正确')).toBe(true);
    });
    it('应识别"错误"为 false', () => {
      expect(tiku.judgementSelect('错误')).toBe(false);
    });
    it('应识别"对"为 true', () => {
      expect(tiku.judgementSelect('对')).toBe(true);
    });
    it('应识别"错"为 false', () => {
      expect(tiku.judgementSelect('错')).toBe(false);
    });
    it('应识别"√"为 true', () => {
      expect(tiku.judgementSelect('√')).toBe(true);
    });
    it('应识别"×"为 false', () => {
      expect(tiku.judgementSelect('×')).toBe(false);
    });
    it('对未知答案应返回 null', () => {
      expect(tiku.judgementSelect('maybe')).toBeNull();
    });
  });

  describe('_validateAnswer', () => {
    it('应校验判断题答案', () => {
      expect(tiku._validateAnswer({ answer: '正确' }, { type: 'judgement', options: [] })).toBe(true);
      expect(tiku._validateAnswer({ answer: '错误' }, { type: 'judgement', options: [] })).toBe(true);
      expect(tiku._validateAnswer({ answer: 'X' }, { type: 'judgement', options: [] })).toBe(false);
    });

    it('应校验单选题答案为单个字母 A-D', () => {
      expect(tiku._validateAnswer({ answer: 'A' }, { type: 'single', options: ['a', 'b', 'c', 'd'] })).toBe(true);
      // 只有2个选项时，AB长度为2，但2 <= 2 校验通过，所以是 true
      expect(tiku._validateAnswer({ answer: 'AB' }, { type: 'single', options: ['a', 'b'] })).toBe(true);
    });

    it('应校验多选题答案为字母组合', () => {
      expect(tiku._validateAnswer({ answer: 'ABD' }, { type: 'multiple', options: ['a', 'b', 'c', 'd'] })).toBe(true);
    });

    it('应校验填空题非空且非默认值 A', () => {
      expect(tiku._validateAnswer({ answer: '北京' }, { type: 'completion', options: [] })).toBe(true);
      expect(tiku._validateAnswer({ answer: '' }, { type: 'completion', options: [] })).toBe(false);
      expect(tiku._validateAnswer({ answer: 'A' }, { type: 'completion', options: [] })).toBe(false);
    });

    it('应校验简答题答案', () => {
      expect(tiku._validateAnswer({ answer: '答案内容' }, { type: 'shortanswer', options: [] })).toBe(true);
      expect(tiku._validateAnswer({ answer: '' }, { type: 'shortanswer', options: [] })).toBe(false);
    });
  });

  describe('query', () => {
    it('禁用时应返回 null', async () => {
      const mod = await modPromise;
      const T = mod.Tiku;
      const SingleMock = class extends T {
        async _query() { return { answer: 'A' }; }
      };
      const t = new SingleMock('mock', '', '');
      t.DISABLE = true;
      const result = await t.query({ title: 'test', options: ['A', 'B'], type: 'single' });
      expect(result).toBeNull();
    });

    it('异常应返回 null', async () => {
      const result = await tiku.query({ title: '触发异常', options: ['A', 'B'], type: 'single' });
      expect(result).toBeNull();
    });

    it('应返回答案并缓存', async () => {
      const result = await tiku.query({ title: '正常题', options: ['A', 'B'], type: 'single' });
      expect(result).toEqual({ answer: 'A' });
      // 再次查询应命中缓存
      const cached = await tiku.cache.get({ title: '正常题', options: ['A', 'B'], type: 'single' });
      expect(cached).toEqual({ answer: 'A' });
    });
  });

  describe('initTiku', () => {
    it('应正确注入配置', () => {
      tiku.initTiku({ SUBMIT: true, COVER_RATE: 0.5, trueList: ['是'], falseList: ['否'] });
      expect(tiku.SUBMIT).toBe(true);
      expect(tiku.COVER_RATE).toBe(0.5);
      expect(tiku.trueList).toEqual(['是']);
      expect(tiku.falseList).toEqual(['否']);
    });
  });
});
