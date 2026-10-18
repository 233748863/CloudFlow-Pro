package com.cloudflow.auth.message;

import com.cloudflow.auth.domain.SysMessageRecord;
import com.cloudflow.auth.mapper.SysDeptMapper;
import com.cloudflow.auth.mapper.SysMessageChannelMapper;
import com.cloudflow.auth.mapper.SysMessageRecordMapper;
import com.cloudflow.auth.mapper.SysMessageSubscribeMapper;
import com.cloudflow.auth.mapper.SysMessageTemplateMapper;
import com.cloudflow.auth.mapper.SysUserMapper;
import com.cloudflow.auth.mapper.SysUserRoleMapper;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.event.outbox.OutboxEventMapper;
import com.cloudflow.common.event.outbox.OutboxPublisher;
import com.cloudflow.common.message.api.MessageReceiver;
import com.cloudflow.common.message.api.MessageSendRequest;
import com.cloudflow.common.message.channel.MessageChannelSenderFactory;
import com.cloudflow.common.message.constant.MessageChannelType;
import com.cloudflow.common.message.security.MessagePayloadCodec;
import java.util.List;
import org.springframework.core.env.StandardEnvironment;

final class MessageInternalTransactionChecks {
    static void run(MessageDeliveryDatabaseChecks suite) throws Exception {
        suite.jdbc.update("INSERT INTO sys_message_channel(channel_id,tenant_id,channel_type,channel_code,channel_name,status,implemented_flag) VALUES (600,?,'INTERNAL','internal-check','站内事务核验','ENABLED',1)", suite.TENANT);
        AuthMessagePushGateway push = new AuthMessagePushGateway(new OutboxPublisher(suite.mapper(OutboxEventMapper.class), suite.json), suite.json, new StandardEnvironment());
        MessageChannelSenderFactory factory = new MessageChannelSenderFactory(List.of(new InternalChannelSender(push)));
        MessageDispatchService dispatch = new MessageDispatchService(suite.json, suite.mapper(SysMessageChannelMapper.class), suite.mapper(SysMessageTemplateMapper.class),
                suite.mapper(SysMessageRecordMapper.class), suite.mapper(SysMessageSubscribeMapper.class), suite.mapper(SysUserMapper.class),
                suite.mapper(SysUserRoleMapper.class), suite.mapper(SysDeptMapper.class), factory, suite.cipher, suite.publisher, null, suite.deliveries, suite.manager);
        MessageSendRequest request = suite.request("unused@example.com").toBuilder().channelTypes(List.of(MessageChannelType.INTERNAL))
                .receivers(List.of(MessageReceiver.builder().receiverType("USER").receiverId(1L).build())).build();
        BusinessEventEnvelope event = suite.envelope(request);
        int before = suite.jdbc.queryForObject("SELECT COUNT(*) FROM outbox_event WHERE event_type='SYSTEM_NOTICE_CREATED'", Integer.class);
        MessageDispatchService.DispatchResult result = dispatch.dispatch(event);
        suite.check(result.success() && "SUCCESS".equals(result.records().get(0).getSendStatus()), "internal message remains successful after external transaction split");
        suite.check(suite.jdbc.queryForObject("SELECT COUNT(*) FROM outbox_event WHERE event_type='SYSTEM_NOTICE_CREATED'", Integer.class) == before + 1, "internal realtime push is queued in the message record transaction");
        suite.check(suite.deliveries.findByRecord(suite.TENANT, result.firstRecordId()) == null, "internal messages do not create external delivery rows");
        dispatch.dispatch(event);
        suite.check(suite.jdbc.queryForObject("SELECT COUNT(*) FROM outbox_event WHERE event_type='SYSTEM_NOTICE_CREATED'", Integer.class) == before + 1, "redelivered internal event does not duplicate the realtime push");
        MessageSendRequest externalRequest = request.toBuilder().channelTypes(List.of(MessageChannelType.EMAIL)).build();
        SysMessageRecord external = suite.reserve(externalRequest);
        BusinessEventEnvelope mixed = suite.envelope(request.toBuilder().channelTypes(List.of(MessageChannelType.INTERNAL, MessageChannelType.EMAIL)).content("changed content").build());
        mixed.setEventId(external.getOutboxEventId());
        MessagePayloadCodec.encode(mixed, request.toBuilder().channelTypes(List.of(MessageChannelType.INTERNAL, MessageChannelType.EMAIL)).content("changed content").build(), suite.json, suite.cipher);
        suite.rejects(() -> {
            try { dispatch.dispatch(mixed); } catch (Exception failure) { throw new RuntimeException(failure); }
        }, "later external identity conflict rolls back the shared staging transaction");
        suite.check(suite.jdbc.queryForObject("SELECT COUNT(*) FROM sys_message_record WHERE outbox_event_id=? AND channel_type='INTERNAL'", Integer.class, external.getOutboxEventId()) == 0, "rolled back mixed staging leaves no internal message record");
        suite.check(suite.jdbc.queryForObject("SELECT COUNT(*) FROM outbox_event WHERE event_type='SYSTEM_NOTICE_CREATED'", Integer.class) == before + 1, "rolled back mixed staging does not publish a ghost internal push");
    }
}
