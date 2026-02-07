package com.cloudflow.oa.service;

import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.oa.domain.SysNotice;

public interface ISysNoticeService {
    
    /**
     * Send a notification
     */
    void sendNotice(Long recipientId, String title, String content, String type, Long senderId, String senderName);

    /**
     * Get user's notifications
     */
    PageResult<SysNotice> getMyNotices(Long userId, PageQuery pageQuery);

    /**
     * Mark notice as read
     */
    void readNotice(Long noticeId);

    /**
     * Get unread count
     */
    long getUnreadCount(Long userId);
}
