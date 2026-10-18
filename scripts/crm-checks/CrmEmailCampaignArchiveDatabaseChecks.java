package com.cloudflow.crm.service.email;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.crm.domain.CrmCampaign;
import com.cloudflow.crm.domain.CrmCampaignLog;
import com.cloudflow.crm.domain.CrmLead;
import com.cloudflow.crm.domain.CrmMassEmail;
import com.cloudflow.crm.domain.CrmMassEmailRecipient;
import com.cloudflow.crm.mapper.CrmCampaignLogMapper;
import com.cloudflow.crm.mapper.CrmCampaignMapper;
import com.cloudflow.crm.service.impl.CrmCampaignLogArchiveService;
import com.cloudflow.crm.support.CrmCampaignLogArchiveCodec;
import java.io.ByteArrayOutputStream;
import java.io.DataOutputStream;
import java.math.BigDecimal;
import java.security.MessageDigest;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.zip.GZIPOutputStream;

final class CrmEmailCampaignArchiveDatabaseChecks {
    private CrmEmailCampaignArchiveDatabaseChecks() {
    }

    static void run(CrmEmailDatabaseChecks suite) throws Exception {
        int before = suite.checks.get();
        codec(suite);
        amounts(suite);
        CrmCampaignLogMapper logs = suite.mapper(CrmCampaignLogMapper.class);
        CrmCampaignLogArchiveService archives = suite.proxied(new CrmCampaignLogArchiveService(logs));
        boundary(suite, logs);
        batch(suite, logs, archives);
        concurrent(suite, logs, archives);
        lateTracking(suite, logs, archives);
        System.out.println("E5_CAMPAIGN_ARCHIVE_DATABASE: assertions=" + (suite.checks.get() - before)
                + "; tenant_plugin=true; real_transactions=true; batch_limit=200; retention_months=12; concurrent_recheck=true; late_tracking=true");
    }

    private static void codec(CrmEmailDatabaseChecks suite) throws Exception {
        for (CrmCampaignLogArchiveCodec.Details details : List.of(
                new CrmCampaignLogArchiveCodec.Details(null, null, null, null),
                new CrmCampaignLogArchiveCodec.Details("", "", "", ""),
                new CrmCampaignLogArchiveCodec.Details("a***@example.com", "https://example.com/路径?值=😀", "邮箱客户端\r\n代理", "::1"),
                new CrmCampaignLogArchiveCodec.Details(null, "https://example.com/" + "detail".repeat(300), "agent".repeat(90), "127.0.0.1"))) {
            CrmCampaignLogArchiveCodec.Encoded encoded = CrmCampaignLogArchiveCodec.encode(details);
            suite.equal(details, CrmCampaignLogArchiveCodec.decode(encoded.payload(), encoded.checksum()), "every nullable unicode field restores exactly");
            byte[] changed = encoded.payload();
            changed[changed.length / 2] ^= 1;
            suite.rejects(() -> CrmCampaignLogArchiveCodec.decode(changed, encoded.checksum()), "corrupt archive rejected");
            byte[] checksum = encoded.checksum();
            checksum[0] ^= 1;
            suite.rejects(() -> CrmCampaignLogArchiveCodec.decode(encoded.payload(), checksum), "corrupt checksum rejected");
            byte[] copied = encoded.payload();
            copied[0] = 0;
            suite.equal(details, CrmCampaignLogArchiveCodec.decode(encoded.payload(), encoded.checksum()), "encoded byte ownership retained");
        }
        suite.rejects(() -> CrmCampaignLogArchiveCodec.encode(new CrmCampaignLogArchiveCodec.Details("\ud800", null, null, null)), "malformed unicode rejected without data replacement");
        suite.rejects(() -> CrmCampaignLogArchiveCodec.encode(new CrmCampaignLogArchiveCodec.Details("x".repeat(32768), null, null, null)), "total encoded field bound enforced");
        byte[] oversized = new byte[32769];
        suite.rejects(() -> CrmCampaignLogArchiveCodec.decode(gzip(oversized), digest(oversized)), "decompression exceeds 32768 bytes rejected");
        ByteArrayOutputStream plain = new ByteArrayOutputStream();
        try (DataOutputStream writer = new DataOutputStream(plain)) {
            writer.writeByte(1); writer.writeInt(2); writer.write(new byte[]{(byte) 0xc3, 0x28});
            writer.writeInt(-1); writer.writeInt(-1); writer.writeInt(-1);
        }
        byte[] malformed = plain.toByteArray();
        suite.rejects(() -> CrmCampaignLogArchiveCodec.decode(gzip(malformed), digest(malformed)), "malformed restored UTF8 rejected");
        suite.rejects(() -> CrmCampaignLogArchiveCodec.decode(new byte[]{1}, new byte[32]), "invalid gzip rejected");
    }

