/**
 * 进度条渲染工具 (基于 cli-progress)
 * @module utils/progress-bar
 */

import cliProgress from 'cli-progress';

/**
 * 创建单线进度条
 * @param {Object} [options]
 * @param {string} [options.format] — 格式字符串
 * @param {boolean} [options.clearOnComplete]
 * @param {number} [options.total]
 * @returns {cliProgress.SingleBar}
 */
export function createProgressBar(options = {}) {
  const bar = new cliProgress.SingleBar({
    format: options.format || '{title} |{bar}| {percentage}% {eta_formatted}',
    barCompleteChar: '█',
    barIncompleteChar: '░',
    hideCursor: true,
    clearOnComplete: options.clearOnComplete !== false,
    stopOnComplete: true,
    fps: 5,
    ...options
  });
  if (options.total !== undefined) {
    bar.start(options.total, 0, { title: '' });
  }
  return bar;
}

/**
 * 格式化秒数为 mm:ss
 * @param {number} seconds
 * @returns {string}
 */
export function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * 渲染视频进度条文本
 * @param {string} name — 任务名
 * @param {number} current — 当前秒
 * @param {number} total — 总秒
 * @returns {string}
 */
export function renderVideoProgress(name, current, total) {
  const pct = Math.min(Math.round((current / total) * 100), 100);
  const barLen = 30;
  const filled = Math.round((pct / 100) * barLen);
  const bar = '█'.repeat(filled) + '░'.repeat(barLen - filled);
  return `${name} |${bar}| ${pct}% ${formatTime(current)}/${formatTime(total)}`;
}
