/**
 * 下载 Blob 文件。
 * 统一处理链接创建与资源释放，避免各页面重复实现下载逻辑。
 */
function resolveDownloadFileName(blob: Blob, fallbackFileName?: string) {
  if (blob instanceof File && blob.name && blob.name !== 'blob') {
    return blob.name;
  }
  return fallbackFileName || 'download';
}

export function downloadBlob(blob: Blob, fileName?: string) {
  const resolvedFileName = resolveDownloadFileName(blob, fileName);
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = resolvedFileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // 延迟释放 URL，避免浏览器尚未完成读取时导致下载文件不完整
  window.setTimeout(() => {
    window.URL.revokeObjectURL(url);
  }, 1000);

  return resolvedFileName;
}

/**
 * 构建统一的 Excel 文件名，方便不同业务页面复用。
 */
export function buildExcelFileName(prefix: string) {
  const date = new Date().toISOString().split('T')[0];
  return `${prefix}_${date}.xlsx`;
}
