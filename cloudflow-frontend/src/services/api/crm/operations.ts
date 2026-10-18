import request from '../request';
import type { PageResult } from '@/types';
import type { CrmLead, CrmTicket } from './types';
import type { HolidayCalendar } from '../holiday';

export type Decimal = number | string;
export interface Versioned { version?: number }
export interface CrmActivity extends Versioned {
  activityId?: number; activityNo?: string; activityType: string; subject: string; description?: string; status: string;
  priority?: string; direction?: string; startTime: string; endTime: string; allDayFlag?: number; durationMinutes?: number;
  bizType: string; bizId?: number; customerId?: number; customerName?: string; ownerId?: number; ownerName?: string;
  location?: string; joinUrl?: string; meetingPlatform?: string; resultSummary?: string; nextAction?: string;
  completeTime?: string; overdueFlag?: number; attachmentUrl?: string; followUpId?: number;
}
export interface ActivityParticipant { participantId?: number; participantType: string; participantRefId: number; participantName?: string; acceptanceStatus: string; isOrganizerFlag?: number; attendFlag?: number; responseTime?: string }
export interface ActivityReminder { reminderId?: number; remindMinutesBefore: number; channelType: string; sentFlag?: number; sendTime?: string }
export interface ActivityDetail { activity: CrmActivity; participants: ActivityParticipant[]; reminders: ActivityReminder[]; conflicts?: CrmActivity[]; generateFollowUp?: boolean }
export interface TimelineItem { type: string; sourceId: number; title: string; content?: string; status?: string; eventTime: string; ownerName?: string }
export interface SlaPolicy extends Versioned { policyId?: number; policyCode: string; policyName: string; entityType: string; entityId?: string; holidayCalendarId?: number; applyForResolution: number; roundTheClockFlag: number; defaultFlag: number; priority: number; effectiveStart?: string; effectiveEnd?: string; status: string; remark?: string }
export interface SlaPriority { priorityCode: string; priorityName: string; firstResponseMinutes: number; resolutionMinutes?: number; sortNo?: number }
export interface SlaRule { ruleType: string; ticketStatus: string }
export interface SlaDetail { policy: SlaPolicy; priorities: SlaPriority[]; rules: SlaRule[] }
export interface SlaGroup { key: string; total: number; responded: number; resolved: number; responseMet: number; resolutionMet: number; responseRate: Decimal | null; resolutionRate: Decimal | null; averageResponseMinutes: Decimal | null; averageResolutionMinutes: Decimal | null }
export interface SlaReport { total: SlaGroup; groups: SlaGroup[]; trend: SlaGroup[]; breachedTickets: CrmTicket[] }
export interface LostReason extends Versioned { reasonId?: number; reasonCode: string; reasonName: string; reasonCategory: string; sortNo?: number; status: string; remark?: string }
export interface Competitor extends Versioned { competitorId?: number; competitorCode: string; competitorName: string; website?: string; industry?: string; strength?: string; weakness?: string; threatLevel: string; status: string; remark?: string }
export interface LossReasonInput { reasonId: number; competitorId?: number; amountLost?: Decimal; isPrimary: boolean; remark?: string }
export interface LossRequest { reasons: LossReasonInput[]; comment?: string; version: number }
export interface LostReport { reasons: { reasonId: number; reasonName: string; count: number; amount: Decimal }[]; competitors: { competitorId: number; competitorName: string; wonCount: number; lostCount: number }[]; trend: { month: string; count: number; amount: Decimal }[] }
export interface CustomerCredit extends Versioned { creditId?: number; customerId?: number; creditLimit: Decimal; overdueThreshold: Decimal; currency: string; bypassFlag?: number; bypassReason?: string; bypassBy?: number; bypassTime?: string; bypassExpireDate?: string; effectiveStart?: string; effectiveEnd?: string; status: string; remark?: string; instanceId?: string }
export interface CreditView { credit: CustomerCredit | null; occupied: Decimal; overdue: Decimal; available: Decimal | null; effective: boolean; bypassActive: boolean; pendingApproval: { approvalId: number; approvalNo: string; status: string; payloadJson: string; instanceId?: string } | null }
export interface Territory extends Versioned { territoryId?: number; territoryCode: string; territoryName: string; parentId: number; levelPath?: string; sortNo: number; ownerId?: number; status: string; remark?: string }
export interface LeadScoreRule extends Versioned { ruleId?: number; ruleName: string; fieldName: string; operator: string; fieldValue?: string; score: number; enabledFlag: number; sortNo: number }
export interface ProfileReport { funnel: Record<string, number>; distribution: { name: string; leads: number; customers: number }[] }
export interface Campaign extends Versioned { campaignId?: number; campaignCode: string; campaignName: string; campaignType: string; status: string; startDate: string; endDate: string; ownerId?: number; ownerName?: string; description?: string; budget: Decimal; actualCost: Decimal; revenue?: Decimal; roi?: Decimal | null; sentCount?: number; deliveredCount?: number; openedCount?: number; clickedCount?: number; bouncedCount?: number; unsubscribedCount?: number; leadCreatedCount?: number; opportunityCreatedCount?: number; wonOpportunityCount?: number; openRate?: Decimal; clickRate?: Decimal; bounceRate?: Decimal; unsubscribeRate?: Decimal }
export interface CampaignListLink { listId: number; isExcludingFlag: number }
export interface CampaignDetail { campaign: Campaign; targetLists: CampaignListLink[] }
export interface TargetList extends Versioned { listId?: number; listCode: string; listName: string; description?: string; memberCount?: number; optedOutCount?: number; sourceType: string; queryCondition?: string; ownerId?: number; status: string }
export interface TargetMember { memberId?: number; memberType: string; memberRefId: number; memberName?: string; email?: string; phone?: string; optedOutFlag?: number }
export interface AudienceCondition { memberType: string; industry?: string; territoryId?: number; marketSegment?: string; levelCode?: string; scoreMin?: number; scoreMax?: number }
export interface TargetListRequest { list: TargetList; condition?: AudienceCondition; members?: TargetMember[] }
export interface TargetListDetail { list: TargetList; members: TargetMember[]; visibleMemberCount: number }
export interface AudienceResult { includedCount: number; excludedCount: number; optedOutCount: number; invalidEmailCount: number; duplicateCount: number; recipientCount: number; members: TargetMember[] }
export interface MarketingEmailPolicy { sendingEnabled: boolean; trackingEnabled: boolean; publicOrigin?: string; allowedHosts: string[]; confirmationThreshold: number; reason?: string }
export interface MarketingEmailTask extends Versioned { massEmailId: number; campaignId: number; subject: string; templateCode: string; fromAddress?: string | null; fromName?: string | null; replyTo?: string | null; scheduledTime?: string; status: string; totalCount: number; sentCount: number; failedCount: number; deliverySummary?: string; recipientSnapshotTime?: string; startTime?: string; endTime?: string }
export interface MarketingEmailRecipient { recipientId: number; targetType: string; targetId?: number; emailMask: string; status: string; testFlag: number; messageRecordId?: number; deliveryId?: number; firstOpenTime?: string; firstClickTime?: string; unsubscribedTime?: string }
export interface MarketingEmailDetail { task: MarketingEmailTask; recipients: PageResult<MarketingEmailRecipient>; policy: MarketingEmailPolicy }
export interface MarketingEmailPreview extends AudienceResult { massEmailId: number; version: number; previewDigest: string; confirmationThreshold: number; requiresConfirmation: boolean; ready: boolean; reason?: string; previewHtml: string; policy: MarketingEmailPolicy; sampleLimit: number }
export interface MarketingEmailDraft { massEmailId?: number; campaignId: number; version?: number; subject: string; templateCode: string; fromAddress?: string | null; fromName?: string | null; replyTo?: string | null }
export interface MarketingEmailCommand { version?: number; previewDigest?: string; confirmLarge?: boolean; confirmedRecipientCount?: number; scheduledTime?: string; testAddress?: string }

