package com.cloudflow.auth.message;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.cloudflow.auth.domain.SysMessageChannel;
import com.cloudflow.auth.domain.SysMessageDelivery;
import com.cloudflow.auth.domain.SysMessageRecord;
import com.cloudflow.auth.domain.SysMessageSubscribe;
import com.cloudflow.auth.domain.SysMessageTemplate;
import com.cloudflow.auth.domain.SysUser;
import com.cloudflow.auth.mapper.SysMessageChannelMapper;
import com.cloudflow.auth.mapper.SysMessageDeliveryMapper;
import com.cloudflow.auth.mapper.SysMessageRecordMapper;
import com.cloudflow.auth.mapper.SysMessageSubscribeMapper;
import com.cloudflow.auth.mapper.SysMessageTemplateMapper;
import com.cloudflow.auth.mapper.SysUserMapper;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.audit.domain.SysAuditLogEntity;
import com.cloudflow.common.audit.mapper.SysAuditLogMapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.event.outbox.OutboxPublisher;
import com.cloudflow.common.message.api.MessageDeliveryResult;
import com.cloudflow.common.message.api.MessageReceiver;
import com.cloudflow.common.message.api.MessageSendRequest;
import com.cloudflow.common.message.channel.ChannelSendContext;
import com.cloudflow.common.message.channel.ChannelSendResult;
import com.cloudflow.common.message.channel.MessageChannelSender;
import com.cloudflow.common.message.channel.MessageChannelSenderFactory;
import com.cloudflow.common.message.constant.MessageChannelType;
import com.cloudflow.common.message.security.MessagePayloadCodec;
import com.cloudflow.common.message.security.MessageSecretCipher;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.function.Supplier;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.util.StringUtils;

@Service
@RequiredArgsConstructor
public class MessageDeliveryService {
    private final SysMessageDeliveryMapper deliveries;
    private final SysMessageRecordMapper records;
    private final SysMessageChannelMapper channels;
    private final SysMessageTemplateMapper templates;
    private final SysMessageSubscribeMapper subscriptions;
    private final SysUserMapper users;
    private final MessageChannelSenderFactory senders;
    private final MessageSecretCipher cipher;
    private final ObjectMapper json;
    private final PlatformTransactionManager transactionManager;
    private final List<MessageDeliverySourceGuard> sourceGuards;
    private final OutboxPublisher outcomePublisher;
    private final SysAuditLogMapper auditLogs;