    private static byte[] gzip(byte[] plain) {
        try {
            ByteArrayOutputStream result = new ByteArrayOutputStream();
            try (GZIPOutputStream output = new GZIPOutputStream(result)) { output.write(plain); }
            return result.toByteArray();
        } catch (Exception exception) { throw new IllegalStateException(exception); }
    }

    private static void amounts(CrmEmailDatabaseChecks suite) throws Exception {
        CrmCampaign campaign = suite.campaign("E5 exact campaign amount storage boundary");
        campaign.setBudget(new BigDecimal("99999999999999.99"));
        campaign.setActualCost(new BigDecimal("0.01"));
        campaign.setRevenue(new BigDecimal("99999999999999.99"));
        campaign.setRoi(com.cloudflow.crm.service.impl.CrmCampaignRevenueService.roi(campaign.getRevenue(), campaign.getActualCost()));
        suite.equal(1, suite.mapper(CrmCampaignMapper.class).updateById(campaign), "maximum campaign amounts persist in the formal schema");
        CrmCampaign restored = suite.mapper(CrmCampaignMapper.class).selectById(campaign.getCampaignId());
        com.fasterxml.jackson.databind.JsonNode json = suite.json.valueToTree(restored);
        suite.check(json.path("budget").isTextual() && json.path("actualCost").isTextual() && json.path("revenue").isTextual() && json.path("roi").isTextual(), "campaign monetary fields serialize as exact strings");
        suite.equal("99999999999999.99", json.path("budget").asText(), "maximum budget retains the last cent");
        suite.equal("99999999999999.99", json.path("revenue").asText(), "maximum fixture income retains the last cent");
        suite.equal("9999999999999998.0000", json.path("roi").asText(), "maximum ROI fits the current formal decimal column exactly");
    }

    private static byte[] digest(byte[] plain) {
        try { return MessageDigest.getInstance("SHA-256").digest(plain); }
        catch (Exception exception) { throw new IllegalStateException(exception); }
    }

    private static CrmCampaignLog event(CrmEmailDatabaseChecks suite, CrmCampaignLogMapper logs, long tenant,
            LocalDateTime when, String detail) {
        Long previousTenant = TenantContext.getTenantId();
        try {
            TenantContext.setTenantId(tenant); UserContext.setTenantId(tenant);
            CrmCampaignLog event = new CrmCampaignLog();
            event.setTenantId(tenant); event.setCampaignId(901L); event.setAction("SENT"); event.setActionTime(when);
            event.setTargetType("LEAD"); event.setTargetId(901L); event.setTargetEmail("a***@example.com");
            event.setClickUrl(detail); event.setUserAgent(detail == null ? null : "浏览器😀".repeat(30)); event.setIpAddress("127.0.0.1");
            event.setSourceEventKey("ARCHIVE:" + UUID.randomUUID()); event.setTestFlag(0);
            event.setCreateBy("e5-owned-history"); event.setCreateTime(LocalDateTime.now());
            suite.equal(1, logs.insertOnce(event), "owned historical event inserted once");
            return event;
        } finally { TenantContext.setTenantId(previousTenant); UserContext.setTenantId(previousTenant); }
    }

    private static void boundary(CrmEmailDatabaseChecks suite, CrmCampaignLogMapper logs) {
        LocalDateTime cutoff = LocalDateTime.of(2099, 3, 1, 0, 0);
        CrmCampaignLog older = event(suite, logs, CrmEmailDatabaseChecks.TENANT, cutoff.minusSeconds(1), "old");
        CrmCampaignLog equal = event(suite, logs, CrmEmailDatabaseChecks.TENANT, cutoff, "equal");
        CrmCampaignLog newer = event(suite, logs, CrmEmailDatabaseChecks.TENANT, cutoff.plusSeconds(1), "new");
        List<Long> candidates = logs.selectArchiveCandidateIds(CrmEmailDatabaseChecks.TENANT, cutoff, 10000);
        suite.check(candidates.contains(older.getLogId()) && !candidates.contains(equal.getLogId()) && !candidates.contains(newer.getLogId()), "strict cutoff excludes equality and future");
        suite.transactions.execute(status -> {
            suite.check(logs.lockArchiveCandidate(CrmEmailDatabaseChecks.TENANT, older.getLogId(), cutoff) != null, "older row is lockable");
            suite.check(logs.lockArchiveCandidate(CrmEmailDatabaseChecks.TENANT, equal.getLogId(), cutoff) == null, "cutoff row is not lockable");
            suite.check(logs.lockArchiveCandidate(CrmEmailDatabaseChecks.TENANT + 1, older.getLogId(), cutoff) == null, "foreign tenant cannot lock local event");
            return null;
        });
    }

