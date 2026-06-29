import request from '@/services/api/request';
import { withList } from './internals';
import type {
  EmergencyContact,
  EmergencyContactPayload,
  EmergencyContactUpdatePayload,
  EmployeeBrief,
  HrEmployee,
  HrEmployeePayload,
  HrPageQuery,
} from './types';

export const listEmployees = async (params?: HrPageQuery) =>
  withList(await request.get<HrEmployee[]>('/hr/employees', { params }));

/**
 * 选择器专用：拉取员工精简列表（默认拉一页 size=999 客户端搜索）
 * 仅返回 id/name/employeeNo/dept/post/position/status 等用于展示与筛选的字段
 */
export const listEmployeesForSelect = async (
  params?: { onlyActive?: boolean } & HrPageQuery,
): Promise<EmployeeBrief[]> => {
  const { onlyActive = true, ...rest } = params || {};
  const list = await request.get<HrEmployee[]>('/hr/employees', {
    params: { pageNum: 1, pageSize: 999, ...rest },
  });
  const arr = withList(list);
  return arr
    .filter((e) => !onlyActive || (e.employeeStatus ?? '') !== 'RESIGNED')
    .map((e) => ({
      id: e.id,
      name: e.name,
      employeeNo: e.employeeNo,
      deptId: e.deptId ?? undefined,
      deptName: e.deptName ?? undefined,
      postName: e.postName ?? undefined,
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
