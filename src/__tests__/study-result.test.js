/**
 * 测试 StudyResult 常量
 */
import { describe, it, expect, beforeAll } from 'vitest';

describe('StudyResult', () => {
  let StudyResult;

  beforeAll(async () => {
    const mod = await import('../core/study-result.js');
    StudyResult = mod.StudyResult;
  });

  it('应定义四个状态值', () => {
    expect(StudyResult.SUCCESS).toBe(0);
    expect(StudyResult.FORBIDDEN).toBe(1);
    expect(StudyResult.ERROR).toBe(2);
    expect(StudyResult.TIMEOUT).toBe(3);
  });

  it('应为只读（Object.freeze）', () => {
    expect(() => { StudyResult.SUCCESS = 999; }).toThrow();
  });
});
