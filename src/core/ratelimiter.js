/**
 * RateLimiter — 请求速率限制
 * @module core/ratelimiter
 */

/**
 * @param {number} ms — 毫秒
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export class RateLimiter {
  /**
   * @param {number} minInterval — 最小间隔 (毫秒)
   */
  constructor(minInterval = 500) {
    this.minInterval = minInterval;
    this.lastCall = 0;
  }

  /**
   * 获取执行许可，不足间隔则等待
   * @param {Object} [options]
   * @param {Object} [options.random] — {min, max} 额外随机等待 (毫秒)
   * @returns {Promise<void>}
   */
  async acquire(options = {}) {
    const now = Date.now();
    const elapsed = now - this.lastCall;

    if (!this._fastMode && elapsed < this.minInterval) {
      await sleep(this.minInterval - elapsed);
    }

    // 额外随机等待（快速模式跳过）
    if (!this._fastMode && options.random) {
      const { min = 0, max = 0 } = options.random;
      const extra = Math.floor(Math.random() * (max - min + 1)) + min;
      if (extra > 0) await sleep(extra);
    }

    this.lastCall = Date.now();
  }

  /** 快速模式：跳过所有延迟 */
  setFastMode(on) {
    this._fastMode = !!on;
  }

  /** 重置计时 */
  reset() {
    this.lastCall = 0;
  }
}
