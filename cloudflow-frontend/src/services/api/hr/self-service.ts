import { getStoredAuthUser } from '@/utils/authStorage';
import { getCurrentHrEmployee, listEmployees } from './employee';
import type { HrEmployee } from './types';

const employeeResolverMap = new Map<string, Promise<HrEmployee>>();

const readStoredUser = (): Record<string, unknown> | null => {
  try {
    const raw = getStoredAuthUser();
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

const readStoredUserId = () => {
  const storedUser = readStoredUser();
  return storedUser?.id ?? storedUser?.userId ?? storedUser?.user_id;
};

const getCurrentUserId = (userId?: number | string) => {
  const value = userId ?? readStoredUserId();
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error('未找到当前登录用户');
  }
  return parsed;
};

const getEmployeeCacheKey = (userId?: number | string) => {
  const storedUser = readStoredUser();
  return `hr:employee:${storedUser?.tenantId ?? 'default'}:${getCurrentUserId(userId)}`;
};

const readCachedEmployee = (cacheKey: string) => {
  const cached = sessionStorage.getItem(cacheKey);
  if (!cached) return null;
  try {
    return JSON.parse(cached) as HrEmployee;
  } catch {
    sessionStorage.removeItem(cacheKey);
    return null;
  }
};

const storeResolvedEmployee = (cacheKey: string, employee: HrEmployee) => {
  sessionStorage.setItem(cacheKey, JSON.stringify(employee));
  return employee;
};

const isCurrentSignedInUser = (userId?: number | string) => {
  if (userId == null) return true;
  const storedUserId = Number(readStoredUserId());
  if (!Number.isFinite(storedUserId) || storedUserId <= 0) return false;
  return Number(userId) === storedUserId;
};

const resolveEmployeeByUserId = async (targetUserId: number) => {
  const employees = await listEmployees();
  const matched = employees.find((employee) => employee.userId === targetUserId);
  if (!matched) {
    throw new Error('当前登录用户未关联 HR 员工档案');
  }
  return matched;
};

export const resolveCurrentEmployee = async (userId?: number | string) => {
  const cacheKey = getEmployeeCacheKey(userId);
  const cached = readCachedEmployee(cacheKey);
  if (cached) return cached;

  if (!employeeResolverMap.has(cacheKey)) {
    const targetUserId = getCurrentUserId(userId);
    const promise = (async () => {
      if (isCurrentSignedInUser(userId)) {
        const employee = await getCurrentHrEmployee();
        return storeResolvedEmployee(cacheKey, employee);
      }
      return storeResolvedEmployee(cacheKey, await resolveEmployeeByUserId(targetUserId));
    })().finally(() => {
      employeeResolverMap.delete(cacheKey);
    });
    employeeResolverMap.set(cacheKey, promise);
  }

  return employeeResolverMap.get(cacheKey)!;
};

export const resolveCurrentEmployeeId = async (userId?: number | string) =>
  (await resolveCurrentEmployee(userId)).id;

const HR_SELF_SERVICE_BLOCKED_STATUSES = new Set(['RESIGNED']);

export const getHrEmployeeStatusLabel = (status?: string | null) => {
  switch (String(status || '').toUpperCase()) {
    case 'PENDING':
      return '待入职';
    case 'PROBATION':
      return '试用期';
    case 'REGULAR':
      return '正式员工';
    case 'RESIGNED':
      return '已离职';
    default:
      return status || '未知状态';
  }
};

export const isHrSelfServiceCreatableEmployee = (employee?: HrEmployee | null) =>
  !HR_SELF_SERVICE_BLOCKED_STATUSES.has(String(employee?.employeeStatus || '').toUpperCase());

export const getHrSelfServiceRestrictionMessage = (employee?: HrEmployee | null) => {
  if (!employee) return '当前登录用户未关联 HR 员工档案，暂时无法发起 HR 自助登记，请联系 HR 完成员工档案绑定。';
  if (isHrSelfServiceCreatableEmployee(employee)) return '';
  return `当前员工状态为“${getHrEmployeeStatusLabel(employee.employeeStatus)}”，不能再发起 HR 自助登记。`;
};

export const assertCurrentEmployeeCanStartSelfService = async (
  actionLabel: string,
  userId?: number | string,
) => {
  const employee = await resolveCurrentEmployee(userId);
  const restrictionMessage = getHrSelfServiceRestrictionMessage(employee);
  if (restrictionMessage) {
    throw new Error(`${restrictionMessage} 当前操作：${actionLabel}。`);
  }
  return employee;
};
