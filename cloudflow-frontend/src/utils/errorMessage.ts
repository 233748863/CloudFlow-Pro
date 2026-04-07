/**
 * 统一提取错误消息，避免页面层重复散落相同兜底逻辑。
 */
export const getErrorMessage = (error: unknown, fallback = '操作失败') => {
  if (error instanceof Error) {
    const message = error.message.trim();
    if (message) {
      return message;
    }
  }
  return fallback;
};
