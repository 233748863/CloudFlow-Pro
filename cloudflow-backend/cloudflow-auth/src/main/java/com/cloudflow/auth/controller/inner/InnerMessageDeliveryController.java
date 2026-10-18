package com.cloudflow.auth.controller.inner;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.auth.domain.SysMessageChannel;
import com.cloudflow.auth.domain.SysMessageTemplate;
import com.cloudflow.auth.mapper.SysMessageChannelMapper;
import com.cloudflow.auth.mapper.SysMessageTemplateMapper;
import com.cloudflow.auth.message.EmailChannelSender;
import com.cloudflow.auth.message.MessageDeliveryService;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.message.api.MessageChannelReadiness;
import com.cloudflow.common.message.api.MessageEmailTemplate;
import com.cloudflow.common.message.api.MessageEmailTemplateChoice;
import com.cloudflow.common.message.security.MessagePayloadCodec;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.common.security.annotation.Inner;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/inner/auth/message")
@RequiredArgsConstructor
public class InnerMessageDeliveryController {
    private final SysMessageChannelMapper channels;
    private final SysMessageTemplateMapper templates;
    private final EmailChannelSender email;
    private final MessageDeliveryService deliveries;
    private final ObjectMapper json;

    @GetMapping("/email-readiness")
    @Inner(allowedServices = {"cloudflow-service-oa", "cloudflow-service-crm"})
    public R<MessageChannelReadiness> readiness(@RequestParam String templateCode) {
        Long tenantId = UserContext.getTenantId();
        if (tenantId == null) throw new com.cloudflow.common.core.exception.ServiceException("租户上下文缺失", 403);
        boolean enabled = templates.selectCount(new LambdaQueryWrapper<SysMessageTemplate>()
                .eq(SysMessageTemplate::getTenantId, tenantId).eq(SysMessageTemplate::getTemplateCode, templateCode)
                .eq(SysMessageTemplate::getChannelType, "EMAIL").eq(SysMessageTemplate::getStatus, "ENABLED")
                .eq(SysMessageTemplate::getDeleted, 0)) == 1;
        if (!enabled) return R.ok(new MessageChannelReadiness(false, "邮件模板未启用，邮件未发送"));
        boolean ready = channels.selectList(new LambdaQueryWrapper<SysMessageChannel>()
                .eq(SysMessageChannel::getTenantId, tenantId).eq(SysMessageChannel::getChannelType, "EMAIL")
                .eq(SysMessageChannel::getStatus, "ENABLED").eq(SysMessageChannel::getImplementedFlag, 1)
                .eq(SysMessageChannel::getDeleted, 0)).stream().anyMatch(email::configured);
        return R.ok(new MessageChannelReadiness(ready, ready ? "邮件配置可用，实际接纳以投递结果为准" : "邮件渠道未配置或部署白名单无效，邮件未发送"));
    }

    @GetMapping("/oa-delivery/{recordId}")
    @Inner(allowedServices = "cloudflow-service-oa")
    @SysLog(value = "读取内部邮件投递快照", logParams = false)
    public R<JsonNode> oaSnapshot(@PathVariable Long recordId) {
        return R.ok(MessagePayloadCodec.internalTree(deliveries.businessSnapshot(UserContext.getTenantId(), recordId, "cloudflow-service-oa"), json));
    }

    @GetMapping("/crm-delivery/{recordId}")
    @Inner(allowedServices = "cloudflow-service-crm")
    @SysLog(value = "读取CRM邮件投递快照", logParams = false)
    public R<JsonNode> crmSnapshot(@PathVariable Long recordId) {
        return R.ok(MessagePayloadCodec.internalTree(deliveries.businessSnapshot(UserContext.getTenantId(), recordId, "cloudflow-service-crm"), json));
    }

    @GetMapping("/crm-template")
    @Inner(allowedServices = "cloudflow-service-crm")
    @SysLog(value = "读取CRM邮件模板", logParams = false)
    public R<JsonNode> crmTemplate(@RequestParam String templateCode) {
        Long tenantId = UserContext.getTenantId();
        if (tenantId == null || templateCode == null || !templateCode.matches("[A-Za-z0-9_-]{1,100}")) {
            throw new com.cloudflow.common.core.exception.ServiceException("邮件模板查询无效", 403);
        }
        SysMessageTemplate template = templates.selectOne(new LambdaQueryWrapper<SysMessageTemplate>()
                .eq(SysMessageTemplate::getTenantId, tenantId).eq(SysMessageTemplate::getTemplateCode, templateCode)
                .eq(SysMessageTemplate::getBizModule, "crm").eq(SysMessageTemplate::getChannelType, "EMAIL")
                .eq(SysMessageTemplate::getStatus, "ENABLED").eq(SysMessageTemplate::getDeleted, 0));
        if (template == null) return R.ok(MessagePayloadCodec.internalTree(new MessageEmailTemplate(null, templateCode, null, null, null, null, null, false, "CRM邮件模板未启用"), json));
        if (!Integer.valueOf(0).equals(template.getForceSendFlag())) {
            return R.ok(MessagePayloadCodec.internalTree(new MessageEmailTemplate(template.getTemplateId(), templateCode, template.getVersion(), template.getContentTemplate(),
                    template.getParamsDeclare(), null, null, false, "营销邮件模板不得启用强制发送，请先关闭该选项"), json));
        }
        List<SysMessageChannel> available = channels.selectList(new LambdaQueryWrapper<SysMessageChannel>()
                .eq(SysMessageChannel::getTenantId, tenantId).eq(SysMessageChannel::getChannelType, "EMAIL")
                .eq(SysMessageChannel::getStatus, "ENABLED").eq(SysMessageChannel::getImplementedFlag, 1)
                .eq(SysMessageChannel::getDeleted, 0).orderByAsc(SysMessageChannel::getPriority, SysMessageChannel::getChannelId));
        SysMessageChannel channel = available.isEmpty() ? null : available.get(0);
        boolean ready = channel != null && email.configured(channel);
        return R.ok(MessagePayloadCodec.internalTree(new MessageEmailTemplate(template.getTemplateId(), templateCode, template.getVersion(), template.getContentTemplate(),
                template.getParamsDeclare(), channel == null ? null : channel.getFromAddress(), channel == null ? null : channel.getFromName(),
                ready, ready ? null : "邮件渠道未配置或部署白名单无效，邮件未发送"), json));
    }

    @GetMapping("/crm-templates")
    @Inner(allowedServices = "cloudflow-service-crm")
    public R<java.util.List<MessageEmailTemplateChoice>> crmTemplates() {
        Long tenantId = UserContext.getTenantId();
        if (tenantId == null) throw new com.cloudflow.common.core.exception.ServiceException("租户上下文缺失", 403);
        return R.ok(templates.selectList(new LambdaQueryWrapper<SysMessageTemplate>()
                .eq(SysMessageTemplate::getTenantId, tenantId).eq(SysMessageTemplate::getBizModule, "crm")
                .eq(SysMessageTemplate::getChannelType, "EMAIL").eq(SysMessageTemplate::getStatus, "ENABLED")
                .eq(SysMessageTemplate::getForceSendFlag, 0).eq(SysMessageTemplate::getDeleted, 0)
                .orderByAsc(SysMessageTemplate::getTemplateCode)).stream()
                .map(template -> new MessageEmailTemplateChoice(template.getTemplateCode(), template.getTemplateName())).toList());
    }
}
