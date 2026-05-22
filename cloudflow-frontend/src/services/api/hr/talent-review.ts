import request from '@/services/api/request';
import type {
  HrPagedResult,
  HrPageQuery,
  HrTalentCalibrationSession,
  HrTalentCalibrationSessionPayload,
  HrTalentNineBoxGrid,
  HrTalentReview,
  HrTalentReviewPayload,
} from './types';

export const listTalentReviews = (params?: HrPageQuery) =>
  request.get<HrPagedResult<HrTalentReview>>('/hr/talent/reviews', { params });

export const getTalentReview = (id: number) =>
  request.get<HrTalentReview>(`/hr/talent/reviews/${id}`);

export const createTalentReview = (data: HrTalentReviewPayload) =>
  request.post<number>('/hr/talent/reviews', data);

export const updateTalentReview = (id: number, data: Partial<HrTalentReviewPayload>) =>
  request.put<void>(`/hr/talent/reviews/${id}`, data);

export const snapshotPerformance = (reviewId: number, objectiveId: number) =>
  request.post<number>(`/hr/talent/reviews/${reviewId}/snapshot-performance`, null, {
    params: { objectiveId },
  });

export const upsertReviewParticipant = (
  reviewId: number,
  employeeId: number,
  data: {
    potentialScore?: number;
    potentialBand?: string;
    performanceScore?: number | string;
    performanceBand?: string;
    calibrationNotes?: string;
    developActionSummary?: string;
  },
) => request.patch<void>(`/hr/talent/reviews/${reviewId}/participants/${employeeId}`, data);

export const moveReviewParticipantCell = (reviewId: number, employeeId: number, gridCell: number) =>
  request.patch<void>(
    `/hr/talent/reviews/${reviewId}/participants/${employeeId}/grid-cell`,
    null,
    { params: { gridCell } },
  );

export const loadNineBox = (reviewId: number) =>
  request.get<HrTalentNineBoxGrid>(`/hr/talent/reviews/${reviewId}/grid`);

export const publishTalentReview = (id: number) =>
  request.post<string>(`/hr/talent/reviews/${id}/publish`, {});

export const listCalibrationSessions = (reviewId: number) =>
  request.get<HrPagedResult<HrTalentCalibrationSession>>(
    `/hr/talent/reviews/${reviewId}/calibration-sessions`,
  );

export const createCalibrationSession = (
  reviewId: number,
  data: HrTalentCalibrationSessionPayload,
) =>
  request.post<number>(`/hr/talent/reviews/${reviewId}/calibration-sessions`, data);

export const updateCalibrationSession = (
  sessionId: number,
  data: Partial<HrTalentCalibrationSessionPayload>,
) => request.put<void>(`/hr/talent/calibration-sessions/${sessionId}`, data);
