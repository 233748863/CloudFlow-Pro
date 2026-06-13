import request from './request';
import { PageResult } from '@/types';

export type BorrowStatus =
  | 'DRAFT'
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'BORROWED'
  | 'RETURNED'
  | 'OVERDUE'
  | 'CANCELLED';

export type ResourceStatus = 'AVAILABLE' | 'BORROWED' | 'DISABLED';

export interface OaSeal {
  sealId?: number;
  sealCode: string;
  sealName: string;
  sealType: string;
  sealNo?: string;
  issuer?: string;
  issueDate?: string;
  expireDate?: string;
  keeperId?: number;
  keeperName?: string;
  location?: string;
  attachmentUrl?: string;
  status?: ResourceStatus;
  borrowDueTime?: string;
  remark?: string;
  createTime?: string;
}

export interface OaSealApplication {
  id?: number;
  instanceId?: string;
  applicationNo?: string;
  contractId?: number;
  contractNo?: string;
  sealId: number;
  sealName?: string;
  userId?: number;
  userName?: string;
  deptId?: number;
  deptName?: string;
  documentName: string;
  useScene?: string;
  copyCount?: number;
  purpose: string;
  expectedBorrowTime?: string;
  expectedReturnTime: string;
  actualBorrowTime?: string;
  actualReturnTime?: string;
  handlerId?: number;
  handlerName?: string;
  attachmentUrl?: string;
  status?: BorrowStatus;
  createTime?: string;
}

export interface OaLicense {
  licenseId?: number;
  licenseCode: string;
  licenseName: string;
  licenseType: string;
  licenseNo?: string;
  issuer?: string;
  issueDate?: string;
  expireDate?: string;
  keeperId?: number;
  keeperName?: string;
  location?: string;
  attachmentUrl?: string;
  status?: ResourceStatus;
  remark?: string;
  createTime?: string;
}

export interface OaLicenseBorrow {
  id?: number;
  instanceId?: string;
  borrowNo?: string;
  licenseId: number;
  licenseName?: string;
  userId?: number;
  userName?: string;
  deptId?: number;
  deptName?: string;
  purpose: string;
  expectedBorrowTime?: string;
  expectedReturnTime: string;
  actualBorrowTime?: string;
  actualReturnTime?: string;
  handlerId?: number;
  handlerName?: string;
  attachmentUrl?: string;
  status?: BorrowStatus;
  createTime?: string;
}

export interface OaHandoverLog {
  id: number;
  actionType: 'BORROW' | 'RETURN';
  operatorName?: string;
  actionTime?: string;
  remark?: string;
  attachmentUrl?: string;
}

export interface OaReminderLog {
  id: number;
  reminderType: 'AUTO' | 'MANUAL';
  operatorName?: string;
  reminderContent?: string;
  reminderTime?: string;
}

export interface OaLicenseRenewal {
  id?: number;
  instanceId?: string;
  renewalNo?: string;
  licenseId: number;
  licenseName?: string;
  licenseNo?: string;
  oldIssueDate?: string;
  oldExpireDate?: string;
  newIssueDate?: string;
  newExpireDate: string;
  applicantId?: number;
  applicantName?: string;
  deptId?: number;
  deptName?: string;
  renewalReason: string;
  attachmentUrl?: string;
  status?: BorrowStatus;
  createTime?: string;
  updateTime?: string;
}

export interface OaSealRenewal {
  id?: number;
  instanceId?: string;
  renewalNo?: string;
  sealId: number;
  sealName?: string;
  sealNo?: string;
  oldIssueDate?: string;
  oldExpireDate?: string;
  newIssueDate?: string;
  newExpireDate: string;
  applicantId?: number;
  applicantName?: string;
  deptId?: number;
  deptName?: string;
  renewalReason: string;
  attachmentUrl?: string;
  status?: BorrowStatus;
  createTime?: string;
  updateTime?: string;
}

export interface OaSealExpiryReminderLog {
  id: number;
  sealId: number;
  sealName?: string;
  expireDate?: string;
  daysBefore?: number;
  recipientId?: number;
  recipientName?: string;
  reminderType: 'AUTO' | 'MANUAL';
  operatorName?: string;
  reminderContent?: string;
  reminderTime?: string;
}

export interface OaLicenseExpiryReminderLog {
  id: number;
  licenseId: number;
  licenseName?: string;
  expireDate?: string;
  daysBefore?: number;
  recipientId?: number;
  recipientName?: string;
  reminderType: 'AUTO' | 'MANUAL';
  operatorName?: string;
  reminderContent?: string;
  reminderTime?: string;
}

