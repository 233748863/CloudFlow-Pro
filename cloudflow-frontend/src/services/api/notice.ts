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
    id: Number(record.noticeId || 0),
    title: record.noticeTitle || '',
    content: record.noticeContent || '',
    type: record.noticeType || '',
    createTime: record.createTime || record.updateTime || '',
    isRead: record.status === '1',
    sender: record.createBy || undefined,
    senderId: record.senderId,
    recipientId: record.recipientId,
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
  const result = await request.get<NoticePageApiResult>('/oa/notice/list', { params });
  return normalizePageResult(result || {});
};

/**
 * 获取消息详情
 */
export const getNoticeDetail = async (noticeId: number): Promise<Notice> => {
  const result = await request.get<NoticeApiRecord>(`/oa/notice/${noticeId}`);
  return mapNotice(result || {});
};

/**
 * 标记消息已读
 */
export const markNoticeRead = async (noticeId: number): Promise<void> => {
  await request.post(`/oa/notice/read/${noticeId}`);
};

/**
 * 删除消息
 */
export const deleteNotice = async (noticeId: number): Promise<void> => {
  await request.delete(`/oa/notice/${noticeId}`);
};

/**
 * 获取未读消息数量
 */
export const getUnreadCount = async (): Promise<number> => {
  const count = await request.get<number>('/oa/notice/unread-count');
  return Number(count || 0);
};