    private static void batch(CrmEmailDatabaseChecks suite, CrmCampaignLogMapper logs, CrmCampaignLogArchiveService archives) {
        LocalDateTime old = LocalDateTime.now().minusMonths(13).withNano(0);
        List<CrmCampaignLog> owned = new ArrayList<>();
        owned.add(event(suite, logs, CrmEmailDatabaseChecks.TENANT, old.minusSeconds(1), null));
        for (int index = 1; index < 205; index++) owned.add(event(suite, logs, CrmEmailDatabaseChecks.TENANT, old, "https://example.com/" + "详情".repeat(500)));
        CrmCampaignLog foreign = event(suite, logs, CrmEmailDatabaseChecks.TENANT + 1, old.minusDays(1), "https://example.com/" + "foreign".repeat(150));
        long rowsBefore = suite.scalar("SELECT COUNT(*) FROM crm_campaign_log");
        CrmCampaignLogArchiveService.Result first = archives.archiveExpired();
        suite.equal(200, first.checked(), "one tenant pass is bounded to 200 rows");
        suite.equal(199, first.archived(), "short row retains raw details");
        suite.check(first.retainedDetailBytes() < first.previousDetailBytes(), "only measured metadata bytes decrease");
        CrmCampaignLogArchiveService.Result second = archives.archiveExpired();
        suite.equal(5, second.checked(), "next pass handles remaining five events");
        suite.equal(5, second.archived(), "remaining bulky details archived");
        suite.equal(0, archives.archiveExpired().checked(), "checked rows are not rescanned");
        suite.equal(rowsBefore, suite.scalar("SELECT COUNT(*) FROM crm_campaign_log"), "archival never removes events");
        suite.equal(0L, suite.scalar("SELECT COUNT(*) FROM crm_campaign_log WHERE log_id=? AND archive_checked_time IS NOT NULL", foreign.getLogId()), "other tenant remains untouched");
        for (CrmCampaignLog original : owned) {
            CrmCampaignLog restored = logs.selectById(original.getLogId());
            suite.equal(original.getTargetEmail(), restored.getTargetEmail(), "stored target email restores");
            suite.equal(original.getClickUrl(), restored.getClickUrl(), "stored URL restores");
            suite.equal(original.getUserAgent(), restored.getUserAgent(), "stored user agent restores");
            suite.equal(original.getIpAddress(), restored.getIpAddress(), "stored IP restores");
            suite.equal(original.getSourceEventKey(), restored.getSourceEventKey(), "immutable dedup key retained");
            suite.equal(original.getActionTime(), restored.getActionTime(), "immutable action time retained");
            suite.equal(original.getAction(), restored.getAction(), "immutable action retained");
            suite.equal(original.getTargetId(), restored.getTargetId(), "immutable recipient reference retained");
            suite.check(restored.getArchiveCheckedTime() != null, "checked timestamp retained");
        }
        CrmCampaignLog shortRow = logs.selectById(owned.get(0).getLogId());
        suite.check(shortRow.getArchivePayload() == null && shortRow.getArchiveChecksum() == null && shortRow.getArchivedTime() == null,
                "non-saving short detail remains raw and unarchived");
        suite.equal(204L, suite.scalar("SELECT COUNT(*) FROM crm_campaign_log WHERE tenant_id=? AND archive_payload IS NOT NULL AND target_email IS NULL AND click_url IS NULL AND user_agent IS NULL AND ip_address IS NULL", CrmEmailDatabaseChecks.TENANT), "compressed fields no longer duplicate raw metadata");
        CrmCampaignLog original = owned.get(1);
        logs.insertOnce(original);
        suite.equal(rowsBefore, suite.scalar("SELECT COUNT(*) FROM crm_campaign_log"), "replayed source event cannot add an archived duplicate");
        suite.equal(original.getClickUrl(), logs.selectById(original.getLogId()).getClickUrl(), "duplicate insertion leaves decoded URL unchanged");
    }

