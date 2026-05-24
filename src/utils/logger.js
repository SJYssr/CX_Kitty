/**
 * 轻量日志工具
 * @module utils/logger
 */

const LEVELS = { trace: 0, debug: 1, info: 2, warn: 3, error: 4 };
let currentLevel = LEVELS.info;

/** @type {string} */
let prefix = '';

/**
 * 设置日志级别
 * @param {'trace'|'debug'|'info'|'warn'|'error'} level
 */
export function setLevel(level) {
  if (level in LEVELS) currentLevel = LEVELS[level];
}

/**
 * 设置日志前缀
 * @param {string} pfx
 */
export function setPrefix(pfx) {
  prefix = pfx;
}

function log(level, label, ...args) {
  if (LEVELS[level] < currentLevel) return;
  const ts = new Date().toLocaleTimeString();
  const pfx = prefix ? `[${prefix}] ` : '';
  console.log(`${ts} ${pfx}${label}`, ...args);
}

export const logger = {
  trace: (...args) => log('trace', '[TRACE]', ...args),
  debug: (...args) => log('debug', '[DEBUG]', ...args),
  info: (...args) => log('info', '[INFO]', ...args),
  warn: (...args) => log('warn', '[WARN]', ...args),
  error: (...args) => log('error', '[ERROR]', ...args)
};

export default logger;
