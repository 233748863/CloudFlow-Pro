import { downloadAuthorizedFile, type FileDownloadRequest } from '../file';

/** 对应旧业务入口逐项注册，未注册的路径由原业务处理。 */
export function hrFileDownloadContext(path: string): FileDownloadRequest | undefined {
  const routes: [RegExp, FileDownloadRequest['bizType']][] = [
    [/^\/ess\/grievances\/([1-9][0-9]*)\/files\/([1-9][0-9]*)$/, 'HR_GRIEVANCE_MINE'],
    [/^\/grievances\/([1-9][0-9]*)\/files\/([1-9][0-9]*)$/, 'HR_GRIEVANCE_MANAGE'],
    [/^\/labor\/disputes\/([1-9][0-9]*)\/grievance-files\/([1-9][0-9]*)$/, 'HR_GRIEVANCE_DISPUTE'],
    [/^\/ess\/leave\/([1-9][0-9]*)\/files\/([1-9][0-9]*)$/, 'HR_LEAVE_PROOF_MINE'],
    [/^\/attendance\/time-requests\/([1-9][0-9]*)\/files\/([1-9][0-9]*)$/, 'HR_LEAVE_PROOF_MANAGE'],
  ];
  for (const [pattern, bizType] of routes) {
    const match = path.match(pattern);
    if (match) return { bizType, bizId: match[1], fileId: match[2] };
  }
  return undefined;
}

export function readHrAuthorizedFile(context: FileDownloadRequest): Promise<Blob> {
  return downloadAuthorizedFile(context, new AbortController().signal);
}