    public SysMessageRecord reserve(BusinessEventEnvelope envelope, MessageSendRequest input,
            MessageChannelType type, MessageReceiver receiver) {
        if (!TransactionSynchronizationManager.isActualTransactionActive()) {
            throw new IllegalStateException("消息记录与投递占位必须在同一事务保存");
        }
        requireTenant(envelope.getTenantId());
        MessageReceiver normalized = normalized(receiver, type);
        MessageSendRequest request = input.toBuilder().receivers(List.of(normalized)).channelTypes(List.of(type)).build();
        String receiverKey = receiverKey(normalized);
        ObjectNode source = json.createObjectNode();
        source.put("sourceModule", envelope.getSourceModule());
        source.set("request", MessagePayloadCodec.internalTree(request, json));
        String payloadHash = MessagePayloadCodec.digest(source, json);
        SysMessageDelivery existing = deliveries.selectOne(new LambdaQueryWrapper<SysMessageDelivery>()
                .eq(SysMessageDelivery::getTenantId, envelope.getTenantId())
                .eq(SysMessageDelivery::getOutboxEventId, envelope.getEventId())
                .eq(SysMessageDelivery::getChannelType, type.name()).eq(SysMessageDelivery::getReceiverKey, receiverKey));
        if (existing != null) {
            if (!Objects.equals(existing.getPayloadHash(), payloadHash)) {
                throw new ServiceException("同源消息内容不一致，已停止投递", 409);
            }
            return ownedRecord(envelope.getTenantId(), existing.getRecordId());
        }
        SysMessageTemplate template = StringUtils.hasText(request.getTemplateCode())
                ? templates.selectOne(new LambdaQueryWrapper<SysMessageTemplate>()
                    .eq(SysMessageTemplate::getTenantId, envelope.getTenantId())
                    .eq(SysMessageTemplate::getTemplateCode, request.getTemplateCode())
                    .eq(SysMessageTemplate::getChannelType, type.name()).eq(SysMessageTemplate::getStatus, "ENABLED")
                    .eq(SysMessageTemplate::getDeleted, 0)) : null;
        boolean direct = StringUtils.hasText(request.getContent())
                && (template == null || Boolean.TRUE.equals(request.getRenderedContent()));
        if (template != null && Integer.valueOf(1).equals(template.getForceSendFlag())) {
            request = request.toBuilder().forceSend(true).build();
        }
        String title = direct ? request.getTitle() : template == null ? null
                : MessageTemplateRendering.render(template.getTitleTemplate(), request.safeParams());
        String content = direct ? request.getContent() : template == null ? null
                : type == MessageChannelType.EMAIL ? MessageTemplateRendering.renderHtml(template.getContentTemplate(), request.safeParams())
                : MessageTemplateRendering.render(template.getContentTemplate(), request.safeParams());
        String linkUrl = request.getLinkUrl();
        if (type == MessageChannelType.WECOM) {
            String linkTemplate = StringUtils.hasText(linkUrl) ? linkUrl : template == null ? null : template.getLinkUrlTemplate();
            linkUrl = MessageTemplateRendering.render(linkTemplate, request.safeParams());
        }
        if (title != null && title.length() > 500 || content != null && content.length() > 1_048_576) {
            throw new ServiceException("邮件标题最多500字符，正文最多1048576字符");
        }
        List<SysMessageChannel> available = channels.selectList(new LambdaQueryWrapper<SysMessageChannel>()
                .eq(SysMessageChannel::getTenantId, envelope.getTenantId()).eq(SysMessageChannel::getChannelType, type.name())
                .eq(SysMessageChannel::getStatus, "ENABLED").eq(SysMessageChannel::getDeleted, 0)
                .orderByAsc(SysMessageChannel::getPriority, SysMessageChannel::getChannelId));
        SysMessageChannel channel = available.stream().filter(value -> Integer.valueOf(1).equals(value.getImplementedFlag()))
                .findFirst().orElse(null);
        String reason = null;
        if (available.isEmpty()) reason = "NO_CHANNEL";
        else if (channel == null || senders.get(type) == null || !senders.get(type).implemented()) reason = "NOT_IMPLEMENTED";
        else if (template == null && (StringUtils.hasText(request.getTemplateCode()) || !direct)) reason = "TEMPLATE_UNAVAILABLE";
        else if (!direct && MessageTemplateRendering.missing(template.getParamsDeclare(), request.safeParams(), json) != null) {
            reason = "TEMPLATE_PARAMS_REQUIRED";
        }
        String category = template != null ? template.getMessageCategory()
                : request.getCategory() == null ? "SYSTEM" : request.getCategory().name();
        SysMessageRecord record = new SysMessageRecord();
        record.setTenantId(envelope.getTenantId());
        record.setOutboxEventId(envelope.getEventId());
        record.setTraceId(limit(request.getTraceId(), 64));
        record.setTemplateCode(limit(request.getTemplateCode(), 100));
        record.setChannelType(type.name());
        record.setChannelId(channel == null ? null : channel.getChannelId());
        record.setReceiverType(normalized.getReceiverType());
        record.setReceiverId(normalized.getReceiverId());
        record.setReceiverName(limit(normalized.getReceiverName(), 100));
        if (StringUtils.hasText(normalized.getReceiverAddress())) {
            record.setReceiverAddrCipher(cipher.encrypt(normalized.getReceiverAddress()));
            record.setReceiverAddrMask(limit(cipher.maskAddress(normalized.getReceiverAddress()), 200));
        }
        record.setTitle(type == MessageChannelType.INTERNAL ? title : "外部消息");
        record.setContent(type == MessageChannelType.INTERNAL ? content : "外部消息正文已加密保存");
        record.setLinkUrl(linkUrl);
        record.setMessageCategory(StringUtils.hasText(category) ? category : "SYSTEM");
        record.setBizType(limit(request.getBizType(), 50));
        record.setBizId(limit(request.getBizId(), 64));
        record.setResendFromId(request.getResendFromId());
        record.setSendStatus(reason == null ? "PENDING"
                : reason.startsWith("TEMPLATE_") || "NOT_IMPLEMENTED".equals(reason) ? "FAILED" : "SKIPPED");
        record.setSkipReason("SKIPPED".equals(record.getSendStatus()) ? reason : null);
        if ("FAILED".equals(record.getSendStatus())) {
            record.setErrorMsg("TEMPLATE_PARAMS_REQUIRED".equals(reason) ? "缺失参数: "
                    + limit(MessageTemplateRendering.missing(template.getParamsDeclare(), request.safeParams(), json), 900) : reason);
        }
        record.setReadFlag(0);
        record.setRetryCount(0);
        record.setCreateBy("system");
        record.setUpdateBy("system");
        record.setCreateTime(LocalDateTime.now());
        record.setUpdateTime(record.getCreateTime());
        records.insert(record);
        ChannelSendContext context = ChannelSendContext.builder().recordId(record.getRecordId())
                .tenantId(envelope.getTenantId()).channelId(record.getChannelId()).receiver(normalized)
                .title(title).content(content).messageCategory(record.getMessageCategory()).params(request.safeParams())
                .linkUrl(linkUrl).build();
        MessageDeliveryPayload payload = new MessageDeliveryPayload(envelope.getTenantId(), envelope.getEventId(),
                envelope.getSourceModule(), request, context, payloadHash, template == null ? null : template.getTemplateId(),
                template == null ? null : template.getVersion(), List.of());
        SysMessageDelivery delivery = new SysMessageDelivery();
        delivery.setTenantId(record.getTenantId());
        delivery.setRecordId(record.getRecordId());
        delivery.setOutboxEventId(envelope.getEventId());
        delivery.setChannelType(type.name());
        delivery.setReceiverKey(receiverKey);
        delivery.setPayloadHash(payloadHash);
        delivery.setPayloadEncrypted(encode(payload));
        delivery.setStatus(record.getSendStatus());
        delivery.setLastErrorCode(reason);
        delivery.setAttemptCount(0);
        delivery.setVersion(0);
        delivery.setNextAttemptTime(request.getScheduleTime());
        delivery.setCreateBy("system");
        delivery.setUpdateBy("system");
        delivery.setCreateTime(record.getCreateTime());
        delivery.setUpdateTime(record.getCreateTime());
        deliveries.insert(delivery);
        publishOutcome(delivery, record);
        return record;
    }

    public SysMessageRecord deliverRecord(Long tenantId, Long recordId) {
        requireTenant(tenantId);
        SysMessageDelivery delivery = findByRecord(tenantId, recordId);
        if (delivery == null) throw new ServiceException("投递记录不存在", 404);
        deliver(tenantId, delivery.getDeliveryId());
        return ownedRecord(tenantId, recordId);
    }

    public int processDue(Long tenantId, int limit) {
        requireTenant(tenantId);
        List<Long> due = deliveries.due(tenantId, LocalDateTime.now(), Math.max(1, Math.min(100, limit)));
        for (Long deliveryId : due) deliver(tenantId, deliveryId);
        return due.size();
    }

