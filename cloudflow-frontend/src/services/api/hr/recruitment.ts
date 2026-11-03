import request from '@/services/api/request';
import { getAttachmentRawValue, normalizeAttachmentUrls } from '@/utils/attachment';
import { normalizeJsonArray, normalizeStringArray, parseMaybeJson, withList } from './internals';
import type {
  Candidate,
  CandidatePayload,
  HrPagedResult,
  HrRecord,
  Interview,
  InterviewSchedulePayload,
  Offer,
  OfferPayload,
  RecruitmentRequest,
  RecruitmentRequestPayload,
} from './types';

const normalizeCandidate = (item: Candidate): Candidate => ({
  ...item,
  resumeAttachmentUrls: normalizeAttachmentUrls(item.resumeAttachmentUrls),
  statusDesc: item.statusDesc,
  sourceDesc: item.sourceDesc,
});

const normalizeInterview = (item: Interview): Interview => ({
  ...item,
  interviewerIds: parseMaybeJson<number[]>(item.interviewerIds, []),
  interviewerNames: parseMaybeJson<string[]>(item.interviewerNames, []),
  interviewRoundName: item.interviewRoundName,
  interviewTypeName: item.interviewTypeName,
  meetingRoomName: item.meetingRoomName || item.location,
  statusName: item.statusName || item.statusDesc,
});

const toRecruitmentPayload = (data: RecruitmentRequestPayload) => ({
  ...data,
  requisitionNo: data.requisitionNo || `HRRQ${Date.now()}`,
  title: data.title || '招聘需求',
});

const toCandidatePayload = (data: CandidatePayload) => ({
  ...data,
  candidateNo: data.candidateNo || `HRC${Date.now()}`,
  resumeAttachmentUrls: normalizeJsonArray(
    normalizeStringArray(data.resumeAttachmentUrls).map((item) => getAttachmentRawValue(item)),
  ),
});

const toOfferPayload = (data: OfferPayload) => ({
  ...data,
  offerNo: data.offerNo || `HROF${Date.now()}`,
});

export const listRecruitmentRequests = async (params?: HrRecord) => {
  const page = await request.get<HrPagedResult<RecruitmentRequest>>('/hr/recruitment/requisitions', { params });
  const rows = withList(page);
  return { ...page, records: rows, rows } as HrPagedResult<RecruitmentRequest>;
};
export const createRecruitmentRequest = (data: RecruitmentRequestPayload) =>
  request.post<number>('/hr/recruitment/requisitions', toRecruitmentPayload(data));
export const submitRecruitmentRequest = (id: number) => request.post<void>(`/hr/recruitment/requisitions/${id}/submit`);
export const approveRecruitmentRequest = (id: number) => request.post<void>(`/hr/recruitment/requisitions/${id}/approve`);
export const completeRecruitmentRequest = (id: number) => request.post<void>(`/hr/recruitment/requisitions/${id}/complete`);
export const cancelRecruitmentRequest = (id: number) => request.post<void>(`/hr/recruitment/requisitions/${id}/cancel`);

export const listCandidates = async (params?: HrRecord) => {
  const page = await request.get<HrPagedResult<Candidate>>('/hr/recruitment/candidates', { params });
  const rows = withList(page).map(normalizeCandidate);
  return { ...page, records: rows, rows } as HrPagedResult<Candidate>;
};
export const getCandidate = async (id: number) => withList(await listCandidates({ pageNum: 1, pageSize: 500 })).find((item) => item.id === id) as Candidate;
export const createCandidate = (data: CandidatePayload) =>
  request.post<number>('/hr/recruitment/candidates', toCandidatePayload(data));
export const updateCandidateStatus = (id: number, status: string, rejectReason?: string) =>
  request.put<void>(`/hr/recruitment/candidates/${id}/status`, undefined, { params: { status, rejectReason } });

export const listInterviews = async (params?: HrRecord) =>
  (await request.get<Interview[]>('/hr/recruitment/interviews', { params })).map(normalizeInterview);
export const scheduleInterview = (data: InterviewSchedulePayload) =>
  request.post<number>('/hr/recruitment/interviews', data);

export const listOffers = async (params?: HrRecord) =>
  request.get<Offer[]>('/hr/recruitment/offers', { params });
export const getOffer = async (id: number) => (await listOffers()).find((item) => item.id === id) as Offer;
export const createOffer = (data: OfferPayload) =>
  request.post<number>('/hr/recruitment/offers', toOfferPayload(data));
export const submitOffer = (id: number) => request.post<void>(`/hr/recruitment/offers/${id}/submit`);
export const approveOffer = (id: number) => request.post<void>(`/hr/recruitment/offers/${id}/approve`);
export const sendOffer = (id: number) => request.post<void>(`/hr/recruitment/offers/${id}/send`);
export const acceptOffer = (id: number) => request.post<void>(`/hr/recruitment/offers/${id}/accept`);
export const rejectOffer = (id: number) => request.post<void>(`/hr/recruitment/offers/${id}/reject`);
export const convertOfferToOnboarding = (id: number) =>
  request.post<number>(`/hr/recruitment/offers/${id}/convert-to-onboarding`);

// ============================================================================
// HR-P0-3 招聘渠道管理
// ============================================================================

export interface RecruitmentChannel extends HrRecord {
  id?: number;
  channelCode?: string;
  channelName?: string;
  channelType?: 'PORTAL' | 'HEADHUNTER' | 'REFERRAL' | 'CAMPUS' | 'SOCIAL' | 'OTHER' | string;
  costAmount?: number;
  contractStart?: string;
  contractEnd?: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  status?: string;
  remark?: string;
}

export interface RecruitmentChannelStat extends RecruitmentChannel {
  totalCandidates?: number;
  hiredCount?: number;
  hireRate?: number;
  costPerHire?: number;
}

export const listRecruitmentChannels = (params?: HrRecord) =>
  request.get<RecruitmentChannel[]>('/hr/recruitment/channels', { params });

export const saveRecruitmentChannel = (data: RecruitmentChannel) =>
  data.id
    ? request.put<void>('/hr/recruitment/channels', data)
    : request.post<number>('/hr/recruitment/channels', data);

export const deleteRecruitmentChannel = (id: number) =>
  request.delete<void>(`/hr/recruitment/channels/${id}`);

export const getRecruitmentChannelStats = () =>
  request.get<RecruitmentChannelStat[]>('/hr/recruitment/channels/stats');
