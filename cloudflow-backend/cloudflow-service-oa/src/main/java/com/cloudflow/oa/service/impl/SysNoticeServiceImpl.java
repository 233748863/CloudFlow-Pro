package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.oa.config.NotificationWebSocketHandler;
import com.cloudflow.oa.domain.SysNotice;
import com.cloudflow.oa.mapper.SysNoticeMapper;
import com.cloudflow.oa.service.ISysNoticeService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import com.fasterxml.jackson.annotation.JsonFormat;
import java.util.HashMap;
import java.util.Map;

@Service
public class SysNoticeServiceImpl implements ISysNoticeService {

    @Autowired
    private SysNoticeMapper noticeMapper;

    @Autowired
    private NotificationWebSocketHandler webSocketHandler;

    @Override
    @Async
    public void sendNotice(Long recipientId, String title, String content, String type, Long senderId, String senderName) {
        if (recipientId == null) return;

        // 1. Save to DB
        SysNotice notice = new SysNotice();
        notice.setNoticeTitle(title);
        notice.setNoticeContent(content);
        notice.setNoticeType(type);
        notice.setRecipientId(recipientId);
        notice.setSenderId(senderId);
        notice.setStatus("0"); // Unread
        notice.setCreateTime(LocalDateTime.now());
        notice.setCreateBy(senderName);
        
        noticeMapper.insert(notice);

        // 2. Push via WebSocket
        Map<String, Object> message = new HashMap<>();
        message.put("type", "NOTICE");
        message.put("data", notice);
        
        webSocketHandler.sendMessage(recipientId, message);
    }

    @Override
    public PageResult<SysNotice> getMyNotices(Long userId, PageQuery pageQuery) {
        Page<SysNotice> page = new Page<>(pageQuery.getPageNum(), pageQuery.getPageSize());
        LambdaQueryWrapper<SysNotice> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(SysNotice::getRecipientId, userId);
        wrapper.orderByDesc(SysNotice::getCreateTime);
        
        Page<SysNotice> result = noticeMapper.selectPage(page, wrapper);
        return new PageResult<>(result.getRecords(), result.getTotal(), result.getCurrent(), result.getSize());
    }

    @Override
    public void readNotice(Long noticeId) {
        SysNotice notice = new SysNotice();
        notice.setNoticeId(noticeId);
        notice.setStatus("1");
        notice.setUpdateTime(LocalDateTime.now());
        noticeMapper.updateById(notice);
    }

    @Override
    public long getUnreadCount(Long userId) {
        return noticeMapper.selectCount(new LambdaQueryWrapper<SysNotice>()
                .eq(SysNotice::getRecipientId, userId)
                .eq(SysNotice::getStatus, "0"));
    }

    @Override
    public SysNotice getNoticeById(Long noticeId) {
        return noticeMapper.selectById(noticeId);
    }

    @Override
    public void deleteNotice(Long noticeId) {
        noticeMapper.deleteById(noticeId);
    }
}
