/**
 * 测试限流器
 */
import { describe, it, expect, beforeAll } from 'vitest';

describe('RateLimiter', () => {
  let RateLimiter;

  beforeAll(async () => {
    const mod = await import('../core/ratelimiter.js');
    RateLimiter = mod.RateLimiter;
  });

  it('构造时设置最小间隔', () => {
    const rl = new RateLimiter(1000);
    expect(rl.minInterval).toBe(1000);
    expect(rl._fastMode).toBeUndefined();
  });

  it('setFastMode(true) 应开启快速模式', () => {
    const rl = new RateLimiter(1000);
    rl.setFastMode(true);
    expect(rl._fastMode).toBe(true);
  });

  it('setFastMode(false) 应关闭快速模式', () => {
    const rl = new RateLimiter(1000);
    rl.setFastMode(true);
    rl.setFastMode(false);
    expect(rl._fastMode).toBe(false);
  });

  it('acquire 应在 fastMode 下快速通过', async () => {
    const rl = new RateLimiter(5000);
    rl.setFastMode(true);
    const start = Date.now();
    await rl.acquire();
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(1000); // 快速模式下不应等待
  });
});
