import {
  assertCurrentEmployeeCanStartSelfService,
  createHrAttendanceSupplement,
  deleteHrAttendanceSupplement,
  getHrAttendanceSupplement,
  listHrAttendanceSupplements,
  resolveCurrentEmployeeId,
  submitHrAttendanceSupplement,
  updateHrAttendanceSupplement,
} from './hr';
import { PageResult } from '@/types';

/** 补卡/外勤申请接口类型 */
export interface AttendanceAppeal {
  id?: number;
  tenantId?: number;
  instanceId?: string;
  userId?: number;
  userName?: string;
  appealNo?: string;
  appealType: string;
  appealDate: string;
  appealTime?: string;
  checkType?: string;
  originalRecordId?: number;
  originalStatus?: string;
  witnessName?: string;
  location?: string;
  address?: string;
  reason: string;
  attachmentUrl?: string;
  status?: string;
  deptId?: number;
  deptName?: string;
  createTime?: string;
}

const META_LABELS = {
  appealType: '申请类型',
  originalStatus: '原始状态',
  witnessName: '证明人',
  location: '位置坐标',
  address: '外勤地址',
  attachmentUrl: '附件',
} as const;

const buildCsvBlob = (rows: AttendanceAppeal[]) => {
  const header = ['单号', '类型', '日期', '时间', '打卡类型', '状态', '原因'];
  const lines = rows.map((item) =>
    [
      item.appealNo || '',
      item.appealType || '',
      item.appealDate || '',
      item.appealTime || '',
      item.checkType || '',
      item.status || '',
      (item.reason || '').replace(/[\r\n]+/g, ' '),
    ].map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','),
  );
  return new Blob([[header.join(','), ...lines].join('\n')], {
    type: 'text/csv;charset=utf-8',
  });
};

const mapStatus = (status?: string) => {
  switch (status) {
    case 'MISSING':
      return 'DRAFT';
    case 'APPROVING':
      return 'PENDING';
    case 'SUPPLEMENT':
      return 'APPROVED';
    default:
      return status || 'DRAFT';
  }
};

const mapCheckTypeToHr = (checkType?: string) => (checkType === '2' ? 'CHECK_OUT' : 'CHECK_IN');
const mapCheckTypeFromHr = (checkType?: string) => (checkType === 'CHECK_OUT' ? '2' : '1');

const appendMetaLine = (lines: string[], label: string, value?: string | number) => {
  if (value == null || value === '') {
    return;
  }
  lines.push(`【${label}】${value}`);
};

const encodeReason = (data: AttendanceAppeal) => {
  const lines = [data.reason.trim()];
  appendMetaLine(lines, META_LABELS.appealType, data.appealType || 'MAKEUP');
  appendMetaLine(lines, META_LABELS.originalStatus, data.originalStatus);
  appendMetaLine(lines, META_LABELS.witnessName, data.witnessName?.trim());
  appendMetaLine(lines, META_LABELS.location, data.location?.trim());
  appendMetaLine(lines, META_LABELS.address, data.address?.trim());
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
    appealType: meta.appealType || 'MAKEUP',
    originalStatus: meta.originalStatus || '',
    witnessName: meta.witnessName || '',
    location: meta.location || '',
    address: meta.address || '',
    attachmentUrl: meta.attachmentUrl || '',
  };
};

const mapHrSupplementToLegacy = (item: {
  id: number;
  employeeName?: string;
  attendanceDate: string;
  checkTime: string;
  checkType: string;
  status: string;
  location?: string | null;
  remark?: string | null;
  createTime?: string;
}) => {
  const detail = decodeReason(item.remark);
  return {
    id: item.id,
    userName: item.employeeName,
    appealNo: `BK${String(item.id).padStart(6, '0')}`,
    appealType: detail.appealType,
    appealDate: item.attendanceDate,
    appealTime: item.checkTime?.slice(11, 19) || '',
    checkType: mapCheckTypeFromHr(item.checkType),
    originalStatus: detail.originalStatus,
    witnessName: detail.witnessName,
    location: detail.location || item.location || '',
    address: detail.address,
    reason: detail.reason,
    attachmentUrl: detail.attachmentUrl,
    status: mapStatus(item.status),
    createTime: item.createTime,
  } satisfies AttendanceAppeal;
};

const toSupplementTime = (data: AttendanceAppeal) => {
  const timePart = data.appealTime || (data.appealType === 'FIELD' ? '09:00:00' : '09:00:00');
  return `${data.appealDate} ${timePart}`;
};

const normalizeOptionalFilter = (value?: string) => {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
};

/** 补卡/外勤申请 API */
export const attendanceAppealApi = {
  list: async (params: { pageNum?: number; pageSize?: number; status?: string; appealType?: string }) => {
    const employeeId = await resolveCurrentEmployeeId();
    const list = await listHrAttendanceSupplements({
      employeeId,
      status:
        normalizeOptionalFilter(params.status) === 'DRAFT'
          ? 'MISSING'
          : normalizeOptionalFilter(params.status) === 'PENDING'
            ? 'APPROVING'
            : normalizeOptionalFilter(params.status) === 'APPROVED'
              ? 'SUPPLEMENT'
              : normalizeOptionalFilter(params.status),
      pageNum: params.pageNum,
      pageSize: params.pageSize,
    });

    const records = list
      .map(mapHrSupplementToLegacy)
      .filter((item) => {
        const appealType = normalizeOptionalFilter(params.appealType);
        return !appealType || item.appealType === appealType;
      });

    return {
      total: records.length,
      rows: records,
      records,
    } as PageResult<AttendanceAppeal>;
  },

  export: async (params: { pageNum?: number; pageSize?: number; status?: string; appealType?: string }) => {
    const page = await attendanceAppealApi.list({
      ...params,
      pageNum: params.pageNum ?? 1,
      pageSize: params.pageSize ?? 500,
    });
    return buildCsvBlob(page.records || page.rows || []);
  },

  getInfo: async (id: number) => {
    const detail = await getHrAttendanceSupplement(id);
    return mapHrSupplementToLegacy(detail);
  },

  add: async (data: AttendanceAppeal) => {
    const employee = await assertCurrentEmployeeCanStartSelfService('新增补卡或外勤申请', data.userId);
    const id = await createHrAttendanceSupplement({
      employeeId: employee.id,
      attendanceDate: data.appealDate,
      checkType: mapCheckTypeToHr(data.checkType),
      checkTime: toSupplementTime(data),
      reason: encodeReason(data),
    });
    return { id };
  },

  edit: async (data: AttendanceAppeal) => {
    if (!data.id) {
      throw new Error('缺少补卡申请ID');
    }
    const employee = await assertCurrentEmployeeCanStartSelfService('编辑补卡或外勤申请', data.userId);
    await updateHrAttendanceSupplement(data.id, {
      employeeId: employee.id,
      attendanceDate: data.appealDate,
      checkType: mapCheckTypeToHr(data.checkType),
      checkTime: toSupplementTime(data),
      reason: encodeReason(data),
    });
    return true;
  },

  remove: async (ids: number[]) => {
    await Promise.all(ids.map((id) => deleteHrAttendanceSupplement(id)));
    return true;
  },

  submit: async (id: number) => {
    await assertCurrentEmployeeCanStartSelfService('提交补卡或外勤申请');
    return submitHrAttendanceSupplement(id);
  },

  cancel: async (id: number) => {
    await deleteHrAttendanceSupplement(id);
    return true;
  },
};
