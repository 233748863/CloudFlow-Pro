package com.cloudflow.oa.service.impl;

import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.message.api.MessageDeliveryResult;
import com.cloudflow.common.message.api.MessageDeliverySnapshot;
import com.cloudflow.common.message.api.MessageChannelReadiness;
import com.cloudflow.common.message.api.MessageReceiver;
import com.cloudflow.common.message.api.MessageSendRequest;
import com.cloudflow.common.message.api.MessageSender;
import com.cloudflow.common.message.api.MessageSourceCheck;
import com.cloudflow.common.message.api.MessageSourceResult;
import com.cloudflow.common.message.constant.MessageCategory;
import com.cloudflow.common.message.constant.MessageChannelType;
import com.cloudflow.common.message.security.MessagePayloadCodec;
import com.cloudflow.oa.domain.OaMeetingReminder;
import com.cloudflow.oa.domain.OaTraceEvent;
import com.cloudflow.oa.domain.SysScheduleEvent;
import com.cloudflow.oa.domain.dto.MeetingCommands;
import com.cloudflow.oa.mapper.OaIdentityReferenceMapper;
import com.cloudflow.oa.mapper.OaMeetingMapper;
import com.cloudflow.oa.mapper.OaMeetingReminderMapper;
import com.cloudflow.oa.service.IOaTraceEventService;
import com.cloudflow.oa.service.remote.RemoteMessageDeliveryService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.function.BiConsumer;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.util.HtmlUtils;

@Service
@RequiredArgsConstructor
public class OaMeetingReminderService {
    public static final String BUSINESS_TYPE = "OA_MEETING_NOTICE";
    private static final String TRACE_TYPE = "OA_MEETING_NOTIFICATION";
    private static final Set<String> FINAL_RESULTS = Set.of("SENT", "FAILED", "UNKNOWN", "SKIPPED", "CANCELLED");
    private static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");
    private final OaMeetingReminderMapper reminders;
    private final OaMeetingMapper meetings;
    private final OaMeetingAccess access;
    private final OaIdentityReferenceMapper identities;
    private final MessageSender sender;
    private final RemoteMessageDeliveryService messages;
    private final IOaTraceEventService trace;
    private final ObjectMapper json;
    private final PlatformTransactionManager transactions;

    public record Queued(String eventId, Long userId, MessageSendRequest request) { }
    public record Outcome(Long userId, MessageDeliveryResult result, LocalDateTime acceptedTime) { }
    public record Recipient(Long userId, Long recordId, String status, String reason, LocalDateTime acceptedTime) { }
    public record Delivery(OaMeetingReminder reminder, List<Recipient> recipients) { }

    public void synchronize(SysScheduleEvent event) {
        OaMeetingAccess.transaction();
        retire(event);
        if (!active(event)) return;
        for (MeetingCommands.Reminder configuration : configurations(event)) {
            add(event, "REMINDER", configuration.channelType(), configuration.remindMinutesBefore(),
                    event.getStartTime().minusMinutes(configuration.remindMinutesBefore()), null);
        }
        notice(event, event.getScheduleVersion() == 1 ? "INVITE" : "UPDATED");
    }

    public void approved(SysScheduleEvent event) {
        OaMeetingAccess.transaction();
        notice(event, "APPROVED");
    }

    @Audit(name = "停止会议旧版本提醒", highRisk = true)
    public void close(SysScheduleEvent event) {
        OaMeetingAccess.transaction();
        retire(event);
        if (Set.of("CANCELLED", "NOT_HELD").contains(event.getStatus())) notice(event, event.getStatus());
    }

    private void retire(SysScheduleEvent event) {
        for (OaMeetingReminder previous : reminders.forEvent(event.getTenantId(), event.getEventId())) {
            if (Set.of("PENDING", "DISPATCHED").contains(previous.getStatus())
                    && (!Objects.equals(previous.getScheduleVersion(), event.getScheduleVersion()) || !active(event))) {
                previous.setStatus("CANCELLED"); save(previous);
            }
            if (!Objects.equals(previous.getScheduleVersion(), event.getScheduleVersion())) {
                for (Recipient recipient : delivery(previous).recipients()) {
                    if (Set.of("SENT", "UNKNOWN").contains(recipient.status())) {
                        MessageDeliveryResult prior = new MessageDeliveryResult(null, recipient.recordId(), event.getTenantId(), null,
                                previous.getChannelType(), recipient.status(), BUSINESS_TYPE, previous.getReminderId().toString(), null, null);
                        correction(event, recipient.userId(), prior);
                    }
                }
            }
        }
    }

