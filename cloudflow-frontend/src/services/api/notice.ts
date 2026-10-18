import request from './request';

/**
 * 消息通知 API 服务
 */

interface NoticeApiRecord {
  noticeId?: number;
  noticeTitle?: string;
  noticeContent?: string;
  noticeType?: string;
  status?: string;
  createBy?: string;
  createTime?: string;
  updateTime?: string;
  senderId?: number;
  recipientId?: number;
  linkUrl?: string;
  recordId?: number;
  title?: string;
  content?: string;
  messageCategory?: string;
  readFlag?: number;
  receiverName?: string;
  senderName?: string;
  bizType?: string;
  bizId?: string;
}

interface NoticePageApiResult {
  total?: number;
  rows?: NoticeApiRecord[];
  records?: NoticeApiRecord[];
  pageNum?: number;
  pageSize?: number;
}

export interface Notice {
  id: number;
  title: string;
  content: string;
  type: string;
  createTime: string;
  isRead: boolean;
  sender?: string;
  senderId?: number;
  recipientId?: number;
  linkUrl?: string;
  bizType?: string;
  bizId?: string;
}

// 分页查询参数
export interface NoticePageQuery {
  pageNum?: number;
  pageSize?: number;
}

// 分页结果
export interface PageResult<T> {
  total: number;
  rows: T[];
  records?: T[];
  pageNum?: number;
  pageSize?: number;
}

function mapNotice(record: NoticeApiRecord): Notice {
  return {
    id: Number(record.recordId ?? record.noticeId ?? 0),
    title: record.title || record.noticeTitle || '',
    content: record.content || record.noticeContent || '',
    type: record.messageCategory || record.noticeType || '',
    createTime: record.createTime || record.updateTime || '',
    isRead: record.readFlag === 1 || record.status === '1',
    sender: record.senderName || record.createBy || undefined,
    senderId: record.senderId,
    recipientId: record.recipientId,
    linkUrl: record.linkUrl,
    bizType: record.bizType,
    bizId: record.bizId,
  };
}

function normalizePageResult(result: NoticePageApiResult): PageResult<Notice> {
  const rows = (result.rows || result.records || []).map(mapNotice);
  return {
    total: result.total || rows.length,
    rows,
    records: rows,
    pageNum: result.pageNum,
    pageSize: result.pageSize,
  };
}

/**
 * 获取消息列表（分页）
 */
export const getNoticeList = async (params?: NoticePageQuery): Promise<PageResult<Notice>> => {
  const result = await request.get<NoticePageApiResult>('/auth/system/message/mine', { params });
  return normalizePageResult(result || {});
};

/**
 * 获取消息详情
 */
export const getNoticeDetail = async (noticeId: number): Promise<Notice> => {
  const result = await request.get<NoticeApiRecord>(`/auth/system/message/mine/${noticeId}`);
  return mapNotice(result || {});
};

/**
 * 标记消息已读
 */
export const markNoticeRead = async (noticeId: number): Promise<void> => {
  await request.put('/auth/system/message/mine/read', { recordIds: [noticeId] });
};

/**
 * 获取未读消息数量
 */
export const getUnreadCount = async (): Promise<number> => {
  const result = await request.get<Record<string, number>>('/auth/system/message/mine/unread-count');
  return Number(result?.TOTAL || 0);
};
