import request from './request';
import {
  assertCurrentEmployeeCanStartSelfService,
  createHrScheduleRule,
  createHrShift,
  getHrAttendanceMonthly,
  getEffectiveAttendanceRule,
  hrCheckIn,
  hrCheckOut,
  listHrAttendanceRecords,
  listHrScheduleRules,
  listHrShifts,
  resolveCurrentEmployeeId,
  updateHrScheduleRule,
  updateHrShift,
} from './hr';

// ================= 考勤管理 =================

export interface AttendanceRecord {
  recordId?: number;
  userId?: number;
  type: '1' | '2';
  checkTime?: string;
  location?: string;
  address?: string;
  deviceInfo?: string;
  wifiInfo?: string;
  status?: string;
  remark?: string;
}

export interface AttendanceRule {
  ruleId?: number;
  ruleName: string;
  checkInTime: string;
  checkOutTime: string;
  elasticMinutes: number;
  workDays?: string;
  lunchBreakStart?: string;
  lunchBreakEnd?: string;
  overtimeEnabled?: number;
  overtimeMinMinutes?: number;
  lateToleranceCount?: number;
  severeLateMinutes?: number;
  absentMinutes?: number;
  photoRequired?: number;
  enabled?: number;
  locationPoints?: string;
  wifiConfigs?: string;
  radius?: number;
  remark?: string;
}

export interface AttendanceStatistics {
  month: string;
  userId: number;
  totalDays: number;
  normalCount: number;
  lateCount: number;
  earlyCount: number;
  outsideCount: number;
  absentCount: number;
  severeLateCount: number;
  totalRecords: number;
}

const DEFAULT_WORK_DAYS = [1, 2, 3, 4, 5];

const normalizeTime = (value?: string | null, fallback = '00:00:00') => {
  const source = (value || fallback).trim();
  if (/^\d{2}:\d{2}$/.test(source)) {
    return `${source}:00`;
  }
  return source || fallback;
};

