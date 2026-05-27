package com.cloudflow.oa.controller;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.security.annotation.Inner;
import com.cloudflow.oa.domain.SysAnnouncement;
import com.cloudflow.oa.service.ISysAnnouncementService;
import lombok.RequiredArgsConstructor;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDateTime;

/**
 * OA 内部公告/通知接口：供其他服务（CRM 等）发布系统通知。
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/inner/oa/announcement")
public class InnerAnnouncementController {

    private static final String CRM_CALLERS =
            "${cloudflow.security.inner.oa.announcement-callers:cloudflow-service-crm}";

    private final ISysAnnouncementService sysAnnouncementService;

    @Inner(allowedServices = {CRM_CALLERS})
    @PostMapping("/publish")
    public R<Long> publish(@RequestBody InnerAnnouncementPublishRequest request) {
        if (request == null || !StringUtils.hasText(request.getTitle())) {
            return R.fail("公告标题不能为空");
        }
        if (!StringUtils.hasText(request.getContent())) {
            return R.fail("公告内容不能为空");
        }
        SysAnnouncement announcement = new SysAnnouncement();
        announcement.setTitle(request.getTitle());
        announcement.setContent(request.getContent());
        announcement.setType(StringUtils.hasText(request.getType()) ? request.getType() : "1");
        announcement.setPriority(StringUtils.hasText(request.getPriority()) ? request.getPriority() : "M");
        announcement.setScopeType(StringUtils.hasText(request.getScopeType()) ? request.getScopeType() : "ALL");
        announcement.setScopeValue(request.getScopeValue());
        announcement.setTenantId(request.getTenantId());
        announcement.setSenderId(request.getSenderId());
        announcement.setCreateBy(StringUtils.hasText(request.getCreateBy()) ? request.getCreateBy() : "system");
        announcement.setIsTop(0);
        announcement.setExpireTime(request.getExpireTime() == null
                ? LocalDateTime.now().plusDays(7)
                : request.getExpireTime());
        boolean ok = sysAnnouncementService.publish(announcement);
        return ok ? R.ok(announcement.getAnnouncementId()) : R.fail("发布公告失败");
    }

    @lombok.Data
    public static class InnerAnnouncementPublishRequest {
        private String title;
        private String content;
        /** 1:通知 2:公告 3:紧急 */
        private String type;
        /** L 低 M 中 H 高 */
        private String priority;
        /** ALL / DEPT / ROLE */
        private String scopeType;
        private String scopeValue;
        private Long tenantId;
        private Long senderId;
        private String createBy;
        private LocalDateTime expireTime;
    }
}
