package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.auth.mapper.*;
import com.cloudflow.auth.message.*;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.event.outbox.OutboxEvent;
import com.cloudflow.common.event.outbox.OutboxEventMapper;
import com.cloudflow.common.event.outbox.OutboxPublisher;
import com.cloudflow.common.message.api.*;
import com.cloudflow.common.message.channel.*;
import com.cloudflow.common.message.config.MessageAutoConfiguration;
import com.cloudflow.common.message.constant.MessageChannelType;
import com.cloudflow.common.message.security.MessagePayloadCodec;
import com.cloudflow.common.message.security.MessageSecretCipher;
import com.cloudflow.oa.domain.MeetingRoom;
import com.cloudflow.oa.domain.SysScheduleEvent;
import com.cloudflow.oa.domain.OaMeetingReminder;
import com.cloudflow.oa.domain.dto.MeetingCommands;
import com.cloudflow.oa.mapper.OaIdentityReferenceMapper;
import com.cloudflow.oa.mapper.OaMeetingMapper;
import com.cloudflow.oa.mapper.OaMeetingReminderMapper;
import com.cloudflow.oa.service.IOaTraceEventService;
import com.cloudflow.oa.service.remote.RemoteMessageDeliveryService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.lang.reflect.Method;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Future;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.core.env.MapPropertySource;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionSynchronizationManager;

final class OaMeetingMessageFixture {
    final OaMeetingReminderService reminders;
    private final OaMeetingReminderService reminderTarget;
    private final SqlSessionTemplate sessions;
    private final JdbcTemplate jdbc;
    private final PlatformTransactionManager transactions;
    private final ObjectMapper json;
    private final long tenant;
    private final long host;
    private final long guest;
    private final long third;
    private final OutboxPublisher publisher;
    private final MessageSecretCipher cipher;
    private final MessageChannelSenderFactory senders;
    private final MessageDeliverySourceGuard guard;
    private final MessageDeliveryService deliveries;
    private final MessageDispatchService dispatch;
    private final MessageSender sender;
    private final AtomicInteger pushCount = new AtomicInteger();
    private final AtomicInteger emailCount = new AtomicInteger();
    private final AtomicBoolean pushUnavailable = new AtomicBoolean();
    private final AtomicReference<String> emailOutcome = new AtomicReference<>("SENT");
    private final AtomicReference<Runnable> duringSend = new AtomicReference<>();
    private int assertions;
    int races;

    OaMeetingMessageFixture(SqlSessionTemplate sessions, JdbcTemplate jdbc, PlatformTransactionManager transactions,
            OaMeetingAccess access, OaMeetingMapper meetings, IOaTraceEventService trace, ObjectMapper json,
            long tenant, long host, long guest, long third) {
        this.sessions = sessions; this.jdbc = jdbc; this.transactions = transactions; this.json = json;
        this.tenant = tenant; this.host = host; this.guest = guest; this.third = third;
        String fixtureKey = UUID.randomUUID().toString();
        cipher = new MessageSecretCipher(fixtureKey);
        publisher = new OutboxPublisher(sessions.getMapper(OutboxEventMapper.class), json);
        StandardEnvironment environment = new StandardEnvironment();
        environment.getPropertySources().addFirst(new MapPropertySource("meeting-fixture", Map.of("spring.application.name", "cloudflow-service-oa", "cloudflow.message.secret-key", fixtureKey)));
        sender = new MessageAutoConfiguration().messageSender(publisher, json, environment);
        RemoteMessageDeliveryService remote = new RemoteMessageDeliveryService() {
            @Override public R<MessageChannelReadiness> readiness(String templateCode) { return R.ok(new MessageChannelReadiness(false, "隔离环境未配置正式邮件商")); }
            @Override public R<MessageDeliverySnapshot> snapshot(Long recordId) {
                if (TransactionSynchronizationManager.isActualTransactionActive()) throw new AssertionError("读取消息结果不得持有业务事务");
                return R.ok(deliveries.businessSnapshot(tenant, recordId, "cloudflow-service-oa"));
            }
        };
        reminderTarget = new OaMeetingReminderService(sessions.getMapper(OaMeetingReminderMapper.class), meetings, access,
                sessions.getMapper(OaIdentityReferenceMapper.class), sender, remote, trace, json, transactions);
        ProxyFactory reminderProxy = new org.springframework.aop.framework.ProxyFactory(reminderTarget); reminderProxy.setProxyTargetClass(true);
        reminderProxy.addAdvice(new org.springframework.transaction.interceptor.TransactionInterceptor(transactions,
                new org.springframework.transaction.annotation.AnnotationTransactionAttributeSource()));
        reminders = (OaMeetingReminderService) reminderProxy.getProxy();
        guard = new OaMessageDeliverySourceGuard(new com.cloudflow.auth.service.remote.RemoteOaMessageSourceService() {
            @Override public R<MessageSourceResult> verify(JsonNode request) { return R.ok(reminders.verify(json.convertValue(request, MessageSourceCheck.class))); }
            @Override public R<List<MessageAttachment>> attachments(JsonNode request) { return R.ok(List.of()); }
        }, json);
        senders = new MessageChannelSenderFactory(List.of(new InternalChannelSender((userId, payload) -> {
            if (TransactionSynchronizationManager.isActualTransactionActive()) throw new AssertionError("站内实时推送不得持有事务");
            pushCount.incrementAndGet();
            if (pushUnavailable.get()) throw new IllegalStateException("隔离实时推送故障");
        }), new MessageChannelSender() {
            @Override public MessageChannelType channelType() { return MessageChannelType.EMAIL; }
            @Override public boolean implemented() { return true; }
            @Override public ChannelSendResult send(ChannelSendContext context) {
                if (TransactionSynchronizationManager.isActualTransactionActive()) throw new AssertionError("外发不得持有事务");
                emailCount.incrementAndGet();
                Runnable callback = duringSend.getAndSet(null); if (callback != null) callback.run();
                return switch (emailOutcome.get()) {
                    case "UNKNOWN" -> ChannelSendResult.unknown("FIXTURE_OUTCOME_UNKNOWN");
                    case "FAILED" -> ChannelSendResult.failed("FIXTURE_EXPLICIT_REFUSAL");
                    case "RETRYABLE" -> ChannelSendResult.retryable("FIXTURE_CONNECT_FAILED");
                    default -> ChannelSendResult.accepted("isolated-provider-" + context.getRecordId());
                };
            }
        }));
        deliveries = createDelivery();
        dispatch = new MessageDispatchService(json, sessions.getMapper(SysMessageChannelMapper.class), sessions.getMapper(SysMessageTemplateMapper.class),
                sessions.getMapper(SysMessageRecordMapper.class), sessions.getMapper(SysMessageSubscribeMapper.class), sessions.getMapper(SysUserMapper.class),
                sessions.getMapper(SysUserRoleMapper.class), sessions.getMapper(SysDeptMapper.class), senders, cipher, sender,
                new org.springframework.data.redis.core.StringRedisTemplate(), deliveries, transactions);
    }

