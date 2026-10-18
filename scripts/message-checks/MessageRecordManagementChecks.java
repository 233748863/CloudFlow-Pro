package com.cloudflow.auth.message;

import com.cloudflow.auth.domain.SysMessageRecord;
import com.cloudflow.auth.domain.dto.MessageRecordQuery;
import com.cloudflow.auth.domain.dto.ResendResultVO;
import com.cloudflow.auth.domain.vo.MessageStatisticsVO;
import com.cloudflow.auth.domain.vo.SysMessageRecordVO;
import com.cloudflow.auth.mapper.SysMessageRecordMapper;
import com.cloudflow.auth.service.MessageRecordService;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.message.channel.ChannelSendResult;
import com.cloudflow.common.message.security.MessagePayloadCodec;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;
import org.springframework.transaction.support.TransactionTemplate;

final class MessageRecordManagementChecks {
    private static final Long TENANT = 910070L;

    static void run(MessageDeliveryDatabaseChecks suite) throws Exception {
        int before = suite.checks.get();
        RecordService records = new RecordService(suite);
        try {
            UserContext.setTenantId(TENANT);
            new TransactionTemplate(suite.manager).execute(status -> {
                try { queryAndStatistics(suite, records); }
                finally { status.setRollbackOnly(); }
                return null;
            });
        } finally { UserContext.setTenantId(suite.TENANT); }
        resend(suite, records);
        System.out.println("MESSAGE_RECORD_MANAGEMENT_CHECKS: assertions=" + (suite.checks.get() - before)
                + "; failed=0; real_service=true; mysql=true; http=false; controlled_transport=true");
    }