export interface BorrowManagementSummary {
  pendingBorrowCount: number;
  overdueCount: number;
  expiringLicenseCount: number;
  pendingSealApplications: OaSealApplication[];
  pendingLicenseBorrows: OaLicenseBorrow[];
  overdueSealApplications: OaSealApplication[];
  overdueLicenseBorrows: OaLicenseBorrow[];
  expiringLicenses: OaLicense[];
}

export interface BorrowTrendItem {
  date: string;
  sealCount: number;
  licenseCount: number;
}

export interface BorrowResourceUsageItem {
  businessType: string;
  resourceId?: number;
  resourceName?: string;
  count: number;
}

export interface BorrowManagementStats {
  pendingBorrowCount: number;
  borrowedCount: number;
  overdueCount: number;
  expiringLicenseCount: number;
  contractUnsealedRiskCount: number;
  overdueReturnRiskCount: number;
  unarchivedRiskCount: number;
  trend: BorrowTrendItem[];
  resourceUsage: BorrowResourceUsageItem[];
}

export const sealApi = {
  list: (params: { pageNum?: number; pageSize?: number; sealName?: string; sealCode?: string; sealNo?: string; sealType?: string; status?: string }) =>
    request.get('/oa/seal/list', { params }) as Promise<PageResult<OaSeal>>,
  available: () => request.get('/oa/seal/available') as Promise<OaSeal[]>,
  expiring: (params: { days?: number; pageNum?: number; pageSize?: number }) =>
    request.get('/oa/seal/expiring', { params }) as Promise<PageResult<OaSeal>>,
  getInfo: (id: number) => request.get(`/oa/seal/${id}`) as Promise<OaSeal>,
  expiryReminderLogs: (id: number) => request.get(`/oa/seal/${id}/expiry-reminder-logs`) as Promise<OaSealExpiryReminderLog[]>,
  remindExpiry: (id: number, remark?: string) => request.post(`/oa/seal/${id}/expiry-remind`, { remark }),
  add: (data: OaSeal) => request.post('/oa/seal', data),
  edit: (data: OaSeal) => request.put('/oa/seal', data),
  remove: (ids: number[]) => request.delete(`/oa/seal/${ids.join(',')}`),
};

export const sealApplicationApi = {
  list: (params: { pageNum?: number; pageSize?: number; applicationNo?: string; documentName?: string; sealId?: number; status?: string }) =>
    request.get('/oa/seal/application/list', { params }) as Promise<PageResult<OaSealApplication>>,
  overdue: (params: { pageNum?: number; pageSize?: number }) =>
    request.get('/oa/seal/application/overdue', { params }) as Promise<PageResult<OaSealApplication>>,
  getInfo: (id: number) => request.get(`/oa/seal/application/${id}`) as Promise<OaSealApplication>,
  handoverLogs: (id: number) => request.get(`/oa/seal/application/${id}/handover-logs`) as Promise<OaHandoverLog[]>,
  reminderLogs: (id: number) => request.get(`/oa/seal/application/${id}/reminder-logs`) as Promise<OaReminderLog[]>,
  add: (data: OaSealApplication) => request.post('/oa/seal/application', data),
  edit: (data: OaSealApplication) => request.put('/oa/seal/application', data),
  remove: (ids: number[]) => request.delete(`/oa/seal/application/${ids.join(',')}`),
  submit: (id: number) => request.post(`/oa/seal/application/submit/${id}`),
  cancel: (id: number) => request.put(`/oa/seal/application/cancel/${id}`),
  confirmBorrow: (id: number, remark?: string, attachmentUrl?: string) => request.put(`/oa/seal/application/${id}/borrow`, { remark, attachmentUrl }),
  confirmReturn: (id: number, remark?: string, attachmentUrl?: string) => request.put(`/oa/seal/application/${id}/return`, { remark, attachmentUrl }),
  remind: (id: number, remark?: string) => request.post(`/oa/seal/application/${id}/remind`, { remark }),
};

