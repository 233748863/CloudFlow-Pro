import {
  assertCurrentEmployeeCanStartSelfService,
  createHrOvertimeApplication,
  deleteHrOvertimeApplication,
  getHrOvertimeApplication,
  listHrOvertimeApplications,
  resolveCurrentEmployeeId,
  submitHrOvertimeApplication,
  updateHrOvertimeApplication,
} from './hr';
import { PageResult } from '@/types';

/** 加班申请接口类型 */
export interface OvertimeRequest {
  id?: number;
  tenantId?: number;
  instanceId?: string;
  userId?: number;
  userName?: string;
  overtimeNo?: string;
  overtimeType: string;
  startTime: string;
  endTime: string;
  overtimeHours?: number;
  compensateType?: string;
  reason: string;
  workContent?: string;
  expectedOutput?: string;
  needMeal?: number;
  workLocation?: string;
  attachmentUrl?: string;
  status?: string;
  deptId?: number;
  deptName?: string;
  createTime?: string;
}

const META_LABELS = {
  workContent: '工作内容',
  expectedOutput: '预期产出',
  needMeal: '是否用餐',
  workLocation: '工作地点',
  attachmentUrl: '附件',
} as const;

const buildCsvBlob = (rows: OvertimeRequest[]) => {
  const header = ['单号', '加班类型', '开始时间', '结束时间', '时长', '补偿方式', '状态', '原因'];
  const lines = rows.map((item) =>
    [
      item.overtimeNo || '',
      item.overtimeType || '',
      item.startTime || '',
      item.endTime || '',
      item.overtimeHours ?? '',
      item.compensateType || '',
      item.status || '',
      (item.reason || '').replace(/[\r\n]+/g, ' '),
    ].map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','),
  );
  return new Blob([[header.join(','), ...lines].join('\n')], {
    type: 'text/csv;charset=utf-8',
  });
};

const appendMetaLine = (lines: string[], label: string, value?: string | number) => {
  if (value == null || value === '') {
    return;
  }
  lines.push(`【${label}】${value}`);
};

const encodeReason = (data: OvertimeRequest) => {
  const lines = [data.reason.trim()];
  appendMetaLine(lines, META_LABELS.workContent, data.workContent?.trim());
  appendMetaLine(lines, META_LABELS.expectedOutput, data.expectedOutput?.trim());
  appendMetaLine(lines, META_LABELS.needMeal, data.needMeal ?? 0);
  appendMetaLine(lines, META_LABELS.workLocation, data.workLocation || 'OFFICE');
  appendMetaLine(lines, META_LABELS.attachmentUrl, data.attachmentUrl?.trim());
  return lines.filter(Boolean).join('\n');
};

const decodeReason = (reason?: string | null) => {
  const lines = (reason || '').split(/\r?\n/);
  const body: string[] = [];
  const meta: Record<string, string> = {};

  lines.forEach((line) => {
    const matched = line.match(/^【(.+?)】(.*)$/);
    if (!matched) {
      body.push(line);
      return;
    }

    const [, label, value] = matched;
    const metaKey = Object.entries(META_LABELS).find(([, labelText]) => labelText === label)?.[0];
    if (metaKey) {
      meta[metaKey] = value;
      return;
    }
    body.push(line);
  });

  return {
    reason: body.join('\n').trim(),
    workContent: meta.workContent || '',
    expectedOutput: meta.expectedOutput || '',
    needMeal: Number(meta.needMeal ?? 0),
    workLocation: meta.workLocation || 'OFFICE',
    attachmentUrl: meta.attachmentUrl || '',
  };
};

const mapStatus = (status?: string) => {
  if (status === 'APPROVING') {
    return 'PENDING';
  }
  return status || 'DRAFT';
};

const mapCompensateTypeToHr = (value?: string) => {
  return value === 'SALARY' ? 'PAYMENT' : 'TIME_OFF';
};

const mapCompensateTypeFromHr = (value?: string) => {
  return value === 'PAYMENT' ? 'SALARY' : 'LEAVE';
};

const normalizeOptionalFilter = (value?: string) => {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
};

const mapHrOvertimeToLegacy = (item: {
  id: number;
  applicationNo: string;
  employeeName?: string;
  startTime: string;
  endTime: string;
  duration: number;
  overtimeType: string;
  reason?: string | null;
  compensationType: string;
  status: string;
  createTime?: string;
}) => {
  const detail = decodeReason(item.reason);
  return {
    id: item.id,
    userName: item.employeeName,
    overtimeNo: item.applicationNo,
    overtimeType: item.overtimeType,
    startTime: item.startTime,
    endTime: item.endTime,
    overtimeHours: Number(item.duration || 0),
    compensateType: mapCompensateTypeFromHr(item.compensationType),
    reason: detail.reason,
    workContent: detail.workContent,
    expectedOutput: detail.expectedOutput,
    needMeal: detail.needMeal,
    workLocation: detail.workLocation,
    attachmentUrl: detail.attachmentUrl,
    status: mapStatus(item.status),
    createTime: item.createTime,
  } satisfies OvertimeRequest;
};

/** 加班申请 API */
export const overtimeApi = {
  list: async (params: { pageNum?: number; pageSize?: number; status?: string; overtimeType?: string }) => {
    const employeeId = await resolveCurrentEmployeeId();
    const list = await listHrOvertimeApplications({
      employeeId,
      status: normalizeOptionalFilter(params.status) === 'PENDING' ? 'APPROVING' : normalizeOptionalFilter(params.status),
      overtimeType: normalizeOptionalFilter(params.overtimeType),
      pageNum: params.pageNum,
      pageSize: params.pageSize,
    });
    const records = list.map(mapHrOvertimeToLegacy);
    return {
      total: records.length,
      rows: records,
      records,
    } as PageResult<OvertimeRequest>;
  },

  export: async (params: { pageNum?: number; pageSize?: number; status?: string; overtimeType?: string }) => {
    const page = await overtimeApi.list({
      ...params,
      pageNum: params.pageNum ?? 1,
      pageSize: params.pageSize ?? 500,
    });
    return buildCsvBlob(page.records || page.rows || []);
  },

  getInfo: async (id: number) => {
    const detail = await getHrOvertimeApplication(id);
    return mapHrOvertimeToLegacy(detail);
  },

  add: async (data: OvertimeRequest) => {
    const employee = await assertCurrentEmployeeCanStartSelfService('新增加班申请', data.userId);
    const id = await createHrOvertimeApplication({
      employeeId: employee.id,
      startTime: data.startTime,
      endTime: data.endTime,
      overtimeType: data.overtimeType,
      reason: encodeReason(data),
      compensationType: mapCompensateTypeToHr(data.compensateType),
    });
    return { id };
  },

  edit: async (data: OvertimeRequest) => {
    if (!data.id) {
      throw new Error('缺少加班申请ID');
    }
    const employee = await assertCurrentEmployeeCanStartSelfService('编辑加班申请', data.userId);
    await updateHrOvertimeApplication(data.id, {
      employeeId: employee.id,
      startTime: data.startTime,
      endTime: data.endTime,
      overtimeType: data.overtimeType,
      reason: encodeReason(data),
      compensationType: mapCompensateTypeToHr(data.compensateType),
    });
    return true;
  },

  remove: async (ids: number[]) => {
    await Promise.all(ids.map((id) => deleteHrOvertimeApplication(id)));
    return true;
  },

  submit: async (id: number) => {
    await assertCurrentEmployeeCanStartSelfService('提交加班申请');
    return submitHrOvertimeApplication(id);
  },

  cancel: async (id: number) => {
    await deleteHrOvertimeApplication(id);
    return true;
  },
};