    public void deliver(Long tenantId, Long deliveryId) {
        requireTenant(tenantId);
        if (TransactionSynchronizationManager.isActualTransactionActive()) {
            throw new IllegalStateException("外部发送必须在业务事务提交后执行");
        }
        String owner = UUID.randomUUID().toString();
        boolean claimed = Boolean.TRUE.equals(transaction(() -> claim(tenantId, deliveryId, owner)));
        if (!claimed) return;
        MessageDeliveryPayload payload;
        try { payload = decode(getOwned(tenantId, deliveryId)); }
        catch (RuntimeException failure) { finishPreparation(tenantId, deliveryId, owner, "PAYLOAD_UNAVAILABLE"); return; }
        List<com.cloudflow.common.message.api.MessageAttachment> attachments;
        try {
            String reason = sourceRejection(payload);
            if (reason != null) { finishPreparation(tenantId, deliveryId, owner, reason); return; }
            List<MessageDeliverySourceGuard> guards = matchingGuards(payload);
            attachments = guards.size() == 1 ? guards.get(0).attachments(payload) : List.of();
            Object requested = payload.request().safeParams().get("attachmentIds");
            List<String> expected = requested instanceof List<?> values ? values.stream().map(String::valueOf).toList() : List.of();
            if (attachments == null || requested != null && !(requested instanceof List<?>) || expected.size() != attachments.size()
                    || attachments.size() > 10 || attachments.stream().anyMatch(file -> file == null || file.fileId() == null || file.content() == null)
                    || !expected.equals(attachments.stream().map(file -> String.valueOf(file.fileId())).toList())
                    || attachments.stream().mapToLong(file -> file.content().length).sum() > 10 * 1024 * 1024) {
                finishPreparation(tenantId, deliveryId, owner, "ATTACHMENT_SOURCE_REQUIRED"); return;
            }
            reason = sourceRejection(payload);
            if (reason != null) { finishPreparation(tenantId, deliveryId, owner, reason); return; }
        } catch (RuntimeException failure) {
            finishPreparation(tenantId, deliveryId, owner, "SOURCE_UNAVAILABLE"); return;
        }
        ChannelSendContext context = transaction(() -> {
            ChannelSendContext prepared = beginSending(tenantId, deliveryId, owner);
            if (prepared != null && "INTERNAL".equals(prepared.getParams().get("_deliveryChannelType"))) {
                finish(tenantId, deliveryId, owner, ChannelSendResult.success());
            }
            return prepared;
        });
        if (context == null) return;
        context.setAttachments(attachments);
        if ("INTERNAL".equals(context.getParams().get("_deliveryChannelType"))) {
            try { senders.get(MessageChannelType.INTERNAL).send(context); }
            catch (RuntimeException unavailablePush) { }
            return;
        }
        ChannelSendResult result;
        try {
            if (matchingGuards(payload).stream().anyMatch(MessageDeliverySourceGuard::verifyAtSendBoundary)) {
                String reason;
                try { reason = sourceRejection(payload); }
                catch (RuntimeException unavailable) { reason = "SOURCE_UNAVAILABLE"; }
                if (reason != null) {
                    String rejection = reason;
                    transaction(() -> { finishSendBoundary(tenantId, deliveryId, owner, rejection); return null; });
                    return;
                }
            }
            MessageChannelSender sender = senders.get(MessageChannelType.valueOf(context.getParams().get("_deliveryChannelType").toString()));
            result = sender == null ? ChannelSendResult.notImplemented() : sender.send(context);
            if (result == null) result = ChannelSendResult.unknown("PROVIDER_RESULT_MISSING");
        } catch (RuntimeException failure) {
            result = ChannelSendResult.unknown("PROVIDER_OUTCOME_UNKNOWN");
        }
        ChannelSendResult finalResult = result;
        transaction(() -> { finish(tenantId, deliveryId, owner, finalResult); return null; });
    }

    private void finishSendBoundary(Long tenantId, Long deliveryId, String owner, String reason) {
        SysMessageDelivery delivery = deliveries.lockDelivery(tenantId, deliveryId);
        if (delivery == null || !owner.equals(delivery.getClaimOwner()) || delivery.getResolvedBy() != null
                || !List.of("SENDING", "UNKNOWN").contains(delivery.getStatus())) return;
        MessageDeliveryPayload payload = decode(delivery);
        if (payload.attempts().isEmpty() || delivery.getAttemptCount() <= 0) throw new IllegalStateException("投递准备记录缺失");
        List<MessageDeliveryPayload.Attempt> attempts = payload.attempts().subList(0, payload.attempts().size() - 1);
        delivery.setPayloadEncrypted(encode(new MessageDeliveryPayload(payload.tenantId(), payload.eventId(), payload.sourceModule(),
                payload.request(), payload.context(), payload.inputHash(), payload.templateId(), payload.templateVersion(), attempts)));
        delivery.setAttemptCount(delivery.getAttemptCount() - 1); delivery.setSendStartedTime(null);
        delivery.setClaimOwner(null); delivery.setClaimUntil(null); delivery.setLastErrorCode(safeCode(reason));
        delivery.setStatus("SOURCE_UNAVAILABLE".equals(reason) ? "PENDING" : "SKIPPED");
        delivery.setNextAttemptTime("PENDING".equals(delivery.getStatus()) ? LocalDateTime.now().plusSeconds(30) : null);
        write(delivery);
        LocalDateTime previousAttempt = attempts.isEmpty() ? null : attempts.get(attempts.size() - 1).startedAt();
        records.update(null, new LambdaUpdateWrapper<SysMessageRecord>().eq(SysMessageRecord::getTenantId, tenantId)
                .eq(SysMessageRecord::getRecordId, delivery.getRecordId()).set(SysMessageRecord::getSendTime, previousAttempt));
    }

    private void finishPreparation(Long tenantId, Long deliveryId, String owner, String reason) {
        transaction(() -> {
            SysMessageDelivery delivery = deliveries.lockDelivery(tenantId, deliveryId);
            if (delivery == null || !"CLAIMED".equals(delivery.getStatus()) || !owner.equals(delivery.getClaimOwner())) return null;
            if ("SOURCE_UNAVAILABLE".equals(reason)) {
                delivery.setStatus("PENDING");
                delivery.setClaimOwner(null);
                delivery.setClaimUntil(null);
                delivery.setNextAttemptTime(LocalDateTime.now().plusSeconds(30));
                delivery.setLastErrorCode(reason);
                write(delivery);
            } else {
                terminal(delivery, "PAYLOAD_UNAVAILABLE".equals(reason) || reason.startsWith("ATTACHMENT_") ? "FAILED" : "SKIPPED", safeCode(reason));
            }
            return null;
        });
    }

