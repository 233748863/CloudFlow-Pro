package com.cloudflow.auth.message;

import com.cloudflow.auth.domain.SysMessageDelivery;
import com.cloudflow.auth.domain.SysMessageRecord;
import com.cloudflow.auth.mapper.*;
import com.cloudflow.common.audit.mapper.SysAuditLogMapper;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.event.outbox.OutboxEventMapper;
import com.cloudflow.common.event.outbox.OutboxPublisher;
import com.cloudflow.common.message.api.MessageDeliverySnapshot;
import com.cloudflow.common.message.api.MessageSendRequest;
import com.cloudflow.common.message.api.MessageSourceCheck;
import com.cloudflow.common.message.channel.ChannelSendContext;
import com.cloudflow.common.message.channel.ChannelSendResult;
import com.cloudflow.common.message.channel.MessageChannelSender;
import com.cloudflow.common.message.channel.MessageChannelSenderFactory;
import com.cloudflow.common.message.constant.MessageChannelType;
import com.cloudflow.common.message.security.MessagePayloadCodec;
import com.cloudflow.common.sensitive.config.SensitiveBeanSerializerModifier;
import com.cloudflow.common.security.portal.PortalContactSnapshot;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.module.SimpleModule;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.fasterxml.jackson.datatype.jsr310.deser.LocalDateTimeDeserializer;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

final class MessageSensitiveSerializationChecks {
    static void run(MessageDeliveryDatabaseChecks suite) throws Exception {
        SimpleModule sensitiveModule = new SimpleModule("production-sensitive-module");
        sensitiveModule.setSerializerModifier(new SensitiveBeanSerializerModifier());
        ObjectMapper json = suite.json.copy().registerModule(sensitiveModule);
        portalContacts(suite, json);
        String address = "protected-address@example.test";
        MessageSendRequest request = suite.request(address).toBuilder().scheduleTime(LocalDateTime.now().minusSeconds(1)).build();
        suite.check(!json.writeValueAsString(request).contains(address), "ordinary response serialization still masks receiver address");
        BusinessEventEnvelope envelope = suite.envelope(request);
        envelope.setSourceModule("cloudflow-service-oa");
        MessagePayloadCodec.encode(envelope, request, json, suite.cipher);
        suite.check(!envelope.getPayload().contains(address), "production serializer writes only encrypted outbox address");
        MessageSendRequest decoded = MessagePayloadCodec.decode(envelope, json, suite.cipher);
        suite.check(address.equals(decoded.safeReceivers().get(0).getReceiverAddress()), "protected outbox retains original mailbox under production sensitive module");
        suite.check(request.getScheduleTime().equals(decoded.getScheduleTime()), "protected serialization preserves installed date module behavior");
        MessageSourceCheck source = new MessageSourceCheck(envelope.getEventId(), 77L, decoded);
        JsonNode sourceTree = MessagePayloadCodec.internalTree(source, json);
        JsonNode transport = json.readTree(json.writeValueAsString(sourceTree));
        suite.check(address.equals(transport.path("request").path("receivers").get(0).path("receiverAddress").asText()), "trusted internal verification transport preserves original mailbox");
        suite.check(address.equals(json.treeToValue(transport, MessageSourceCheck.class).request().safeReceivers().get(0).getReceiverAddress()), "internal verification request deserializes exact mailbox");
        AtomicInteger sends = new AtomicInteger();
        MessageChannelSender sender = new MessageChannelSender() {
            public MessageChannelType channelType() { return MessageChannelType.EMAIL; }
            public boolean implemented() { return true; }
            public ChannelSendResult send(ChannelSendContext context) {
                suite.check(!TransactionSynchronizationManager.isActualTransactionActive(), "sensitive serializer path calls provider outside transaction");
                suite.check(address.equals(context.getReceiver().getReceiverAddress()), "delivery payload decrypts actual mailbox before provider invocation");
                sends.incrementAndGet();
                return ChannelSendResult.success();
            }
        };
        MessageDeliveryService worker = new MessageDeliveryService(suite.mapper(SysMessageDeliveryMapper.class), suite.mapper(SysMessageRecordMapper.class),
                suite.mapper(SysMessageChannelMapper.class), suite.mapper(SysMessageTemplateMapper.class), suite.mapper(SysMessageSubscribeMapper.class),
                suite.mapper(SysUserMapper.class), new MessageChannelSenderFactory(List.of(sender)), suite.cipher, json, suite.manager, List.of(),
                new OutboxPublisher(suite.mapper(OutboxEventMapper.class), json), suite.mapper(SysAuditLogMapper.class));
        SysMessageRecord record = new TransactionTemplate(suite.manager).execute(status -> worker.reserve(envelope, decoded, MessageChannelType.EMAIL, decoded.safeReceivers().get(0)));
        suite.check("SUCCESS".equals(worker.deliverRecord(suite.TENANT, record.getRecordId()).getSendStatus()) && sends.get() == 1, "sensitive application mapper supports a complete persisted send");
        SysMessageDelivery delivery = worker.findByRecord(suite.TENANT, record.getRecordId());
        suite.check(!delivery.getPayloadEncrypted().contains(address) && suite.cipher.decrypt(delivery.getPayloadEncrypted()).contains(address), "persisted payload encrypts the actual unmasked receiver");
        MessageDeliverySnapshot snapshot = worker.businessSnapshot(suite.TENANT, record.getRecordId(), "cloudflow-service-oa");
        JsonNode internalResponse = json.readTree(json.writeValueAsString(R.ok(MessagePayloadCodec.internalTree(snapshot, json))));
        suite.check(address.equals(internalResponse.path("data").path("request").path("receivers").get(0).path("receiverAddress").asText()), "protected business snapshot remains exact through the response envelope");
        DateTimeFormatter timeFormat = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
        JavaTimeModule oaTimeModule = new JavaTimeModule();
        oaTimeModule.addDeserializer(LocalDateTime.class, new LocalDateTimeDeserializer(timeFormat));
        ObjectMapper oaJson = new ObjectMapper().registerModule(oaTimeModule);
        MessageDeliverySnapshot receivedSnapshot = oaJson.treeToValue(internalResponse.path("data"), MessageDeliverySnapshot.class);
        suite.check(snapshot.acceptedTime().equals(receivedSnapshot.acceptedTime()), "business snapshot accepted time survives OA configured date deserializer");
        suite.check(snapshot.acceptedTime().format(timeFormat).equals(internalResponse.path("data").path("acceptedTime").asText()), "business snapshot declares a stable cross-service accepted time format");
        suite.check(snapshot.acceptedTime().equals(json.treeToValue(internalResponse.path("data"), MessageDeliverySnapshot.class).acceptedTime()), "business snapshot accepted time also round trips through the auth mapper");
        suite.check(!json.writeValueAsString(snapshot).contains(address) && !json.writeValueAsString(request).contains(address), "per-write internal attribute never disables subsequent public response masking");
        worker.deliverRecord(suite.TENANT, record.getRecordId());
        suite.check(sends.get() == 1, "sensitive mapper delivery redelivery does not duplicate send");
    }