const parseJsonSafely = <T>(value?: string | null): T | null => {
  if (!value) {
    return null;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
};

const normalizeJsonField = (value?: string) => {
  if (!value) {
    return undefined;
  }
  const parsed = parseJsonSafely<unknown>(value);
  return parsed ?? value;
};

const stringifyConfigField = (value?: unknown) => {
  if (value == null || value === '') {
    return '';
  }
  return typeof value === 'string' ? value : JSON.stringify(value);
};

const parseCoordinates = (location?: string) => {
  if (!location) {
    return {};
  }
  const [latitudeText, longitudeText] = location.split(',').map((item) => item.trim());
  const latitude = Number(latitudeText);
  const longitude = Number(longitudeText);
  return {
    latitude: Number.isFinite(latitude) ? latitude : undefined,
    longitude: Number.isFinite(longitude) ? longitude : undefined,
  };
};

const mapHrRuleToAttendanceRule = async () => {
  const [effectiveRule, rules, shifts] = await Promise.all([
    getEffectiveAttendanceRule().catch(() => null),
    listHrScheduleRules(),
    listHrShifts(),
  ]);
  const targetRule =
    (effectiveRule?.ruleId ? rules.find((rule) => rule.id === effectiveRule.ruleId) : null) ??
    rules.find((rule) => rule.status === 1 && rule.ruleType === 'FIXED') ??
    rules.find((rule) => rule.status === 1) ??
    rules[0];

  if (!targetRule) {
    return null;
  }

  const ruleConfig = parseJsonSafely<Record<string, unknown>>(targetRule.ruleConfig) ?? {};
  const shiftId = Number(effectiveRule?.shiftId ?? ruleConfig.shiftId);
  const shift = shifts.find((item) => item.id === shiftId);
  const workDays = Array.isArray(ruleConfig.workDays) ? ruleConfig.workDays : DEFAULT_WORK_DAYS;

  return {
    ruleId: targetRule.id,
    ruleName: targetRule.ruleName,
    checkInTime: normalizeTime(effectiveRule?.checkInTime || shift?.startTime || (ruleConfig.checkInTime as string | undefined), '09:00:00'),
    checkOutTime: normalizeTime(effectiveRule?.checkOutTime || shift?.endTime || (ruleConfig.checkOutTime as string | undefined), '18:00:00'),
    elasticMinutes: effectiveRule?.lateThreshold ?? shift?.lateThreshold ?? Number(ruleConfig.elasticMinutes ?? 15),
    workDays: JSON.stringify(workDays),
    lunchBreakStart: normalizeTime(ruleConfig.lunchBreakStart as string | undefined, '12:00:00'),
    lunchBreakEnd: normalizeTime(ruleConfig.lunchBreakEnd as string | undefined, '13:00:00'),
    overtimeEnabled: (effectiveRule?.overtimeEnabled ?? ruleConfig.overtimeEnabled) ? 1 : 0,
    overtimeMinMinutes: Number(effectiveRule?.overtimeMinMinutes ?? ruleConfig.overtimeMinMinutes ?? 30),
    lateToleranceCount: Number(ruleConfig.lateToleranceCount ?? 0),
    severeLateMinutes: Number(effectiveRule?.severeLateMinutes ?? ruleConfig.severeLateMinutes ?? 60),
    absentMinutes: Number(effectiveRule?.absentMinutes ?? ruleConfig.absentMinutes ?? 240),
    photoRequired: (effectiveRule?.photoRequired ?? ruleConfig.photoRequired) ? 1 : 0,
    enabled: targetRule.status ?? 1,
    locationPoints: stringifyConfigField(ruleConfig.locationPoints),
    wifiConfigs: stringifyConfigField(ruleConfig.wifiConfigs),
    radius: Number(effectiveRule?.radius ?? ruleConfig.radius ?? 200),
    remark: targetRule.description || (ruleConfig.remark as string | undefined) || '',
  } satisfies AttendanceRule;
};

const ensureShift = async (data: AttendanceRule, currentShiftId?: number) => {
  const shifts = await listHrShifts();
  const selectedShift =
    shifts.find((item) => item.id === currentShiftId) ??
    shifts.find((item) => item.shiftCode === 'STANDARD') ??
    shifts[0];

  const shiftPayload = {
    shiftName: data.ruleName || '标准班次',
    startTime: normalizeTime(data.checkInTime),
    endTime: normalizeTime(data.checkOutTime),
    breakMinutes: 60,
    lateThreshold: data.elasticMinutes ?? 15,
    earlyThreshold: data.elasticMinutes ?? 15,
    color: '#1890ff',
    status: data.enabled ?? 1,
  };

  if (selectedShift) {
    await updateHrShift(selectedShift.id, shiftPayload);
    return selectedShift.id;
  }

  return createHrShift({
    shiftCode: `ATT_${Date.now()}`,
    ...shiftPayload,
  });
};

// 打卡
export const checkIn = async (data: AttendanceRecord) => {
  const employee = await assertCurrentEmployeeCanStartSelfService('考勤打卡', data.userId);
  const { latitude, longitude } = parseCoordinates(data.location);
  const payload = {
    employeeId: employee.id,
    checkMethod: 'GPS' as const,
    location: data.address || data.location,
    latitude,
    longitude,
    remark: data.remark || data.deviceInfo || '',
  };

  if (data.type === '1') {
    await hrCheckIn(payload);
  } else {
    await hrCheckOut(payload);
  }
  return true;
};

// 获取当前规则
export const getAttendanceRule = () => mapHrRuleToAttendanceRule();

// 保存/更新考勤规则
export const saveAttendanceRule = async (data: AttendanceRule) => {
  const rules = await listHrScheduleRules();
  const currentRule =
    rules.find((item) => item.id === data.ruleId) ??
    rules.find((item) => item.ruleType === 'FIXED') ??
    rules[0];
  const currentConfig = parseJsonSafely<Record<string, unknown>>(currentRule?.ruleConfig) ?? {};
  const currentShiftId = Number(currentConfig.shiftId);
  const shiftId = await ensureShift(data, Number.isFinite(currentShiftId) ? currentShiftId : undefined);

  const ruleConfig = JSON.stringify({
    ...currentConfig,
    shiftId,
    workDays: parseJsonSafely<number[]>(data.workDays) ?? DEFAULT_WORK_DAYS,
    lunchBreakStart: normalizeTime(data.lunchBreakStart, '12:00:00'),
    lunchBreakEnd: normalizeTime(data.lunchBreakEnd, '13:00:00'),
    overtimeEnabled: data.overtimeEnabled === 1,
    overtimeMinMinutes: data.overtimeMinMinutes ?? 30,
    lateToleranceCount: data.lateToleranceCount ?? 0,
    severeLateMinutes: data.severeLateMinutes ?? 60,
    absentMinutes: data.absentMinutes ?? 240,
    photoRequired: data.photoRequired === 1,
    locationPoints: normalizeJsonField(data.locationPoints),
    wifiConfigs: normalizeJsonField(data.wifiConfigs),
    radius: data.radius ?? 200,
    remark: data.remark ?? '',
  });

  const rulePayload = {
    ruleName: data.ruleName,
    ruleType: 'FIXED',
    ruleConfig,
    description: data.remark ?? '',
    status: data.enabled ?? 1,
  };

  if (currentRule) {
    await updateHrScheduleRule(currentRule.id, rulePayload);
  } else {
    await createHrScheduleRule(rulePayload);
  }
  return true;
};

// 获取考勤记录列表
export const getAttendanceRecords = async (params: {
  userId?: number;
  startDate?: string;
  endDate?: string;
  pageNum?: number;
  pageSize?: number;
}) => {
  const employeeId = await resolveCurrentEmployeeId(params.userId);
  const records = await listHrAttendanceRecords({
    employeeId,
    startDate: params.startDate,
    endDate: params.endDate,
    pageNum: params.pageNum,
    pageSize: params.pageSize,
  });

  return records.map((record) => ({
    recordId: record.id,
    userId: params.userId,
    type: record.checkType === 'CHECK_OUT' ? '2' : '1',
    checkTime: record.checkTime,
    location: record.location || undefined,
    status: record.status,
    remark: record.remark || undefined,
  })) as AttendanceRecord[];
};

// 获取月度考勤统计
export const getAttendanceStatistics = async (params: {
  userId?: number;
  month: string;
}) => {
  const employeeId = await resolveCurrentEmployeeId(params.userId);
  const [yearText, monthText] = params.month.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const summary = await getHrAttendanceMonthly(employeeId, year, month);
  const actualDays = summary.actualDays ?? 0;
  const lateTimes = summary.lateTimes ?? 0;
  const earlyTimes = summary.earlyTimes ?? 0;

  return {
    month: params.month,
    userId: params.userId ?? employeeId,
    totalDays: summary.workDays ?? 0,
    normalCount: Math.max(actualDays - lateTimes - earlyTimes, 0),
    lateCount: lateTimes,
    earlyCount: earlyTimes,
    outsideCount: 0,
    absentCount: summary.absentDays ?? 0,
    severeLateCount: 0,
    totalRecords: actualDays * 2,
  } satisfies AttendanceStatistics;
};

// ================= 资产管理 =================

export interface Asset {
  assetId?: number;
  assetCode?: string;
  name: string;
  category?: string;
  model?: string;
  status?: string;
  price?: number;
  purchaseDate?: string;
  ownerId?: number;
  location?: string;
  remark?: string;
  createBy?: string;
  createTime?: string;
}

export interface AssetLog {
  logId?: number;
  refId?: number;
  refType?: string;
  type?: string;
  quantityChange?: number;
  operatorId?: number;
  targetId?: number;
  remark?: string;
  createTime?: string;
}

export interface AssetQueryParams {
  pageNum?: number;
  pageSize?: number;
  name?: string;
  assetCode?: string;
  category?: string;
  status?: string;
}

export interface AssetStatistics {
  total: number;
  statusCount: {
    idle: number;
    inUse: number;
    repair: number;
    scrapped: number;
  };
  categoryCount: Record<string, number>;
  totalValue: number;
  categoryValue: Record<string, number>;
}

export const getAssetList = (params?: AssetQueryParams) => {
  return request.get('/oa/asset/list', { params });
};

export const getAssetDetail = (id: number) => {
  return request.get<Asset>(`/oa/asset/${id}`);
};

export const addAsset = (data: Asset) => {
  return request.post<boolean>('/oa/asset', data);
};

export const updateAsset = (data: Asset) => {
  return request.put<boolean>('/oa/asset', data);
};

export const deleteAsset = (id: number) => {
  return request.delete<boolean>(`/oa/asset/${id}`);
};

export const borrowAsset = (id: number, userId: number) => {
  return request.post(`/oa/asset/${id}/borrow`, null, { params: { userId } });
};

export const returnAsset = (id: number) => {
  return request.post(`/oa/asset/${id}/return`);
};

export const repairAsset = (id: number, remark?: string) => {
  return request.post(`/oa/asset/${id}/repair`, null, { params: { remark } });
};

export const scrapAsset = (id: number, remark?: string) => {
  return request.post(`/oa/asset/${id}/scrap`, null, { params: { remark } });
};

export const getAssetLogs = (id: number) => {
  return request.get<AssetLog[]>(`/oa/asset/${id}/logs`);
};

export const getAssetStatistics = () => {
  return request.get<AssetStatistics>('/oa/asset/statistics');
};

export const getAssetCategories = () => {
  return request.get<string[]>('/oa/asset/categories');
};

export const getAssetQrCodeBlob = (id: number) => {
  return request.get<Blob>(`/oa/asset/${id}/qrcode`, {
    responseType: 'blob',
    silent: true,
  });
};
