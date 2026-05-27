/**
 * Chaoxing 工厂 — 统一 Web 和 CLI 的初始化逻辑
 * @module core/factory
 */
import { Chaoxing } from './chaoxing.js';
import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';

/**
 * 创建独立 session 的 Chaoxing 实例（Web 端用，避免 SessionManager 单例串号）
 * @param {Object} account — { phone, password }
 * @param {Object} [opts]
 * @param {Object} [opts.tiku] — 题库实例
 * @param {number} [opts.speed=1]
 * @param {number} [opts.jobs=3]
 * @param {boolean} [opts.fastMode=false]
 * @param {Object} [opts.globalThrottle] — 全局节流器
 * @returns {Chaoxing}
 */
export function createStandalone(account, opts = {}) {
  const jar = new CookieJar();
  const session = wrapper(axios.create({
    jar,
    withCredentials: true,
    timeout: 30000
  }));

  return new Chaoxing(account, opts.tiku || null, {
    speed: opts.speed || 1,
    jobs: opts.jobs || 3,
    fastMode: opts.fastMode || false,
    _standaloneSession: session,
    _globalThrottle: opts.globalThrottle || undefined
  });
}

/**
 * 创建共享 session 的 Chaoxing 实例（CLI 端用，复用 SessionManager 会话）
 * @param {Object} account — { phone, password }
 * @param {Object} [opts]
 * @param {Object} [opts.tiku] — 题库实例
 * @param {number} [opts.speed=1]
 * @param {number} [opts.jobs=3]
 * @returns {Chaoxing}
 */
export function createShared(account, opts = {}) {
  return new Chaoxing(account, opts.tiku || null, {
    speed: opts.speed || 1,
    jobs: opts.jobs || 3
  });
}
