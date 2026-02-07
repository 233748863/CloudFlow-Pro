import request from './request';

/**
 * 消息通知 API 服务
 */

// 消息数据类型
export interface Notice {
  id: number;
  title: string;
  content: string;
  type: string;
  createTime: string;
  isRead: boolean;
  sender?: string;
}

// 分页查询参数
export interface NoticePageQuery {
  pageNum?: number;
  pageSize?: number;
}

// 分页结果
export interface PageResult<T> {
  total: number;
  records: T[];
}

/**
 * 获取消息列表（分页）
 */
export const getNoticeList = async (params?: NoticePageQuery): Promise<PageResult<Notice>> => {
  return request.get('/workflow/notice/list', { params }) as Promise<PageResult<Notice>>;
};

/**
 * 获取消息详情
 */
export const getNoticeDetail = async (noticeId: number): Promise<Notice> => {
  return request.get(`/workflow/notice/${noticeId}`) as Promise<Notice>;
};

/**
 * 标记消息已读
 */
export const markNoticeRead = async (noticeId: number): Promise<boolean> => {
  return request.post(`/workflow/notice/read/${noticeId}`) as Promise<boolean>;
};

/**
 * 删除消息
 */
export const deleteNotice = async (noticeId: number): Promise<boolean> => {
  return request.delete(`/workflow/notice/${noticeId}`) as Promise<boolean>;
};

/**
 * 获取未读消息数量
 */
export const getUnreadCount = async (): Promise<number> => {
  return request.get('/workflow/notice/unread-count') as Promise<number>;
};
