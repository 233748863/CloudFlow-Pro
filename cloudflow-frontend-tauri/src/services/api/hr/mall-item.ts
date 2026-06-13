import request from '@/services/api/request';
import type {
  HrMallItem,
  HrMallItemPayload,
  HrPagedResult,
  HrRecord,
} from './types';

export const listMallItems = (params?: HrRecord) =>
  request.get<HrPagedResult<HrMallItem>>('/hr/benefit/mall/items', { params });

export const getMallItem = (id: number) =>
  request.get<HrMallItem>(`/hr/benefit/mall/items/${id}`);

export const createMallItem = (data: HrMallItemPayload) =>
  request.post<number>('/hr/benefit/mall/items', data);

export const updateMallItem = (id: number, data: Partial<HrMallItemPayload>) =>
  request.put<void>(`/hr/benefit/mall/items/${id}`, data);

export const onShelfItem = (id: number) =>
  request.post<void>(`/hr/benefit/mall/items/${id}/on-shelf`);

export const offShelfItem = (id: number) =>
  request.post<void>(`/hr/benefit/mall/items/${id}/off-shelf`);
