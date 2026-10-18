import request from '../request';
import type { PageResult } from '@/types';

export type EmailBusinessType = 'CUSTOMER' | 'OPPORTUNITY' | 'TICKET' | 'QUOTE';
export interface EmailFile { fileId: number; fileName: string; fileSize: number }
export interface CustomerEmail {
  emailId: number; messageRecordId?: number; requestKey?: string; direction: 'INBOUND' | 'OUTBOUND'; subject: string;
  contentSummary?: string; sanitizedContent?: string; fromAddress?: string; toAddresses: string[]; ccAddresses?: string[];
  bizType: EmailBusinessType; bizId: number; customerId: number; contactId?: number; senderUserId: number;
  sendTime?: string; sendStatus: string; attachmentCount: number; attachments?: EmailFile[]; readFlag: number;
  readTime?: string; remark?: string; createBy?: string; createTime?: string;
}
export interface CustomerEmailRequest {
  requestKey: string; bizType: EmailBusinessType; bizId: number; contactId?: number; templateCode?: string;
  subject: string; content: string; fileIds: number[]; fromAddress?: string; toAddresses?: string[]; ccAddresses?: string[]; remark?: string;
}
export interface EmailOutcome { emailId: number; sendStatus: string; code: string; message: string }
export interface EmailContext { bizType: EmailBusinessType; bizId: number; customerId: number; businessName: string; contacts: { contactId: number; contactName: string; emailMask: string }[] }
export interface EmailTemplatePreview { content: string; ready: boolean; reason: string }
type Query = Record<string, string | number | undefined>;

export const emailArchive = {
  list: (params: Query) => request.get<PageResult<CustomerEmail>>('/crm/email/list', { params, silent: true }),
  detail: (emailId: number) => request.get<CustomerEmail>(`/crm/email/${emailId}`, { silent: true }),
  context: (bizType: EmailBusinessType, bizId: number) => request.get<EmailContext>('/crm/email/context', { params: { bizType, bizId }, silent: true }),
  templates: () => request.get<{ templateCode: string; templateName: string }[]>('/crm/email/templates', { silent: true }),
  template: (templateCode: string, bizType: EmailBusinessType, bizId: number, contactId?: number) => request.get<EmailTemplatePreview>('/crm/email/template', { params: { templateCode, bizType, bizId, contactId }, silent: true }),
  draft: (body: CustomerEmailRequest) => request.post<EmailOutcome>('/crm/email/draft', body, { silent: true }),
  send: (body: CustomerEmailRequest) => request.post<EmailOutcome>('/crm/email/send', body, { silent: true }),
  inbound: (body: CustomerEmailRequest) => request.post<EmailOutcome>('/crm/email/archive-inbound', body, { silent: true }),
  upload: (bizType: EmailBusinessType, bizId: number, file: File, inbound: boolean) => {
    const body = new FormData(); body.append('file', file);
    return request.post<EmailFile>(inbound ? '/crm/email/attachments/inbound-upload' : '/crm/email/attachments/upload', body,
      { params: { bizType, bizId }, headers: { 'Content-Type': 'multipart/form-data' }, silent: true });
  },
  attachment: (emailId: number, fileId: number) => downloadAuthorizedFile(
    { bizType: 'CRM_EMAIL_ATTACHMENT', bizId: String(emailId), fileId }, new AbortController().signal),
};
import { downloadAuthorizedFile } from '../file';