    private MessageDeliveryService createDelivery() {
        return new MessageDeliveryService(sessions.getMapper(SysMessageDeliveryMapper.class), sessions.getMapper(SysMessageRecordMapper.class),
                sessions.getMapper(SysMessageChannelMapper.class), sessions.getMapper(SysMessageTemplateMapper.class), sessions.getMapper(SysMessageSubscribeMapper.class),
                sessions.getMapper(SysUserMapper.class), senders, cipher, json, transactions, List.of(guard), publisher,
                sessions.getMapper(com.cloudflow.common.audit.mapper.SysAuditLogMapper.class));
    }

    int exercise(OaMeetingBookingService bookings, MeetingRoomServiceImpl rooms) throws Exception {
        jdbc.update("UPDATE sys_message_channel SET status='DISABLED' WHERE tenant_id=? AND channel_type='EMAIL'", tenant);
        jdbc.update("INSERT INTO sys_message_channel(channel_id,tenant_id,channel_code,channel_name,channel_type,status,implemented_flag,priority,retry_count,retry_interval_sec) VALUES(?,?,'H4_CHECK_EMAIL','H4协议夹具邮件','EMAIL','ENABLED',1,0,2,1)", 9392001L, tenant);
        timePrecision(bookings);
        MeetingCommands.Booking command = command("H4多提醒真实流水"); command.setAttendeeIds(List.of(guest, third));
        command.setReminders(List.of(new MeetingCommands.Reminder(120, "INTERNAL"), new MeetingCommands.Reminder(120, "EMAIL"), new MeetingCommands.Reminder(30, "INTERNAL")));
        SysScheduleEvent event = bookings.create(command);
        equal(5L, count("SELECT COUNT(*) FROM oa_meeting_reminder WHERE event_id=?", event.getEventId()), "三组配置加两渠道邀请可靠保存");
        equal(0L, count("SELECT SUM(sent_flag) FROM oa_meeting_reminder WHERE event_id=?", event.getEventId()), "预约保存不虚报提醒已发");
        reminders.dispatchDue();
        OaMeetingReminder internal = reminder(event, "REMINDER", "INTERNAL", 120);
        equal("DISPATCHED", internal.getStatus(), "到期提醒仅进入派发状态");
        List<BusinessEventEnvelope> queue = queued(internal.getReminderId()); equal(3, queue.size(), "三位接收人分别持久化发送事件");
        long outboxBefore = count("SELECT COUNT(*) FROM outbox_event WHERE aggregate_id=? AND event_type='MESSAGE_SEND'", internal.getReminderId());
        reminders.dispatchDue(); equal(outboxBefore, count("SELECT COUNT(*) FROM outbox_event WHERE aggregate_id=? AND event_type='MESSAGE_SEND'", internal.getReminderId()), "重复调度不重复生成逐人事件");
        dispatch.dispatch(queue.get(0)); outcomes(internal.getReminderId());
        equal(0L, count("SELECT sent_flag FROM oa_meeting_reminder WHERE reminder_id=?", internal.getReminderId()), "仅首人成功整组仍未完成");
        OaMeetingReminderService.Delivery partial = reminders.details(event.getEventId()).stream().filter(value -> value.reminder().getReminderId().equals(internal.getReminderId())).findFirst().orElseThrow();
        equal(1L, partial.recipients().stream().filter(value -> "SENT".equals(value.status())).count(), "逐人结果只记录实际已送达一人");
        dispatch.dispatch(queue.get(1)); dispatch.dispatch(queue.get(2)); outcomes(internal.getReminderId());
        equal(1L, count("SELECT sent_flag FROM oa_meeting_reminder WHERE reminder_id=?", internal.getReminderId()), "三人实际成功后整组标已发送");
        equal(0L, count("SELECT COUNT(*) FROM oa_meeting_reminder WHERE reminder_id=? AND message_record_id IS NOT NULL", internal.getReminderId()), "多人汇总不伪装成首人的消息记录");
        equal(3L, count("SELECT COUNT(*) FROM sys_message_record WHERE biz_type='OA_MEETING_NOTICE' AND biz_id=? AND send_status='SUCCESS' AND title LIKE '%H4多提醒真实流水%' AND content LIKE '%https://meet.example.test/%' AND link_url IS NOT NULL", internal.getReminderId().toString()), "站内实际消息保留正确标题正文及链接");
        int pushed = pushCount.get(); for (BusinessEventEnvelope value : queue) dispatch.dispatch(value); outcomes(internal.getReminderId());
        equal(pushed, pushCount.get(), "消息事件重放不重复实时推送或站内入箱");
        OaMeetingReminder email = reminder(event, "REMINDER", "EMAIL", 120);
        check(queued(email.getReminderId()).stream().allMatch(value -> value.getPayload().startsWith("MESSAGE_ENCRYPTED_V1:")), "外部消息发送事件保持加密");
        MeetingCommands.Booking editing = command("H4已改期的新标题"); editing.setAttendeeIds(List.of(third)); editing.setVersion(event.getVersion()); editing.setStartTime(event.getStartTime().plusHours(2)); editing.setEndTime(editing.getStartTime().plusHours(1));
        SysScheduleEvent changed = bookings.update(event.getEventId(), editing);
        equal("CANCELLED", text("SELECT status FROM oa_meeting_reminder WHERE reminder_id=?", email.getReminderId()), "改期取消旧待发渠道");
        int beforeEmail = emailCount.get(); send(email.getReminderId());
        equal(beforeEmail, emailCount.get(), "旧版本投递前源核验阻止真实外发调用");
        equal(0L, count("SELECT sent_flag FROM oa_meeting_reminder WHERE reminder_id=?", email.getReminderId()), "旧通知跳过不算实际发送");
        List<OaMeetingReminderService.Delivery> corrections = reminders.details(event.getEventId()).stream().filter(value -> value.reminder().getEventKey().contains(":CORRECTION:")).toList();
        check(!corrections.isEmpty(), "已送达旧通知生成可靠更正");
        OaMeetingReminderService.Delivery guestCorrection = corrections.stream().filter(value -> value.recipients().stream().anyMatch(person -> person.userId() == guest)).findFirst().orElseThrow();
        MessageSendRequest corrected = MessagePayloadCodec.decode(queued(guestCorrection.reminder().getReminderId()).get(0), json, cipher);
        check(corrected.getContent().contains("已失效") && !corrected.getContent().contains("新标题") && corrected.getLinkUrl() == null, "被移除接收人仅收撤销更正，不泄漏新详情");
        pushUnavailable.set(true); send(guestCorrection.reminder().getReminderId()); pushUnavailable.set(false);
        equal(1L, count("SELECT sent_flag FROM oa_meeting_reminder WHERE reminder_id=?", guestCorrection.reminder().getReminderId()), "实时推送失败仍按已提交的站内入箱事实确认");
        declined(bookings);
        externalOutcomes(bookings);
        inFlight(bookings);
        sourceTampering(bookings);
        approvalHeld(bookings, rooms);
        concurrentResults(bookings);
        check(!reminders.emailReadiness().ready(), "未配置正式邮件商明确显示停用");
        equal(0L, count("SELECT COUNT(*) FROM oa_meeting_reminder WHERE event_id=? AND schedule_version=? AND status='PENDING' AND due_time<=NOW() AND event_key LIKE '%:REMINDER:%'", changed.getEventId(), changed.getScheduleVersion()), "未配置新提醒不会虚构排程");
        System.out.println("MEETING_H4_MESSAGE_DATABASE: assertions=" + assertions + "; real_outbox=true; real_auth_delivery=true; real_oa_results=true; real_internal_inbox=true; email_provider=fixture; http=false; redis=false");
        return assertions;
    }