    private void notice(SysScheduleEvent event, String kind) {
        Set<String> channels = new LinkedHashSet<>(); channels.add("INTERNAL");
        configurations(event).forEach(configuration -> channels.add(configuration.channelType()));
        for (String channel : channels) add(event, kind, channel, 0, LocalDateTime.now(), null);
    }

    private OaMeetingReminder add(SysScheduleEvent event, String kind, String channel, int minutes, LocalDateTime due, String suffix) {
        String key = event.getEventId() + ":" + event.getScheduleVersion() + ":" + kind + ":" + minutes + ":" + channel
                + (suffix == null ? "" : ":" + suffix);
        OaMeetingReminder existing = reminders.forEvent(event.getTenantId(), event.getEventId()).stream()
                .filter(value -> key.equals(value.getEventKey())).findFirst().orElse(null);
        if (existing != null) return existing;
        OaMeetingReminder reminder = new OaMeetingReminder();
        reminder.setTenantId(event.getTenantId()); reminder.setEventId(event.getEventId()); reminder.setScheduleVersion(event.getScheduleVersion());
        reminder.setRemindMinutesBefore(minutes); reminder.setChannelType(channel); reminder.setDueTime(due.withNano(0)); reminder.setEventKey(key);
        reminder.setStatus("PENDING"); reminder.setSentFlag(0); reminder.setCreateBy(OaRecordSupport.userName()); reminder.setUpdateBy(OaRecordSupport.userName());
        reminder.setCreateTime(LocalDateTime.now()); reminder.setUpdateTime(reminder.getCreateTime());
        OaRecordSupport.saved(reminders.insert(reminder));
        return reminder;
    }

    @Audit(name = "按数据库事实派发到期会议提醒")
    public void dispatchDue() {
        LocalDateTime now = LocalDateTime.now();
        Long afterId = 0L;
        List<RuntimeException> failures = new ArrayList<>();
        while (true) {
            List<OaMeetingReminder> due = reminders.due(OaRecordSupport.tenantId(), now, afterId);
            if (due.isEmpty()) break;
            for (OaMeetingReminder observed : due) {
                try { locked(observed, (event, reminder) -> stage(event, reminder, now)); }
                catch (RuntimeException failure) { failures.add(new IllegalStateException("会议提醒" + observed.getReminderId() + "派发失败", failure)); }
                afterId = observed.getReminderId();
            }
        }
        if (!failures.isEmpty()) {
            IllegalStateException failure = new IllegalStateException("会议提醒派发失败数：" + failures.size());
            failures.forEach(failure::addSuppressed); throw failure;
        }
    }

    private void stage(SysScheduleEvent event, OaMeetingReminder reminder, LocalDateTime now) {
        if (!"PENDING".equals(reminder.getStatus()) || reminder.getDueTime().isAfter(now)) return;
        String kind = kind(reminder);
        if (!valid(event, reminder, kind)) { reminder.setStatus("CANCELLED"); save(reminder); return; }
        if ("REMINDER".equals(kind) && "PENDING".equals(event.getApprovalStatus())) return;
        List<Long> people = recipients(event);
        if (people.isEmpty()) { reminder.setStatus("CANCELLED"); save(reminder); return; }
        for (Long userId : people) queue(reminder, userId, request(event, reminder, userId, kind, false));
        reminder.setStatus("DISPATCHED"); save(reminder);
    }

    private void queue(OaMeetingReminder reminder, Long userId, MessageSendRequest request) {
        String eventId = eventId(reminder.getTenantId(), request.getDeduplicationKey());
        trace.record(reminder.getTenantId(), TRACE_TYPE, reminder.getReminderId(), "MESSAGE_RECIPIENT", userId,
                "MEETING_DELIVERY_QUEUED", "已排队，等待逐人真实投递结果", eventId, null, "system", write(new Queued(eventId, userId, request)));
        sender.send(request);
    }

