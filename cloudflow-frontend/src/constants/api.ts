/**
 * API 常量配置
 */

// API 超时时间
export const API_TIMEOUT = 10000;

// API 成功状态码
export const API_SUCCESS_CODE = 200;

// API 错误状态码
export const API_ERROR_CODES = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  SERVER_ERROR: 500,
} as const;