    private static void concurrent(CrmEmailDatabaseChecks suite, CrmCampaignLogMapper logs, CrmCampaignLogArchiveService archives) throws Exception {
        CrmCampaignLog candidate = event(suite, logs, CrmEmailDatabaseChecks.TENANT, LocalDateTime.now().minusMonths(13), "https://example.com/" + "并发".repeat(400));
        ExecutorService workers = Executors.newFixedThreadPool(2);
        CountDownLatch ready = new CountDownLatch(2), start = new CountDownLatch(1);
        List<Future<CrmCampaignLogArchiveService.Result>> results = new ArrayList<>();
        try {
            for (int index = 0; index < 2; index++) {
                results.add(workers.submit(() -> {
                    suite.identity(10L); ready.countDown();
                    try {
                        if (!start.await(10, TimeUnit.SECONDS)) throw new IllegalStateException("archive start timed out");
                        return archives.archiveExpired();
                    } finally { UserContext.clear(); TenantContext.clear(); }
                }));
            }
            suite.check(ready.await(10, TimeUnit.SECONDS), "two archive transactions ready"); start.countDown();
            int checked = 0;
            for (Future<CrmCampaignLogArchiveService.Result> result : results) checked += result.get(30, TimeUnit.SECONDS).checked();
            suite.equal(1, checked, "concurrent lock recheck processes the same event once");
            suite.equal(candidate.getClickUrl(), logs.selectById(candidate.getLogId()).getClickUrl(), "concurrent archive restores exact detail");
            suite.concurrentGroups++;
        } finally {
            start.countDown(); workers.shutdownNow(); suite.check(workers.awaitTermination(10, TimeUnit.SECONDS), "archive workers finished");
        }
    }

    private static void lateTracking(CrmEmailDatabaseChecks suite, CrmCampaignLogMapper logs, CrmCampaignLogArchiveService archives) throws Exception {
        suite.identity(10L); suite.setting("crm.email.sendingEnabled", "true"); suite.setting("crm.email.trackingEnabled", "true");
        suite.setting("crm.email.allowedHosts", "example.com");
        CrmCampaign campaign = suite.campaign("E5 archived SENT supports late callbacks");
        CrmLead lead = suite.lead("Archive receiver", "archive-receiver@example.com", 10L, 0);
        suite.list(campaign, false, lead);
        CrmMassEmail task = suite.draft(campaign); suite.send(task); suite.pump();
        CrmMassEmailRecipient recipient = suite.recipients(task.getMassEmailId()).get(0);
        suite.equal("SENT", recipient.getStatus(), "SMTP accepted actual source before archival");
        Long logId = suite.jdbc.queryForObject("SELECT log_id FROM crm_campaign_log WHERE tenant_id=? AND source_event_key=?", Long.class,
                CrmEmailDatabaseChecks.TENANT, "MAIL:" + recipient.getRecipientId() + ":SENT");
        suite.equal(1, suite.jdbc.update("UPDATE crm_campaign_log SET action_time=?,user_agent=? WHERE tenant_id=? AND log_id=?",
                LocalDateTime.now().minusMonths(13), "owned-archive-agent-".repeat(20), CrmEmailDatabaseChecks.TENANT, logId), "date only the owned delivery fixture");
        CrmCampaignLog before = logs.selectById(logId);
        archives.archiveExpired();
        CrmCampaignLog archived = logs.selectById(logId);
        suite.check(archived.getArchivePayload() != null, "actual accepted event detail is archived");
        suite.equal(before.getUserAgent(), archived.getUserAgent(), "accepted archived metadata restores exactly");
        String token = suite.tokens(recipient, "open").get(0);
        suite.tracking.open(token, "late-client", "127.0.0.1");
        suite.tracking.open(token, "late-client", "127.0.0.1");
        String click = suite.tokens(recipient, "click").get(0);
        suite.tracking.click(click, "late-client", "127.0.0.1"); suite.tracking.click(click, "late-client", "127.0.0.1");
        CrmCampaign refreshed = suite.mapper(CrmCampaignMapper.class).selectById(campaign.getCampaignId());
        suite.equal(1, refreshed.getSentCount(), "archival retains canonical SENT count");
        suite.equal(1, refreshed.getOpenedCount(), "late repeated open remains counted once");
        suite.equal(1, refreshed.getClickedCount(), "late repeated click remains counted once");
        suite.equal(1L, suite.scalar("SELECT COUNT(*) FROM crm_campaign_log WHERE tenant_id=? AND source_event_key=?",
                CrmEmailDatabaseChecks.TENANT, "MAIL:" + recipient.getRecipientId() + ":OPENED"), "late canonical open source is unique");
    }
}
