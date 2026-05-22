import request from '@/services/api/request';
import type { HrTalentArchive } from './types';

export const getMyTalentArchive = () =>
  request.get<HrTalentArchive>('/hr/talent/archive/mine');

export const getEmployeeTalentArchive = (employeeId: number) =>
  request.get<HrTalentArchive>(`/hr/talent/archive/employees/${employeeId}`);
