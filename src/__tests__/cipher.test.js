/**
 * 测试超星加密工具函数
 */
import { describe, it, expect, beforeAll } from 'vitest';

describe('cipher', () => {
  let getEnc, getTimestamp, aesEncrypt;

  beforeAll(async () => {
    const mod = await import('../core/cipher.js');
    getEnc = mod.getEnc;
    getTimestamp = mod.getTimestamp;
    aesEncrypt = mod.aesEncrypt;
  });

  describe('getTimestamp', () => {
    it('应返回当前时间的字符串', () => {
      const ts = getTimestamp();
      expect(typeof ts).toBe('string');
      expect(ts.length).toBeGreaterThan(0);
      // 应是纯数字字符串
      expect(/^\d+$/.test(ts)).toBe(true);
    });
  });

  describe('getEnc', () => {
    it('应返回非空字符串', () => {
      const enc = getEnc('123', '456', 'job1', 'obj1', 30, 60);
      expect(typeof enc).toBe('string');
      expect(enc.length).toBeGreaterThan(0);
    });

    it('不同参数应产生不同的 enc', () => {
      const enc1 = getEnc('123', '456', 'job1', 'obj1', 30, 60);
      const enc2 = getEnc('789', '000', 'job2', 'obj2', 10, 20);
      expect(enc1).not.toBe(enc2);
    });

    it('相同参数应产生相同的 enc', () => {
      const enc1 = getEnc('123', '456', 'job1', 'obj1', 30, 60);
      const enc2 = getEnc('123', '456', 'job1', 'obj1', 30, 60);
      expect(enc1).toBe(enc2);
    });
  });

  describe('aesEncrypt', () => {
    it('应返回非空结果', () => {
      const result = aesEncrypt('hello', 'key123');
      expect(result).toBeTruthy();
    });

    it('相同输入应产生相同输出', () => {
      const r1 = aesEncrypt('test', 'key');
      const r2 = aesEncrypt('test', 'key');
      expect(r1).toBe(r2);
    });

    it('不同输入应产生不同输出', () => {
      const r1 = aesEncrypt('hello', 'key');
      const r2 = aesEncrypt('world', 'key');
      expect(r1).not.toBe(r2);
    });
  });
});