    private MessageSendRequest request(SysScheduleEvent event, OaMeetingReminder reminder, Long userId, String kind, boolean withdrawn) {
        String label = switch (kind) {
            case "INVITE" -> "会议邀请";
            case "UPDATED" -> "会议已更新";
            case "APPROVED" -> "会议预约审批通过";
            case "CANCELLED" -> "会议已取消";
            case "NOT_HELD" -> "会议未举行";
            case "CORRECTION" -> "旧会议通知更正";
            default -> "会议即将开始";
        };
        String content = withdrawn ? "原会议通知已失效，请勿按旧通知参会。"
                : "<p>" + HtmlUtils.htmlEscape(label + "：" + event.getTitle()) + "</p><p>"
                + event.getStartTime().format(TIME) + " — " + event.getEndTime().format(TIME) + "（Asia/Shanghai）</p>"
                + ("PENDING".equals(event.getApprovalStatus()) ? "<p>会议室预约待审批，尚未获准开始。</p>" : "")
                + (event.getJoinUrl() == null ? "" : "<p>线上会议：<a href=\"" + HtmlUtils.htmlEscape(event.getJoinUrl()) + "\">" + HtmlUtils.htmlEscape(event.getJoinUrl()) + "</a></p>");
        String key = "oa-meeting:" + reminder.getEventKey() + ":" + userId;
        return MessageSendRequest.builder().templateCode("OA_MEETING_NOTICE").bizType(BUSINESS_TYPE).bizId(reminder.getReminderId().toString())
                .channelTypes(List.of(MessageChannelType.valueOf(reminder.getChannelType()))).receivers(List.of(MessageReceiver.ofUser(userId)))
                .params(Map.of("eventId", event.getEventId(), "scheduleVersion", event.getScheduleVersion(), "kind", kind, "withdrawn", withdrawn))
                .category(MessageCategory.BIZ_REMINDER).forceSend(false).renderedContent(true).title(label + (withdrawn ? "" : "：" + event.getTitle()))
                .content(content).linkUrl(withdrawn ? null : "/office/my-meetings?eventId=" + event.getEventId())
                .deduplicationKey(key).traceId(MessagePayloadCodec.hash(key)).build();
    }

    public MessageSourceResult verify(MessageSourceCheck check) {
        try {
            if (check == null || check.eventId() == null || check.recordId() == null) return new MessageSourceResult(false, "SOURCE_INVALID");
            OaMeetingReminder reminder = reference(check == null || check.request() == null ? null : check.request().getBizId());
            Queued queued = frozen(reminder, check.eventId(), check.request());
            SysScheduleEvent event = access.get(reminder.getEventId());
            String kind = kind(reminder);
            if (!valid(event, reminder, kind) || !Set.of("DISPATCHED", "FAILED").contains(reminder.getStatus())
                    || "REMINDER".equals(kind) && "PENDING".equals(event.getApprovalStatus())) return new MessageSourceResult(false, "SOURCE_EXPIRED");
            if (!"CORRECTION".equals(kind) && !recipients(event).contains(queued.userId())) return new MessageSourceResult(false, "RECEIVER_WITHDRAWN");
            if (identities.user(queued.userId(), reminder.getTenantId()) == null) return new MessageSourceResult(false, "RECEIVER_UNAVAILABLE");
            return new MessageSourceResult(true, null);
        } catch (IllegalArgumentException | ServiceException failure) { return new MessageSourceResult(false, "SOURCE_INVALID"); }
    }

    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    public void deliveryEvent(BusinessEventEnvelope envelope) throws Exception {
        if (!"cloudflow-auth".equals(envelope.getSourceModule()) || !Objects.equals(envelope.getTenantId(), OaRecordSupport.tenantId())) throw new ServiceException("投递结果来源无效", 403);
        MessageDeliveryResult announced = json.readValue(envelope.getPayload(), MessageDeliveryResult.class);
        if (!BUSINESS_TYPE.equals(announced.businessType())) return;
        if (!Objects.equals(announced.tenantId(), envelope.getTenantId()) || announced.recordId() == null) throw new ServiceException("投递结果租户不一致", 403);
        R<MessageDeliverySnapshot> response = messages.snapshot(announced.recordId());
        if (response == null || !response.isSuccess() || response.getData() == null) throw new IllegalStateException("无法核实当前会议通知投递结果");
        MessageDeliverySnapshot snapshot = response.getData();
        MessageDeliveryResult actual = snapshot.result();
        if (actual == null || snapshot.request() == null || !Objects.equals(actual.tenantId(), envelope.getTenantId())
                || !Objects.equals(actual.recordId(), announced.recordId()) || !Objects.equals(actual.deliveryId(), announced.deliveryId())
                || !Objects.equals(actual.outboxEventId(), announced.outboxEventId()) || !Objects.equals(actual.businessId(), announced.businessId())
                || !Objects.equals(actual.businessType(), announced.businessType()) || !Objects.equals(actual.channelType(), announced.channelType())) {
            throw new ServiceException("会议投递结果关联不一致", 409);
        }
        if (!FINAL_RESULTS.contains(actual.status())) return;
        OaMeetingReminder reference = reference(actual.businessId());
        locked(reference, (event, reminder) -> applyResult(event, reminder, snapshot));
    }

