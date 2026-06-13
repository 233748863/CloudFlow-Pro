import request from '@/services/api/request';
import { PageResult } from '@/types';
import type {
  DeptTreeNode,
  HrPageQuery,
  HrRecord,
  PositionOption,
  PostOption,
} from './types';

export const getDeptTreeOptions = () =>
  request.get<DeptTreeNode[]>('/auth/system/dept/tree');

export const getPostOptions = () =>
  request.get<PageResult<PostOption>>('/auth/system/post/list');

export const getPositionOptions = (params?: HrPageQuery) =>
  request.get<PositionOption[]>('/hr/organization/positions', { params });

export const listPositionFamilies = (params?: HrRecord) =>
  request.get<HrRecord[]>('/hr/organization/families', { params });
export const createPositionFamily = (data: HrRecord) =>
  request.post<number>('/hr/organization/families', { ...data, familyCode: data.familyCode || `FAM${Date.now()}` });
export const updatePositionFamily = (id: number, data: HrRecord) =>
  request.put<void>(`/hr/organization/families/${id}`, data);
export const deletePositionFamily = (id: number) =>
  request.delete<void>(`/hr/organization/families/${id}`);

export const listOrganizationLevels = (params?: HrRecord) =>
  request.get<HrRecord[]>('/hr/organization/levels', { params });
export const createOrganizationLevel = (data: HrRecord) =>
  request.post<number>('/hr/organization/levels', { ...data, levelCode: data.levelCode || `LV${Date.now()}` });
export const updateOrganizationLevel = (id: number, data: HrRecord) =>
  request.put<void>(`/hr/organization/levels/${id}`, data);
export const deleteOrganizationLevel = (id: number) =>
  request.delete<void>(`/hr/organization/levels/${id}`);

export const createPosition = (data: HrRecord) =>
  request.post<number>('/hr/organization/positions', { ...data, positionCode: data.positionCode || `POS${Date.now()}` });
export const updatePosition = (id: number, data: HrRecord) =>
  request.put<void>(`/hr/organization/positions/${id}`, data);
export const deletePosition = (id: number) =>
  request.delete<void>(`/hr/organization/positions/${id}`);
