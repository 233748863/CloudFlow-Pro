import request from '@/services/api/request';
import { withList } from './internals';
import type {
  EmergencyContact,
  EmergencyContactPayload,
  EmergencyContactUpdatePayload,
  EmployeeBrief,
  HrEmployee,
  HrEmployeeOnboardingResult,
  HrEmployeePayload,
  HrPagedResult,
  HrPageQuery,
} from './types';

export const pageEmployees = (params?: HrPageQuery) =>
  request.get<HrPagedResult<HrEmployee>>('/hr/employees', { params });

export const listEmployees = async (params?: HrPageQuery) => {
  const hasExplicitPage = params?.pageNum != null || params?.pageSize != null;
  const firstPage = await pageEmployees({ pageNum: 1, pageSize: 500, ...params });
  const firstRows = withList(firstPage);

  if (hasExplicitPage || firstRows.length >= (firstPage.total || 0)) {
    return firstRows;
  }

  const pageSize = firstPage.pageSize || firstPage.size || 500;
  const totalPages = Math.ceil((firstPage.total || 0) / pageSize);
  const restPages = await Promise.all(
    Array.from({ length: Math.max(0, totalPages - 1) }, (_, index) =>
      pageEmployees({ ...params, pageNum: index + 2, pageSize }),
    ),
  );
  return firstRows.concat(restPages.flatMap((page) => withList(page)));
};

/**
 * 选择器专用：拉取员工精简列表（默认按后端单页上限拉一页）
 * 仅返回 id/name/employeeNo/dept/post/position/status 等用于展示与筛选的字段
 */
export const listEmployeesForSelect = async (
  params?: { onlyActive?: boolean } & HrPageQuery,
): Promise<EmployeeBrief[]> => {
  const { onlyActive = true, ...rest } = params || {};
  const arr = await listEmployees({ pageNum: 1, pageSize: 500, ...rest });
  return arr
    .filter((e) => !onlyActive || (e.employeeStatus ?? '') !== 'RESIGNED')
    .map((e) => ({
      id: e.id,
      name: e.name,
      employeeNo: e.employeeNo,
      deptId: e.deptId ?? undefined,
      deptName: e.deptName ?? undefined,
      postId: e.postId ?? undefined,
      postName: e.postName ?? undefined,
      positionId: e.positionId ?? undefined,
      positionName: e.positionName ?? undefined,
      employeeStatus: e.employeeStatus,
    }));
};

export const getCurrentHrEmployee = () =>
  request.get<HrEmployee>('/hr/employees/current');

export const getEmployeeDetail = (id: number) =>
  request.get<HrEmployee>(`/hr/employees/${id}`);

export const createEmployee = (data: HrEmployeePayload) =>
  request.post<number>('/hr/employees', data);

export const createEmployeeOnboardingRequest = (data: HrEmployeePayload) =>
  request.post<HrEmployeeOnboardingResult>('/hr/employees/onboarding-requests', data);

export const updateEmployee = (id: number, data: Partial<HrEmployeePayload>) =>
  request.put<void>(`/hr/employees/${id}`, data);

export const listEmergencyContacts = async (employeeId: number) =>
  withList(await request.get<EmergencyContact[]>(`/hr/employees/${employeeId}/emergency-contacts`));

export const getEmergencyContact = async (id: number) => {
  const employees = await listEmployees();
  const lists = await Promise.all(employees.map((employee) => listEmergencyContacts(employee.id).catch(() => [])));
  return lists.flat().find((item) => item.id === id) as EmergencyContact;
};

export const createEmergencyContact = (data: EmergencyContactPayload) =>
  request.post<number>('/hr/employees/emergency-contacts', data);

export const updateEmergencyContact = (id: number, data: EmergencyContactUpdatePayload) =>
  request.put<void>(`/hr/employees/emergency-contacts/${id}`, data);

export const deleteEmergencyContact = (id: number) =>
  request.delete<void>(`/hr/employees/emergency-contacts/${id}`);
