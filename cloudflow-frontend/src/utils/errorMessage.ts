/**
 * 统一提取错误消息，避免页面层重复散落相同兜底逻辑。
 */
export const getErrorMessage = (error: unknown, fallback = '操作失败') => {
  if (error && typeof error === 'object') {
    const record = error as Record<string, any>;
    const responseData = record.response?.data;
    const candidates = [
      responseData?.message,
      responseData?.msg,
      responseData?.error,
      record.message,
      record.msg,
      record.error,
    ];
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate.trim();
      }
    }
  }
  if (error instanceof Error) {
    const message = error.message.trim();
    if (message) {
      return message;
    }
  }
  return fallback;
};
