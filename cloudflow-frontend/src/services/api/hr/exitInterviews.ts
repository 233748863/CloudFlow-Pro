import { hr09Page, hr09Request } from './hr09Request';
import { Hr09Error, requireId, requireVersion } from './hr09Model';
import type { Hr09NamedOption, Hr09Page } from './hr09Types';

export interface ExitInterview {
  interviewId: string; employeeId: string; employeeName: string; lifecycleApplicationId: string; applicationNo: string;
  settlementId: string | null; interviewerId: string; interviewerName: string; interviewTime: string;
  location: string | null; leavingReason: string | null; employeeFeedback: string | null; managerComment: string | null;
  improvementItems: string[]; attachmentFileIds: string[]; attachmentFiles: Hr09NamedOption[]; status: 'DRAFT' | 'CONFIRMED'; version: number;
}
export interface ExitInterviewQuery { pageNum?: number; pageSize?: number; employeeId?: string; keyword?: string; status?: string; lifecycleApplicationId?: string }
export interface ExitInterviewInput {
  lifecycleApplicationId: string; settlementId?: string | null; interviewerId: string; interviewTime: string;
  location: string | null; leavingReason: string | null; employeeFeedback: string | null; managerComment: string | null;
  improvementItems: string[]; attachmentFileIds?: string[]; status: 'DRAFT' | 'CONFIRMED'; version?: number;
}
const root = '/hr/exit-interview';
const id = (value: unknown) => {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) throw new Hr09Error('记录编号无法完整读取，请刷新。');
  return requireId(String(value));
};
const option = (value: Hr09NamedOption): Hr09NamedOption => {
  if (!value || typeof value.label !== 'string') throw new Hr09Error('未取得完整名称，请重新读取。');
  return { value: id(value.value), label: value.label };
};
const record = (value: ExitInterview): ExitInterview => {
  if (!value || !['DRAFT', 'CONFIRMED'].includes(value.status) || !Array.isArray(value.attachmentFileIds)
      || !Array.isArray(value.attachmentFiles) || !Array.isArray(value.improvementItems)) throw new Hr09Error('面谈记录不完整，请重新读取。');
  requireVersion(value.version);
  return { ...value, interviewId: id(value.interviewId), employeeId: id(value.employeeId), lifecycleApplicationId: id(value.lifecycleApplicationId),
    interviewerId: id(value.interviewerId), settlementId: value.settlementId == null ? null : id(value.settlementId),
    attachmentFileIds: value.attachmentFileIds.map(id), attachmentFiles: value.attachmentFiles.map(option) };
};
export function interviewInput(row: ExitInterview): ExitInterviewInput {
  return { lifecycleApplicationId: row.lifecycleApplicationId, settlementId: row.settlementId, interviewerId: row.interviewerId,
    interviewTime: row.interviewTime, location: row.location, leavingReason: row.leavingReason, employeeFeedback: row.employeeFeedback,
    managerComment: row.managerComment, improvementItems: row.improvementItems, attachmentFileIds: row.attachmentFileIds, status: row.status, version: row.version };
}
const input = (value: ExitInterviewInput) => {
  if (!value.interviewTime || !/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d)?$/.test(value.interviewTime)) throw new Hr09Error('请选择完整的面谈日期和时间。', 400);
  return { ...value, lifecycleApplicationId: id(value.lifecycleApplicationId), interviewerId: id(value.interviewerId),
    interviewTime: value.interviewTime.length === 16 ? `${value.interviewTime}:00` : value.interviewTime,
    ...(value.version == null ? {} : requireVersion(value.version)) };
};
export const exitInterviewApi = {
  list: async (query: ExitInterviewQuery, signal?: AbortSignal) => {
    const page = hr09Page<ExitInterview>(await hr09Request({ method: 'GET', url: `${root}/list`, params: query, signal }));
    return { ...page, rows: page.rows.map(record) };
  },
  detail: async (identifier: string, signal?: AbortSignal) => record(await hr09Request({ method: 'GET', url: `${root}/${id(identifier)}`, signal })),
  options: async (kind: 'applications' | 'interviewers', query: ExitInterviewQuery, signal?: AbortSignal) => {
    const page = hr09Page<Hr09NamedOption>(await hr09Request<Hr09Page<Hr09NamedOption>>({ method: 'GET', url: `${root}/${kind}`, params: query, signal }));
    return { ...page, rows: page.rows.map(option) };
  },
  create: async (value: ExitInterviewInput) => id(await hr09Request({ method: 'POST', url: root, data: input(value) })),
  update: async (identifier: string, value: ExitInterviewInput) => {
    requireVersion(value.version);
    await hr09Request({ method: 'PUT', url: `${root}/${id(identifier)}`, data: input(value) });
  },
  upload: async (row: ExitInterview, file: File) => {
    if (!file.size || file.size > 10485760 || !/\.(pdf|png|jpe?g)$/i.test(file.name)) throw new Hr09Error('请选择不超过10MiB的PDF、PNG或JPEG附件。', 400);
    const data = new FormData(); data.append('file', file);
    await hr09Request({ method: 'POST', url: `${root}/${id(row.interviewId)}/attachments`, params: requireVersion(row.version), data, headers: { 'Content-Type': undefined } });
  },
  download: async (row: ExitInterview, fileId: string) => {
    const blob = await readHrAuthorizedFile({ bizType: 'HR_EXIT_INTERVIEW', bizId: id(row.interviewId), fileId: id(fileId) });
    if (!(blob instanceof Blob) || !blob.size || !['application/pdf', 'image/png', 'image/jpeg'].includes(blob.type.split(';')[0])) throw new Hr09Error('未取得有效附件，下载已停止。');
    return blob;
  },
};
import { readHrAuthorizedFile } from './fileDownload';