    private boolean claim(Long tenantId, Long deliveryId, String owner) {
        SysMessageDelivery delivery = deliveries.lockDelivery(tenantId, deliveryId);
        if (delivery == null) return false;
        LocalDateTime now = LocalDateTime.now();
        if ("SENDING".equals(delivery.getStatus())) {
            if (delivery.getClaimUntil() != null && !delivery.getClaimUntil().isAfter(now)) {
                delivery.setStatus("UNKNOWN");
                delivery.setLastErrorCode("SEND_LEASE_EXPIRED");
                write(delivery);
            }
            return false;
        }
        boolean expiredClaim = "CLAIMED".equals(delivery.getStatus()) && delivery.getSendStartedTime() == null
                && delivery.getClaimUntil() != null && !delivery.getClaimUntil().isAfter(now);
        if (!expiredClaim && !List.of("PENDING", "RETRYABLE").contains(delivery.getStatus())) return false;
        if (delivery.getNextAttemptTime() != null && delivery.getNextAttemptTime().isAfter(now)) return false;
        delivery.setStatus("CLAIMED");
        delivery.setClaimOwner(owner);
        delivery.setClaimUntil(now.plusSeconds(30));
        delivery.setSendStartedTime(null);
        write(delivery);
        return true;
    }

    private ChannelSendContext beginSending(Long tenantId, Long deliveryId, String owner) {
        SysMessageDelivery delivery = deliveries.lockDelivery(tenantId, deliveryId);
        LocalDateTime now = LocalDateTime.now();
        if (delivery == null || !"CLAIMED".equals(delivery.getStatus()) || !owner.equals(delivery.getClaimOwner())
                || !delivery.getClaimUntil().isAfter(now)) return null;
        MessageDeliveryPayload payload;
        try { payload = decode(delivery); }
        catch (RuntimeException failure) { terminal(delivery, "FAILED", "PAYLOAD_UNAVAILABLE"); return null; }
        SysMessageChannel channel = deliveries.lockChannel(tenantId, payload.context().getChannelId());
        SysMessageTemplate template = payload.templateId() == null ? null : deliveries.lockTemplate(tenantId, payload.templateId());
        String reason = revalidate(payload, channel, template);
        if (reason != null) { terminal(delivery, "SKIPPED", reason); return null; }
        LocalDateTime quietUntil = quietUntil(payload, now);
        LocalDateTime quotaUntil = quotaUntil(tenantId, channel, now);
        LocalDateTime delayedUntil = quietUntil == null ? quotaUntil
                : quotaUntil == null || quietUntil.isAfter(quotaUntil) ? quietUntil : quotaUntil;
        if (delayedUntil != null) {
            delivery.setStatus("PENDING");
            delivery.setNextAttemptTime(delayedUntil);
            delivery.setClaimOwner(null);
            delivery.setClaimUntil(null);
            delivery.setLastErrorCode(quietUntil == null ? "CHANNEL_QUOTA" : "QUIET_HOURS");
            write(delivery);
            return null;
        }
        if (delivery.getAttemptCount() == 0 && template != null && template.getDedupeWindowSec() != null
                && template.getDedupeWindowSec() > 0 && !Boolean.TRUE.equals(payload.request().getForceSend())
                && StringUtils.hasText(payload.request().getBizId())
                && deliveries.duplicated(tenantId, deliveryId, delivery.getReceiverKey(), template.getTemplateCode(),
                        delivery.getChannelType(), payload.request().getBizId(), now.minusSeconds(template.getDedupeWindowSec()))) {
            terminal(delivery, "SKIPPED", "DEDUPED");
            return null;
        }
        List<MessageDeliveryPayload.Attempt> attempts = new ArrayList<>(payload.attempts());
        attempts.add(new MessageDeliveryPayload.Attempt(channel.getChannelId(), now));
        delivery.setPayloadEncrypted(encode(new MessageDeliveryPayload(payload.tenantId(), payload.eventId(),
                payload.sourceModule(), payload.request(), payload.context(), payload.inputHash(),
                payload.templateId(), payload.templateVersion(), attempts)));
        delivery.setStatus("SENDING");
        delivery.setSendStartedTime(now);
        delivery.setClaimUntil(now.plusSeconds(30));
        delivery.setAttemptCount(delivery.getAttemptCount() + 1);
        delivery.setNextAttemptTime(null);
        delivery.setLastErrorCode(null);
        write(delivery);
        records.update(null, new LambdaUpdateWrapper<SysMessageRecord>().eq(SysMessageRecord::getTenantId, tenantId)
                .eq(SysMessageRecord::getRecordId, delivery.getRecordId()).set(SysMessageRecord::getSendTime, now));
        LinkedHashMap<String, Object> params = new java.util.LinkedHashMap<>(payload.context().getParams());
        params.put("_deliveryChannelType", delivery.getChannelType());
        return payload.context().toBuilder().deliveryId(deliveryId).params(params).build();
    }

    private String revalidate(MessageDeliveryPayload payload, SysMessageChannel channel, SysMessageTemplate template) {
        if (channel == null || !"ENABLED".equals(channel.getStatus()) || !Integer.valueOf(1).equals(channel.getImplementedFlag())) {
            return "CHANNEL_DISABLED";
        }
        if (!payload.request().safeChannelTypes().get(0).name().equals(channel.getChannelType())) return "CHANNEL_CHANGED";
        if (payload.templateId() != null) {
            if (template == null || !Objects.equals(template.getTenantId(), payload.tenantId())
                    || !"ENABLED".equals(template.getStatus()) || !Integer.valueOf(0).equals(template.getDeleted())
                    || !Objects.equals(template.getVersion(), payload.templateVersion())) return "TEMPLATE_CHANGED";
        }
        Long userId = payload.context().getReceiver().getReceiverId();
        if (userId != null) {
            SysUser user = users.selectOne(new LambdaQueryWrapper<SysUser>().eq(SysUser::getTenantId, payload.tenantId())
                    .eq(SysUser::getUserId, userId).eq(SysUser::getStatus, "0").eq(SysUser::getDeleted, 0));
            if (user == null) return "RECEIVER_UNAVAILABLE";
            if (!Boolean.TRUE.equals(payload.request().getForceSend())) {
                SysMessageSubscribe subscription = subscription(payload);
                if (subscription != null && Integer.valueOf(0).equals(subscription.getEnabledFlag())) return "UNSUBSCRIBED";
            }
        }
        return null;
    }

    private List<MessageDeliverySourceGuard> matchingGuards(MessageDeliveryPayload payload) {
        return sourceGuards.stream().filter(guard -> guard.supports(payload.sourceModule(), payload.request().getBizType())).toList();
    }

