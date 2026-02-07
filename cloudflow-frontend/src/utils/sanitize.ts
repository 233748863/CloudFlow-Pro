/**
 * XSS 防护工具函数
 * 用于清理和转义用户输入的内容，防止跨站脚本攻击
 */

/**
 * 转义 HTML 特殊字符
 * 防止 HTML 注入攻击
 */
export const escapeHtml = (text: string): string => {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;',
  };
  
  return text.replace(/[&<>"'/]/g, (char) => map[char]);
};

/**
 * 清理 URL，只允许安全的协议
 * 防止 javascript: 等危险协议
 */
export const sanitizeUrl = (url: string): string => {
  const trimmedUrl = url.trim();
  
  // 允许的安全协议
  const safeProtocols = ['http:', 'https:', 'mailto:', 'tel:'];
  
  try {
    const urlObj = new URL(trimmedUrl);
    if (safeProtocols.includes(urlObj.protocol)) {
      return trimmedUrl;
    }
  } catch {
    // 如果不是有效的 URL，检查是否是相对路径
    if (trimmedUrl.startsWith('/') || trimmedUrl.startsWith('./') || trimmedUrl.startsWith('../')) {
      return trimmedUrl;
    }
  }
  
  // 不安全的 URL，返回空字符串
  return '';
};

/**
 * 清理用户输入的文本
 * 移除潜在的危险字符和脚本
 */
export const sanitizeInput = (input: string): string => {
  // 移除 HTML 标签
  let cleaned = input.replace(/<[^>]*>/g, '');
  
  // 移除潜在的脚本内容
  cleaned = cleaned.replace(/javascript:/gi, '');
  cleaned = cleaned.replace(/on\w+\s*=/gi, '');
  
  // 转义特殊字符
  cleaned = escapeHtml(cleaned);
  
  return cleaned;
};

/**
 * 为 React 组件创建安全的 HTML 内容
 * 使用 dangerouslySetInnerHTML 时的安全包装
 */
export const createSafeHtml = (html: string): { __html: string } => {
  // 基本的 HTML 清理
  let cleaned = html;
  
  // 移除 script 标签
  cleaned = cleaned.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  
  // 移除事件处理器
  cleaned = cleaned.replace(/on\w+\s*=\s*["'][^"']*["']/gi, '');
  cleaned = cleaned.replace(/on\w+\s*=\s*[^\s>]*/gi, '');
  
  // 移除 javascript: 协议
  cleaned = cleaned.replace(/javascript:/gi, '');
  
  return { __html: cleaned };
};

/**
 * 验证和清理文件名
 * 防止路径遍历攻击
 */
export const sanitizeFilename = (filename: string): string => {
  // 移除路径分隔符和特殊字符
  let cleaned = filename.replace(/[/\\]/g, '');
  
  // 移除潜在危险的字符
  cleaned = cleaned.replace(/[<>:"|?*\x00-\x1f]/g, '');
  
  // 移除开头的点（隐藏文件）
  cleaned = cleaned.replace(/^\.+/, '');
  
  // 限制长度
  if (cleaned.length > 255) {
    cleaned = cleaned.substring(0, 255);
  }
  
  return cleaned || 'unnamed';
};

/**
 * 清理 JSON 数据
 * 递归清理对象中的所有字符串值
 */
export const sanitizeJson = <T>(data: T): T => {
  if (typeof data === 'string') {
    return sanitizeInput(data) as T;
  }
  
  if (Array.isArray(data)) {
    return data.map(item => sanitizeJson(item)) as T;
  }
  
  if (data !== null && typeof data === 'object') {
    const cleaned: any = {};
    for (const [key, value] of Object.entries(data)) {
      cleaned[key] = sanitizeJson(value);
    }
    return cleaned as T;
  }
  
  return data;
};

/**
 * 验证和清理 CSS 类名
 * 防止 CSS 注入
 */
export const sanitizeClassName = (className: string): string => {
  // 只允许字母、数字、连字符和下划线
  return className.replace(/[^a-zA-Z0-9\-_\s]/g, '');
};
