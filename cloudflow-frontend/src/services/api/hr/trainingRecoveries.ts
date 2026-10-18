import { hr09Page, hr09Request } from './hr09Request';
import { Hr09Error, requireId, requireText, requireVersion } from './hr09Model';
import type { Hr09NamedOption } from './hr09Types';

export interface TrainingRecovery {
  recoveryId: string; employeeId: string; employeeName: string; enrollmentId: string; courseName: string; sessionNo: string;
  agreementFileId: string; agreementFileName: string; assessedAmount: string; collectedAmount: string; assessmentReason: string;
  status: 'DRAFT' | 'CONFIRMED' | 'CLEARED' | 'VOID'; confirmedBy: string | null; confirmedTime: string | null; settlementId: string | null; version: number;
}
export interface TrainingRecoveryQuery { pageNum?: number; pageSize?: number; keyword?: string; status?: string; enrollmentId?: string }
export interface TrainingAssessment { assessedAmount: string; assessmentReason: string }
export interface TrainingAgreement { fileId: string; fileName: string; fileSize: number }
const root = '/hr/training-recovery';
const id = (value: unknown) => {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) throw new Hr09Error('记录编号无法完整读取，请刷新。');
  return requireId(String(value));
};
const money = (value: string) => {
  if (typeof value !== 'string' || !/^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/.test(value.trim())) throw new Hr09Error('核定金额须为0或正数，最多12位整数和2位小数。', 400);
  return value.trim();
};
const assessment = (value: TrainingAssessment) => ({ assessedAmount: money(value.assessedAmount), assessmentReason: requireText(value.assessmentReason, '核定依据', 1000) });
const record = (value: TrainingRecovery): TrainingRecovery => {
  if (!value || !['DRAFT', 'CONFIRMED', 'CLEARED', 'VOID'].includes(value.status) || typeof value.assessmentReason !== 'string') throw new Hr09Error('核定记录不完整，请重新读取。');
  requireVersion(value.version);
  return { ...value, recoveryId: id(value.recoveryId), employeeId: id(value.employeeId), enrollmentId: id(value.enrollmentId),
    agreementFileId: id(value.agreementFileId), assessedAmount: money(value.assessedAmount), collectedAmount: money(value.collectedAmount),
    confirmedBy: value.confirmedBy == null ? null : id(value.confirmedBy), settlementId: value.settlementId == null ? null : id(value.settlementId) };
};
export const trainingRecoveryApi = {
  list: async (query: TrainingRecoveryQuery, signal?: AbortSignal) => {
    const page = hr09Page<TrainingRecovery>(await hr09Request({ method: 'GET', url: `${root}/list`, params: query, signal }));
    return { ...page, rows: page.rows.map(record) };
  },
  detail: async (identifier: string, signal?: AbortSignal) => record(await hr09Request({ method: 'GET', url: `${root}/${id(identifier)}`, signal })),
  enrollments: async (query: TrainingRecoveryQuery, signal?: AbortSignal) => {
    const page = hr09Page<Hr09NamedOption>(await hr09Request({ method: 'GET', url: `${root}/enrollments`, params: query, signal }));
    return { ...page, rows: page.rows.map(option => {
      if (typeof option.label !== 'string') throw new Hr09Error('未取得完整的培训名称，请重新读取。');
      return { value: id(option.value), label: option.label };
    }) };
  },
  upload: async (enrollmentId: string, file: File): Promise<TrainingAgreement> => {
    if (!file.size || file.size > 10485760 || !/\.(pdf|png|jpe?g)$/i.test(file.name)) throw new Hr09Error('请选择不超过10MiB的PDF、PNG或JPEG协议。', 400);
    const data = new FormData(); data.append('file', file);
    const uploaded = await hr09Request<TrainingAgreement>({ method: 'POST', url: `${root}/agreements`, params: { enrollmentId: id(enrollmentId) }, data, headers: { 'Content-Type': undefined } });
    if (!uploaded || typeof uploaded.fileName !== 'string' || !Number.isSafeInteger(uploaded.fileSize) || uploaded.fileSize <= 0) throw new Hr09Error('尚未取得协议保存结果，请重新核对。');
    return { ...uploaded, fileId: id(uploaded.fileId) };
  },
  validate: assessment,
  create: async (enrollmentId: string, fileId: string, value: TrainingAssessment) => id(await hr09Request({ method: 'POST', url: root, data: { ...assessment(value), enrollmentId: id(enrollmentId), agreementFileId: id(fileId) } })),
  update: async (row: TrainingRecovery, value: TrainingAssessment) => hr09Request<void>({ method: 'PUT', url: `${root}/${id(row.recoveryId)}`, data: { ...assessment(value), ...requireVersion(row.version) } }),
  confirm: async (row: TrainingRecovery) => hr09Request<void>({ method: 'POST', url: `${root}/${id(row.recoveryId)}/confirm`, data: requireVersion(row.version) }),
  download: async (row: TrainingRecovery) => {
    const blob = await readHrAuthorizedFile({ bizType: 'HR_TRAINING_AGREEMENT', bizId: id(row.recoveryId), fileId: id(row.agreementFileId) });
    if (!(blob instanceof Blob) || !blob.size || !['application/pdf', 'image/png', 'image/jpeg'].includes(blob.type.split(';')[0])) throw new Hr09Error('未取得有效协议，下载已停止。');
    return blob;
  },
};
import { readHrAuthorizedFile } from './fileDownload';
