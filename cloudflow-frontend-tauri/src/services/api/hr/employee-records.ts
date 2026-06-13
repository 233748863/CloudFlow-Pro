import request from '@/services/api/request';
import { getAttachmentRawValue, normalizeAttachmentUrls } from '@/utils/attachment';
import { listEmployees } from './employee';
import { normalizeJsonArray, normalizeStringArray } from './internals';
import type {
  EmployeeContract,
  EmployeeContractPayload,
  EmployeeDocument,
  EmployeeDocumentPayload,
  Headcount,
  HeadcountPayload,
  HeadcountStatistics,
  HrRecord,
} from './types';

const normalizeEmployeeContract = (item: EmployeeContract): EmployeeContract => ({
  ...item,
  attachmentUrls: normalizeAttachmentUrls(item.attachmentUrls),
});

const normalizeEmployeeDocument = (item: EmployeeDocument): EmployeeDocument => ({
  ...item,
  attachmentUrls: normalizeAttachmentUrls(item.attachmentUrls),
});

export const listEmployeeContracts = async (employeeId: number) =>
  (await request.get<EmployeeContract[]>(`/hr/employees/${employeeId}/contracts`)).map(normalizeEmployeeContract);
export const getEmployeeContract = async (id: number) => {
  const employees = await listEmployees();
  const lists = await Promise.all(employees.map((employee) => listEmployeeContracts(employee.id).catch(() => [])));
  return lists.flat().find((item) => item.id === id) as EmployeeContract;
};
export const createEmployeeContract = (data: EmployeeContractPayload) =>
  request.post<number>('/hr/employees/contracts', {
    ...data,
    attachmentUrls: normalizeJsonArray(normalizeStringArray(data.attachmentUrls).map((item) => getAttachmentRawValue(item))),
  });
export const updateEmployeeContract = (id: number, data: Partial<EmployeeContractPayload>) =>
  request.put<void>(`/hr/employees/contracts/${id}`, {
    ...data,
    attachmentUrls: normalizeJsonArray(normalizeStringArray(data.attachmentUrls).map((item) => getAttachmentRawValue(item))),
  });
export const deleteEmployeeContract = (id: number) =>
  request.delete<void>(`/hr/employees/contracts/${id}`);

export const listEmployeeDocuments = async (employeeId: number) =>
  (await request.get<EmployeeDocument[]>(`/hr/employees/${employeeId}/documents`)).map(normalizeEmployeeDocument);
export const getEmployeeDocument = async (id: number) => {
  const employees = await listEmployees();
  const lists = await Promise.all(employees.map((employee) => listEmployeeDocuments(employee.id).catch(() => [])));
  return lists.flat().find((item) => item.id === id) as EmployeeDocument;
};
export const createEmployeeDocument = (data: EmployeeDocumentPayload) =>
  request.post<number>('/hr/employees/documents', {
    ...data,
    attachmentUrls: normalizeJsonArray(normalizeStringArray(data.attachmentUrls).map((item) => getAttachmentRawValue(item))),
  });
export const updateEmployeeDocument = (id: number, data: Partial<EmployeeDocumentPayload>) =>
  request.put<void>(`/hr/employees/documents/${id}`, {
    ...data,
    attachmentUrls: normalizeJsonArray(normalizeStringArray(data.attachmentUrls).map((item) => getAttachmentRawValue(item))),
  });
export const deleteEmployeeDocument = (id: number) =>
  request.delete<void>(`/hr/employees/documents/${id}`);

export const listHeadcounts = (params?: HrRecord) =>
  request.get<Headcount[]>('/hr/organization/headcounts', { params });
export const setHeadcount = (data: HeadcountPayload) =>
  data.id
    ? request.put<void>(`/hr/organization/headcounts/${data.id}`, { ...data, vacancyCount: Number(data.approvedCount || 0) - Number(data.actualCount || 0) })
    : request.post<void>('/hr/organization/headcounts', { ...data, vacancyCount: Number(data.approvedCount || 0) - Number(data.actualCount || 0) });
export const getHeadcountStatistics = async (targetType: string, targetId: number) => {
  const rows = await listHeadcounts({ targetType, targetId });
  const item = rows[0];
  return item ? request.get<HeadcountStatistics>(`/hr/organization/headcounts/${item.id}/statistics`) : ({} as HeadcountStatistics);
};
export const updateHeadcountActualCount = async (targetType: string, targetId: number, actualCount: number) => {
  const rows = await listHeadcounts({ targetType, targetId });
  const item = rows[0];
  if (item) {
    await request.put<void>(`/hr/organization/headcounts/${item.id}/actual-count`, undefined, { params: { actualCount } });
  }
};