export const licenseApi = {
  list: (params: { pageNum?: number; pageSize?: number; licenseName?: string; licenseCode?: string; licenseNo?: string; licenseType?: string; status?: string }) =>
    request.get('/oa/license/list', { params }) as Promise<PageResult<OaLicense>>,
  available: () => request.get('/oa/license/available') as Promise<OaLicense[]>,
  expiring: (params: { days?: number; pageNum?: number; pageSize?: number }) =>
    request.get('/oa/license/expiring', { params }) as Promise<PageResult<OaLicense>>,
  getInfo: (id: number) => request.get(`/oa/license/${id}`) as Promise<OaLicense>,
  expiryReminderLogs: (id: number) => request.get(`/oa/license/${id}/expiry-reminder-logs`) as Promise<OaLicenseExpiryReminderLog[]>,
  remindExpiry: (id: number, remark?: string) => request.post(`/oa/license/${id}/expiry-remind`, { remark }),
  add: (data: OaLicense) => request.post('/oa/license', data),
  edit: (data: OaLicense) => request.put('/oa/license', data),
  remove: (ids: number[]) => request.delete(`/oa/license/${ids.join(',')}`),
};

export const licenseBorrowApi = {
  list: (params: { pageNum?: number; pageSize?: number; borrowNo?: string; licenseName?: string; licenseId?: number; status?: string }) =>
    request.get('/oa/license/borrow/list', { params }) as Promise<PageResult<OaLicenseBorrow>>,
  overdue: (params: { pageNum?: number; pageSize?: number }) =>
    request.get('/oa/license/borrow/overdue', { params }) as Promise<PageResult<OaLicenseBorrow>>,
  getInfo: (id: number) => request.get(`/oa/license/borrow/${id}`) as Promise<OaLicenseBorrow>,
  handoverLogs: (id: number) => request.get(`/oa/license/borrow/${id}/handover-logs`) as Promise<OaHandoverLog[]>,
  reminderLogs: (id: number) => request.get(`/oa/license/borrow/${id}/reminder-logs`) as Promise<OaReminderLog[]>,
  add: (data: OaLicenseBorrow) => request.post('/oa/license/borrow', data),
  edit: (data: OaLicenseBorrow) => request.put('/oa/license/borrow', data),
  remove: (ids: number[]) => request.delete(`/oa/license/borrow/${ids.join(',')}`),
  submit: (id: number) => request.post(`/oa/license/borrow/submit/${id}`),
  cancel: (id: number) => request.put(`/oa/license/borrow/cancel/${id}`),
  confirmBorrow: (id: number, remark?: string, attachmentUrl?: string) => request.put(`/oa/license/borrow/${id}/borrow`, { remark, attachmentUrl }),
  confirmReturn: (id: number, remark?: string, attachmentUrl?: string) => request.put(`/oa/license/borrow/${id}/return`, { remark, attachmentUrl }),
  remind: (id: number, remark?: string) => request.post(`/oa/license/borrow/${id}/remind`, { remark }),
};

export const licenseRenewalApi = {
  list: (params: { pageNum?: number; pageSize?: number; renewalNo?: string; licenseId?: number; licenseName?: string; status?: string }) =>
    request.get('/oa/license/renewal/list', { params }) as Promise<PageResult<OaLicenseRenewal>>,
  getInfo: (id: number) => request.get(`/oa/license/renewal/${id}`) as Promise<OaLicenseRenewal>,
  add: (data: OaLicenseRenewal) => request.post('/oa/license/renewal', data),
  edit: (data: OaLicenseRenewal) => request.put('/oa/license/renewal', data),
  remove: (ids: number[]) => request.delete(`/oa/license/renewal/${ids.join(',')}`),
  submit: (id: number) => request.post(`/oa/license/renewal/submit/${id}`),
  cancel: (id: number) => request.put(`/oa/license/renewal/cancel/${id}`),
};

export const sealRenewalApi = {
  list: (params: { pageNum?: number; pageSize?: number; renewalNo?: string; sealId?: number; sealName?: string; status?: string }) =>
    request.get('/oa/seal/renewal/list', { params }) as Promise<PageResult<OaSealRenewal>>,
  getInfo: (id: number) => request.get(`/oa/seal/renewal/${id}`) as Promise<OaSealRenewal>,
  add: (data: OaSealRenewal) => request.post('/oa/seal/renewal', data),
  edit: (data: OaSealRenewal) => request.put('/oa/seal/renewal', data),
  remove: (ids: number[]) => request.delete(`/oa/seal/renewal/${ids.join(',')}`),
  submit: (id: number) => request.post(`/oa/seal/renewal/submit/${id}`),
  cancel: (id: number) => request.put(`/oa/seal/renewal/cancel/${id}`),
};

export const borrowManagementApi = {
  summary: () => request.get('/oa/borrow-management/summary') as Promise<BorrowManagementSummary>,
  stats: () => request.get('/oa/borrow-management/stats') as Promise<BorrowManagementStats>,
};