    private String sourceRejection(MessageDeliveryPayload payload) {
        List<MessageDeliverySourceGuard> guards = matchingGuards(payload);
        if (!StringUtils.hasText(payload.request().getBizId())) return guards.isEmpty() ? null : "SOURCE_INVALID";
        if (guards.size() != 1) return "SOURCE_NOT_CONFIGURED";
        return guards.get(0).rejectionCode(payload);
    }

    private SysMessageSubscribe subscription(MessageDeliveryPayload payload) {
        return subscriptions.selectOne(new LambdaQueryWrapper<SysMessageSubscribe>()
                .eq(SysMessageSubscribe::getTenantId, payload.tenantId())
                .eq(SysMessageSubscribe::getUserId, payload.context().getReceiver().getReceiverId())
                .eq(SysMessageSubscribe::getMessageCategory, payload.context().getMessageCategory())
                .eq(SysMessageSubscribe::getChannelType, payload.request().safeChannelTypes().get(0).name()));
    }

    private LocalDateTime quietUntil(MessageDeliveryPayload payload, LocalDateTime now) {
        if (payload.context().getReceiver().getReceiverId() == null || Boolean.TRUE.equals(payload.request().getForceSend())) return null;
        SysMessageSubscribe subscription = subscription(payload);
        if (subscription == null || subscription.getQuietStart() == null || subscription.getQuietEnd() == null
                || subscription.getQuietStart().equals(subscription.getQuietEnd())) return null;
        LocalTime current = now.toLocalTime();
        boolean quiet = subscription.getQuietStart().isBefore(subscription.getQuietEnd())
                ? !current.isBefore(subscription.getQuietStart()) && current.isBefore(subscription.getQuietEnd())
                : !current.isBefore(subscription.getQuietStart()) || current.isBefore(subscription.getQuietEnd());
        if (!quiet) return null;
        return (current.isBefore(subscription.getQuietEnd()) ? now.toLocalDate() : now.toLocalDate().plusDays(1))
                .atTime(subscription.getQuietEnd());
    }

    private LocalDateTime quotaUntil(Long tenantId, SysMessageChannel channel, LocalDateTime now) {
        if (channel.getRateLimitMinute() == null && channel.getDailyLimit() == null) return null;
        LocalDateTime day = now.toLocalDate().atStartOfDay();
        LocalDateTime minute = now.truncatedTo(ChronoUnit.MINUTES);
        long minuteAttempts = 0;
        long dayAttempts = 0;
        for (SysMessageDelivery candidate : deliveries.recentAttempts(tenantId, day)) {
            for (MessageDeliveryPayload.Attempt attempt : decode(candidate).attempts()) {
                if (!Objects.equals(attempt.channelId(), channel.getChannelId())) continue;
                if (!attempt.startedAt().isBefore(day)) dayAttempts++;
                if (!attempt.startedAt().isBefore(minute)) minuteAttempts++;
            }
        }
        if (channel.getDailyLimit() != null && dayAttempts >= channel.getDailyLimit()) return day.plusDays(1);
        if (channel.getRateLimitMinute() != null && minuteAttempts >= channel.getRateLimitMinute()) return minute.plusMinutes(1);
        return null;
    }

    private void finish(Long tenantId, Long deliveryId, String owner, ChannelSendResult result) {
        SysMessageDelivery delivery = deliveries.lockDelivery(tenantId, deliveryId);
        if (delivery == null || !owner.equals(delivery.getClaimOwner()) || delivery.getResolvedBy() != null
                || !List.of("SENDING", "UNKNOWN").contains(delivery.getStatus())) return;
        String outcome = !result.isImplemented() ? "FAILED" : result.isSuccess() ? "SENT" : result.getOutcome();
        if (!List.of("SENT", "RETRYABLE", "FAILED", "UNKNOWN", "SKIPPED").contains(outcome == null ? "" : outcome)) {
            outcome = "UNKNOWN";
        }
        String error = !result.isImplemented() ? "NOT_IMPLEMENTED"
                : safeCode(result.getSkipReason() != null ? result.getSkipReason() : result.getErrorMessage());
        MessageDeliveryPayload payload = decode(delivery);
        if ("RETRYABLE".equals(outcome)) {
            SysMessageRecord record = ownedRecord(tenantId, delivery.getRecordId());
            SysMessageChannel channel = channels.selectById(record.getChannelId());
            int retries = channel == null || channel.getRetryCount() == null ? 0 : Math.min(100, channel.getRetryCount());
            long attempts = payload.attempts().stream().filter(attempt -> Objects.equals(attempt.channelId(), record.getChannelId())).count();
            if (attempts > retries) outcome = "FAILED";
            else delivery.setNextAttemptTime(LocalDateTime.now().plusSeconds(channel.getRetryIntervalSec() == null
                    ? 60 : Math.max(1, channel.getRetryIntervalSec())));
        }
        if (result.isImplemented() && "FAILED".equals(outcome) && switchChannel(delivery, payload)) outcome = "RETRYABLE";
        if ("SENT".equals(outcome) && result.getPrivateReceipt() != null && !result.getPrivateReceipt().isEmpty()) {
            delivery.setPayloadEncrypted(encode(payload.receipt(result.getPrivateReceipt())));
        }
        delivery.setStatus(outcome);
        delivery.setLastErrorCode("SENT".equals(outcome) ? null : error);
        if (StringUtils.hasText(result.getProviderMessageId())) delivery.setProviderMessageId(limit(result.getProviderMessageId(), 255));
        if ("SENT".equals(outcome)) delivery.setAcceptedTime(LocalDateTime.now());
        if (error != null && error.startsWith("SMTP_REJECTED_")) delivery.setBouncedTime(LocalDateTime.now());
        delivery.setClaimOwner(null);
        delivery.setClaimUntil(null);
        write(delivery);
    }

