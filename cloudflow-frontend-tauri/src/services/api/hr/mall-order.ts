import request from '@/services/api/request';
import type {
  HrMallOrder,
  HrMallOrderPayload,
  HrPagedResult,
  HrRecord,
} from './types';

export const listAllOrders = (params?: HrRecord) =>
  request.get<HrPagedResult<HrMallOrder>>('/hr/benefit/mall/orders', { params });

export const listMyOrders = (params?: HrRecord) =>
  request.get<HrPagedResult<HrMallOrder>>('/hr/benefit/mall/orders/mine', { params });

export const getMallOrder = (id: number) =>
  request.get<HrMallOrder>(`/hr/benefit/mall/orders/${id}`);

export const placeMallOrder = (data: HrMallOrderPayload) =>
  request.post<number>('/hr/benefit/mall/orders', data);

export const shipOrder = (id: number, expressNo: string) =>
  request.post<void>(`/hr/benefit/mall/orders/${id}/ship`, null, {
    params: { expressNo },
  });

export const cancelOrder = (id: number, reason?: string) =>
  request.post<void>(`/hr/benefit/mall/orders/${id}/cancel`, null, {
    params: { reason },
  });

export const completeOrder = (id: number) =>
  request.post<void>(`/hr/benefit/mall/orders/${id}/complete`);
