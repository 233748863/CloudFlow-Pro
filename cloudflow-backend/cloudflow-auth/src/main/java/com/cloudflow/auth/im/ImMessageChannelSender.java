package com.cloudflow.auth.im;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.auth.domain.SysMessageChannel;
import com.cloudflow.auth.domain.SysTenant;
import com.cloudflow.auth.domain.SysUser;
import com.cloudflow.auth.mapper.ImMapper;
import com.cloudflow.auth.mapper.SysMessageChannelMapper;
import com.cloudflow.common.message.channel.ChannelSendContext;
import com.cloudflow.common.message.channel.ChannelSendResult;
import com.cloudflow.common.message.channel.ChannelTestContext;
import com.cloudflow.common.message.channel.ChannelTestResult;
import com.cloudflow.common.message.channel.MessageChannelSender;
import com.cloudflow.common.message.constant.MessageChannelType;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Objects;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Component
public class ImMessageChannelSender implements MessageChannelSender {
    private final ImDatabase database;
    private final SysMessageChannelMapper channels;
    private final ImConfigRules rules;
    private final ImProperties properties;
    private final ImConnectionProbe probe;
    private final ImMessageSender provider;
    private final ImTodoSender todos;

    public ImMessageChannelSender(ImDatabase database, SysMessageChannelMapper channels, ImConfigRules rules,
            ImProperties properties, ImConnectionProbe probe, List<ImMessageSender> providers, ImTodoSender todos) {
        this.database = database;
        this.channels = channels;
        this.rules = rules;
        this.properties = properties;
        this.probe = probe;
        this.todos = todos;
        List<ImMessageSender> supported = providers.stream().filter(candidate -> "WECOM".equals(candidate.providerType())).toList();
        if (supported.size() != 1) throw new IllegalStateException("IM_MESSAGE_PROVIDER_REQUIRED");
        provider = supported.get(0);
    }

    @Override public MessageChannelType channelType() { return MessageChannelType.WECOM; }
    @Override public boolean implemented() { return true; }

    @Override
    public ChannelSendResult send(ChannelSendContext context) {
        if (TransactionSynchronizationManager.isActualTransactionActive()) throw new IllegalStateException("IM_MESSAGE_TRANSACTION_INVALID");
        if (context == null || !identifier(context.getTenantId()) || !identifier(context.getChannelId())
                || !identifier(context.getDeliveryId()) || !identifier(context.getRecordId())) return ChannelSendResult.failed("DELIVERY_REQUIRED");
        if (context.getReceiver() == null || !"USER".equals(context.getReceiver().getReceiverType())
                || !identifier(context.getReceiver().getReceiverId())) return ChannelSendResult.failed("IM_MESSAGE_LOCAL_RECEIVER_REQUIRED");
        if (context.getAttachments() != null && !context.getAttachments().isEmpty()
                || context.getParams() != null && List.of("attachments", "fileIds", "attachmentIds").stream().anyMatch(context.getParams()::containsKey)) {
            return ChannelSendResult.failed("IM_MESSAGE_ATTACHMENTS_UNSUPPORTED");
        }
        if (context.getParams() != null && (context.getParams().containsKey("imTodoMappingId") || context.getParams().containsKey("imTodoCardKey"))) {
            try {
                rules.requireDeployment();
                if (!database.read(context.getTenantId(), ignored -> activeChannel(context.getTenantId(), context.getChannelId()))) {
                    return ChannelSendResult.skipped("CHANNEL_DISABLED");
                }
                return todos.send(context);
            } catch (ImFailure failure) { return ChannelSendResult.skipped(failure.getReasonCode()); }
            catch (RuntimeException failure) { return ChannelSendResult.retryable("IM_TODO_PREFLIGHT_UNAVAILABLE"); }
        }
        Prepared prepared;
        try {
            rules.requireDeployment();
            prepared = database.read(context.getTenantId(), mapper -> prepare(mapper, context));
        } catch (ImFailure failure) { return ChannelSendResult.skipped(failure.getReasonCode()); }
        catch (RuntimeException failure) { return ChannelSendResult.retryable("IM_MESSAGE_PREFLIGHT_UNAVAILABLE"); }
        if (prepared.reason() != null) return ChannelSendResult.skipped(prepared.reason());
        ImMessageSender.Notice notice;
        try {
            String link = ImMessageContent.destination(properties.getPublicUrl(), context.getLinkUrl());
            notice = new ImMessageSender.Notice(prepared.externalUserId(), context.getTitle(), context.getContent(), link);
            ImMessageContent.body(prepared.credentials(), notice);
        } catch (RuntimeException failure) { return ChannelSendResult.failed("IM_MESSAGE_CONTENT_INVALID"); }
        try {
            ChannelSendResult result = provider.send(prepared.credentials(), notice);
            return result == null ? ChannelSendResult.unknown("IM_MESSAGE_OUTCOME_UNKNOWN") : result;
        } catch (RuntimeException failure) { return ChannelSendResult.unknown("IM_MESSAGE_OUTCOME_UNKNOWN"); }
    }

