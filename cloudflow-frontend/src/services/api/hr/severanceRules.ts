import { hr09Page, hr09Request } from './hr09Request';
import { Hr09Error, requireId, requireText, requireVersion } from './hr09Model';

export interface SeveranceSlab { sortNo: number; minServiceYears: string; maxServiceYears: string | null; calculationMode: string; compensationMonths: string }
export interface SeveranceSettings {
  ruleName: string; effectiveFrom: string; effectiveTo: string | null; salaryComponentIds: string[]; averagingMonths: number; serviceRounding: string;
  socialMonthlySalary: string | null; baseCapMultiplier: string | null; maxCompensationMonths: string | null; noticeMonths: string;
  leaveDailyDivisor: string | null; leaveHoursPerDay: string | null; leaveCashMultiplier: string | null; remark: string | null; slabs: SeveranceSlab[];
}
export interface SeveranceComponent { value: string; label: string; componentType: string; version: number }
export interface SeveranceRule {
  ruleId: string; ruleCode: string; settings: SeveranceSettings; salaryComponents: SeveranceComponent[];
  policyFile: { fileId: string; fileName: string; fileSize: number } | null; missingRequirements: string[];
  status: 'DRAFT' | 'CONFIRMED' | 'DISABLED'; confirmedBy: string | null; confirmedTime: string | null; version: number; editable: boolean;
}
export interface SeveranceQuery { pageNum?: number; pageSize?: number; keyword?: string; status?: string }
const root = '/hr/severance-rule';
const id = (value: unknown) => {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) throw new Hr09Error('政策编号无法完整读取，请刷新。');
  return requireId(String(value));
};
const decimal = (value: string, label: string, money = false): string => {
  if (typeof value !== 'string' || !(money ? /^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/ : /^(?:0|[1-9]\d{0,3})(?:\.\d{1,4})?$/).test(value.trim())) {
    throw new Hr09Error(`${label}须为0或正数，最多${money ? '12位整数、2位小数' : '4位整数、4位小数'}。`, 400);
  }
  return value.trim();
};
const optional = (value: string | null, label: string, money = false) => value == null || value === '' ? null : decimal(value, label, money);
const date = (value: string, label: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1000-01-01' || Number.isNaN(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw new Hr09Error(`请填写有效的${label}。`, 400);
  return value;
};
const settings = (value: SeveranceSettings): SeveranceSettings => {
  if (!value || !Number.isInteger(value.averagingMonths) || value.averagingMonths < 1 || value.averagingMonths > 120) throw new Hr09Error('工资取样月数须为1至120之间的整数。', 400);
  if (!['ACTUAL_MONTHS', 'FLOOR_YEAR', 'CEIL_HALF_YEAR'].includes(value.serviceRounding)) throw new Hr09Error('请选择工龄算法。', 400);
  if (!Array.isArray(value.salaryComponentIds) || value.salaryComponentIds.length > 100 || !Array.isArray(value.slabs) || value.slabs.length > 100) throw new Hr09Error('工资项目和工龄分档各最多100项。', 400);
  const components = value.salaryComponentIds.map(id);
  if (new Set(components).size !== components.length) throw new Hr09Error('工资项目不能重复。', 400);
  const from = date(value.effectiveFrom, '生效日期'); const to = value.effectiveTo ? date(value.effectiveTo, '失效日期') : null;
  if (to && to < from) throw new Hr09Error('失效日期不得早于生效日期。', 400);
  return { ruleName: requireText(value.ruleName, '政策名称', 100), effectiveFrom: from, effectiveTo: to, salaryComponentIds: components,
    averagingMonths: value.averagingMonths, serviceRounding: value.serviceRounding, socialMonthlySalary: optional(value.socialMonthlySalary, '核定社会平均月工资', true),
    baseCapMultiplier: optional(value.baseCapMultiplier, '月基数上限倍数'), maxCompensationMonths: optional(value.maxCompensationMonths, '补偿月数上限'), noticeMonths: decimal(value.noticeMonths, '额外通知补偿月数'),
    leaveDailyDivisor: optional(value.leaveDailyDivisor, '日薪除数'), leaveHoursPerDay: optional(value.leaveHoursPerDay, '每日小时数'), leaveCashMultiplier: optional(value.leaveCashMultiplier, '年假折现系数'),
    remark: value.remark ? requireText(value.remark, '核定说明', 500) : null,
    slabs: value.slabs.map((slab, index) => {
      if (!slab || !['FIXED', 'PER_YEAR'].includes(slab.calculationMode)) throw new Hr09Error(`请选择第${index + 1}档计算方式。`, 400);
      return { sortNo: index, minServiceYears: decimal(slab.minServiceYears, '工龄下限'), maxServiceYears: optional(slab.maxServiceYears, '工龄上限'), calculationMode: slab.calculationMode, compensationMonths: decimal(slab.compensationMonths, '补偿月数') };
    }) };
};
const component = (value: SeveranceComponent): SeveranceComponent => {
  if (!value || typeof value.label !== 'string' || !['FIXED', 'VARIABLE', 'EARNING'].includes(value.componentType)) throw new Hr09Error('工资项目读取不完整，请刷新。');
  requireVersion(value.version); return { ...value, value: id(value.value) };
};
const record = (value: SeveranceRule): SeveranceRule => {
  if (!value || !['DRAFT', 'CONFIRMED', 'DISABLED'].includes(value.status) || typeof value.editable !== 'boolean'
    || !Array.isArray(value.missingRequirements) || value.missingRequirements.some(message => typeof message !== 'string') || !Array.isArray(value.salaryComponents)) throw new Hr09Error('政策详情不完整，请重新读取。');
  requireVersion(value.version);
  if (value.policyFile && (typeof value.policyFile.fileName !== 'string' || !Number.isSafeInteger(value.policyFile.fileSize) || value.policyFile.fileSize <= 0)) throw new Hr09Error('政策文件信息不完整，请重新读取。');
  return { ...value, ruleId: id(value.ruleId), ruleCode: requireText(value.ruleCode, '政策编号', 64), settings: settings(value.settings), salaryComponents: value.salaryComponents.map(component),
    confirmedBy: value.confirmedBy == null ? null : id(value.confirmedBy), policyFile: value.policyFile ? { ...value.policyFile, fileId: id(value.policyFile.fileId) } : null };
};
export const severanceRulesApi = {
  list: async (query: SeveranceQuery, signal?: AbortSignal) => {
    const page = hr09Page<SeveranceRule>(await hr09Request({ method: 'GET', url: `${root}/list`, params: query, signal })); return { ...page, rows: page.rows.map(record) };
  },
  detail: async (identifier: string, signal?: AbortSignal) => record(await hr09Request({ method: 'GET', url: `${root}/${id(identifier)}`, signal })),
  components: async (signal?: AbortSignal) => {
    const rows = await hr09Request<SeveranceComponent[]>({ method: 'GET', url: `${root}/components`, signal });
    if (!Array.isArray(rows)) throw new Hr09Error('工资项目读取不完整，请重试。'); return rows.map(component);
  },
  create: async (code: string, value: SeveranceSettings) => {
    const ruleCode = requireText(code, '政策编号', 64);
    if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(ruleCode)) throw new Hr09Error('政策编号以字母或数字开头，只能使用字母、数字、点、短横线和下划线。', 400);
    return id(await hr09Request({ method: 'POST', url: root, data: { ...settings(value), ruleCode } }));
  },
  update: async (row: SeveranceRule, value: SeveranceSettings) => hr09Request<void>({ method: 'PUT', url: `${root}/${id(row.ruleId)}`, data: { ...settings(value), ...requireVersion(row.version) } }),
  confirm: async (row: SeveranceRule) => hr09Request<void>({ method: 'POST', url: `${root}/${id(row.ruleId)}/confirm`, data: requireVersion(row.version) }),
  upload: async (row: SeveranceRule, file: File) => {
    if (!file.size || file.size > 10485760 || !/\.(pdf|png|jpe?g)$/i.test(file.name)) throw new Hr09Error('请选择不超过10MiB的PDF、PNG或JPEG政策文件。', 400);
    const data = new FormData(); data.append('file', file);
    return record(await hr09Request({ method: 'POST', url: `${root}/${id(row.ruleId)}/policy`, params: requireVersion(row.version), data, headers: { 'Content-Type': undefined } }));
  },
  download: async (row: SeveranceRule) => {
    const blob = await readHrAuthorizedFile({ bizType: 'HR_SEVERANCE_POLICY', bizId: id(row.ruleId), fileId: id(row.policyFile?.fileId) });
    if (!(blob instanceof Blob) || !blob.size || !['application/pdf', 'image/png', 'image/jpeg'].includes(blob.type.split(';')[0])) throw new Hr09Error('未取得有效政策文件，下载已停止。'); return blob;
  },
};
import { readHrAuthorizedFile } from './fileDownload';
