package com.cloudflow.auth.message;

import com.cloudflow.auth.domain.SysPortalUser;
import com.cloudflow.auth.event.consumer.MessageSendEventConsumer;
import com.cloudflow.auth.mapper.SysDeptMapper;
import com.cloudflow.auth.mapper.SysMessageChannelMapper;
import com.cloudflow.auth.mapper.SysMessageRecordMapper;
import com.cloudflow.auth.mapper.SysMessageSubscribeMapper;
import com.cloudflow.auth.mapper.SysMessageTemplateMapper;
import com.cloudflow.auth.mapper.SysPortalUserMapper;
import com.cloudflow.auth.mapper.SysTenantMapper;
import com.cloudflow.auth.mapper.SysUserMapper;
import com.cloudflow.auth.mapper.SysUserRoleMapper;
import com.cloudflow.auth.portal.PortalContacts;
import com.cloudflow.auth.portal.PortalInvitationMail;
import com.cloudflow.auth.portal.PortalTenantAccess;
import com.cloudflow.auth.service.remote.RemoteCrmPortalService;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.event.outbox.OutboxEventMapper;
import com.cloudflow.common.event.outbox.OutboxPublisher;
import com.cloudflow.common.message.api.MessageSendRequest;
import com.cloudflow.common.message.channel.ChannelSendResult;
import com.cloudflow.common.message.constant.MessageChannelType;
import com.cloudflow.common.message.security.MessagePayloadCodec;
import com.cloudflow.common.security.portal.PortalAccessPolicy;
import com.cloudflow.common.security.portal.PortalContactSnapshot;
import java.lang.reflect.Proxy;
import java.util.List;
import org.springframework.transaction.support.TransactionTemplate;

