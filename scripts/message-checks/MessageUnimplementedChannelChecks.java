package com.cloudflow.auth.message;

import com.cloudflow.auth.domain.SysMessageDelivery;
import com.cloudflow.auth.domain.SysMessageRecord;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.message.api.MessageReceiver;
import com.cloudflow.common.message.api.MessageSendRequest;
import com.cloudflow.common.message.channel.ChannelSendResult;
import com.cloudflow.common.message.channel.MessageChannelSenderFactory;
import com.cloudflow.common.message.constant.MessageChannelType;
import java.util.List;
import org.springframework.transaction.support.TransactionTemplate;

final class MessageUnimplementedChannelChecks {
    static void run(MessageDeliveryDatabaseChecks suite) throws Exception {
        int before = suite.checks.get();
        MessageSendRequest email = suite.request("unimplemented@example.test");
        MessageDeliveryService missing = suite.service(new MessageChannelSenderFactory(List.of()));
        BusinessEventEnvelope emailEvent = suite.envelope(email);
        SysMessageRecord noAdapter = new TransactionTemplate(suite.manager).execute(status ->
                missing.reserve(emailEvent, email, MessageChannelType.EMAIL, email.safeReceivers().get(0)));
        failed(suite, missing, noAdapter, "missing EMAIL adapter");

        suite.jdbc.update("INSERT INTO sys_message_channel(channel_id,tenant_id,channel_type,channel_code,channel_name,status,implemented_flag) VALUES (590,?,'SMS','unimplemented-check','未实现核验','ENABLED',0)", suite.TENANT);
        suite.jdbc.update("INSERT INTO sys_message_channel(channel_id,tenant_id,channel_type,channel_code,channel_name,status,implemented_flag,priority,retry_count) VALUES (591,?,'EMAIL','adapter-declines-check','适配器未实现核验','ENABLED',1,-100,0)", suite.TENANT);
        try {
            MessageSendRequest sms = email.toBuilder().channelTypes(List.of(MessageChannelType.SMS))
                    .receivers(List.of(MessageReceiver.builder().receiverType("USER").receiverId(1L).build())).build();
            BusinessEventEnvelope event = suite.envelope(sms);
            SysMessageRecord first = suite.dispatch.dispatch(event).records().get(0);
            failed(suite, suite.deliveries, first, "configured unimplemented SMS");
            Long repeated = suite.dispatch.dispatch(event).firstRecordId();
            suite.check(first.getRecordId().equals(repeated), "unimplemented event redelivery returns same failed record");
            suite.check(suite.jdbc.queryForObject("SELECT COUNT(*) FROM sys_message_record WHERE outbox_event_id=?", Integer.class,
                    event.getEventId()) == 1, "unimplemented event redelivery creates no duplicate record");
            suite.outcome = ChannelSendResult::notImplemented;
            SysMessageRecord changed = suite.reserve(email.toBuilder().title("适配器未实现核验").build());
            suite.check("PENDING".equals(changed.getSendStatus()) && Long.valueOf(591L).equals(changed.getChannelId()),
                    "runtime nonimplementation uses independent enabled channel");
            int sendsBefore = suite.sends.get();
            SysMessageRecord declined = suite.deliveries.deliverRecord(suite.TENANT, changed.getRecordId());
            suite.check(suite.sends.get() == sendsBefore + 1, "runtime nonimplementation reaches actual registered adapter");
            suite.check("FAILED".equals(declined.getSendStatus()) && "NOT_IMPLEMENTED".equals(declined.getErrorMsg())
                    && declined.getSkipReason() == null, "adapter nonimplementation outcome is explicit failure");
            suite.deliveries.deliverRecord(suite.TENANT, changed.getRecordId());
            suite.check(suite.sends.get() == sendsBefore + 1, "runtime nonimplementation remains terminal without retry or fallback");
        } finally {
            suite.outcome = ChannelSendResult::success;
            suite.jdbc.update("DELETE FROM sys_message_channel WHERE channel_id IN (590,591) AND tenant_id=?", suite.TENANT);
        }
        System.out.println("A2_UNIMPLEMENTED_CHECKS: assertions=" + (suite.checks.get() - before) + "; failed=0");
    }

    private static void failed(MessageDeliveryDatabaseChecks suite, MessageDeliveryService service,
                               SysMessageRecord record, String name) {
        suite.check("FAILED".equals(record.getSendStatus()) && "NOT_IMPLEMENTED".equals(record.getErrorMsg())
                && record.getSkipReason() == null, name + " records FAILED with explicit reason");
        SysMessageDelivery delivery = service.findByRecord(suite.TENANT, record.getRecordId());
        suite.check("FAILED".equals(delivery.getStatus()) && "NOT_IMPLEMENTED".equals(delivery.getLastErrorCode())
                && delivery.getAttemptCount() == 0, name + " never enters transport or retry");
        service.deliverRecord(suite.TENANT, record.getRecordId());
        suite.check(service.findByRecord(suite.TENANT, record.getRecordId()).getAttemptCount() == 0,
                name + " remains terminal on repeated worker scan");
    }
}