    private static void queryAndStatistics(MessageDeliveryDatabaseChecks suite, RecordService records) {
        insert(suite, 970001L, TENANT, "EMAIL", "FAILED", "PAY", "A", 701L, "2031-01-15T00:00:00", "REJECTED");
        insert(suite, 970002L, TENANT, "INTERNAL", "SUCCESS", "PAY", "A", 702L, "2031-01-15T12:00:00", null);
        insert(suite, 970003L, TENANT, "EMAIL", "UNKNOWN", "OTHER", "B", 701L, "2031-01-15T23:59:59", "UNCONFIRMED");
        insert(suite, 970004L, TENANT, "EMAIL", "RETRYABLE", "OTHER", "B", 703L, "2031-01-15T13:00:00", "TEMPORARY");
        insert(suite, 970005L, TENANT, "SMS", "SKIPPED", "OTHER", "B", 703L, "2031-01-15T14:00:00", "SKIPPED_DETAIL");
        insert(suite, 970006L, TENANT, "EMAIL", "SUCCESS", null, "C", 704L, "2031-01-15T15:00:00", "HISTORIC_DETAIL");
        insert(suite, 970007L, TENANT, "SMS", "FAILED", "THIRD", "B", 703L, "2031-01-15T16:00:00", "REJECTED");
        insert(suite, 970008L, TENANT, "INTERNAL", "SUCCESS", "PAY", "A", 702L, "2031-01-16T00:00:00", null);
        insert(suite, 970009L, TENANT, "EMAIL", "FAILED", "OLDER", "A", 701L, "2031-01-14T23:59:59", "OLDER");
        insert(suite, 970010L, TENANT + 1, "EMAIL", "FAILED", "PAY", "A", 701L, "2031-01-15T10:00:00", "FOREIGN");
        MessageRecordQuery query = day();
        PageResult<SysMessageRecordVO> all = records.list(query, 1, 20);
        suite.check(all.getTotal() == 7 && all.getRows().size() == 7,
                "record query includes both day boundaries and excludes other days and tenant; total=" + all.getTotal()
                        + "; rows=" + all.getRows().stream()
                                .map(row -> row.getRecordId() + "@" + row.getCreateTime()).toList());
        suite.check(all.getRows().get(0).getRecordId().equals(970003L), "record query orders newest first");
        UserContext.setUserId(702L);
        try { suite.check(records.mine(null, null, "2031-01-15", "2031-01-15", 1, 20).getTotal() == 1,
                "personal message date range excludes next-day midnight using the shared boundary"); }
        finally { UserContext.setUserId(1L); }
        suite.check(records.list(query, 2, 2).getRows().get(0).getRecordId().equals(970006L), "record query applies actual second-page offset");
        PageResult<SysMessageRecordVO> safe = records.list(query, -2, 999);
        suite.check(safe.getPageNum() == 1 && safe.getPageSize() == 200, "record pagination clamps page and maximum size");
        suite.check(records.list(query, 1, 0).getPageSize() == 1, "record pagination enforces minimum size");
        query.setChannelType(" email ");
        suite.check(records.list(query, 1, 20).getTotal() == 4, "record channel filter normalizes whitespace and case");
        query.setSendStatus(" failed ");
        suite.check(records.list(query, 1, 20).getTotal() == 1, "record status filter normalizes whitespace and case");
        query.setTemplateCode("PA"); query.setBizType("A"); query.setReceiverId(701L);
        suite.check(records.list(query, 1, 20).getRows().get(0).getRecordId().equals(970001L), "record combines all seven query fields with partial template matching");
        query.setBizType("B");
        suite.check(records.list(query, 1, 20).getTotal() == 0, "record business filter excludes unrelated business");
        query = day(); query.setReceiverId(703L);
        suite.check(records.list(query, 1, 20).getTotal() == 3, "record receiver filter is exact");
        query = day(); query.setTemplateCode("OTHER");
        suite.check(records.list(query, 1, 20).getTotal() == 3, "record template filter selects matching template");
        query = day(); query.setBeginTime("2031-01-15 13:00:00"); query.setEndTime("2031-01-15 15:00:00");
        suite.check(records.list(query, 1, 20).getTotal() == 3, "record timestamp range includes both boundaries");
        MessageRecordQuery invalid = day(); invalid.setBeginTime("invalid-date");
        suite.rejects(() -> records.list(invalid, 1, 20), "record invalid date fails explicitly");
        suite.check(records.list(null, 1, 20).getTotal() == 9, "record null query remains tenant scoped");
        MessageStatisticsVO stats = records.statistics("2031-01-15", "2031-01-15");
        suite.check(stats.getTotal() == 7 && stats.getSuccess() == 2 && stats.getFailed() == 2 && stats.getUnknown() == 1, "statistics count terminal and unresolved states independently");
        suite.check(Math.abs(stats.getSuccessRate() - 2D / 7D) < 0.000001D, "overall rate retains all records in denominator");
        suite.check(stats.getChannelSuccessRates().equals(Map.of("EMAIL", .25D, "INTERNAL", 1D, "SMS", 0D)), "channel success rates use matching denominators");
        suite.check(stats.getTemplateSuccessRates().equals(Map.of("PAY", .5D, "OTHER", 0D, "THIRD", 0D)), "template rates group named templates and exclude direct sends");
        suite.check(stats.getTopFailureReasons().size() == 1 && "REJECTED".equals(stats.getTopFailureReasons().get(0).getReason())
                && stats.getTopFailureReasons().get(0).getCount() == 2, "failure ranking counts FAILED only, excluding UNKNOWN, RETRYABLE, SKIPPED and SUCCESS details");
        MessageStatisticsVO empty = records.statistics("2031-02-01", "2031-02-01");
        suite.check(empty.getTotal() == 0 && empty.getSuccessRate() == 0D && empty.getChannelSuccessRates().isEmpty()
                && empty.getTemplateSuccessRates().isEmpty() && empty.getTopFailureReasons().isEmpty(), "empty statistics return finite zeroes and empty groups");
        suite.rejects(() -> records.statistics("invalid-date", null), "statistics invalid date fails explicitly");
        for (int index = 0; index < 6; index++) {
            for (int count = 0; count <= index; count++) {
                insert(suite, 971000L + index * 10L + count, TENANT, "EMAIL", "FAILED", "TOP", "A", 701L, "2031-01-17T12:00:00", "REASON_" + index);
            }
        }
        List<MessageStatisticsVO.FailureReasonVO> top = records.statistics("2031-01-17", "2031-01-17").getTopFailureReasons();
        suite.check(top.size() == 5 && top.get(0).getCount() == 6 && top.get(4).getCount() == 2, "failure ranking returns five reasons in descending frequency");
    }

