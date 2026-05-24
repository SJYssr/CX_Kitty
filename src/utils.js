import chalk from "chalk";

// 日志 - 带颜色
export function log(msg, type = "info") {
  const colors = {
    info: chalk.cyan,
    success: chalk.green,
    warn: chalk.yellow,
    error: chalk.red,
    step: chalk.magenta
  };
  const prefix = {
    info: " ℹ",
    success: " ✓",
    warn: " ⚠",
    error: " ✗",
    step: " ▶"
  };
  console.log(`${colors[type](prefix[type])} ${msg}`);
}

// 延时
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 随机延时 - 模拟人类操作
export function randomSleep(min = 500, max = 2000) {
  return sleep(Math.floor(Math.random() * (max - min + 1)) + min);
}

// 格式化时间
export function now() {
  return new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
}