    private static void portalContacts(MessageDeliveryDatabaseChecks suite, ObjectMapper json) throws Exception {
        PortalContactSnapshot contact = new PortalContactSnapshot();
        contact.setTenantId(suite.TENANT);
        contact.setContactId(800L);
        contact.setCustomerId(801L);
        contact.setEmail("portal-original@example.test");
        contact.setPhone("13800138000");
        contact.setVersion(4);
        String ordinary = json.writeValueAsString(R.ok(contact));
        suite.check(!ordinary.contains(contact.getEmail()) && !ordinary.contains(contact.getPhone()), "ordinary portal contact responses retain global sensitive masking");
        JsonNode trusted = json.readTree(json.writeValueAsString(R.ok(MessagePayloadCodec.internalTree(contact, json))));
        PortalContactSnapshot restored = json.treeToValue(trusted.path("data"), PortalContactSnapshot.class);
        suite.check(contact.getEmail().equals(restored.getEmail()) && contact.getPhone().equals(restored.getPhone()), "trusted portal contact transport preserves the original invitation address and phone");
        suite.check(contact.getTenantId().equals(restored.getTenantId()) && contact.getContactId().equals(restored.getContactId())
                && contact.getCustomerId().equals(restored.getCustomerId()) && contact.getVersion().equals(restored.getVersion()), "trusted portal contact transport preserves identity and relationship version");
        PageResult<PortalContactSnapshot> page = new PageResult<>(List.of(contact), 1, 1, 10);
        String pageResponse = json.writeValueAsString(R.ok(MessagePayloadCodec.internalTree(page, json)));
        R<PageResult<PortalContactSnapshot>> restoredPage = json.readValue(pageResponse, new TypeReference<>() { });
        suite.check(restoredPage.getData().getRows().size() == 1 && contact.getEmail().equals(restoredPage.getData().getRows().get(0).getEmail()),
                "trusted paginated portal contact response deserializes an exact mailbox");
        suite.check(json.readTree(json.writeValueAsString(R.ok(MessagePayloadCodec.internalTree(null, json)))).path("data").isNull(),
                "missing trusted portal identity remains null across transport");
        suite.check(ordinary.equals(json.writeValueAsString(R.ok(contact))), "trusted contact transport never disables subsequent ordinary response masking");
    }
}
