import request from '../request';
import type { PageResult } from '@/types';

export interface DealAllocation {
  allocationId: string | number;
  eventId: string | number;
  reversalOfId?: string | number | null;
  eventType: string;
  bizType: string;
  bizId: string | number;
  customerName: string;
  businessName?: string;
  occurredTime: string;
  currency: string;
  teamVersion: number;
  baselineFlag: number;
  salesUserId: string | number;
  salesUserName?: string;
  deptId: string | number;
  deptName?: string;
  roleType: string;
  allocatedPercentage: string | number;
  allocatedAmount: string | number;
  commissionRate?: string | number | null;
  commissionAmount?: string | number | null;
  commissionStatus?: string;
  compChangeId?: string | number | null;
  payrollPeriodId?: string | number | null;
  payrollPeriodName?: string;
  payrollState?: string;
  commissionRequested?: boolean;
}
export interface CommissionFilters {
  startDate?: string; endDate?: string; currency?: string; eventType?: string; bizType?: string; bizId?: string;
  pageNum: number; pageSize: number;
}
export interface CommissionOptions {
  periods: { id: string | number; name: string }[];
  components: { id: string | number; name: string }[];
}
export const commissionApi = {
  list: (params: CommissionFilters) => request.get<PageResult<DealAllocation>>('/crm/deal-allocation/list', { params }),
  options: () => request.get<CommissionOptions>('/crm/commission/options'),
  confirm: (data: { allocationIds: string[]; commissionRate: string; approvalBasis: string }) => request.post<void>('/crm/commission/confirm', data),
  post: (data: { allocationIds: string[]; payrollPeriodId: string; salaryComponentId: string }) =>
    request.post<{ sources: number; synchronizedSources: number; pending: boolean }>('/crm/commission/post', data),
};