    private void applyResult(SysScheduleEvent event, OaMeetingReminder reminder, MessageDeliverySnapshot snapshot) {
        MessageDeliveryResult result = snapshot.result();
        Queued queued = frozen(reminder, result.outboxEventId(), snapshot.request());
        List<OaTraceEvent> previous = history(reminder, "MEETING_DELIVERY_RESULT");
        String fingerprint = result.deliveryId() + ":" + result.version();
        if (previous.stream().anyMatch(value -> fingerprint.equals(value.getEventContent()))) return;
        if ("SENT".equals(result.status()) && snapshot.acceptedTime() == null) throw new IllegalStateException("实际发送接纳时间缺失");
        Outcome outcome = new Outcome(queued.userId(), result, snapshot.acceptedTime());
        trace.record(reminder.getTenantId(), TRACE_TYPE, reminder.getReminderId(), "MESSAGE_RECIPIENT", queued.userId(),
                "MEETING_DELIVERY_RESULT", "会议通知真实结果：" + result.status(), fingerprint, null, "system", write(outcome));
        refresh(reminder);
        if (Set.of("SENT", "UNKNOWN").contains(result.status()) && !Objects.equals(event.getScheduleVersion(), reminder.getScheduleVersion())) {
            correction(event, queued.userId(), result);
        }
    }

    private void refresh(OaMeetingReminder reminder) {
        List<Recipient> recipients = delivery(reminder).recipients();
        boolean complete = !recipients.isEmpty() && recipients.stream().allMatch(recipient -> "SENT".equals(recipient.status()));
        if (complete) {
            reminder.setSentFlag(1);
            reminder.setSendTime(recipients.stream().map(Recipient::acceptedTime).filter(Objects::nonNull).max(LocalDateTime::compareTo).orElseThrow());
            reminder.setMessageRecordId(recipients.size() == 1 ? recipients.get(0).recordId() : null);
            if (!"CANCELLED".equals(reminder.getStatus())) reminder.setStatus("SENT");
        } else if (!"CANCELLED".equals(reminder.getStatus())) {
            boolean finished = recipients.stream().allMatch(recipient -> FINAL_RESULTS.contains(recipient.status()) && !"UNKNOWN".equals(recipient.status()));
            reminder.setStatus(finished ? "FAILED" : "DISPATCHED");
        }
        save(reminder);
    }

    private void correction(SysScheduleEvent event, Long userId, MessageDeliveryResult previous) {
        if (identities.user(userId, event.getTenantId()) == null) return;
        OaMeetingReminder correction = add(event, "CORRECTION", previous.channelType(), 0, LocalDateTime.now(), previous.recordId().toString());
        if (!"PENDING".equals(correction.getStatus())) return;
        boolean withdrawn = !recipients(event).contains(userId) || !active(event);
        queue(correction, userId, request(event, correction, userId, "CORRECTION", withdrawn));
        correction.setStatus("DISPATCHED"); save(correction);
    }

    public List<Delivery> details(Long eventId) {
        SysScheduleEvent event = access.get(eventId);
        if (!access.visible(event)) throw OaMeetingAccess.unavailable();
        return meetings.reminders(event.getTenantId(), eventId).stream().map(this::delivery).toList();
    }

    public MessageChannelReadiness emailReadiness() {
        try {
            R<MessageChannelReadiness> response = messages.readiness("OA_MEETING_NOTICE");
            if (response != null && response.isSuccess() && response.getData() != null) return response.getData();
        } catch (RuntimeException failure) { }
        return new MessageChannelReadiness(false, "邮件服务未核实，邮件未发送；站内通知和预约仍可使用");
    }