    private boolean switchChannel(SysMessageDelivery delivery, MessageDeliveryPayload payload) {
        Set<Long> attempted = payload.attempts().stream().map(MessageDeliveryPayload.Attempt::channelId)
                .collect(java.util.stream.Collectors.toSet());
        SysMessageChannel next = channels.selectList(new LambdaQueryWrapper<SysMessageChannel>()
                .eq(SysMessageChannel::getTenantId, delivery.getTenantId()).eq(SysMessageChannel::getChannelType, delivery.getChannelType())
                .eq(SysMessageChannel::getStatus, "ENABLED").eq(SysMessageChannel::getDeleted, 0)
                .eq(SysMessageChannel::getImplementedFlag, 1).orderByAsc(SysMessageChannel::getPriority, SysMessageChannel::getChannelId))
                .stream().filter(channel -> !attempted.contains(channel.getChannelId())).findFirst().orElse(null);
        if (next == null) return false;
        ChannelSendContext context = payload.context().toBuilder().channelId(next.getChannelId()).build();
        delivery.setPayloadEncrypted(encode(new MessageDeliveryPayload(payload.tenantId(), payload.eventId(), payload.sourceModule(),
                payload.request(), context, payload.inputHash(), payload.templateId(), payload.templateVersion(), payload.attempts())));
        delivery.setNextAttemptTime(LocalDateTime.now());
        int updated = records.update(null, new LambdaUpdateWrapper<SysMessageRecord>().eq(SysMessageRecord::getTenantId, delivery.getTenantId())
                .eq(SysMessageRecord::getRecordId, delivery.getRecordId()).set(SysMessageRecord::getChannelId, next.getChannelId()));
        if (updated != 1) throw new ServiceException("消息记录缺失，已停止切换渠道", 409);
        return true;
    }

    private void terminal(SysMessageDelivery delivery, String status, String error) {
        delivery.setStatus(status);
        delivery.setLastErrorCode(safeCode(error));
        delivery.setClaimOwner(null);
        delivery.setClaimUntil(null);
        delivery.setNextAttemptTime(null);
        write(delivery);
    }

    private void write(SysMessageDelivery delivery) {
        delivery.setUpdateBy(UserContext.getUserId() == null ? "system" : String.valueOf(UserContext.getUserId()));
        delivery.setUpdateTime(LocalDateTime.now());
        if (deliveries.writeState(delivery) != 1) throw new ServiceException("投递状态已变更，请刷新重试", 409);
        delivery.setVersion(delivery.getVersion() + 1);
        String recordStatus = "SENT".equals(delivery.getStatus()) ? "SUCCESS" : delivery.getStatus();
        int updated = records.update(null, new LambdaUpdateWrapper<SysMessageRecord>()
                .eq(SysMessageRecord::getTenantId, delivery.getTenantId()).eq(SysMessageRecord::getRecordId, delivery.getRecordId())
                .set(SysMessageRecord::getSendStatus, recordStatus)
                .set(SysMessageRecord::getSkipReason, "SKIPPED".equals(recordStatus) ? delivery.getLastErrorCode() : null)
                .set(SysMessageRecord::getErrorMsg, delivery.getLastErrorCode())
                .set(SysMessageRecord::getRetryCount, Math.max(0, delivery.getAttemptCount() - 1))
                .set(SysMessageRecord::getUpdateTime, delivery.getUpdateTime()));
        if (updated != 1) throw new ServiceException("消息记录缺失，已停止投递", 409);
        publishOutcome(delivery, ownedRecord(delivery.getTenantId(), delivery.getRecordId()));
    }

    private void publishOutcome(SysMessageDelivery delivery, SysMessageRecord record) {
        if (!List.of("SENT", "FAILED", "UNKNOWN", "SKIPPED", "CANCELLED").contains(delivery.getStatus())) return;
        MessageDeliveryResult result = new MessageDeliveryResult(delivery.getDeliveryId(), delivery.getRecordId(), delivery.getTenantId(),
                delivery.getOutboxEventId(), delivery.getChannelType(), delivery.getStatus(), record.getBizType(), record.getBizId(),
                delivery.getLastErrorCode(), delivery.getVersion());
        try {
            String payload = json.writeValueAsString(result);
            String identity = "message-delivery:" + delivery.getTenantId() + ":" + delivery.getDeliveryId() + ":" + delivery.getVersion();
            outcomePublisher.publishOnceAt(BusinessEventEnvelope.builder().eventId(UUID.nameUUIDFromBytes(identity.getBytes(java.nio.charset.StandardCharsets.UTF_8)).toString())
                    .eventType("MESSAGE_DELIVERY_RESULT").tenantId(delivery.getTenantId()).sourceModule("cloudflow-auth")
                    .sourceId(delivery.getDeliveryId()).payload(payload).payloadDigest(MessagePayloadCodec.hash(payload)).build(), null);
        } catch (com.fasterxml.jackson.core.JsonProcessingException failure) {
            throw new ServiceException("发送结果事件无法保存", 500);
        }
    }

    public SysMessageDelivery findByRecord(Long tenantId, Long recordId) {
        requireTenant(tenantId);
        return deliveries.selectOne(new LambdaQueryWrapper<SysMessageDelivery>()
                .eq(SysMessageDelivery::getTenantId, tenantId).eq(SysMessageDelivery::getRecordId, recordId));
    }

    public SysMessageDelivery getOwned(Long tenantId, Long deliveryId) {
        requireTenant(tenantId);
        SysMessageDelivery delivery = deliveries.selectOne(new LambdaQueryWrapper<SysMessageDelivery>()
                .eq(SysMessageDelivery::getTenantId, tenantId).eq(SysMessageDelivery::getDeliveryId, deliveryId));
        if (delivery == null) throw new ServiceException("投递记录不存在", 404);
        return delivery;
    }

    public com.cloudflow.common.message.api.MessageDeliverySnapshot businessSnapshot(Long tenantId, Long recordId, String sourceModule) {
        SysMessageDelivery delivery = findByRecord(tenantId, recordId);
        if (delivery == null) throw new ServiceException("投递记录不存在", 404);
        MessageDeliveryPayload payload = decode(delivery);
        if (!Objects.equals(payload.sourceModule(), sourceModule)) throw new ServiceException("无权读取其他来源的投递记录", 403);
        SysMessageRecord record = ownedRecord(tenantId, recordId);
        MessageDeliveryResult result = new MessageDeliveryResult(delivery.getDeliveryId(), recordId, tenantId,
                delivery.getOutboxEventId(), delivery.getChannelType(), delivery.getStatus(), record.getBizType(), record.getBizId(),
                delivery.getLastErrorCode(), delivery.getVersion());
        return new com.cloudflow.common.message.api.MessageDeliverySnapshot(result, payload.request(), delivery.getAcceptedTime());
    }

