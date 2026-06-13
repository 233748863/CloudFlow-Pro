import request from '@/services/api/request';
import type {
  HrPagedResult,
  HrPointAccount,
  HrPointTransaction,
  HrRecord,
} from './types';

export const getMyPointAccount = () =>
  request.get<HrPointAccount>('/hr/benefit/points/mine');

export const getEmployeePointAccount = (employeeId: number) =>
  request.get<HrPointAccount>(`/hr/benefit/points/employees/${employeeId}`);

export const listPointTransactions = (accountId: number, params?: HrRecord) =>
  request.get<HrPagedResult<HrPointTransaction>>(
    `/hr/benefit/points/${accountId}/transactions`,
    { params },
  );

export const adjustPoint = (
  employeeId: number,
  points: number,
  direction: 'IN' | 'OUT',
  remark?: string,
) =>
  request.post<number>('/hr/benefit/points/manual-adjust', null, {
    params: { employeeId, points, direction, remark },
  });