    private void timePrecision(OaMeetingBookingService bookings) throws Exception {
        MeetingCommands.Booking command = command("H4提醒时间精度");
        command.setStartTime(command.getStartTime().plusHours(4));
        command.setEndTime(command.getStartTime().plusHours(1));
        SysScheduleEvent event = bookings.create(command);
        LocalDateTime due = command.getStartTime().minusMinutes(120).withNano(750_000_000);
        Method scheduling = OaMeetingReminderService.class.getDeclaredMethod("add", SysScheduleEvent.class, String.class, String.class,
                int.class, LocalDateTime.class, String.class);
        scheduling.setAccessible(true);
        new org.springframework.transaction.support.TransactionTemplate(transactions).executeWithoutResult(status -> {
            try { scheduling.invoke(reminderTarget, event, "REMINDER", "INTERNAL", 120, due, null); }
            catch (ReflectiveOperationException failure) { throw new IllegalStateException(failure); }
        });
        LocalDateTime stored = reminder(event, "REMINDER", "INTERNAL", 120).getDueTime();
        System.out.println("MEETING_TIME_PRECISION: requested=" + due + "; stored=" + stored);
        equal(due.withNano(0), stored, "提醒按表的秒精度向下取整，不被四舍五入延后一秒");
    }

    private void declined(OaMeetingBookingService bookings) throws Exception {
        MeetingCommands.Booking command = command("H4拒绝后不提醒"); command.setReminders(List.of(new MeetingCommands.Reminder(120, "INTERNAL")));
        SysScheduleEvent event = bookings.create(command); reminders.dispatchDue();
        OaMeetingReminder group = reminder(event, "REMINDER", "INTERNAL", 120);
        long originalUser = com.cloudflow.common.core.context.UserContext.getUserId();
        com.cloudflow.common.core.context.UserContext.setUserId(guest);
        try { bookings.respond(event.getEventId(), new MeetingCommands.Response(event.getScheduleVersion(), "DECLINED")); }
        finally { com.cloudflow.common.core.context.UserContext.setUserId(originalUser); }
        send(group.getReminderId());
        equal(1L, count("SELECT COUNT(*) FROM sys_message_record WHERE biz_id=? AND receiver_id=? AND send_status='SKIPPED'", group.getReminderId().toString(), guest), "排队后本人拒绝会前提醒则投递前跳过");
        equal("FAILED", text("SELECT status FROM oa_meeting_reminder WHERE reminder_id=?", group.getReminderId()), "部分跳过整组显示实际未全送达");
        equal(0L, count("SELECT sent_flag FROM oa_meeting_reminder WHERE reminder_id=?", group.getReminderId()), "跳过不等于实际发送");
    }

