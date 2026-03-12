/**
 * 下载 Blob 文件。
 * 统一处理链接创建与资源释放，避免各页面重复实现下载逻辑。
 */
export function downloadBlob(blob: Blob, fileName: string) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

/**
 * 构建统一的 Excel 文件名，方便不同业务页面复用。
 */
export function buildExcelFileName(prefix: string) {
  const date = new Date().toISOString().split('T')[0];
  return `${prefix}_${date}.xlsx`;
}