    private Delivery delivery(OaMeetingReminder reminder) {
        Map<Long, Outcome> latest = new LinkedHashMap<>();
        for (OaTraceEvent result : history(reminder, "MEETING_DELIVERY_RESULT")) {
            Outcome outcome = read(result.getSnapshotJson(), Outcome.class);
            Outcome prior = latest.get(outcome.userId());
            if (prior == null || outcome.result().deliveryId() > prior.result().deliveryId()
                    || Objects.equals(outcome.result().deliveryId(), prior.result().deliveryId()) && outcome.result().version() >= prior.result().version()) latest.put(outcome.userId(), outcome);
        }
        List<Recipient> recipients = history(reminder, "MEETING_DELIVERY_QUEUED").stream().map(entry -> {
            Queued queued = read(entry.getSnapshotJson(), Queued.class);
            Outcome outcome = latest.get(queued.userId());
            return outcome == null ? new Recipient(queued.userId(), null, "QUEUED", "尚未取得实际投递结果", null)
                    : new Recipient(queued.userId(), outcome.result().recordId(), outcome.result().status(), reason(outcome.result()), outcome.acceptedTime());
        }).toList();
        return new Delivery(reminder, recipients);
    }

    private Queued frozen(OaMeetingReminder reminder, String eventId, MessageSendRequest actual) {
        if (actual == null || !BUSINESS_TYPE.equals(actual.getBizType()) || actual.safeReceivers().size() != 1
                || !"USER".equals(actual.safeReceivers().get(0).getReceiverType()) || actual.safeReceivers().get(0).getReceiverAddress() != null) {
            throw new IllegalArgumentException("会议消息收件人来源无效");
        }
        Queued queued = history(reminder, "MEETING_DELIVERY_QUEUED").stream()
                .map(entry -> read(entry.getSnapshotJson(), Queued.class)).filter(value -> Objects.equals(value.userId(), actual.safeReceivers().get(0).getReceiverId()))
                .findFirst().orElseThrow(() -> new IllegalArgumentException("会议通知未登记"));
        MessageSendRequest normalized = actual.toBuilder().receivers(List.of(MessageReceiver.ofUser(queued.userId()))).build();
        if (actual.getResendFromId() == null) {
            if (!Objects.equals(queued.eventId(), eventId)) throw new IllegalArgumentException("会议通知事件不一致");
        } else {
            Outcome original = history(reminder, "MEETING_DELIVERY_RESULT").stream()
                    .map(entry -> read(entry.getSnapshotJson(), Outcome.class)).filter(outcome -> Objects.equals(outcome.userId(), queued.userId())
                            && Objects.equals(outcome.result().recordId(), actual.getResendFromId()))
                    .max(java.util.Comparator.comparing(outcome -> outcome.result().version())).orElseThrow(() -> new IllegalStateException("重发原结果尚未核实"));
            String identity = "message-resend:" + reminder.getTenantId() + ":" + original.result().recordId() + ":" + original.result().version();
            if (!"FAILED".equals(original.result().status()) || !UUID.nameUUIDFromBytes(identity.getBytes(StandardCharsets.UTF_8)).toString().equals(eventId)
                    || actual.getDeduplicationKey() != null || !Integer.valueOf(0).equals(actual.getRetryAttempt())) throw new IllegalArgumentException("会议通知重发来源无效");
            normalized.setResendFromId(null); normalized.setDeduplicationKey(queued.request().getDeduplicationKey()); normalized.setRetryAttempt(queued.request().getRetryAttempt());
        }
        if (!MessagePayloadCodec.digest(MessagePayloadCodec.internalTree(queued.request(), json), json)
                .equals(MessagePayloadCodec.digest(MessagePayloadCodec.internalTree(normalized, json), json))) throw new IllegalArgumentException("会议通知内容与业务快照不一致");
        return queued;
    }

    private List<OaTraceEvent> history(OaMeetingReminder reminder, String eventType) {
        return reminders.history(reminder.getTenantId(), reminder.getReminderId(), eventType).stream()
                .sorted(java.util.Comparator.comparing(OaTraceEvent::getId)).toList();
    }

    private OaMeetingReminder reference(String value) {
        if (value == null || !value.matches("[1-9][0-9]{0,18}")) throw new IllegalArgumentException("会议提醒标识无效");
        OaMeetingReminder reminder = reminders.selectById(Long.valueOf(value));
        if (reminder == null || !Objects.equals(reminder.getTenantId(), OaRecordSupport.tenantId())) throw new ServiceException("会议提醒不存在", 404);
        return reminder;
    }