    private static void resend(MessageDeliveryDatabaseChecks suite, RecordService records) throws Exception {
        Supplier<ChannelSendResult> previous = suite.outcome;
        try {
            suite.outcome = () -> ChannelSendResult.failed("RECORD_TEST_REJECTED");
            SysMessageRecord first = suite.send("record-first@example.test");
            SysMessageRecord second = suite.send("record-second@example.test");
            suite.outcome = () -> ChannelSendResult.unknown("RECORD_TEST_UNKNOWN");
            SysMessageRecord unknown = suite.send("record-unknown@example.test");
            suite.outcome = ChannelSendResult::success;
            SysMessageRecord success = suite.send("record-success@example.test");
            String original = suite.json.writeValueAsString(suite.mapper(SysMessageRecordMapper.class).selectById(first.getRecordId()));
            int sends = suite.sends.get();
            ResendResultVO single = new TransactionTemplate(suite.manager).execute(status -> records.resend(List.of(first.getRecordId())));
            suite.check(single.getRequested() == 1 && single.getAccepted() == 1 && suite.sends.get() == sends, "single resend queues a request without sending in transaction");
            BusinessEventEnvelope event = event(suite, first.getRecordId());
            suite.check(MessagePayloadCodec.decode(event, suite.json, suite.cipher).getResendFromId().equals(first.getRecordId()), "single resend event links to original record");
            SysMessageRecord fresh = suite.dispatch.dispatch(event).records().get(0);
            suite.check(!fresh.getRecordId().equals(first.getRecordId()) && fresh.getResendFromId().equals(first.getRecordId())
                    && "SUCCESS".equals(fresh.getSendStatus()), "dispatching queued resend creates separate linked successful record");
            suite.check(original.equals(suite.json.writeValueAsString(suite.mapper(SysMessageRecordMapper.class).selectById(first.getRecordId()))), "resend preserves every original record field");
            suite.check(records.list(null, 1, 200).getRows().stream().anyMatch(row -> fresh.getRecordId().equals(row.getRecordId()) && row.getDeliveryId() != null), "record list resolves real delivery identifiers");
            int events = suite.jdbc.queryForObject("SELECT COUNT(*) FROM outbox_event WHERE event_type='MESSAGE_SEND'", Integer.class);
            ResendResultVO batch = new TransactionTemplate(suite.manager).execute(status -> records.resend(List.of(first.getRecordId(), second.getRecordId(), unknown.getRecordId(), success.getRecordId(), -1L)));
            suite.check(batch.getRequested() == 5 && batch.getAccepted() == 2, "batch accepts FAILED and skips unknown, success and missing records");
            suite.check(suite.jdbc.queryForObject("SELECT COUNT(*) FROM outbox_event WHERE event_type='MESSAGE_SEND'", Integer.class) == events + 1, "batch retry reuses first event and queues only second new source");
            SysMessageRecord secondFresh = suite.dispatch.dispatch(event(suite, second.getRecordId())).records().get(0);
            suite.check(secondFresh.getResendFromId().equals(second.getRecordId()) && "SUCCESS".equals(secondFresh.getSendStatus()), "batch queued resend creates its linked record");
            sends = suite.sends.get(); suite.dispatch.dispatch(event);
            suite.check(suite.sends.get() == sends, "replaying resend event does not duplicate provider calls");
            UserContext.setTenantId(TENANT);
            try { suite.check(records.resend(List.of(first.getRecordId())).getAccepted() == 0, "resend excludes another tenant's failed record"); }
            finally { UserContext.setTenantId(suite.TENANT); }
            suite.check(records.resend(null).getRequested() == 0 && records.resend(List.of()).getAccepted() == 0, "empty resend does not enqueue messages");
        } finally { suite.outcome = previous; }
    }

    private static BusinessEventEnvelope event(MessageDeliveryDatabaseChecks suite, Long source) throws Exception {
        List<String> events = suite.jdbc.queryForList("SELECT payload_json FROM outbox_event WHERE event_type='MESSAGE_SEND' ORDER BY id DESC", String.class);
        for (String payload : events) {
            BusinessEventEnvelope event = suite.json.readValue(payload, BusinessEventEnvelope.class);
            if (source.equals(MessagePayloadCodec.decode(event, suite.json, suite.cipher).getResendFromId())) return event;
        }
        throw new AssertionError("Resend event not found for " + source);
    }

    private static MessageRecordQuery day() {
        MessageRecordQuery query = new MessageRecordQuery();
        query.setBeginTime("2031-01-15"); query.setEndTime("2031-01-15"); return query;
    }

    private static void insert(MessageDeliveryDatabaseChecks suite, Long id, Long tenant, String channel, String state,
                               String template, String business, Long receiver, String created, String error) {
        suite.jdbc.update("INSERT INTO sys_message_record(record_id,tenant_id,channel_type,receiver_type,receiver_id,template_code,biz_type,send_status,create_time,error_msg,title,content) VALUES (?,?,?,'USER',?,?,?,?,?,?,?,?)",
                id, tenant, channel, receiver, template, business, state, LocalDateTime.parse(created), error, "record-check", "record-content");
    }

    private static final class RecordService extends MessageRecordService {
        RecordService(MessageDeliveryDatabaseChecks suite) {
            super(suite.publisher, suite.cipher, suite.deliveries);
            this.baseMapper = suite.mapper(SysMessageRecordMapper.class);
        }
    }
}