final class MessagePortalInvitationChecks {
    static void run(MessageDeliveryDatabaseChecks suite) throws Exception {
        int checksBefore = suite.checks.get();
        suite.outcome = ChannelSendResult::success;
        suite.jdbc.update("INSERT INTO sys_tenant(tenant_id,tenant_code,tenant_name,status,deleted) VALUES (?,'portal-check','门户事务核验','0',0)", suite.TENANT);
        PortalAccessPolicy access = new PortalAccessPolicy(true, "https://portal.example.test");
        PortalInvitationMail mail = new PortalInvitationMail(access, suite.mapper(SysMessageChannelMapper.class), suite.deliveries,
                new OutboxPublisher(suite.mapper(OutboxEventMapper.class), suite.json), suite.json, suite.cipher,
                "message-fixture-encryption-key-at-least-32-characters");
        SysPortalUser user = account(901L);
        int sendsBefore = suite.sends.get();
        int eventsBefore = eventCount(suite);
        String token = issue(suite, mail, user);
        suite.check(suite.sends.get() == sendsBefore, "portal invitation reserves without sending inside the business transaction");
        suite.check(eventCount(suite) == eventsBefore + 1, "portal invitation queues one initial MESSAGE_SEND event without a recovery job");
        BusinessEventEnvelope event = event(suite, user);
        suite.check("cloudflow-auth".equals(event.getSourceModule()) && user.getPortalUserId().equals(event.getSourceId())
                && suite.TENANT.equals(event.getTenantId()), "portal event preserves trusted source and tenant identity");
        suite.check(event.getPayload().startsWith("MESSAGE_ENCRYPTED_V1:") && !event.getPayload().contains(token)
                && !event.getPayload().contains(user.getEmail()), "portal outbox payload encrypts invitation token and recipient");
        MessageSendRequest request = MessagePayloadCodec.decode(event, suite.json, suite.cipher);
        suite.check(request.safeChannelTypes().equals(List.of(MessageChannelType.EMAIL)) && request.safeReceivers().size() == 1
                && "EMAIL".equals(request.safeReceivers().get(0).getReceiverType())
                && user.getEmail().equals(request.safeReceivers().get(0).getReceiverAddress()), "portal dispatch retains exactly one EMAIL recipient");
        suite.check(event.getEventId().equals(request.getTraceId()) && request.getLinkUrl() == null
                && request.getContent().contains("/portal/portal-check/activate#token=" + token), "portal reservation and queued payload share the same trace and protected link");
        suite.check(suite.jdbc.queryForObject("SELECT COUNT(*) FROM sys_message_record record JOIN sys_message_delivery delivery ON delivery.record_id=record.record_id WHERE record.outbox_event_id=? AND delivery.outbox_event_id=record.outbox_event_id AND record.trace_id=record.outbox_event_id AND record.send_status='PENDING' AND delivery.status='PENDING'", Integer.class, event.getEventId()) == 1,
                "portal message record, delivery reservation and queued event have one shared identity");
        String ordinary = suite.jdbc.queryForObject("SELECT CONCAT_WS('|',title,content,link_url,receiver_addr_mask) FROM sys_message_record WHERE outbox_event_id=?", String.class, event.getEventId());
        String encrypted = suite.jdbc.queryForObject("SELECT payload_encrypted FROM sys_message_delivery WHERE outbox_event_id=?", String.class, event.getEventId());
        suite.check(!ordinary.contains(token) && !ordinary.contains(user.getEmail()) && !encrypted.contains(token)
                && !encrypted.contains(user.getEmail()), "portal ordinary records contain no raw invitation or recipient");
        MessageSendEventConsumer consumer = consumer(suite, access);
        consumer.consume(event);
        suite.check(suite.sends.get() == sendsBefore + 1, "initial portal event consumes its existing reservation and sends once");
        suite.check(suite.jdbc.queryForObject("SELECT COUNT(*) FROM sys_message_record record JOIN sys_message_delivery delivery ON delivery.record_id=record.record_id WHERE record.outbox_event_id=? AND record.send_status='SUCCESS' AND delivery.status='SENT' AND delivery.attempt_count=1", Integer.class, event.getEventId()) == 1,
                "initial portal event completes its original reservation without a hash conflict");
        consumer.consume(event);
        suite.check(suite.sends.get() == sendsBefore + 1, "duplicate portal event consumption never repeats the external send");
        suite.check(suite.jdbc.queryForObject("SELECT COUNT(*) FROM sys_message_record WHERE outbox_event_id=?", Integer.class, event.getEventId()) == 1,
                "duplicate portal event leaves no extra message records");
        rollback(suite, mail);
        SysPortalUser revoked = account(904L);
        issue(suite, mail, revoked);
        suite.jdbc.update("UPDATE sys_portal_user SET status='DISABLED',activate_token_hash=NULL WHERE portal_user_id=?", revoked.getPortalUserId());
        sendsBefore = suite.sends.get();
        BusinessEventEnvelope revokedEvent = event(suite, revoked);
        consumer.consume(revokedEvent);
        suite.check(suite.sends.get() == sendsBefore && "SKIPPED".equals(suite.jdbc.queryForObject("SELECT status FROM sys_message_delivery WHERE outbox_event_id=?", String.class, revokedEvent.getEventId())),
                "revoked portal invitation is checked again when its initial event is consumed");
        MessagePortalInvitationConcurrencyChecks.run(suite, mail);
        System.out.println("PORTAL_INVITATION_TRANSACTION_CHECKS: assertions=" + (suite.checks.get() - checksBefore)
                + "; failed=0; mysql=true; transactions=true; encrypted_outbox=true; crm_identity_double=true; transport_recorder=true; recovery_job=false; production_modified=false");
    }

    private static void rollback(MessageDeliveryDatabaseChecks suite, PortalInvitationMail mail) {
        int before = eventCount(suite);
        SysPortalUser failed = account(902L);
        suite.jdbc.execute("CREATE TRIGGER reject_portal_event BEFORE INSERT ON outbox_event FOR EACH ROW BEGIN IF NEW.event_type='MESSAGE_SEND' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='PORTAL_FIXTURE_FAILURE'; END IF; END");
        try {
            suite.rejects(() -> issue(suite, mail, failed), "initial portal outbox persistence failure reaches the business caller");
        } finally {
            suite.jdbc.execute("DROP TRIGGER reject_portal_event");
        }
        assertAbsent(suite, failed, "failed portal event rolls back account, activation hash, message and delivery");
        SysPortalUser cancelled = account(903L);
        new TransactionTemplate(suite.manager).execute(status -> {
            issue(suite, mail, cancelled);
            status.setRollbackOnly();
            return null;
        });
        assertAbsent(suite, cancelled, "outer business rollback removes the portal account and all queued invitation data");
        suite.check(eventCount(suite) == before, "failed and rolled back invitations leave no queued events");
    }

