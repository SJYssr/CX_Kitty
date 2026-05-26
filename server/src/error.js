/**
 * 错误消息清洗 — 隐藏内部细节，返回对用户友好的错误信息
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

// 已知的安全错误消息正则（不含敏感路径/IP/SQL）
const SAFE_MSG_RE = /^(验证码|登录|注册|课程|任务|账号|邮箱|密码|手机号|网络|数据库|文件|格式|配置|权限|余额)/;

export function sanitizeError(err) {
  if (!err) return '服务器错误';
  const msg = (typeof err === 'string' ? err : err.message) || '';
  for (const [pattern, friendly] of RAW_PATTERNS) {
    if (pattern.test(msg)) return friendly;
  }
  // 只透传已知安全的消息，其余返回通用错误避免泄露内部细节
  if (SAFE_MSG_RE.test(msg)) return msg;
  return '服务器内部错误';
}
