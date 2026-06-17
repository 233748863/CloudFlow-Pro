package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.event.SystemNoticeCreatedEvent;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.event.outbox.OutboxPublisher;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.oa.config.NotificationWebSocketHandler;
import com.cloudflow.oa.domain.SysNotice;
import com.cloudflow.oa.mapper.SysNoticeMapper;
import com.cloudflow.oa.service.ISysNoticeService;
import com.cloudflow.common.audit.annotation.Audit;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.stereotype.Service;

import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;

import java.time.LocalDateTime;

@Service
@RequiredArgsConstructor
public class SysNoticeServiceImpl implements ISysNoticeService {

    private static final String WORKPLACE_SUMMARY_CACHE = "oa_workplace_summary_core#60s";

    private final SysNoticeMapper noticeMapper;
    private final NotificationWebSocketHandler webSocketHandler;
    private final OutboxPublisher outboxPublisher;
    private final ObjectMapper objectMapper;

    @Override
    @CacheEvict(cacheNames = WORKPLACE_SUMMARY_CACHE, key = "#recipientId", condition = "#recipientId != null")
    public void sendNotice(Long recipientId, String title, String content, String type, Long senderId, String senderName) {
        if (recipientId == null) return;

        SysNotice notice = new SysNotice();
        notice.setNoticeTitle(title);
        notice.setNoticeContent(content);
        notice.setNoticeType(type);
        notice.setRecipientId(recipientId);
        notice.setSenderId(senderId);
        notice.setTenantId(resolveTenantId());
        notice.setStatus("0");
        notice.setCreateTime(LocalDateTime.now());
        notice.setCreateBy(senderName);
        notice.setUpdateTime(notice.getCreateTime());
        notice.setUpdateBy(senderName);
        noticeMapper.insert(notice);
        publishNoticeCreatedEvent(notice, senderName);
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
    @CacheEvict(cacheNames = WORKPLACE_SUMMARY_CACHE, key = "T(com.cloudflow.common.core.context.UserContext).getUserId()")
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
    @Audit(name = "删除通知", diff = true, highRisk = true)
    public void deleteNotice(Long noticeId) {
        noticeMapper.deleteById(noticeId);
    }

    private void publishNoticeCreatedEvent(SysNotice notice, String senderName) {
        try {
            SystemNoticeCreatedEvent event = new SystemNoticeCreatedEvent();
            event.setNoticeId(notice.getNoticeId());
            event.setTenantId(notice.getTenantId());
            event.setRecipientId(notice.getRecipientId());
            event.setSenderId(notice.getSenderId());
            event.setSenderName(senderName);
            event.setTitle(notice.getNoticeTitle());
            event.setContent(notice.getNoticeContent());
            event.setType(notice.getNoticeType());
            event.setStatus(notice.getStatus());
            event.setCreateTime(notice.getCreateTime());

            BusinessEventEnvelope envelope = BusinessEventEnvelope.builder()
                    .eventType("SYSTEM_NOTICE_CREATED")
                    .sourceModule("cloudflow-oa")
                    .sourceId(notice.getNoticeId())
                    .tenantId(notice.getTenantId())
                    .payload(objectMapper.writeValueAsString(event))
                    .build();
            outboxPublisher.publish(envelope);
        } catch (Exception e) {
            webSocketHandler.sendMessage(notice.getRecipientId(), buildLocalWsMessage(notice, senderName));
        }
    }

    private java.util.Map<String, Object> buildLocalWsMessage(SysNotice notice, String senderName) {
        java.util.Map<String, Object> data = new java.util.HashMap<>();
        data.put("noticeId", notice.getNoticeId());
        data.put("noticeTitle", notice.getNoticeTitle());
        data.put("noticeContent", notice.getNoticeContent());
        data.put("noticeType", notice.getNoticeType());
        data.put("status", notice.getStatus());
        data.put("senderId", notice.getSenderId());
        data.put("recipientId", notice.getRecipientId());
        data.put("createBy", senderName);
        data.put("createTime", notice.getCreateTime());
        java.util.Map<String, Object> message = new java.util.HashMap<>();
        message.put("type", "NOTICE");
        message.put("data", data);
        return message;
    }

    private Long resolveTenantId() {
        Long tenantId = UserContext.getTenantId();
        return tenantId != null ? tenantId : TenantContext.getTenantId();
    }
}