    private static void assertAbsent(MessageDeliveryDatabaseChecks suite, SysPortalUser user, String label) {
        suite.check(suite.jdbc.queryForObject("SELECT COUNT(*) FROM sys_portal_user WHERE login_account=?", Integer.class, user.getLoginAccount()) == 0
                && suite.jdbc.queryForObject("SELECT COUNT(*) FROM sys_message_record WHERE biz_type='PORTAL_ACTIVATION' AND biz_id=?", Integer.class, user.getPortalUserId().toString()) == 0
                && suite.jdbc.queryForObject("SELECT COUNT(*) FROM outbox_event WHERE aggregate_type='cloudflow-auth' AND aggregate_id=? AND event_type='MESSAGE_SEND'", Integer.class, user.getPortalUserId()) == 0
                && suite.jdbc.queryForObject("SELECT COUNT(*) FROM sys_message_delivery delivery LEFT JOIN sys_message_record record ON record.record_id=delivery.record_id WHERE record.record_id IS NULL", Integer.class) == 0, label);
    }

    private static String issue(MessageDeliveryDatabaseChecks suite, PortalInvitationMail mail, SysPortalUser user) {
        return new TransactionTemplate(suite.manager).execute(status -> {
            String token = mail.prepare(user);
            suite.mapper(SysPortalUserMapper.class).insert(user);
            mail.reserve(user, "portal-check", token);
            return token;
        });
    }

    private static int eventCount(MessageDeliveryDatabaseChecks suite) {
        return suite.jdbc.queryForObject("SELECT COUNT(*) FROM outbox_event WHERE event_type='MESSAGE_SEND'", Integer.class);
    }

    private static BusinessEventEnvelope event(MessageDeliveryDatabaseChecks suite, SysPortalUser user) throws Exception {
        String payload = suite.jdbc.queryForObject("SELECT event.payload_json FROM outbox_event event JOIN sys_message_record record ON record.outbox_event_id=event.event_id WHERE record.biz_type='PORTAL_ACTIVATION' AND record.biz_id=? AND event.event_type='MESSAGE_SEND'", String.class, user.getPortalUserId().toString());
        return suite.json.readValue(payload, BusinessEventEnvelope.class);
    }

    private static SysPortalUser account(Long contactId) {
        SysPortalUser user = new SysPortalUser();
        user.setTenantId(MessageDeliveryDatabaseChecks.TENANT);
        user.setUserType("CUSTOMER_CONTACT");
        user.setRefBizType("CRM_CONTACT");
        user.setRefBizId(contactId);
        user.setCustomerId(900L);
        user.setLoginAccount("portal." + contactId);
        user.setEmail("portal-" + contactId + "@example.test");
        user.setStatus("PENDING");
        user.setDeleted(0);
        user.setVersion(0);
        user.setSessionVersion(0);
        user.setFailCount(0);
        return user;
    }

    private static MessageSendEventConsumer consumer(MessageDeliveryDatabaseChecks suite, PortalAccessPolicy access) {
        RemoteCrmPortalService remote = (RemoteCrmPortalService) Proxy.newProxyInstance(RemoteCrmPortalService.class.getClassLoader(),
                new Class<?>[] { RemoteCrmPortalService.class }, (proxy, method, arguments) -> {
                    if (!"identity".equals(method.getName())) throw new AssertionError("Unexpected CRM operation");
                    PortalContactSnapshot contact = new PortalContactSnapshot();
                    contact.setTenantId(suite.TENANT);
                    contact.setContactId((Long) arguments[0]);
                    contact.setCustomerId((Long) arguments[1]);
                    contact.setEmail("portal-" + arguments[0] + "@example.test");
                    contact.setVersion(0);
                    return R.ok(contact);
                });
        PortalActivationMessageSourceGuard guard = new PortalActivationMessageSourceGuard(suite.mapper(SysPortalUserMapper.class), new PortalContacts(remote),
                new PortalTenantAccess(suite.mapper(SysTenantMapper.class)), access);
        MessageDeliveryService delivery = suite.service(suite.senderFactory, List.of(guard));
        MessageDispatchService dispatch = new MessageDispatchService(suite.json, suite.mapper(SysMessageChannelMapper.class), suite.mapper(SysMessageTemplateMapper.class),
                suite.mapper(SysMessageRecordMapper.class), suite.mapper(SysMessageSubscribeMapper.class), suite.mapper(SysUserMapper.class),
                suite.mapper(SysUserRoleMapper.class), suite.mapper(SysDeptMapper.class), suite.senderFactory, suite.cipher, suite.publisher, null, delivery, suite.manager);
        return new MessageSendEventConsumer(dispatch);
    }
}
