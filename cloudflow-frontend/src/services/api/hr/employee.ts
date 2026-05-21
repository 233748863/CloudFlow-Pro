import request from '@/services/api/request';
import type {
  EmergencyContact,
  EmergencyContactPayload,
  EmergencyContactUpdatePayload,
  HrEmployee,
  HrEmployeePayload,
  HrPageQuery,
} from './types';

export const listEmployees = (params?: HrPageQuery) =>
  request.get<HrEmployee[]>('/hr/employees', { params });

export const getCurrentHrEmployee = () =>
  request.get<HrEmployee>('/hr/employees/current');

export const getEmployeeDetail = (id: number) =>
  request.get<HrEmployee>(`/hr/employees/${id}`);

export const createEmployee = (data: HrEmployeePayload) =>
  request.post<number>('/hr/employees', data);

export const updateEmployee = (id: number, data: Partial<HrEmployeePayload>) =>
  request.put<void>(`/hr/employees/${id}`, data);

export const listEmergencyContacts = (employeeId: number) =>
  request.get<EmergencyContact[]>(`/hr/employees/${employeeId}/emergency-contacts`);

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
