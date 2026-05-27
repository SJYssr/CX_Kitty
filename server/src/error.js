/**
 * 错误消息清洗 — 使用 denylist 隐藏内部敏感信息
 */

const RAW_PATTERNS = [
  [/Access denied for user/i, '数据库连接失败（账号或密码错误）'],
  [/ECONNREFUSED/i, '数据库连接失败（服务未启动）'],
  [/ETIMEDOUT/i, '数据库连接超时'],
  [/ENOTFOUND/i, '数据库主机地址无法解析'],
  [/ER_DUP_ENTRY/i, '数据重复，请检查输入'],
  [/ER_NO_SUCH_TABLE/i, '数据库表结构异常，请联系管理员'],
  [/ER_PARSE_ERROR/i, '数据库查询异常'],
  [/connect ETIMEDOUT/i, '网络连接超时'],
  [/getaddrinfo ENOTFOUND/i, '网络地址无法解析'],
  [/ER_LOCK_DEADLOCK/i, '系统繁忙，请稍后重试'],
  [/ER_LOCK_WAIT_TIMEOUT/i, '系统繁忙，请稍后重试'],
  [/PROTOCOL_/i, '数据库连接异常'],
  [/socket hang up/i, '网络连接中断'],
];

const SENSITIVE_PATTERNS = [
  /\/home\//, /\/root\//, /\/etc\//, /\/var\//,
  /SELECT\s.*\bFROM\b/i, /\bINSERT\s+INTO\b/i, /\bDROP\s+/i,
  /\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/,
  /ER_\w+/,
  /at\s+\S+\s+\(.*:\d+:\d+\)/,
  /password/i, /token/i, /secret/i,
];

export function sanitizeError(err) {
  if (!err) return '服务器错误';
  const msg = (typeof err === 'string' ? err : err.message) || '';

  for (const [pattern, friendly] of RAW_PATTERNS) {
    if (pattern.test(msg)) return friendly;
  }

  for (const pattern of SENSITIVE_PATTERNS) {
    if (pattern.test(msg)) return '服务器内部错误';
  }

  return msg;
}