    private void externalOutcomes(OaMeetingBookingService bookings) throws Exception {
        MeetingCommands.Booking command = command("H4失败与未知结果"); command.setAttendeeIds(List.of()); command.setReminders(List.of(new MeetingCommands.Reminder(120, "EMAIL")));
        SysScheduleEvent event = bookings.create(command); reminders.dispatchDue();
        OaMeetingReminder group = reminder(event, "REMINDER", "EMAIL", 120);
        emailOutcome.set("FAILED"); send(group.getReminderId());
        equal("FAILED", text("SELECT status FROM oa_meeting_reminder WHERE reminder_id=?", group.getReminderId()), "明确失败保留未发状态");
        Long recordId = jdbc.queryForObject("SELECT record_id FROM sys_message_record WHERE biz_type='OA_MEETING_NOTICE' AND biz_id=?", Long.class, group.getReminderId().toString());
        check(deliveries.requestResend(tenant, recordId), "管理员可从原失败事实登记重发");
        emailOutcome.set("SENT"); send(group.getReminderId());
        equal(1L, count("SELECT sent_flag FROM oa_meeting_reminder WHERE reminder_id=?", group.getReminderId()), "合法重发核验快照及来源后更新实际成功");
        MeetingCommands.Booking unknownCommand = command("H4未知结果不盲重发"); unknownCommand.setAttendeeIds(List.of()); unknownCommand.setReminders(List.of(new MeetingCommands.Reminder(120, "EMAIL")));
        SysScheduleEvent unknown = bookings.create(unknownCommand); reminders.dispatchDue();
        OaMeetingReminder uncertain = reminder(unknown, "REMINDER", "EMAIL", 120);
        emailOutcome.set("UNKNOWN"); send(uncertain.getReminderId());
        Long unknownRecord = jdbc.queryForObject("SELECT record_id FROM sys_message_record WHERE biz_type='OA_MEETING_NOTICE' AND biz_id=?", Long.class, uncertain.getReminderId().toString());
        check(!deliveries.requestResend(tenant, unknownRecord), "未知结果禁止盲目重发");
        equal(0L, count("SELECT sent_flag FROM oa_meeting_reminder WHERE reminder_id=?", uncertain.getReminderId()), "未知结果不能宣称发送成功");
        emailOutcome.set("SENT");
        MeetingCommands.Booking retryCommand = command("H4数据库恢复投递"); retryCommand.setAttendeeIds(List.of()); retryCommand.setReminders(List.of(new MeetingCommands.Reminder(120, "EMAIL")));
        SysScheduleEvent retry = bookings.create(retryCommand); reminders.dispatchDue();
        OaMeetingReminder recoverable = reminder(retry, "REMINDER", "EMAIL", 120);
        emailOutcome.set("RETRYABLE"); send(recoverable.getReminderId());
        jdbc.update("UPDATE sys_message_delivery delivery JOIN sys_message_record record ON record.record_id=delivery.record_id AND record.tenant_id=delivery.tenant_id SET delivery.next_attempt_time=DATE_SUB(NOW(),INTERVAL 1 MINUTE) WHERE record.biz_id=? AND record.biz_type='OA_MEETING_NOTICE'", recoverable.getReminderId().toString());
        emailOutcome.set("SENT"); createDelivery().processDue(tenant, 100); outcomes(recoverable.getReminderId());
        equal(1L, count("SELECT sent_flag FROM oa_meeting_reminder WHERE reminder_id=?", recoverable.getReminderId()), "新服务实例不依赖Redis从数据库恢复并发送");
        jdbc.update("UPDATE sys_message_channel SET status='DISABLED' WHERE channel_id=?", 9392001L);
        MeetingCommands.Booking disabled = command("H4外部关闭仍可预约"); disabled.setAttendeeIds(List.of()); disabled.setReminders(List.of(new MeetingCommands.Reminder(120, "EMAIL")));
        SysScheduleEvent disabledEvent = bookings.create(disabled); reminders.dispatchDue();
        OaMeetingReminder closed = reminder(disabledEvent, "REMINDER", "EMAIL", 120); int before = emailCount.get(); send(closed.getReminderId());
        equal(before, emailCount.get(), "外部渠道未配置不调用发送商");
        OaMeetingReminderService.Delivery detail = reminders.details(disabledEvent.getEventId()).stream().filter(value -> value.reminder().getReminderId().equals(closed.getReminderId())).findFirst().orElseThrow();
        check(detail.recipients().get(0).reason().contains("未配置"), "外部关闭明确回显逐人未发送原因");
        OaMeetingReminder internal = reminder(disabledEvent, "INVITE", "INTERNAL", 0); send(internal.getReminderId());
        equal(1L, count("SELECT sent_flag FROM oa_meeting_reminder WHERE reminder_id=?", internal.getReminderId()), "外部关闭站内邀请仍可使用");
        jdbc.update("UPDATE sys_message_channel SET status='ENABLED' WHERE channel_id=?", 9392001L);
    }

