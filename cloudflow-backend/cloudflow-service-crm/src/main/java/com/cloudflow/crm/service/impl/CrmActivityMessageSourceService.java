package com.cloudflow.crm.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.event.outbox.OutboxEvent;
import com.cloudflow.common.event.outbox.OutboxEventMapper;
import com.cloudflow.common.message.api.MessageReceiver;
import com.cloudflow.common.message.api.MessageSendRequest;
import com.cloudflow.common.message.api.MessageSourceCheck;
import com.cloudflow.common.message.api.MessageSourceResult;
import com.cloudflow.common.message.constant.MessageChannelType;
import com.cloudflow.common.message.constant.MessageEventType;
import com.cloudflow.common.message.security.MessagePayloadCodec;
import com.cloudflow.common.message.security.MessageSecretCipher;
import com.cloudflow.crm.domain.CrmActivity;
import com.cloudflow.crm.domain.CrmActivityParticipant;
import com.cloudflow.crm.domain.CrmActivityReminder;
import com.cloudflow.crm.mapper.CrmActivityMapper;
import com.cloudflow.crm.mapper.CrmActivityParticipantMapper;
import com.cloudflow.crm.mapper.CrmActivityReminderMapper;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class CrmActivityMessageSourceService {
    public static final String BUSINESS_TYPE = "CRM_ACTIVITY";
    private static final String SOURCE = "cloudflow-service-crm";
    private final CrmActivityMapper activities;
    private final CrmActivityReminderMapper reminders;
    private final CrmActivityParticipantMapper participants;
    private final OutboxEventMapper events;
    private final ObjectMapper json;
    private final MessageSecretCipher cipher;

    public MessageSourceResult verify(MessageSourceCheck check) {
        try {
            if (check == null || check.request() == null || check.recordId() == null || check.recordId() <= 0 || check.eventId() == null) return denied("SOURCE_INVALID");
            MessageSendRequest request = check.request();
            if (!BUSINESS_TYPE.equals(request.getBizType()) || !"CRM_ACTIVITY_REMINDER".equals(request.getTemplateCode())
                    || request.getResendFromId() != null || Boolean.TRUE.equals(request.getForceSend())
                    || request.safeChannelTypes().size() != 1 || !Set.of(MessageChannelType.INTERNAL, MessageChannelType.EMAIL).contains(request.safeChannelTypes().get(0))
                    || request.safeReceivers().size() != 1) return denied("SOURCE_INVALID");
            MessageReceiver receiver = request.safeReceivers().get(0);
            if (!"USER".equals(receiver.getReceiverType()) || receiver.getReceiverId() == null) return denied("SOURCE_INVALID");
            Long tenantId = CrmRecordSupport.tenantId();
            OutboxEvent stored = events.selectOne(new LambdaQueryWrapper<OutboxEvent>()
                    .eq(OutboxEvent::getTenantId, tenantId).eq(OutboxEvent::getEventId, check.eventId()));
            if (stored == null || !SOURCE.equals(stored.getAggregateType()) || !MessageEventType.SEND.equals(stored.getEventType())) return denied("SOURCE_INVALID");
            BusinessEventEnvelope envelope = json.readValue(stored.getPayloadJson(), BusinessEventEnvelope.class);
            if (!SOURCE.equals(envelope.getSourceModule()) || !Objects.equals(tenantId, envelope.getTenantId())
                    || !Objects.equals(check.eventId(), envelope.getEventId()) || envelope.getPayloadDigest() == null) return denied("SOURCE_INVALID");
            MessageSendRequest original = MessagePayloadCodec.decode(envelope, json, cipher);
            if (original.safeReceivers().stream().noneMatch(member -> "USER".equals(member.getReceiverType())
                    && Objects.equals(member.getReceiverId(), receiver.getReceiverId()))) return denied("SOURCE_INVALID");
            MessageSendRequest expected = original.toBuilder().receivers(List.of(MessageReceiver.ofUser(receiver.getReceiverId())))
                    .traceId(original.getTraceId() == null || original.getTraceId().isBlank() ? check.eventId() : original.getTraceId()).build();
            MessageSendRequest normalized = request.toBuilder().receivers(List.of(MessageReceiver.ofUser(receiver.getReceiverId()))).build();
            if (!MessagePayloadCodec.digest(MessagePayloadCodec.internalTree(expected, json), json)
                    .equals(MessagePayloadCodec.digest(MessagePayloadCodec.internalTree(normalized, json), json))) return denied("SOURCE_INVALID");
            Long activityId = identifier(request.getBizId());
            String prefix = "activity:" + activityId + ":reminder:";
            String key = request.getDeduplicationKey();
            if (key == null || !key.startsWith(prefix)
                    || !UUID.nameUUIDFromBytes((SOURCE + ":" + tenantId + ":" + key).getBytes(StandardCharsets.UTF_8)).toString().equals(check.eventId())) return denied("SOURCE_INVALID");
            CrmActivity activity = activities.selectById(activityId);
            CrmActivityReminder reminder = reminders.selectById(identifier(key.substring(prefix.length())));
            if (activity == null || !Objects.equals(tenantId, activity.getTenantId()) || !Integer.valueOf(0).equals(activity.getDeleted())
                    || !Set.of("PLANNED", "IN_PROGRESS").contains(activity.getStatus())
                    || reminder == null || !Objects.equals(tenantId, reminder.getTenantId()) || !Objects.equals(activityId, reminder.getActivityId())
                    || !Integer.valueOf(1).equals(reminder.getSentFlag()) || reminder.getSendTime() == null
                    || !request.safeChannelTypes().get(0).name().equals(reminder.getChannelType())
                    || activity.getStartTime().minusMinutes(reminder.getRemindMinutesBefore()).isAfter(LocalDateTime.now())) return denied("SOURCE_EXPIRED");
            if (!Objects.equals(activity.getOwnerId(), receiver.getReceiverId()) && participants.selectCount(new LambdaQueryWrapper<CrmActivityParticipant>()
                    .eq(CrmActivityParticipant::getActivityId, activityId).eq(CrmActivityParticipant::getTenantId, tenantId)
                    .eq(CrmActivityParticipant::getDeleted, 0)
                    .eq(CrmActivityParticipant::getParticipantType, "USER").eq(CrmActivityParticipant::getParticipantRefId, receiver.getReceiverId())
                    .ne(CrmActivityParticipant::getAcceptanceStatus, "DECLINED")) == 0) return denied("SOURCE_RECIPIENT_REMOVED");
            return new MessageSourceResult(true, null);
        } catch (IllegalArgumentException | JsonProcessingException invalid) { return denied("SOURCE_INVALID"); }
    }

    private Long identifier(String value) {
        if (value == null || !value.matches("[1-9][0-9]{0,18}")) throw new IllegalArgumentException("活动消息来源ID无效");
        return Long.valueOf(value);
    }

    private MessageSourceResult denied(String reason) { return new MessageSourceResult(false, reason); }
}