    public java.util.Map<Long, Long> deliveryIds(Long tenantId, List<Long> recordIds) {
        requireTenant(tenantId);
        if (recordIds.isEmpty()) return java.util.Map.of();
        return deliveries.selectList(new LambdaQueryWrapper<SysMessageDelivery>()
                .select(SysMessageDelivery::getRecordId, SysMessageDelivery::getDeliveryId)
                .eq(SysMessageDelivery::getTenantId, tenantId).in(SysMessageDelivery::getRecordId, recordIds)).stream()
                .collect(java.util.stream.Collectors.toMap(SysMessageDelivery::getRecordId, SysMessageDelivery::getDeliveryId));
    }

    @Audit(name = "保存外部消息人工核验依据", highRisk = true)
    public void recordResolution(Long tenantId, Long deliveryId, Long userId, Integer version, String conclusion, String evidence) {
        requireTenant(tenantId);
        if (userId == null || !Objects.equals(userId, UserContext.getUserId()) || version == null || evidence == null
                || evidence.trim().length() < 10 || evidence.length() > 1000
                || !List.of("ACCEPTED", "NOT_ACCEPTED").contains(conclusion == null ? "" : conclusion)) {
            throw new ServiceException("核验人、版本、结论或依据不合法");
        }
        transaction(() -> {
            SysMessageDelivery delivery = deliveries.lockDelivery(tenantId, deliveryId);
            if (delivery == null || !"UNKNOWN".equals(delivery.getStatus()) || !Objects.equals(version, delivery.getVersion())) {
                throw new ServiceException("仅可核验当前版本的结果未明记录", 409);
            }
            delivery.setResolvedBy(userId);
            delivery.setResolutionReason(evidence.trim());
            if ("ACCEPTED".equals(conclusion)) {
                delivery.setAcceptedTime(LocalDateTime.now());
                terminal(delivery, "SENT", "VERIFIED_ACCEPTED");
            } else {
                terminal(delivery, "FAILED", "VERIFIED_NOT_ACCEPTED");
            }
            audit(delivery, "人工核验外部消息接纳结果", "status", "UNKNOWN", delivery.getStatus());
            return null;
        });
    }

    @Audit(name = "清理到期外部消息敏感发送载荷", highRisk = true)
    public int expirePayloads(Long tenantId, int retentionDays) {
        requireTenant(tenantId);
        if (retentionDays < 1 || retentionDays > 3650) throw new ServiceException("发送载荷保留天数必须在1至3650之间");
        return deliveries.update(null, new LambdaUpdateWrapper<SysMessageDelivery>()
                .eq(SysMessageDelivery::getTenantId, tenantId).in(SysMessageDelivery::getStatus, "SENT", "FAILED", "SKIPPED", "CANCELLED")
                .lt(SysMessageDelivery::getUpdateTime, LocalDateTime.now().minusDays(retentionDays))
                .isNull(SysMessageDelivery::getClaimOwner).isNotNull(SysMessageDelivery::getPayloadEncrypted)
                .set(SysMessageDelivery::getPayloadEncrypted, null));
    }

    @Audit(name = "人工重新登记外部消息", highRisk = true)
    public boolean requestResend(Long tenantId, Long recordId) {
        requireTenant(tenantId);
        if (UserContext.getUserId() == null) throw new ServiceException("重新发送需要当前操作人", 403);
        TransactionTemplate joined = new TransactionTemplate(transactionManager);
        return Boolean.TRUE.equals(joined.execute(status -> {
            SysMessageDelivery existing = findByRecord(tenantId, recordId);
            if (existing == null) return false;
            SysMessageDelivery delivery = deliveries.lockDelivery(tenantId, existing.getDeliveryId());
            if (delivery == null || !"FAILED".equals(delivery.getStatus())) return false;
            MessageDeliveryPayload payload = decode(delivery);
            MessageSendRequest request = payload.request().toBuilder().resendFromId(recordId).deduplicationKey(null)
                    .retryAttempt(0).scheduleTime(null).forceSend(false).build();
            String identity = "message-resend:" + tenantId + ":" + recordId + ":" + delivery.getVersion();
            Long sourceId = 0L;
            try { if (request.getBizId() != null) sourceId = Long.valueOf(request.getBizId()); }
            catch (NumberFormatException ignored) { }
            BusinessEventEnvelope event = BusinessEventEnvelope.builder()
                    .eventId(UUID.nameUUIDFromBytes(identity.getBytes(java.nio.charset.StandardCharsets.UTF_8)).toString())
                    .eventType("MESSAGE_SEND").tenantId(tenantId).sourceModule(payload.sourceModule()).sourceId(sourceId).build();
            MessagePayloadCodec.encode(event, request, json, cipher);
            outcomePublisher.publishOnceAt(event, null);
            audit(delivery, "人工重新登记外部消息", "resendEventId", null, event.getEventId());
            return true;
        }));
    }

    private void audit(SysMessageDelivery delivery, String name, String field, String before, String after) {
        SysAuditLogEntity entry = new SysAuditLogEntity();
        entry.setTenantId(delivery.getTenantId());
        entry.setBizModule("system-message");
        entry.setAuditName(name);
        entry.setAuditField(field);
        entry.setBeforeVal(before);
        entry.setAfterVal(after);
        entry.setHighRisk(1);
        entry.setRiskLevel("HIGH");
        entry.setCreateBy(UserContext.getUserName() == null ? String.valueOf(UserContext.getUserId()) : UserContext.getUserName());
        entry.setCreateTime(LocalDateTime.now());
        try {
            entry.setAfterJson(json.writeValueAsString(java.util.Map.of("deliveryId", delivery.getDeliveryId(),
                    "recordId", delivery.getRecordId(), "version", delivery.getVersion(), "operatorId", UserContext.getUserId(),
                    "resolutionReason", delivery.getResolutionReason() == null ? "" : delivery.getResolutionReason())));
        } catch (com.fasterxml.jackson.core.JsonProcessingException failure) {
            throw new ServiceException("消息核验审计无法保存", 500);
        }
        if (auditLogs.insert(entry) != 1) throw new ServiceException("消息核验审计无法保存", 500);
    }