    private void inFlight(OaMeetingBookingService bookings) throws Exception {
        MeetingCommands.Booking command = command("H4在途旧邮件"); command.setAttendeeIds(List.of()); command.setReminders(List.of(new MeetingCommands.Reminder(120, "EMAIL")));
        SysScheduleEvent event = bookings.create(command); reminders.dispatchDue(); OaMeetingReminder group = reminder(event, "REMINDER", "EMAIL", 120);
        duringSend.set(() -> bookings.cancel(event.getEventId(), new MeetingCommands.Change(event.getVersion(), "发送中取消", null)));
        send(group.getReminderId());
        equal("CANCELLED", text("SELECT status FROM oa_meeting_reminder WHERE reminder_id=?", group.getReminderId()), "已在途旧通知取消状态保留");
        equal(1L, count("SELECT sent_flag FROM oa_meeting_reminder WHERE reminder_id=?", group.getReminderId()), "已在途真实送达事实不可抹除");
        check(count("SELECT COUNT(*) FROM oa_meeting_reminder WHERE event_id=? AND event_key LIKE '%:CORRECTION:%' AND status='DISPATCHED'", event.getEventId()) == 1, "迟到成功可靠登记且仅一份取消更正");
        outcomes(group.getReminderId());
        equal(1L, count("SELECT COUNT(*) FROM oa_meeting_reminder WHERE event_id=? AND event_key LIKE '%:CORRECTION:%'", event.getEventId()), "迟到成功重放不重复更正");
    }