    private boolean valid(SysScheduleEvent event, OaMeetingReminder reminder, String kind) {
        if (!Objects.equals(event.getScheduleVersion(), reminder.getScheduleVersion()) || "SERIES".equals(event.getRecurrenceRole())) return false;
        if ("CORRECTION".equals(kind)) return true;
        if (Set.of("CANCELLED", "NOT_HELD").contains(kind)) return kind.equals(event.getStatus());
        return active(event) && event.getEndTime().isAfter(LocalDateTime.now());
    }

    private boolean active(SysScheduleEvent event) {
        return !"SERIES".equals(event.getRecurrenceRole()) && Set.of("PLANNED", "IN_PROGRESS").contains(event.getStatus())
                && Set.of("NOT_REQUIRED", "PENDING", "APPROVED").contains(event.getApprovalStatus());
    }

    private List<Long> recipients(SysScheduleEvent event) {
        return meetings.attendees(event.getTenantId(), event.getEventId()).stream()
                .filter(invitation -> Integer.valueOf(0).equals(invitation.getDeleted()) && !"DECLINED".equals(invitation.getAcceptanceStatus()))
                .map(com.cloudflow.oa.domain.OaMeetingAttendance::getUserId).distinct().sorted()
                .filter(userId -> identities.user(userId, event.getTenantId()) != null).toList();
    }

    private List<MeetingCommands.Reminder> configurations(SysScheduleEvent event) {
        try { return OaMeetingRules.reminders(json.readValue(event.getReminders() == null ? "[]" : event.getReminders(), new TypeReference<List<MeetingCommands.Reminder>>() { })); }
        catch (Exception failure) { throw new IllegalArgumentException("会议提醒设置无效", failure); }
    }

    private void locked(OaMeetingReminder observed, BiConsumer<SysScheduleEvent, OaMeetingReminder> work) {
        SysScheduleEvent observedEvent = access.get(observed.getEventId());
        new TransactionTemplate(transactions).executeWithoutResult(status -> {
            access.lockRooms(Arrays.asList(observedEvent.getRoomId()));
            SysScheduleEvent event = access.lock(observedEvent);
            OaMeetingReminder reminder = reminders.lock(event.getTenantId(), observed.getReminderId());
            if (reminder == null || !Objects.equals(reminder.getEventId(), event.getEventId())) throw new IllegalStateException("会议提醒关联不一致");
            work.accept(event, reminder);
        });
    }

    private void save(OaMeetingReminder reminder) {
        reminder.setUpdateBy(OaRecordSupport.userName()); reminder.setUpdateTime(LocalDateTime.now());
        OaRecordSupport.saved(reminders.saveState(reminder));
    }

    private String kind(OaMeetingReminder reminder) { return reminder.getEventKey().split(":")[2]; }
    private String eventId(Long tenantId, String key) { return UUID.nameUUIDFromBytes(("cloudflow-service-oa:" + tenantId + ":" + key).getBytes(StandardCharsets.UTF_8)).toString(); }
    private String write(Object value) {
        try { return json.writeValueAsString(MessagePayloadCodec.internalTree(value, json)); }
        catch (Exception failure) { throw new IllegalStateException("会议通知快照保存失败", failure); }
    }
    private <Value> Value read(String value, Class<Value> type) {
        try { return json.readValue(value, type); }
        catch (Exception failure) { throw new IllegalStateException("会议通知快照不可核实", failure); }
    }
    private String reason(MessageDeliveryResult result) {
        if ("SENT".equals(result.status())) return "已取得实际发送接纳结果";
        return switch (Objects.toString(result.errorCode(), "")) {
            case "NO_CHANNEL", "SMTP_CONFIGURATION_INVALID", "CHANNEL_DISABLED" -> "邮件渠道未配置或不可用，未发送";
            case "SOURCE_EXPIRED", "SOURCE_INVALID" -> "会议或通知版本已失效，未发送";
            case "RECEIVER_WITHDRAWN" -> "参与者已拒绝或被移除，未发送";
            case "NOT_IMPLEMENTED" -> "此渠道未启用，未发送";
            default -> "UNKNOWN".equals(result.status()) ? "发送结果未知，等待消息中心核验" : Objects.toString(result.errorCode(), result.status());
        };
    }
}
