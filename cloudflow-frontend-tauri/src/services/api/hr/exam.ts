import request from '@/services/api/request';
import type {
  HrExamAttempt,
  HrExamPaper,
  HrExamPaperPayload,
  HrExamQuestionBank,
  HrExamQuestionBankPayload,
  HrPagedResult,
  HrPageQuery,
} from './types';

// ----- 题库 -----

export const listQuestions = (params?: HrPageQuery) =>
  request.get<HrPagedResult<HrExamQuestionBank>>('/hr/training/questions', { params });

export const getQuestion = (id: number) =>
  request.get<HrExamQuestionBank>(`/hr/training/questions/${id}`);

export const createQuestion = (data: HrExamQuestionBankPayload) =>
  request.post<number>('/hr/training/questions', data);

export const updateQuestion = (id: number, data: Partial<HrExamQuestionBankPayload>) =>
  request.put<void>(`/hr/training/questions/${id}`, data);

export const deleteQuestion = (id: number) =>
  request.delete<void>(`/hr/training/questions/${id}`);

// ----- 试卷 -----

export const listPapers = (params?: HrPageQuery) =>
  request.get<HrPagedResult<HrExamPaper>>('/hr/training/papers', { params });

export const getPaper = (id: number) =>
  request.get<HrExamPaper>(`/hr/training/papers/${id}`);

export const savePaper = (data: HrExamPaperPayload) =>
  request.post<number>('/hr/training/papers', data);

export const updatePaper = (id: number, data: HrExamPaperPayload) =>
  request.put<number>(`/hr/training/papers/${id}`, data);

export const deletePaper = (id: number) =>
  request.delete<void>(`/hr/training/papers/${id}`);

export const startAttempt = (paperId: number, sessionId?: number) =>
  request.post<{ attemptId: number }>(`/hr/training/papers/${paperId}/attempts`, { sessionId });

// ----- 答卷 -----

export const listAttempts = (params?: HrPageQuery) =>
  request.get<HrPagedResult<HrExamAttempt>>('/hr/training/attempts', { params });

export const listMyAttempts = (params?: HrPageQuery) =>
  request.get<HrPagedResult<HrExamAttempt>>('/hr/training/attempts/mine', { params });

export const getAttempt = (id: number) =>
  request.get<HrExamAttempt>(`/hr/training/attempts/${id}`);

export const submitAttempt = (id: number, answers: Array<Record<string, unknown>>) =>
  request.post<Record<string, unknown>>(`/hr/training/attempts/${id}/submit`, { answers });

export const gradeAttempt = (id: number, data: { score: number | string; passFlag?: boolean; comment?: string }) =>
  request.post<void>(`/hr/training/attempts/${id}/grade`, data);