    private void sourceTampering(OaMeetingBookingService bookings) throws Exception {
        MeetingCommands.Booking command = command("H4通知快照防篡改"); command.setReminders(List.of(new MeetingCommands.Reminder(120, "INTERNAL")));
        SysScheduleEvent event = bookings.create(command); reminders.dispatchDue();
        OaMeetingReminder group = reminder(event, "REMINDER", "INTERNAL", 120); BusinessEventEnvelope envelope = queued(group.getReminderId()).get(0);
        MessageSendRequest request = MessagePayloadCodec.decode(envelope, json, cipher); dispatch.dispatch(envelope);
        Long recordId = jdbc.queryForObject("SELECT record_id FROM sys_message_record WHERE biz_type='OA_MEETING_NOTICE' AND biz_id=? AND receiver_id=?",
                Long.class, group.getReminderId().toString(), request.safeReceivers().get(0).getReceiverId());
        check(reminders.verify(new MessageSourceCheck(envelope.getEventId(), recordId, request)).allowed(), "原始真实发送快照可以通过业务源核验");
        for (MessageSendRequest forged : List.of(request.toBuilder().title("被篡改的通知").build(), request.toBuilder().content("伪造正文").build(),
                request.toBuilder().linkUrl("https://unexpected.example.test/").build(), request.toBuilder().receivers(List.of(MessageReceiver.ofUser(third))).build(),
                request.toBuilder().channelTypes(List.of(MessageChannelType.EMAIL)).build(), request.toBuilder().forceSend(true).build())) {
            check(!reminders.verify(new MessageSourceCheck(envelope.getEventId(), recordId, forged)).allowed(), "篡改标题、正文、链接、收件人、渠道或强制发送均拒绝");
        }
        check(!reminders.verify(new MessageSourceCheck(UUID.randomUUID().toString(), recordId, request)).allowed(), "真实内容搭配伪造发送事件也拒绝");
        identity(tenant + 1, host);
        try { check(!reminders.verify(new MessageSourceCheck(envelope.getEventId(), recordId, request)).allowed(), "跨租户不能核验或投递会议快照"); }
        finally { identity(tenant, host); }
        identity(tenant, third);
        try { rejects(() -> reminders.details(event.getEventId()), "无会议关系用户不能读取逐人投递明细"); }
        finally { identity(tenant, host); }
        BusinessEventEnvelope actual = resultEvents(group.getReminderId()).get(0);
        BusinessEventEnvelope foreignSource = json.readValue(json.writeValueAsString(actual), BusinessEventEnvelope.class); foreignSource.setSourceModule("cloudflow-service-crm");
        rejects(() -> reminders.deliveryEvent(foreignSource), "投递结果只能来自认证消息服务");
        BusinessEventEnvelope crossTenant = json.readValue(json.writeValueAsString(actual), BusinessEventEnvelope.class); crossTenant.setTenantId(tenant + 1);
        rejects(() -> reminders.deliveryEvent(crossTenant), "投递结果信封的租户必须匹配当前租户");
        BusinessEventEnvelope wrongRelation = json.readValue(json.writeValueAsString(actual), BusinessEventEnvelope.class);
        MessageDeliveryResult original = json.readValue(actual.getPayload(), MessageDeliveryResult.class);
        wrongRelation.setPayload(json.writeValueAsString(new MessageDeliveryResult(original.deliveryId(), original.recordId(), original.tenantId(), original.outboxEventId(),
                original.channelType(), original.status(), original.businessType(), Long.toString(Long.MAX_VALUE), original.errorCode(), original.version())));
        rejects(() -> reminders.deliveryEvent(wrongRelation), "伪造提醒关联与真实消息快照不一致时拒绝");
        equal(0L, count("SELECT COUNT(*) FROM oa_trace_event WHERE tenant_id=? AND business_id=? AND event_type='MEETING_DELIVERY_RESULT'", tenant, group.getReminderId()), "所有非法结果都未写入会议发送事实");
        send(group.getReminderId());
        MeetingCommands.Booking failedCommand = command("H4伪报成功无效"); failedCommand.setAttendeeIds(List.of()); failedCommand.setReminders(List.of(new MeetingCommands.Reminder(120, "EMAIL")));
        SysScheduleEvent failed = bookings.create(failedCommand); reminders.dispatchDue(); OaMeetingReminder failedGroup = reminder(failed, "REMINDER", "EMAIL", 120);
        emailOutcome.set("FAILED");
        try { for (BusinessEventEnvelope queued : queued(failedGroup.getReminderId())) dispatch.dispatch(queued); }
        finally { emailOutcome.set("SENT"); }
        BusinessEventEnvelope claimed = resultEvents(failedGroup.getReminderId()).get(0); MessageDeliveryResult result = json.readValue(claimed.getPayload(), MessageDeliveryResult.class);
        claimed.setPayload(json.writeValueAsString(new MessageDeliveryResult(result.deliveryId(), result.recordId(), result.tenantId(), result.outboxEventId(),
                result.channelType(), "SENT", result.businessType(), result.businessId(), null, result.version())));
        reminders.deliveryEvent(claimed);
        equal("FAILED", text("SELECT status FROM oa_meeting_reminder WHERE reminder_id=?", failedGroup.getReminderId()), "回调声称成功仍按消息中心实际失败结果保存");
        equal(0L, count("SELECT sent_flag FROM oa_meeting_reminder WHERE reminder_id=?", failedGroup.getReminderId()), "伪报成功不会把未发送改为已发送");
    }

