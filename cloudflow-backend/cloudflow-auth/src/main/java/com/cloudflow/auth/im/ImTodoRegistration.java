package com.cloudflow.auth.im;

import com.cloudflow.auth.domain.SysMessageDelivery;
import com.cloudflow.auth.domain.SysMessageRecord;
import com.cloudflow.auth.mapper.ImTodoMapper;
import com.cloudflow.auth.message.MessageDeliveryService;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.message.api.MessageReceiver;
import com.cloudflow.common.message.api.MessageSendRequest;
import com.cloudflow.common.message.constant.MessageCategory;
import com.cloudflow.common.message.constant.MessageChannelType;
import com.cloudflow.common.security.im.ImTaskTodos;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class ImTodoRegistration {
    private static final SecureRandom RANDOM = new SecureRandom();
    private final ImDatabase database;
    private final ImTodoMapper todos;
    private final ImConfigRules rules;
    private final ImTodoAccounts accounts;
    private final MessageDeliveryService deliveries;

    public Long register(ImTaskTodos.Candidate candidate, long receiver) {
        rules.requireDeployment();
        if (candidate == null || !candidate.receivers().contains(receiver)) throw ImFailure.callbackActor();
        return database.write(candidate.tenantId(), mapper -> {
            if (mapper.lockLoginTenant(candidate.tenantId()) == null) throw ImFailure.callbackActor();
            List<ImBindingRow> bindings = mapper.ownBindings(candidate.tenantId(), receiver);
            if (bindings.size() != 1) return null;
            ImBindingRow binding = bindings.get(0);
            if (!"WECOM".equals(binding.getImType()) || !Set.of("ACTIVE", "OUT_OF_SCOPE").contains(Objects.toString(binding.getStatus(), ""))
                    || binding.getConfigId() == null || !ImMessageContent.member(binding.getImUserId())) return null;
            ImConfigRow config = mapper.lockConfig(candidate.tenantId(), binding.getConfigId());
            if (config == null || !"ENABLED".equals(config.getStatus()) || !Boolean.TRUE.equals(config.getTodoEnabled())
                    || !Integer.valueOf(0).equals(config.getDeleted())) return null;
            ImTodoRow existing = todos.existing(candidate.tenantId(), config.getConfigId(), candidate.taskId(), candidate.assignmentVersion(), receiver);
            if (existing != null) return existing.getDeliveryId();
            byte[] random = new byte[32]; RANDOM.nextBytes(random);
            String cardKey = Base64.getUrlEncoder().withoutPadding().encodeToString(random);
            ImTodoRow row = new ImTodoRow(); row.setTenantId(candidate.tenantId()); row.setConfigId(config.getConfigId());
            row.setTaskId(candidate.taskId()); row.setAssignmentVersion(candidate.assignmentVersion()); row.setReceiverUserId(receiver);
            row.setImType("WECOM"); row.setImUserId(binding.getImUserId()); row.setCardKeyHash(hash(cardKey)); row.setVersion(0); row.setStatus("PENDING");
            if (todos.insert(row) != 1) throw ImFailure.callbackUnavailable();
            accounts.verify(new ImTaskTodos.Request(candidate.tenantId(), row.getMappingId()));
            String identity = "im-todo\n" + candidate.tenantId() + "\n" + row.getMappingId();
            BusinessEventEnvelope envelope = BusinessEventEnvelope.builder().tenantId(candidate.tenantId()).sourceModule("cloudflow-auth")
                    .sourceId(row.getMappingId()).eventType("IM_TODO_RESERVED")
                    .eventId(UUID.nameUUIDFromBytes(identity.getBytes(StandardCharsets.UTF_8)).toString()).build();
            MessageReceiver recipient = MessageReceiver.ofUser(receiver);
            MessageSendRequest request = MessageSendRequest.builder().title("审批待办").content("请查看当前待办")
                    .channelTypes(List.of(MessageChannelType.WECOM)).receivers(List.of(recipient)).category(MessageCategory.TODO)
                    .bizType("IM_TASK_TODO").bizId(candidate.taskId()).linkUrl("/workflow/task/" + candidate.taskId())
                    .params(Map.of("imTodoMappingId", row.getMappingId(), "imTodoCardKey", cardKey)).build();
            SysMessageRecord record = deliveries.reserve(envelope, request, MessageChannelType.WECOM, recipient);
            SysMessageDelivery delivery = deliveries.findByRecord(candidate.tenantId(), record.getRecordId());
            if (delivery == null || todos.link(candidate.tenantId(), row.getMappingId(), delivery.getDeliveryId()) != 1) throw ImFailure.callbackUnavailable();
            return delivery.getDeliveryId();
        });
    }

    static String hash(String value) {
        try { return java.util.HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))); }
        catch (java.security.NoSuchAlgorithmException failure) { throw new IllegalStateException("IM_CARD_HASH_UNAVAILABLE"); }
    }
}
