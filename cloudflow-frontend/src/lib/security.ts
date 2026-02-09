import DOMPurify from 'dompurify';

// ============================================================
// 安全工具集 - XSS 防护、数据脱敏、输入过滤
// ============================================================

/**
 * XSS 防护 - 清理 HTML 内容
 * 使用 DOMPurify 过滤恶意脚本
 */
export function sanitizeHTML(dirty: string): string {
  if (!dirty) return '';
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li', 'span', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'img'],
    ALLOWED_ATTR: ['href', 'target', 'class', 'style', 'src', 'alt', 'width', 'height'],
    ALLOW_DATA_ATTR: false,
  });
}

/**
 * 严格模式 - 移除所有 HTML 标签，仅保留纯文本
 */
export function sanitizeText(dirty: string): string {
  if (!dirty) return '';
  return DOMPurify.sanitize(dirty, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
}

/**
 * 数据脱敏 - 手机号
 * 13812345678 → 138****5678
 */
export function maskPhone(phone: string): string {
  if (!phone || phone.length < 7) return phone;
  return phone.replace(/(\d{3})\d{4}(\d+)/, '$1****$2');
}

/**
 * 数据脱敏 - 邮箱
 * user@example.com → u***@example.com
 */
export function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return email;
  const [local, domain] = email.split('@');
  if (local.length <= 1) return `${local}***@${domain}`;
  return `${local[0]}***@${domain}`;
}

/**
 * 数据脱敏 - 身份证号
 * 110101199001011234 → 110101****1234
 */
export function maskIdCard(idCard: string): string {
  if (!idCard || idCard.length < 8) return idCard;
  return idCard.replace(/(\d{6})\d+(\d{4})/, '$1****$2');
}

/**
 * 输入过滤 - 防止 SQL 注入关键字
 */
export function filterSQLInjection(input: string): string {
  if (!input) return '';
  const sqlKeywords = /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER|CREATE|EXEC|EXECUTE)\b)/gi;
  return input.replace(sqlKeywords, '');
}

/**
 * 安全的 JSON 解析
 * 防止恶意 JSON 导致应用崩溃
 */
export function safeJsonParse<T = unknown>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

/**
 * 生产环境安全的日志输出
 * 开发环境正常输出，生产环境静默
 */
export const safeLog = {
  log: (...args: unknown[]) => {
    if (import.meta.env.DEV) console.log(...args);
  },
  warn: (...args: unknown[]) => {
    if (import.meta.env.DEV) console.warn(...args);
  },
  error: (...args: unknown[]) => {
    // 错误日志在生产环境也输出（但不输出敏感数据）
    console.error(...args);
  },
  debug: (...args: unknown[]) => {
    if (import.meta.env.DEV) console.debug(...args);
  },
};

/**
 * 检查 URL 是否安全（防止 javascript: 协议等）
 */
export function isSafeUrl(url: string): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url, window.location.origin);
    return ['http:', 'https:', 'mailto:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

/**
 * 转义 HTML 特殊字符（用于非 DOMPurify 场景）
 */
export function escapeHtml(str: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return str.replace(/[&<>"']/g, (m) => map[m] || m);
}
