import request from './request';

export type MessageChannelType = 'INTERNAL' | 'EMAIL' | 'SMS' | 'WECOM' | 'DINGTALK' | 'FEISHU' | 'WEBHOOK';
export type MessageCategory = 'TODO' | 'CC' | 'ANNOUNCEMENT' | 'SYSTEM' | 'BIZ_REMINDER';
export type MessageStatus = 'ENABLED' | 'DISABLED';
export type MessageSendStatus = 'PENDING' | 'CLAIMED' | 'SENDING' | 'RETRYABLE' | 'UNKNOWN' | 'SUCCESS' | 'FAILED' | 'CANCELLED' | 'SKIPPED';

export interface MessagePage<T> {
  rows: T[];
  total: number;
  pageNum: number;
  pageSize: number;
}

export interface MessagePageQuery {
  pageNum: number;
  pageSize: number;
  channelType?: MessageChannelType | '';
  status?: MessageStatus | '';
  templateCode?: string;
}

export interface MessageChannel {
  channelId?: number;
  channelType: MessageChannelType;
  channelCode: string;
  channelName: string;
  provider?: string;
  signature?: string;
  apiKey?: string;
  apiSecret?: string;
  endpoint?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpSslFlag?: number;
  smtpUsername?: string;
  smtpPwd?: string;
  fromAddress?: string;
  fromName?: string;
  callbackUrl?: string;
  priority: number;
  rateLimitMinute?: number | null;
  dailyLimit?: number | null;
  retryCount: number;
  retryIntervalSec: number;
  implementedFlag?: number;
  status: MessageStatus;
  remark?: string;
}

export interface MessageTemplate {
  templateId?: number;
  templateCode: string;
  templateName: string;
  channelType: MessageChannelType;
  bizModule?: string;
  messageCategory: MessageCategory;
  titleTemplate?: string;
  contentTemplate: string;
  paramsDeclare?: string;
  forceSendFlag: number;
  dedupeWindowSec: number;
  linkUrlTemplate?: string;
  status: MessageStatus;
  remark?: string;
  updateTime?: string;
}

export interface MessageRecord {
  recordId: number;
  deliveryId?: number;
  traceId?: string;
  templateCode?: string;
  channelType: MessageChannelType;
  receiverType?: string;
  receiverId?: number;
  receiverAddrMask?: string;
  receiverName?: string;
  title?: string;
  content?: string;
  messageCategory: MessageCategory;
  bizType?: string;
  bizId?: string;
  linkUrl?: string;
  sendStatus: MessageSendStatus;
  skipReason?: string;
  retryCount?: number;
  errorMsg?: string;
  sendTime?: string;
  readFlag: number;
  readTime?: string;
  resendFromId?: number;
  createTime?: string;
}

export interface MessageRecordQuery extends MessagePageQuery {
  sendStatus?: MessageSendStatus | '';
  bizType?: string;
  receiverId?: number;
  beginTime?: string;
  endTime?: string;
}

export interface MessageStatistics {
  total: number;
  success: number;
  failed: number;
  unknown: number;
  successRate: number;
  topFailureReasons: { reason: string; count: number }[];
  channelSuccessRates: Record<string, number>;
  templateSuccessRates: Record<string, number>;
}

export interface MyMessage {
  recordId: number;
  title?: string;
  content?: string;
  messageCategory: MessageCategory;
  linkUrl?: string;
  readFlag: number;
  createTime?: string;
}

export interface MyMessageQuery {
  pageNum: number;
  pageSize: number;
  category?: MessageCategory | '';
  readFlag?: number;
  beginTime?: string;
  endTime?: string;
}

export interface MessageSubscription {
  messageCategory: MessageCategory;
  channelType: MessageChannelType;
  enabledFlag: number;
  quietStart?: string | null;
  quietEnd?: string | null;
}

const basePath = '/auth/system/message';

export const listMessageChannels = (params: MessagePageQuery) =>
  request.get<MessagePage<MessageChannel>>(`${basePath}/channel/list`, { params });
export const getMessageChannel = (channelId: number) =>
  request.get<MessageChannel>(`${basePath}/channel/${channelId}`);
export const addMessageChannel = (payload: MessageChannel) => request.post<void>(`${basePath}/channel`, payload);
export const updateMessageChannel = (payload: MessageChannel) => request.put<void>(`${basePath}/channel`, payload);
export const removeMessageChannels = (channelIds: number[]) =>
  request.delete<void>(`${basePath}/channel/${channelIds.join(',')}`);
export const testMessageChannel = (channelId: number, payload: { target?: string; content?: string }) =>
  request.post<{ success: boolean; message: string }>(`${basePath}/channel/${channelId}/test`, payload);

export const listMessageTemplates = (params: MessagePageQuery) =>
  request.get<MessagePage<MessageTemplate>>(`${basePath}/template/list`, { params });
export const getMessageTemplate = (templateId: number) =>
  request.get<MessageTemplate>(`${basePath}/template/${templateId}`);
export const addMessageTemplate = (payload: MessageTemplate) => request.post<void>(`${basePath}/template`, payload);
export const updateMessageTemplate = (payload: MessageTemplate) => request.put<void>(`${basePath}/template`, payload);
export const removeMessageTemplates = (templateIds: number[]) =>
  request.delete<void>(`${basePath}/template/${templateIds.join(',')}`);
export const previewMessageTemplate = (payload: {
  templateCode: string;
  channelType: MessageChannelType;
  params: Record<string, unknown>;
}) => request.post<{ title: string; content: string }>(`${basePath}/template/preview`, payload);

export const listMessageRecords = (params: MessageRecordQuery) =>
  request.get<MessagePage<MessageRecord>>(`${basePath}/record/list`, { params });
export const resendMessageRecords = (recordIds: number[]) =>
  request.post<{ requested: number; accepted: number }>(`${basePath}/record/${recordIds.join(',')}/resend`);
export interface MessageDelivery {
  deliveryId: number;
  recordId: number;
  channelType: MessageChannelType;
  status: Exclude<MessageSendStatus, 'SUCCESS'> | 'SENT';
  attemptCount: number;
  version: number;
  sendStartedTime?: string;
  nextAttemptTime?: string;
  acceptedTime?: string;
  lastErrorCode?: string;
  resolvedBy?: number;
  resolutionReason?: string;
}

export const getMessageDelivery = (deliveryId: number) =>
  request.get<MessageDelivery>(`${basePath}/delivery/${deliveryId}`);
export const resolveMessageDelivery = (deliveryId: number, payload: {
  version: number;
  conclusion: 'ACCEPTED' | 'NOT_ACCEPTED';
  evidence: string;
  password: string;
  totpCode?: string;
}) => request.post<MessageDelivery>(`${basePath}/delivery/${deliveryId}/resolve`, payload);
export const getMessageStatistics = (params: { beginTime?: string; endTime?: string }) =>
  request.get<MessageStatistics>(`${basePath}/record/statistics`, { params });

export const listMyMessages = (params: MyMessageQuery) =>
  request.get<MessagePage<MyMessage>>(`${basePath}/mine`, { params });
export const getMyMessage = (recordId: number) => request.get<MyMessage>(`${basePath}/mine/${recordId}`);
export const readMyMessages = (payload: { recordIds?: number[]; category?: MessageCategory; all?: boolean }) =>
  request.put<void>(`${basePath}/mine/read`, payload);
export const listMySubscriptions = () => request.get<MessageSubscription[]>(`${basePath}/subscribe/mine`);
export const saveMySubscriptions = (payload: MessageSubscription[]) => request.put<void>(`${basePath}/subscribe/mine`, payload);
