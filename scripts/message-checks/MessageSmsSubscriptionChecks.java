package com.cloudflow.auth.message;

import com.cloudflow.auth.domain.SysMessageDelivery;
import com.cloudflow.auth.domain.SysMessageRecord;
import com.cloudflow.common.message.api.MessageReceiver;
import com.cloudflow.common.message.api.MessageSendRequest;
import com.cloudflow.common.message.channel.ChannelSendContext;
import com.cloudflow.common.message.channel.ChannelSendResult;
import com.cloudflow.common.message.channel.MessageChannelSender;
import com.cloudflow.common.message.channel.MessageChannelSenderFactory;
import com.cloudflow.common.message.constant.MessageCategory;
import com.cloudflow.common.message.constant.MessageChannelType;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import org.springframework.transaction.support.TransactionTemplate;

final class MessageSmsSubscriptionChecks {
    static void run(MessageDeliveryDatabaseChecks suite) {
        int before = suite.checks.get();
        AtomicInteger sends = new AtomicInteger();
        MessageChannelSender sender = new MessageChannelSender() {
            public MessageChannelType channelType() { return MessageChannelType.SMS; }
            public boolean implemented() { return true; }
            public ChannelSendResult send(ChannelSendContext context) {
                sends.incrementAndGet();
                return ChannelSendResult.success();
            }
        };
        MessageDeliveryService worker = suite.service(new MessageChannelSenderFactory(List.of(sender)));
        suite.jdbc.update("INSERT INTO sys_user(user_id,tenant_id,user_name,nick_name) VALUES (592,?,'sms-subscription-check','短信退订核验')", suite.TENANT);
        suite.jdbc.update("INSERT INTO sys_message_channel(channel_id,tenant_id,channel_type,channel_code,channel_name,status,implemented_flag) VALUES (592,?,'SMS','sms-subscription-check','短信退订核验','ENABLED',1)", suite.TENANT);
        suite.jdbc.update("INSERT INTO sys_message_subscribe(tenant_id,user_id,message_category,channel_type,enabled_flag) VALUES (?,592,'SYSTEM','SMS',1)", suite.TENANT);
        try {
            MessageSendRequest request = MessageSendRequest.builder().title("短信退订核验").content("退订后禁止投递")
                    .channelTypes(List.of(MessageChannelType.SMS)).category(MessageCategory.SYSTEM)
                    .receivers(List.of(MessageReceiver.builder().receiverType("USER").receiverId(592L).build())).build();
            SysMessageRecord pending = reserve(suite, worker, request);
            suite.check("PENDING".equals(pending.getSendStatus()), "SMS subscription test starts with an enabled channel and pending delivery");
            suite.jdbc.update("UPDATE sys_message_subscribe SET enabled_flag=0 WHERE tenant_id=? AND user_id=592 AND channel_type='SMS'", suite.TENANT);
            SysMessageRecord skipped = worker.deliverRecord(suite.TENANT, pending.getRecordId());
            suite.check("SKIPPED".equals(skipped.getSendStatus()) && "UNSUBSCRIBED".equals(skipped.getSkipReason()),
                    "SMS unsubscribe after reservation records SKIPPED and UNSUBSCRIBED");
            SysMessageDelivery delivery = worker.findByRecord(suite.TENANT, skipped.getRecordId());
            suite.check("SKIPPED".equals(delivery.getStatus()) && delivery.getAttemptCount() == 0
                    && "UNSUBSCRIBED".equals(delivery.getLastErrorCode()), "SMS unsubscribe persists zero transport attempts");
            worker.deliverRecord(suite.TENANT, pending.getRecordId());
            suite.check(sends.get() == 0, "unsubscribed SMS and repeated worker scan never contact the adapter");
            SysMessageRecord disabled = worker.deliverRecord(suite.TENANT, reserve(suite, worker, request).getRecordId());
            suite.check("SKIPPED".equals(disabled.getSendStatus()) && "UNSUBSCRIBED".equals(disabled.getSkipReason())
                    && sends.get() == 0, "new SMS while unsubscribed remains blocked");
            SysMessageRecord category = worker.deliverRecord(suite.TENANT,
                    reserve(suite, worker, request.toBuilder().category(MessageCategory.BIZ_REMINDER).build()).getRecordId());
            suite.check("SUCCESS".equals(category.getSendStatus()) && sends.get() == 1,
                    "SMS unsubscribe applies only to its selected message category");
            suite.jdbc.update("UPDATE sys_message_subscribe SET enabled_flag=1 WHERE tenant_id=? AND user_id=592 AND channel_type='SMS'", suite.TENANT);
            SysMessageRecord enabled = worker.deliverRecord(suite.TENANT, reserve(suite, worker, request).getRecordId());
            suite.check("SUCCESS".equals(enabled.getSendStatus()) && sends.get() == 2,
                    "SMS resubscribe allows a new message through the registered adapter");
        } finally {
            suite.jdbc.update("DELETE FROM sys_message_subscribe WHERE tenant_id=? AND user_id=592", suite.TENANT);
            suite.jdbc.update("DELETE FROM sys_message_channel WHERE tenant_id=? AND channel_id=592", suite.TENANT);
            suite.jdbc.update("DELETE FROM sys_user WHERE tenant_id=? AND user_id=592", suite.TENANT);
        }
        System.out.println("A2_SMS_SUBSCRIPTION_CHECKS: assertions=" + (suite.checks.get() - before)
                + "; failed=0; actual_service=true; sms_vendor=false; transport_recorder=true");
    }

    private static SysMessageRecord reserve(MessageDeliveryDatabaseChecks suite, MessageDeliveryService worker,
                                             MessageSendRequest request) {
        return new TransactionTemplate(suite.manager).execute(status -> worker.reserve(suite.envelope(request),
                request, MessageChannelType.SMS, request.safeReceivers().get(0)));
    }
}
