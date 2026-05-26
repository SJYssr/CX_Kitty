/**
 * 测试 Chaoxing 核心类的可测试部分（不依赖 HTTP 的纯逻辑）
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';

describe('Chaoxing', () => {
  let Chaoxing;

  beforeAll(async () => {
    const mod = await import('../core/chaoxing.js');
    Chaoxing = mod.Chaoxing;
  });

  it('构造时应设置默认值', () => {
    const cx = new Chaoxing({ phone: '13800138000', password: 'test' }, null);
    expect(cx.account.phone).toBe('13800138000');
    expect(cx.speed).toBe(1);
    expect(cx.jobs).toBe(3);
    expect(cx.notopenAction).toBe('continue');
    expect(cx.rollbackTimes).toBe(0);
  });

  it('构造时应接受自定义 speed 和 jobs', () => {
    const cx = new Chaoxing({ phone: '13800138000', password: 'test' }, null, { speed: 5, jobs: 2 });
    expect(cx.speed).toBe(5);
    expect(cx.jobs).toBe(2);
  });

  it('构造时应接受自定义 notopenAction', () => {
    const cx = new Chaoxing({ phone: '13800138000', password: 'test' }, null, { notopenAction: 'ask' });
    expect(cx.notopenAction).toBe('ask');
  });

  it('传入 tiku 实例时 this.tiku 不为 null', () => {
    const fakeTiku = { query: async () => null, DISABLE: false, SUBMIT: true };
    const cx = new Chaoxing({ phone: '13800138000', password: 'test' }, fakeTiku);
    expect(cx.tiku).toBe(fakeTiku);
  });

  it('getFid 应返回默认值 4311', () => {
    const cx = new Chaoxing({ phone: '13800138000', password: 'test' }, null);
    expect(cx.getFid()).toBe('4311');
  });

  it('getUid 初始应为 null', () => {
    const cx = new Chaoxing({ phone: '13800138000', password: 'test' }, null);
    expect(cx._uid).toBeNull();
  });

  it('fastMode 应关闭 rateLimiter 的快速模式', () => {
    const cx = new Chaoxing({ phone: '13800138000', password: 'test' }, null, { fastMode: true });
    expect(cx.rateLimiter._fastMode).toBe(true);
  });

  it('独立 session 模式应设置 _standaloneSession 且 session 为 null', () => {
    const fakeAxios = { interceptors: { response: { use: () => {} } } };
    const cx = new Chaoxing({ phone: '13800138000', password: 'test' }, null, { _standaloneSession: fakeAxios });
    expect(cx.session).toBeNull();
    expect(cx.axios).toBe(fakeAxios);
  });
});
