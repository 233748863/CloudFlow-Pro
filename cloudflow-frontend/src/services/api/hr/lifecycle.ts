import request from '@/services/api/request';
import { statusDescMap } from './internals';
import type {
  HrRecord,
  LifecycleApplication,
  OnboardingApplication,
  OnboardingApplicationPayload,
  OnboardingTask,
  ProbationConfirmation,
  ProbationConfirmationPayload,
  ResignationApplication,
  ResignationApplicationPayload,
  ResignationHandover,
  TransferApplication,
  TransferApplicationPayload,
} from './types';

const normalizeLifecycleApplication = <T extends Record<string, any>>(item: T): T => ({
  ...item,
  expectedDate: item.expectedDate || item.onboardDate || item.effectiveDate,
  onboardDate: item.onboardDate || item.expectedDate || item.effectiveDate,
  effectiveDate: item.effectiveDate || item.expectedDate || item.onboardDate || item.actualDate,
  statusDesc: item.statusDesc || statusDescMap[String(item.status || '')] || item.status,
});

const createLifecycle = (type: string, data: HrRecord) =>
  request.post<number>('/hr/lifecycle/applications', { ...data, applicationNo: data.applicationNo || `HRLC${Date.now()}`, type, effectiveDate: data.effectiveDate || data.expectedDate || data.actualDate });
const listLifecycle = async (type: string, params?: HrRecord) =>
  (await request.get<LifecycleApplication[]>('/hr/lifecycle/applications', { params: { ...params, type } })).map(normalizeLifecycleApplication);

export const listOnboardingApplications = async (params?: HrRecord) =>
  (await request.get<OnboardingApplication[]>('/hr/lifecycle/applications', { params: { ...params, type: 'ONBOARDING' } })).map(normalizeLifecycleApplication);
export const getOnboardingApplication = async (id: number) =>
  (await listOnboardingApplications()).find((item) => item.id === id) as OnboardingApplication;
export const getOnboardingTasks = (id: number) =>
  request.get<OnboardingTask[]>(`/hr/lifecycle/applications/${id}/tasks`);
export const createOnboardingApplication = (data: OnboardingApplicationPayload) =>
  request.post<number>('/hr/lifecycle/applications', { ...data, applicationNo: data.applicationNo || `HRLC${Date.now()}`, type: 'ONBOARDING', effectiveDate: data.expectedDate });
export const submitOnboardingApplication = (id: number) => request.post<void>(`/hr/lifecycle/applications/${id}/submit`);
export const approveOnboarding = (id: number) => request.post<void>(`/hr/lifecycle/applications/${id}/approve`);
export const rejectOnboarding = (id: number) => request.post<void>(`/hr/lifecycle/applications/${id}/reject`);
export const completeOnboardingTask = (taskId: number, remark?: string) =>
  request.post<void>(`/hr/lifecycle/tasks/${taskId}/complete`, { remark });
export const confirmOnboarding = (applicationId: number, confirmDate?: string) =>
  request.post<void>(`/hr/lifecycle/applications/${applicationId}/complete`, { confirmDate });

export const listLifecycleApplications = async (params?: HrRecord) =>
  (await request.get<LifecycleApplication[]>('/hr/lifecycle/applications', { params })).map(normalizeLifecycleApplication);
export const createLifecycleApplication = (type: string, data: HrRecord) =>
  createLifecycle(type, data);
export const changeLifecycleApplicationStatus = (id: number, action: string, data?: HrRecord) =>
  request.post<void>(`/hr/lifecycle/applications/${id}/${action}`, data || {});
export const listLifecycleApplicationTasks = (id: number) =>
  request.get<OnboardingTask[]>(`/hr/lifecycle/applications/${id}/tasks`);

export const createProbationConfirmation = (data: ProbationConfirmationPayload) => createLifecycle('PROBATION', data);
export const submitProbationConfirmation = (id: number) => request.post<void>(`/hr/lifecycle/applications/${id}/submit`);
export const approveProbationConfirmation = (id: number) => request.post<void>(`/hr/lifecycle/applications/${id}/approve`);
export const rejectProbationConfirmation = (id: number, rejectReason?: string, extensionDays?: number) =>
  request.post<void>(`/hr/lifecycle/applications/${id}/reject`, { rejectReason, extensionDays });
export const getProbationConfirmation = async (id: number) => (await listLifecycle('PROBATION')).find((item) => item.id === id) as ProbationConfirmation;
export const listProbationByEmployee = (employeeId: number) => listLifecycle('PROBATION', { employeeId }) as Promise<ProbationConfirmation[]>;
export const sendProbationReminders = () => Promise.resolve();

export const createTransferApplication = (data: TransferApplicationPayload) => createLifecycle('TRANSFER', data);
export const submitTransferApplication = (id: number) => request.post<void>(`/hr/lifecycle/applications/${id}/submit`);
export const approveTransfer = (id: number) => request.post<void>(`/hr/lifecycle/applications/${id}/approve`);
export const effectiveTransfer = (id: number) => request.post<void>(`/hr/lifecycle/applications/${id}/effective`);
export const getTransferApplication = async (id: number) => (await listLifecycle('TRANSFER')).find((item) => item.id === id) as TransferApplication;
export const listTransferByEmployee = (employeeId: number) => listLifecycle('TRANSFER', { employeeId }) as Promise<TransferApplication[]>;

export const createResignationApplication = (data: ResignationApplicationPayload) => createLifecycle('RESIGNATION', data);
export const submitResignationApplication = (id: number) => request.post<void>(`/hr/lifecycle/applications/${id}/submit`);
export const approveResignation = (id: number) => request.post<void>(`/hr/lifecycle/applications/${id}/approve`);
export const conductExitInterview = (id: number, interviewContent: string) =>
  request.put<void>(`/hr/lifecycle/applications/${id}`, { remark: interviewContent });
export const completeResignationHandover = (handoverId: number, remark?: string) =>
  request.post<void>(`/hr/lifecycle/tasks/${handoverId}/complete`, { remark });
export const confirmResignation = (applicationId: number, confirmDate?: string) =>
  request.post<void>(`/hr/lifecycle/applications/${applicationId}/complete`, { confirmDate });
export const getResignationApplication = async (id: number) => (await listLifecycle('RESIGNATION')).find((item) => item.id === id) as ResignationApplication;
export const listResignationByEmployee = (employeeId: number) => listLifecycle('RESIGNATION', { employeeId }) as Promise<ResignationApplication[]>;
export const listResignationHandovers = (applicationId: number) =>
  request.get<ResignationHandover[]>(`/hr/lifecycle/applications/${applicationId}/tasks`);
