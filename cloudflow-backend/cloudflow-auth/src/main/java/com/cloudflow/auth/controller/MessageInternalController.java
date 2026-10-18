package com.cloudflow.auth.controller;

import com.cloudflow.auth.domain.dto.SmsCodeSendDTO;
import com.cloudflow.auth.domain.dto.SmsCodeVerifyDTO;
import com.cloudflow.auth.service.SmsCodeService;
import com.cloudflow.auth.message.MessageDispatchService;
import com.cloudflow.auth.domain.vo.SendResultVO;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.message.api.MessageSendRequest;
import com.cloudflow.common.security.annotation.Inner;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.ratelimiter.annotation.RateLimiter;
import com.cloudflow.common.ratelimiter.enums.LimitType;
import cn.dev33.satoken.annotation.SaIgnore;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.core.env.Environment;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * 消息内部发送与短信验证码接口。
 */
@RestController
@RequestMapping
@RequiredArgsConstructor
public class MessageInternalController {
    private final SmsCodeService smsCodeService;
    private final MessageDispatchService messageDispatchService;
    private final ObjectMapper objectMapper;
    private final Environment environment;

    @Inner
    @PostMapping("/inner/message/send-sync")
    public R<SendResultVO> sendSync(@RequestBody MessageSendRequest request) {
        if (request == null || request.safeReceivers().isEmpty()) {
            return R.ok(new SendResultVO(false, "接收人不能为空", null));
        }
        try {
            BusinessEventEnvelope envelope = BusinessEventEnvelope.builder()
                    .eventId(UUID.randomUUID().toString())
                    .eventType("MESSAGE_SEND")
                    .sourceModule(environment.getProperty("spring.application.name", "cloudflow-auth"))
                    .tenantId(com.cloudflow.common.core.context.UserContext.getTenantId() == null
                            ? 100000L : com.cloudflow.common.core.context.UserContext.getTenantId())
                    .payload(objectMapper.writeValueAsString(request))
                    .build();
            MessageDispatchService.DispatchResult result = messageDispatchService.dispatch(envelope);
            return R.ok(new SendResultVO(result.success(), result.message(), result.firstRecordId()));
        } catch (ServiceException e) {
            return R.ok(new SendResultVO(false, e.getMessage(), null));
        } catch (Exception e) {
            return R.ok(new SendResultVO(false, "消息发送失败", null));
        }
    }

    @RepeatSubmit.Disabled
    @RateLimiter(key = "auth:sms-code:send", time = 60, count = 5, limitType = LimitType.IP)
    @PostMapping("/sms/code/send")
    @SaIgnore
    public R<Void> sendSmsCode(@RequestBody @Valid SmsCodeSendDTO dto, HttpServletRequest request) {
        smsCodeService.send(dto, request);
        return R.ok();
    }

    @RateLimiter(key = "auth:sms-code:verify", time = 60, count = 10, limitType = LimitType.IP)
    @RepeatSubmit.Disabled
    @PostMapping("/sms/code/verify")
    @SaIgnore
    public R<Void> verifySmsCode(@RequestBody @Valid SmsCodeVerifyDTO dto) {
        smsCodeService.verify(dto);
        return R.ok();
    }
}