    @Audit(name = "取消尚未外发的消息", highRisk = true)
    public boolean cancelUnstarted(Long tenantId, Long recordId) {
        requireTenant(tenantId);
        SysMessageDelivery existing = findByRecord(tenantId, recordId);
        if (existing == null) return false;
        return Boolean.TRUE.equals(transaction(() -> {
            SysMessageDelivery delivery = deliveries.lockDelivery(tenantId, existing.getDeliveryId());
            if (!List.of("PENDING", "RETRYABLE", "CLAIMED").contains(delivery.getStatus())) return false;
            terminal(delivery, "CANCELLED", "SOURCE_CANCELLED");
            return true;
        }));
    }

    private MessageReceiver normalized(MessageReceiver receiver, MessageChannelType channel) {
        String type = receiver.getReceiverType() == null ? "USER" : receiver.getReceiverType().trim().toUpperCase(Locale.ROOT);
        String address = receiver.getReceiverAddress();
        if ("EMAIL".equals(type)) address = MessageEmailAddress.normalize(address);
        if ("USER".equals(type) && receiver.getReceiverId() == null || !"USER".equals(type) && receiver.getReceiverId() != null) {
            throw new ServiceException("消息接收人类型与身份不一致");
        }
        if (channel == MessageChannelType.EMAIL && !List.of("USER", "EMAIL").contains(type)) {
            throw new ServiceException("邮件渠道只接受用户或邮箱接收人");
        }
        return MessageReceiver.builder().receiverType(type).receiverId(receiver.getReceiverId())
                .receiverAddress(address).receiverName(receiver.getReceiverName()).build();
    }

    private String receiverKey(MessageReceiver receiver) {
        return MessagePayloadCodec.hash(receiver.getReceiverType() + ":"
                + (receiver.getReceiverId() == null ? receiver.getReceiverAddress() : receiver.getReceiverId()));
    }

    private MessageDeliveryPayload decode(SysMessageDelivery delivery) {
        try {
            MessageDeliveryPayload payload = json.readValue(cipher.decrypt(delivery.getPayloadEncrypted()), MessageDeliveryPayload.class);
            if (!Objects.equals(payload.tenantId(), delivery.getTenantId()) || !Objects.equals(payload.eventId(), delivery.getOutboxEventId())
                    || !Objects.equals(payload.context().getTenantId(), delivery.getTenantId())
                    || !Objects.equals(payload.context().getRecordId(), delivery.getRecordId())
                    || !Objects.equals(payload.inputHash(), delivery.getPayloadHash())
                    || !Objects.equals(receiverKey(payload.context().getReceiver()), delivery.getReceiverKey())
                    || !Objects.equals(payload.request().safeChannelTypes().get(0).name(), delivery.getChannelType())
                    || payload.attempts() == null || payload.attempts().size() != delivery.getAttemptCount()) {
                throw new IllegalArgumentException("投递载荷归属不一致");
            }
            return payload;
        } catch (Exception failure) {
            throw new ServiceException("投递载荷无法核验", 409);
        }
    }

    private String encode(MessageDeliveryPayload payload) {
        try { return cipher.encrypt(json.writeValueAsString(MessagePayloadCodec.internalTree(payload, json))); }
        catch (Exception failure) { throw new ServiceException("投递载荷加密失败", 500); }
    }

    public PrivateReceipt updatePrivateReceipt(Long tenantId, Long deliveryId, String sourceModule, String businessType,
            String businessId, java.util.function.UnaryOperator<java.util.Map<String, String>> operation) {
        requireTenant(tenantId);
        return new TransactionTemplate(transactionManager).execute(transactionStatus -> {
            SysMessageDelivery delivery = deliveries.lockDelivery(tenantId, deliveryId);
            if (delivery == null || !"WECOM".equals(delivery.getChannelType())
                    || !List.of("SENDING", "SENT", "UNKNOWN").contains(delivery.getStatus())) return new PrivateReceipt(java.util.Map.of());
            MessageDeliveryPayload payload = decode(delivery);
            if (!Objects.equals(sourceModule, payload.sourceModule()) || !Objects.equals(businessType, payload.request().getBizType())
                    || !Objects.equals(businessId, payload.request().getBizId()) || payload.attempts().isEmpty()) {
                throw new ServiceException("消息回执归属不一致", 409);
            }
            java.util.Map<String, String> before = payload.attempts().get(payload.attempts().size() - 1).privateReceipt();
            java.util.Map<String, String> after = java.util.Map.copyOf(operation.apply(before));
            if (!before.equals(after)) {
                delivery.setPayloadEncrypted(encode(payload.receipt(after)));
                delivery.setUpdateBy("message-receipt"); delivery.setUpdateTime(LocalDateTime.now());
                if (deliveries.writeState(delivery) != 1) throw new ServiceException("消息回执已变化", 409);
            }
            return new PrivateReceipt(after);
        });
    }

    public record PrivateReceipt(@com.fasterxml.jackson.annotation.JsonIgnore java.util.Map<String, String> values) {
        public PrivateReceipt { values = java.util.Map.copyOf(values); }
        @Override public String toString() { return "MessageDeliveryService.PrivateReceipt[protected]"; }
    }

    private SysMessageRecord ownedRecord(Long tenantId, Long recordId) {
        SysMessageRecord record = records.selectOne(new LambdaQueryWrapper<SysMessageRecord>()
                .eq(SysMessageRecord::getTenantId, tenantId).eq(SysMessageRecord::getRecordId, recordId));
        if (record == null) throw new ServiceException("消息记录不存在", 404);
        return record;
    }

    private <Result> Result transaction(Supplier<Result> operation) {
        TransactionTemplate transaction = new TransactionTemplate(transactionManager);
        transaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        transaction.setIsolationLevel(TransactionDefinition.ISOLATION_READ_COMMITTED);
        return transaction.execute(status -> operation.get());
    }

    private void requireTenant(Long tenantId) {
        Long current = UserContext.getTenantId();
        if (current == null) current = com.cloudflow.common.tenant.TenantContext.getTenantId();
        if (tenantId == null || !Objects.equals(tenantId, current)) throw new ServiceException("消息租户上下文不一致", 403);
    }

    private String safeCode(String value) {
        return value != null && value.matches("[A-Z][A-Z0-9_]{0,63}") ? value : "DELIVERY_FAILED";
    }

    private String limit(String value, int maximum) {
        return value == null || value.length() <= maximum ? value : value.substring(0, maximum);
    }
}
