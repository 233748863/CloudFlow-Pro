package com.cloudflow.oa.controller;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.security.annotation.Inner;
import com.cloudflow.oa.service.ISysNoticeService;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/oa/inner/notice")
@RequiredArgsConstructor
public class InnerNoticeController {

    private static final String AUTH_CALLERS = "${cloudflow.security.inner.oa.auth-callers:cloudflow-auth}";

    private final ISysNoticeService sysNoticeService;

    @Inner(allowedServices = {AUTH_CALLERS})
    @PostMapping("/send")
    public R<Void> send(@RequestBody NoticeSendRequest request) {
        sysNoticeService.sendNotice(
                request.getRecipientId(),
                request.getTitle(),
                request.getContent(),
                request.getType(),
                request.getSenderId(),
                request.getSenderName());
        return R.ok();
    }

    @Data
    public static class NoticeSendRequest {
        private Long recipientId;
        private String title;
        private String content;
        private String type;
        private Long senderId;
        private String senderName;
    }
}