    private void approvalHeld(OaMeetingBookingService bookings, MeetingRoomServiceImpl rooms) throws Exception {
        MeetingRoom room = new com.cloudflow.oa.domain.MeetingRoom(); room.setName("H4待审批不发参会提醒"); room.setCapacity(6); room.setStatus("1"); room.setNeedApprovalFlag(1); room.setApproverId(guest);
        rooms.createRoom(room);
        Long roomId = jdbc.queryForObject("SELECT room_id FROM oa_meeting_room WHERE tenant_id=? AND name=?", Long.class, tenant, room.getName());
        MeetingCommands.Booking command = command("H4待审批提醒抑制"); command.setRoomId(roomId); command.setReminders(List.of(new MeetingCommands.Reminder(120, "INTERNAL")));
        SysScheduleEvent event = bookings.create(command); equal("PENDING", event.getApprovalStatus(), "待审批提醒测试使用真实待批预约");
        reminders.dispatchDue(); reminders.dispatchDue(); OaMeetingReminder group = reminder(event, "REMINDER", "INTERNAL", 120);
        equal("PENDING", group.getStatus(), "审批未完成保留待发提醒，不能通知即将开会");
        equal(0, queued(group.getReminderId()).size(), "重复调度也不为待批会议生成会前提醒事件");
        OaMeetingReminder invite = reminder(event, "INVITE", "INTERNAL", 0); MessageSendRequest request = MessagePayloadCodec.decode(queued(invite.getReminderId()).get(0), json, cipher);
        check(request.getContent().contains("待审批") && request.getContent().contains("尚未获准开始"), "等待审批的邀请明确注明尚未获准开始");
        bookings.cancel(event.getEventId(), new MeetingCommands.Change(event.getVersion(), "取消待批预约", null)); reminders.dispatchDue();
        equal("CANCELLED", text("SELECT status FROM oa_meeting_reminder WHERE reminder_id=?", group.getReminderId()), "待批预约取消后旧提醒不会复活");
    }

    private void concurrentResults(OaMeetingBookingService bookings) throws Exception {
        MeetingCommands.Booking command = command("H4投递结果并发及旧快照"); command.setReminders(List.of(new MeetingCommands.Reminder(120, "INTERNAL")));
        SysScheduleEvent event = bookings.create(command); reminders.dispatchDue(); OaMeetingReminder group = reminder(event, "REMINDER", "INTERNAL", 120);
        for (BusinessEventEnvelope queued : queued(group.getReminderId())) dispatch.dispatch(queued);
        List<BusinessEventEnvelope> results = resultEvents(group.getReminderId()); equal(2, results.size(), "两个真实接收人各自产生实际投递结果");
        ExecutorService pool = java.util.concurrent.Executors.newFixedThreadPool(2);
        try {
            new org.springframework.transaction.support.TransactionTemplate(transactions).executeWithoutResult(status -> {
                equal(0L, count("SELECT COUNT(*) FROM oa_trace_event WHERE tenant_id=? AND business_id=? AND event_type='MEETING_DELIVERY_RESULT'", tenant, group.getReminderId()), "外层事务先建立尚无投递结果的旧快照");
                Future<Boolean> first = pool.submit(() -> {
                    identity(tenant, host);
                    try { reminders.deliveryEvent(results.get(0)); return true; }
                    finally { com.cloudflow.common.tenant.TenantContext.clear(); com.cloudflow.common.core.context.UserContext.clear(); }
                });
                try { check(first.get(20, java.util.concurrent.TimeUnit.SECONDS), "其他连接先提交第一位接收人结果"); reminders.deliveryEvent(results.get(1)); }
                catch (Exception failure) { throw new IllegalStateException(failure); }
            }); races++;
            equal(1L, count("SELECT sent_flag FROM oa_meeting_reminder WHERE reminder_id=?", group.getReminderId()), "外层旧快照不遗漏已提交结果，整组正确标已送达");
            CyclicBarrier barrier = new java.util.concurrent.CyclicBarrier(2);
            java.util.concurrent.Callable<Boolean> replay = () -> {
                identity(tenant, host);
                try { barrier.await(10, java.util.concurrent.TimeUnit.SECONDS); reminders.deliveryEvent(results.get(1)); return true; }
                finally { com.cloudflow.common.tenant.TenantContext.clear(); com.cloudflow.common.core.context.UserContext.clear(); }
            };
            Future<Boolean> first = pool.submit(replay); Future<Boolean> second = pool.submit(replay);
            check(first.get(20, java.util.concurrent.TimeUnit.SECONDS) && second.get(20, java.util.concurrent.TimeUnit.SECONDS), "同一真实结果两连接并发重放均按幂等成功"); races++;
            equal(2L, count("SELECT COUNT(*) FROM oa_trace_event WHERE tenant_id=? AND business_id=? AND event_type='MEETING_DELIVERY_RESULT'", tenant, group.getReminderId()), "并发和重放后逐人结果只保留两份实际事实");
            equal(1L, count("SELECT sent_flag FROM oa_meeting_reminder WHERE reminder_id=?", group.getReminderId()), "并发重放不回退整组实际发送状态");
        } finally { pool.shutdownNow(); }
    }

