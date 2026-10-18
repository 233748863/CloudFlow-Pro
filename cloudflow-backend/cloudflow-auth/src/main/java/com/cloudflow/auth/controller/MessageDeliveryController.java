package com.cloudflow.auth.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.auth.domain.dto.MessageDeliveryResolveDTO;
import com.cloudflow.auth.domain.vo.MessageDeliveryVO;
import com.cloudflow.auth.service.MessageDeliveryResolutionService;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.common.ratelimiter.annotation.RateLimiter;
import com.cloudflow.common.ratelimiter.enums.LimitType;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/system/message/delivery")
@RequiredArgsConstructor
public class MessageDeliveryController {
    private final MessageDeliveryResolutionService service;

    @GetMapping("/{deliveryId}")
    @SaCheckPermission("system:message:record:list")
    public R<MessageDeliveryVO> get(@PathVariable Long deliveryId) { return R.ok(service.get(deliveryId)); }

    @PostMapping("/{deliveryId}/resolve")
    @SaCheckPermission("system:message:record:resend")
    @SysLog("核验外部消息发送结果")
    @RepeatSubmit
    @RateLimiter(key = "message:delivery:resolve", time = 60, count = 5, limitType = LimitType.USER)
    public R<MessageDeliveryVO> resolve(@PathVariable Long deliveryId, @RequestBody @Valid MessageDeliveryResolveDTO request) {
        return R.ok(service.resolve(deliveryId, request));
    }
}
