import request from '@/services/api/request';
import type {
  HrPagedResult,
  HrPageQuery,
  HrTrainingCategory,
  HrTrainingCategoryPayload,
  HrTrainingCourse,
  HrTrainingCoursePayload,
  HrTrainingInstructor,
  HrTrainingInstructorPayload,
} from './types';

// ----- 课程 -----

export const listTrainingCourses = (params?: HrPageQuery) =>
  request.get<HrPagedResult<HrTrainingCourse>>('/hr/training/courses', { params });

export const getTrainingCourse = (id: number) =>
  request.get<HrTrainingCourse>(`/hr/training/courses/${id}`);

export const createTrainingCourse = (data: HrTrainingCoursePayload) =>
  request.post<number>('/hr/training/courses', data);

export const updateTrainingCourse = (id: number, data: Partial<HrTrainingCoursePayload>) =>
  request.put<void>(`/hr/training/courses/${id}`, data);

export const deleteTrainingCourse = (id: number) =>
  request.delete<void>(`/hr/training/courses/${id}`);

// ----- 分类 -----

export const listTrainingCategories = (params?: HrPageQuery) =>
  request.get<HrTrainingCategory[]>('/hr/training/categories', { params });

export const createTrainingCategory = (data: HrTrainingCategoryPayload) =>
  request.post<number>('/hr/training/categories', data);

export const updateTrainingCategory = (id: number, data: Partial<HrTrainingCategoryPayload>) =>
  request.put<void>(`/hr/training/categories/${id}`, data);

export const deleteTrainingCategory = (id: number) =>
  request.delete<void>(`/hr/training/categories/${id}`);

// ----- 讲师 -----

export const listTrainingInstructors = (params?: HrPageQuery) =>
  request.get<HrPagedResult<HrTrainingInstructor>>('/hr/training/instructors', { params });

export const createTrainingInstructor = (data: HrTrainingInstructorPayload) =>
  request.post<number>('/hr/training/instructors', data);

export const updateTrainingInstructor = (id: number, data: Partial<HrTrainingInstructorPayload>) =>
  request.put<void>(`/hr/training/instructors/${id}`, data);

export const deleteTrainingInstructor = (id: number) =>
  request.delete<void>(`/hr/training/instructors/${id}`);
