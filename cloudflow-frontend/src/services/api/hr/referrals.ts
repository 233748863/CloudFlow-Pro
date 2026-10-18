import { hr09Page, hr09Request } from './hr09Request';
import { readHrAuthorizedFile } from './fileDownload';
import { Hr09Error, requireId, requireText, requireVersion } from './hr09Model';
import type { Hr09Page, Hr09NamedOption } from './hr09Types';

export const referralStatuses = { SUBMITTED: '已提交', SCREENING: '初筛通过', INTERVIEWING: '面试中', OFFERED: '录用办理中', HIRED: '已入职', REJECTED: '未通过', DUPLICATE: '重复推荐' };
export const referralBonusStatuses = { NOT_APPLICABLE: '尚未核定适用奖金', PENDING: '奖金审批中', APPROVED: '奖金已批准，待工资发放', PAID: '奖金已随工资发放' };
export interface Referral {
  referralId: string; referralNo: string; candidateName: string; contactPhone: string | null; email: string | null;
  targetPositionId: string; status: keyof typeof referralStatuses; hireDate: string | null; bonusStatus: keyof typeof referralBonusStatuses;
  bonusAmount: string | number | null; bonusPayDate: string | null; version: number; createTime: string;
  candidateId: string | null; referrerName: string | null; referralReason: string | null; currentEmployer: string | null; currentJobTitle: string | null;
  bonusCanSubmit: boolean; bonusDecision: string | null; bonusConditionRemark: string | null; resumeFileId: string | null;
}
export interface ReferralQuery { pageNum?: number; pageSize?: number; keyword?: string; status?: string }
export interface ReferralInput {
  candidateName: string; contactPhone: string; email: string; currentEmployer: string; currentJobTitle: string;
  targetPositionId: string; resumeFileId: string; referralReason: string;
}
export interface ReferralResume { fileId: string; fileName: string; size: number }
export interface ReferralBonusInput { amount: string; salaryComponentId: string; payrollPeriodId: string; conditionRemark: string }
const root = '/hr/referral';
const id = (value: unknown) => {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) throw new Hr09Error('记录编号精度无效，请重新读取。');
  return requireId(String(value));
};
const summary = (row: Referral): Referral => {
  if (!row || !(row.status in referralStatuses) || !(row.bonusStatus in referralBonusStatuses)) throw new Hr09Error('推荐状态返回不完整，请重新读取。');
  requireVersion(row.version);
  return { ...row, referralId: id(row.referralId), targetPositionId: id(row.targetPositionId), candidateId: row.candidateId == null ? null : id(row.candidateId) };
};
const options = (result: Hr09Page<Hr09NamedOption>) => {
  const page = hr09Page<Hr09NamedOption>(result);
  return { ...page, rows: page.rows.map(option => ({ value: id(option.value), label: option.label })) };
};

export const hrReferralApi = {
  list: async (query: ReferralQuery, mine: boolean, signal?: AbortSignal) => {
    const page = hr09Page<Referral>(await hr09Request({ method: 'GET', url: `${root}/${mine ? 'mine' : 'list'}`, params: query, signal }));
    return { ...page, rows: page.rows.map(summary) };
  },
  detail: async (referralId: string, mine: boolean, signal?: AbortSignal) => summary(await hr09Request<Referral>({ method: 'GET', url: `${root}${mine ? '/mine' : ''}/${requireId(referralId)}`, signal })),
  positions: async (query: ReferralQuery, signal?: AbortSignal) => options(await hr09Request({ method: 'GET', url: `${root}/positions`, params: query, signal })),
  bonusOptions: async (referralId: string, components: boolean, query: ReferralQuery, signal?: AbortSignal) => options(await hr09Request({ method: 'GET', url: `${root}/${requireId(referralId)}/bonus-options`, params: { ...query, components }, signal })),
  bonus: async (row: Referral, input: ReferralBonusInput) => {
    if (!/^(?:0|[1-9][0-9]{0,11})(?:\.[0-9]{1,2})?$/.test(input.amount) || Number(input.amount) <= 0) throw new Hr09Error('奖金须大于零，最多保留两位小数且不超过999999999999.99元。', 400);
    return summary(await hr09Request<Referral>({ method: 'POST', url: `${root}/${requireId(row.referralId)}/bonus`, data: { ...input, ...requireVersion(row.version),
      salaryComponentId: requireId(input.salaryComponentId), payrollPeriodId: requireId(input.payrollPeriodId), conditionRemark: requireText(input.conditionRemark, '奖金条件说明', 500), conditionsVerified: true } }));
  },
  requisitions: async (referralId: string, query: ReferralQuery, signal?: AbortSignal) => options(await hr09Request({ method: 'GET', url: `${root}/${requireId(referralId)}/requisitions`, params: query, signal })),
  upload: async (file: File): Promise<ReferralResume> => {
    if (!file || !file.size || file.size > 10485760 || !/\.(pdf|docx?)$/i.test(file.name)) throw new Hr09Error('请选择不超过10MiB的PDF或Word简历。', 400);
    const data = new FormData(); data.append('file', file);
    const result = await hr09Request<ReferralResume>({ method: 'POST', url: `${root}/resume`, data, headers: { 'Content-Type': undefined } });
    if (!result || typeof result.fileName !== 'string' || !Number.isSafeInteger(result.size) || result.size <= 0) throw new Hr09Error('未取得完整上传结果，请重新上传。');
    return { ...result, fileId: id(result.fileId) };
  },
  submit: async (input: ReferralInput) => {
    const phone = input.contactPhone.trim(); const email = input.email.trim();
    if (!phone && !email) throw new Hr09Error('手机或邮箱至少填写一项。', 400);
    if (phone && !/^\+[1-9][0-9 ()-]{5,30}$/.test(phone)) throw new Hr09Error('手机号须明确填写“+国家区号”。', 400);
    if (email.length > 254) throw new Hr09Error('邮箱最多254个字符。', 400);
    return summary(await hr09Request<Referral>({ method: 'POST', url: root, data: { ...input, candidateName: requireText(input.candidateName, '候选人姓名', 100),
      contactPhone: phone || null, email: email || null, targetPositionId: requireId(input.targetPositionId), resumeFileId: requireId(input.resumeFileId) } }));
  },
  screening: async (row: Referral, accepted: boolean, reason: string) => summary(await hr09Request<Referral>({ method: 'PUT', url: `${root}/${requireId(row.referralId)}/screening`,
    data: { ...requireVersion(row.version), accepted, reason: requireText(reason, '初筛说明', 1000) } })),
  convert: async (row: Referral, requisitionId: string) => id(await hr09Request<unknown>({ method: 'POST', url: `${root}/${requireId(row.referralId)}/convert`,
    data: { ...requireVersion(row.version), requisitionId: requireId(requisitionId) } })),
  download: async (referralId: string, mine: boolean) => {
    const row = await hrReferralApi.detail(referralId, mine);
    const blob = await readHrAuthorizedFile({ bizType: mine ? 'HR_REFERRAL_RESUME_MINE' : 'HR_REFERRAL_RESUME_MANAGE', bizId: requireId(referralId), fileId: id(row.resumeFileId) });
    const extensions: Record<string, string> = { 'application/pdf': 'pdf', 'application/msword': 'doc', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx' };
    const extension = blob instanceof Blob ? extensions[blob.type.split(';', 1)[0].toLowerCase()] : undefined;
    if (!(blob instanceof Blob) || !blob.size || !extension) throw new Hr09Error('未取得有效简历，下载已停止。');
    return { blob, extension };
  },
};