    private MeetingCommands.Booking command(String title) {
        MeetingCommands.Booking command = new MeetingCommands.Booking(); command.setTitle(title); command.setStartTime(LocalDateTime.now().plusHours(1).withSecond(0).withNano(0));
        command.setEndTime(command.getStartTime().plusHours(1)); command.setAttendeeIds(List.of(guest)); command.setConfirmParticipantConflicts(true);
        command.setJoinUrl("https://meet.example.test/meeting"); return command;
    }
    private OaMeetingReminder reminder(SysScheduleEvent event, String kind, String channel, int minutes) {
        return sessions.getMapper(OaMeetingReminderMapper.class).forEvent(tenant, event.getEventId()).stream()
                .filter(value -> value.getScheduleVersion().equals(event.getScheduleVersion()) && value.getEventKey().contains(":" + kind + ":")
                        && channel.equals(value.getChannelType()) && minutes == value.getRemindMinutesBefore()).findFirst().orElseThrow();
    }
    private List<BusinessEventEnvelope> queued(Long reminderId) throws Exception {
        List<BusinessEventEnvelope> result = new ArrayList<>();
        for (OutboxEvent event : sessions.getMapper(OutboxEventMapper.class).selectList(new LambdaQueryWrapper<OutboxEvent>().eq(OutboxEvent::getTenantId, tenant)
                .eq(OutboxEvent::getEventType, "MESSAGE_SEND").eq(OutboxEvent::getAggregateId, reminderId).orderByAsc(OutboxEvent::getId))) result.add(json.readValue(event.getPayloadJson(), BusinessEventEnvelope.class));
        return result;
    }
    private void send(Long reminderId) throws Exception {
        List<BusinessEventEnvelope> events = queued(reminderId);
        if (events.isEmpty()) System.out.println("MEETING_QUEUE_DIAGNOSTIC " + jdbc.queryForList(
                "SELECT reminder_id,channel_type,status,sent_flag,due_time,NOW(6) AS observed_time FROM oa_meeting_reminder WHERE reminder_id=?", reminderId));
        for (BusinessEventEnvelope event : events) dispatch.dispatch(event);
        outcomes(reminderId);
    }
    private void outcomes(Long reminderId) throws Exception {
        for (BusinessEventEnvelope envelope : resultEvents(reminderId)) reminders.deliveryEvent(envelope);
    }
    private List<BusinessEventEnvelope> resultEvents(Long reminderId) throws Exception {
        List<BusinessEventEnvelope> results = new ArrayList<>();
        for (OutboxEvent event : sessions.getMapper(OutboxEventMapper.class).selectList(new LambdaQueryWrapper<OutboxEvent>().eq(OutboxEvent::getTenantId, tenant)
                .eq(OutboxEvent::getEventType, "MESSAGE_DELIVERY_RESULT").orderByAsc(OutboxEvent::getId))) {
            BusinessEventEnvelope envelope = json.readValue(event.getPayloadJson(), BusinessEventEnvelope.class);
            MessageDeliveryResult result = json.readValue(envelope.getPayload(), MessageDeliveryResult.class);
            if (OaMeetingReminderService.BUSINESS_TYPE.equals(result.businessType()) && reminderId.toString().equals(result.businessId())) results.add(envelope);
        }
        return results;
    }
    @FunctionalInterface private interface Action { void run() throws Exception; }
    private void rejects(Action work, String label) throws Exception { try { work.run(); } catch (com.cloudflow.common.core.exception.ServiceException | IllegalArgumentException failure) { check(true, label + " actual=" + failure.getMessage()); return; } throw new AssertionError(label); }
    private void identity(long tenantId, long userId) { com.cloudflow.common.tenant.TenantContext.setTenantId(tenantId); com.cloudflow.common.core.context.UserContext.setTenantId(tenantId); com.cloudflow.common.core.context.UserContext.setUserId(userId); com.cloudflow.common.core.context.UserContext.setUserName("meeting-check-" + userId); com.cloudflow.common.core.context.UserContext.setDsType(4); }
    private long count(String sql, Object... values) { return Objects.requireNonNull(jdbc.queryForObject(sql, Long.class, values)); }
    private String text(String sql, Object... values) { return jdbc.queryForObject(sql, String.class, values); }
    private void equal(Object expected, Object actual, String label) { check(Objects.equals(expected, actual), label + " expected=" + expected + " actual=" + actual); }
    private void check(boolean success, String label) { if (!success) throw new AssertionError(label); assertions++; System.out.println("PASS " + label); }
}