    @Override
    public ChannelTestResult test(ChannelTestContext context) {
        try {
            if (TransactionSynchronizationManager.isActualTransactionActive() || context == null
                    || !identifier(context.getTenantId()) || !identifier(context.getChannelId())) throw ImFailure.configuration();
            rules.requireDeployment();
            WeComCredentials credentials = database.read(context.getTenantId(), mapper -> {
                if (!activeTenant(mapper, context.getTenantId()) || !activeChannel(context.getTenantId(), context.getChannelId())) throw ImFailure.disabled();
                List<ImConfigRow> rows = mapper.loginConfigurations(context.getTenantId());
                if (rows.size() != 1 || !activeConfig(rows.get(0), context.getTenantId())) throw ImFailure.configuration();
                return rules.credentials(rows.get(0));
            });
            probe.test(credentials);
            return ChannelTestResult.builder().success(true).message("企业微信应用凭据验证成功；未发送业务消息").build();
        } catch (RuntimeException failure) {
            return ChannelTestResult.builder().success(false).message("企业微信消息不可用，请核对接入开关、当前租户配置及应用凭据").build();
        }
    }

    private Prepared prepare(ImMapper mapper, ChannelSendContext context) {
        long tenantId = context.getTenantId();
        long userId = context.getReceiver().getReceiverId();
        if (!activeTenant(mapper, tenantId)) return Prepared.skip("IM_MESSAGE_TENANT_UNAVAILABLE");
        if (!activeChannel(tenantId, context.getChannelId())) return Prepared.skip("CHANNEL_DISABLED");
        SysUser user = mapper.loginUser(tenantId, userId);
        if (user == null || !Objects.equals(user.getTenantId(), tenantId) || !Objects.equals(user.getUserId(), userId)
                || !"0".equals(user.getStatus()) || !Integer.valueOf(0).equals(user.getDeleted())) return Prepared.skip("RECEIVER_UNAVAILABLE");
        List<ImBindingRow> rows = mapper.ownBindings(tenantId, userId);
        if (rows.size() != 1) return Prepared.skip("NO_IM_MAPPING");
        ImBindingRow binding = rows.get(0);
        if (!Objects.equals(binding.getTenantId(), tenantId) || !Objects.equals(binding.getUserId(), userId)
                || !"WECOM".equals(binding.getImType()) || !identifier(binding.getConfigId())
                || !List.of("ACTIVE", "OUT_OF_SCOPE").contains(Objects.toString(binding.getStatus(), ""))
                || !ImMessageContent.member(binding.getImUserId())) return Prepared.skip("NO_IM_MAPPING");
        ImConfigRow config = mapper.config(tenantId, binding.getConfigId());
        if (!activeConfig(config, tenantId) || !Objects.equals(config.getConfigId(), binding.getConfigId())) return Prepared.skip("IM_MESSAGE_DISABLED");
        return new Prepared(rules.credentials(config), binding.getImUserId(), null);
    }

    private boolean activeConfig(ImConfigRow config, long tenantId) {
        return config != null && Objects.equals(config.getTenantId(), tenantId) && "WECOM".equals(config.getImType())
                && Integer.valueOf(0).equals(config.getDeleted()) && "ENABLED".equals(config.getStatus()) && Boolean.TRUE.equals(config.getMessageEnabled());
    }

    private boolean activeTenant(ImMapper mapper, long tenantId) {
        SysTenant tenant = mapper.tenant(tenantId);
        return tenant != null && Objects.equals(tenant.getTenantId(), tenantId) && "0".equals(tenant.getStatus())
                && Integer.valueOf(0).equals(tenant.getDeleted()) && (tenant.getExpireTime() == null || tenant.getExpireTime().isAfter(LocalDateTime.now()));
    }

    private boolean activeChannel(long tenantId, long channelId) {
        return channels.selectOne(new LambdaQueryWrapper<SysMessageChannel>().eq(SysMessageChannel::getTenantId, tenantId)
                .eq(SysMessageChannel::getChannelId, channelId).eq(SysMessageChannel::getChannelType, "WECOM")
                .eq(SysMessageChannel::getStatus, "ENABLED").eq(SysMessageChannel::getDeleted, 0)) != null;
    }

    private static boolean identifier(Long value) { return value != null && value > 0; }

    private record Prepared(WeComCredentials credentials, String externalUserId, String reason) {
        private static Prepared skip(String reason) { return new Prepared(null, null, reason); }
        @Override public String toString() { return "ImMessageChannelSender.Prepared[redacted]"; }
    }
}