type Query = Record<string, string | number | undefined>;
async function allPages<RecordType>(url: string): Promise<PageResult<RecordType>> {
  const rows: RecordType[] = [];
  let pageNum = 1;
  let total = 1;
  while (rows.length < total) {
    const page = await request.get<PageResult<RecordType>>(url, { params: { pageNum, pageSize: 100 } });
    rows.push(...page.rows); total = page.total; pageNum += 1;
    if (!page.rows.length) break;
  }
  return { rows, total };
}
export const crmOperations = {
  activityContracts: (customerId: number) => allPages<{ contractId: number; contractNo?: string; contractName: string; customerId: number }>(`/crm/activity/contracts?customerId=${customerId}`),
  activities: (params: Query) => request.get<PageResult<CrmActivity>>('/crm/activity/list', { params }),
  activity: (id: number) => request.get<ActivityDetail>(`/crm/activity/${id}`),
  saveActivity: (data: ActivityDetail) => data.activity.activityId ? request.put<ActivityDetail>('/crm/activity', data) : request.post<ActivityDetail>('/crm/activity', data),
  finishActivity: (id: number, data: { version?: number; resultSummary?: string; nextAction?: string; generateFollowUp: boolean }) => request.post<ActivityDetail>(`/crm/activity/${id}/complete`, data),
  cancelActivity: (id: number, version?: number) => request.post(`/crm/activity/${id}/cancel`, { version }),
  nextActivity: (id: number, data: ActivityDetail) => request.post<ActivityDetail>(`/crm/activity/${id}/next`, data),
  respondActivity: (id: number, acceptanceStatus: string) => request.post(`/crm/activity/${id}/respond`, { acceptanceStatus }),
  deleteActivity: (id: number) => request.delete(`/crm/activity/${id}`),
  timeline: (id: number, params: Query) => request.get<PageResult<TimelineItem>>(`/crm/activity/customer/${id}/timeline`, { params }),
  policies: () => allPages<SlaPolicy>('/crm/sla/policy/list'),
  policy: (id: number) => request.get<SlaDetail>(`/crm/sla/policy/${id}`),
  priorities: () => request.get<SlaPriority[]>('/crm/sla/priorities'),
  calendars: () => request.get<HolidayCalendar[]>('/crm/sla/calendars'),
  savePolicy: (data: SlaDetail) => request.post<number>('/crm/sla/policy', data),
  disablePolicy: (id: number) => request.post(`/crm/sla/policy/${id}/disable`),
  previewSla: (data: { customerId: number; severity: string; openedTime?: string }) => request.post<CrmTicket>('/crm/sla/preview', data),
  slaReport: (params: Query) => request.get<SlaReport>('/crm/sla/report', { params }),
  respondTicket: (id: number) => request.post(`/crm/ticket/${id}/respond`),
  lostReasons: () => allPages<LostReason>('/crm/lost-analysis/reasons'),
  competitors: () => allPages<Competitor>('/crm/lost-analysis/competitors'),
  saveLostReason: (data: LostReason) => request.post<number>('/crm/lost-analysis/reason', data),
  saveCompetitor: (data: Competitor) => request.post<number>('/crm/lost-analysis/competitor', data),
  lostReport: (params: Query) => request.get<LostReport>('/crm/lost-analysis/report', { params }),
  lose: (id: number, data: LossRequest) => request.post<number>(`/crm/opportunity/${id}/lose`, data),
  win: (id: number, version: number, competitorId?: number) => request.post(`/crm/opportunity/${id}/win`, { version, competitorId }),
  credit: (id: number) => request.get<CreditView>(`/crm/credit/customer/${id}`),
  submitCredit: (id: number, data: CustomerCredit) => request.post<number>(`/crm/credit/customer/${id}/submit`, data),
  bypassCredit: (id: number, data: CustomerCredit) => request.post(`/crm/credit/customer/${id}/bypass`, data),
  territories: (parentId?: number) => request.get<Territory[]>('/crm/territory/tree', { params: { parentId } }),
  saveTerritory: (data: Territory) => request.post<Territory>('/crm/territory', data),
  deleteTerritory: (id: number) => request.delete(`/crm/territory/${id}`),
  scoreRules: () => request.get<LeadScoreRule[]>('/crm/lead-score/rules'),
  saveScoreRule: (data: LeadScoreRule) => request.post<LeadScoreRule>('/crm/lead-score/rule', data),
  recalculateLead: (id: number) => request.post<number>(`/crm/lead-score/${id}/recalculate`),
  batchScore: (ids: number[]) => request.post<string>('/crm/lead-score/batch', ids),
  qualify: (id: number, action: 'qualify' | 'disqualify' | 'start-qualifying', version?: number, comment?: string) => request.post<CrmLead>(`/crm/lead/${id}/${action}`, { version, comment, disqualifyReason: comment }),
  profileReport: (dimension: string) => request.get<ProfileReport>('/crm/profile-report', { params: { dimension } }),
  campaigns: (params: Query = {}) => request.get<PageResult<Campaign>>('/crm/campaign/list', { params }),
  campaignChoices: () => allPages<Campaign>('/crm/campaign/list'),
  campaign: (id: number) => request.get<CampaignDetail>(`/crm/campaign/${id}`),
  saveCampaign: (data: CampaignDetail) => request.post<Campaign>('/crm/campaign', data),
  campaignAudience: (id: number) => request.get<AudienceResult>(`/crm/campaign/${id}/audience`),
  recalculateCampaign: (id: number) => request.post<Campaign>(`/crm/campaign/${id}/recalculate`),
  deleteCampaign: (id: number) => request.delete(`/crm/campaign/${id}`),
  marketingEmailTasks: (campaignId: number) => request.get<MarketingEmailTask[]>('/crm/campaign/mass-email/list', { params: { campaignId } }),
  marketingEmailTemplates: () => request.get<{ templateCode: string; templateName: string }[]>('/crm/campaign/mass-email/templates'),
  marketingEmailDetail: (id: number, pageNum = 1, pageSize = 20) => request.get<MarketingEmailDetail>(`/crm/campaign/mass-email/${id}`, { params: { pageNum, pageSize } }),
  saveMarketingEmail: (draft: MarketingEmailDraft) => request.post<MarketingEmailTask>('/crm/campaign/mass-email', draft),
  previewMarketingEmail: (id: number) => request.post<MarketingEmailPreview>(`/crm/campaign/mass-email/${id}/preview`),
  sendMarketingEmail: (id: number, command: MarketingEmailCommand) => request.post<MarketingEmailTask>(`/crm/campaign/mass-email/${id}/send`, command),
  scheduleMarketingEmail: (id: number, command: MarketingEmailCommand) => request.post<MarketingEmailTask>(`/crm/campaign/mass-email/${id}/schedule`, command),
  testMarketingEmail: (id: number, command: MarketingEmailCommand) => request.post<MarketingEmailRecipient>(`/crm/campaign/mass-email/${id}/test`, command),
  cancelMarketingEmail: (id: number, command: MarketingEmailCommand) => request.post<MarketingEmailTask>(`/crm/campaign/mass-email/${id}/cancel`, command),
  targetLists: () => request.get<TargetList[]>('/crm/target-list/list'),
  targetList: (id: number) => request.get<TargetListDetail>(`/crm/target-list/${id}`),
  saveTargetList: (data: TargetListRequest) => request.post<TargetList>('/crm/target-list', data),
  previewAudience: (data: AudienceCondition) => request.post<TargetMember[]>('/crm/target-list/preview', data),
  refreshTargetList: (id: number) => request.post<TargetList>(`/crm/target-list/${id}/refresh`),
  deleteTargetList: (id: number) => request.delete(`/crm/target-list/${id}`),
  exportTargetList: (id: number) => request.get<Blob>(`/crm/target-list/${id}/export`, { responseType: 'blob' }),
};
