import request from '@/services/api/request';
import type { HrTrainingArchive } from './types';

export const getMyTrainingArchive = () =>
  request.get<HrTrainingArchive>('/hr/training/archive/mine');

export const getEmployeeTrainingArchive = (employeeId: number) =>
  request.get<HrTrainingArchive>(`/hr/training/archive/employees/${employeeId}`);
