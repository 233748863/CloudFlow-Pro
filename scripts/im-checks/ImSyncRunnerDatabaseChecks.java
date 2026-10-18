package com.cloudflow.auth.im;

import cn.dev33.satoken.stp.StpUtil;
import com.cloudflow.auth.mapper.ImOrganizationMapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.tenant.TenantContext;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.function.BiFunction;
import java.util.function.Supplier;
import org.springframework.jdbc.core.JdbcTemplate;

final class ImSyncRunnerDatabaseChecks {
    private static final long TENANT = 100000;
    private static final long OTHER = 990100;
    private final JdbcTemplate jdbc;
    private final ImDatabase database;
    private final ImOrganizationMapper writes;
    private final ImOrgSnapshotCodec codec;
    private final Supplier<ImSyncBatchExecutor> batches;
    private final ImSyncEffectsExecutor effects;
    private final long administrator;
    private final BiFunction<Long, Long, String> login;
    private final PreviewFactory previews;
    private int assertions;

    @FunctionalInterface
    interface PreviewFactory { ImSyncRunRow create(String suffix) throws Exception; }

    ImSyncRunnerDatabaseChecks(JdbcTemplate jdbc, ImDatabase database, ImOrganizationMapper writes, ImOrgSnapshotCodec codec,
            Supplier<ImSyncBatchExecutor> batches, ImSyncEffectsExecutor effects, long administrator,
            BiFunction<Long, Long, String> login, PreviewFactory previews) {
        this.jdbc = jdbc;
        this.database = database;
        this.writes = writes;
        this.codec = codec;
        this.batches = batches;
        this.effects = effects;
        this.administrator = administrator;
        this.login = login;
        this.previews = previews;
    }

    void run() throws Exception {
        Long previousTenant = TenantContext.getTenantId();
        Long previousUserTenant = UserContext.getTenantId();
        boolean previousSkip = TenantContext.getTenantSkip();
        try {
            confirmedRecovery();
            for (String boundary : List.of("user", "role", "permission", "package", "configuration", "version", "local", "tenant")) revokedRecovery(boundary);
            legacyRecovery();
            concurrentRecovery();
            fairDirectory();
            System.out.println("G4_IM_SYNC_RUNNER_DATABASE: assertions=" + assertions + "; failed=0; real_mysql=true; real_redis=true; original_login_revoked=true; recorded_permission_rechecked=true; confirmed_batches_only=true; restart_resume=true; directory_pagination=true; effects_ack_fixture=false; source_fixture=true; vendor_service=false");
        } finally {
            if (previousTenant == null) TenantContext.clear();
            else TenantContext.setTenantId(previousTenant);
            UserContext.setTenantId(previousUserTenant);
            if (previousSkip) TenantContext.setTenantSkip();
            else TenantContext.clearTenantSkip();
        }
    }

    private void confirmedRecovery() throws Exception {
        ImSyncRunRow run = previews.create("首次");
        equal(new ImSyncRunner.Sweep(0, 0, 0, 0), runner().recoverDue(), "unconfirmed previews never scheduled");
        rejected(() -> runner().recover(TENANT, run.getSyncRunId(), deadline()), "IM_ORG_LOCAL_INVALID");
        String token = login.apply(administrator, TENANT);
        ImSyncRunner.Result accepted = runner().apply(run.getSyncRunId(), request(run));
        equal(100, accepted.progress().processed(), "interactive request commits one bounded batch");
        equal(administrator, state(run).confirmedBy(), "confirmation persisted inside encrypted checkpoint");
        check(accepted.progress().remaining() > 0, "remaining members not falsely reported complete");
        check(StpUtil.getStpLogic().getLoginIdByToken(token) == null, "actual security cleanup logs original administrator out");
        rejected(() -> runner().apply(run.getSyncRunId(), request(run)), "IM_AUTHENTICATION_REQUIRED");
        ImSyncApplication paused = state(run);
        equal(paused, runner().recover(TENANT, run.getSyncRunId(), System.nanoTime() - 1), "expired recovery budget performs no batch");
        Thread.currentThread().interrupt();
        try { equal(paused, runner().recover(TENANT, run.getSyncRunId(), deadline()), "interrupted recovery performs no batch"); }
        finally { Thread.interrupted(); }
        TenantContext.setTenantId(OTHER);
        UserContext.setTenantId(OTHER);
        TenantContext.setTenantSkip();
        try {
            ImSyncRunner.Sweep sweep = runner().recoverDue();
            equal("PARTIAL", state(run).status(), "fixture retains its known preview conflicts after committing applicable changes");
            check(paused.preview().summary().userConflicts() + paused.preview().summary().departmentConflicts() > 0, "fixture conflicts existed before background execution");
            equal(new ImSyncRunner.Sweep(1, 0, 0, 1), sweep, "partial report is not counted as fully successful synchronization");
            equal(OTHER, TenantContext.getTenantId(), "directory restores caller tenant");
            equal(OTHER, UserContext.getTenantId(), "directory restores caller user tenant");
            check(TenantContext.getTenantSkip(), "directory preserves preexisting skip flag while writes stay scoped");
        } finally { TenantContext.clearTenantSkip(); TenantContext.setTenantId(TENANT); UserContext.setTenantId(TENANT); }
        check(state(run).finished() && !state(run).effectsPending(), "actual organization and security work complete");
        equal(102L, state(run).summary().actual().usersUpdated(), "all 102 source updates counted exactly once");
        int auditCount = audits(run);
        ImSyncApplication completed = runner().recover(TENANT, run.getSyncRunId(), deadline());
        equal(completed, state(run), "replaying completed run is idempotent");
        equal(auditCount, audits(run), "completed replay appends no duplicate business audit");
        ImSyncRunner foreign = new ImSyncRunner(batches.get(), effects, database, writes, codec);
        rejected(() -> foreign.recover(OTHER, run.getSyncRunId(), deadline()), "IM_ORG_LOCAL_INVALID");
        System.out.println("G4_IM_RUNNER_STAGE: confirmed_recovery=passed; original_login_revoked=true; caller_context_restored=true");
    }

    private void revokedRecovery(String boundary) throws Exception {
        ImSyncRunRow run = previews.create(boundary);
        ImSyncApplication first = batches.get().step(run.getSyncRunId(), run.getConfigVersion(), run.getSnapshotHash());
        check(first.effectsPending(), boundary + " starts with durable security work");
        Map<String, Object> tenant = jdbc.queryForMap("SELECT package_id,package_version,effective_menu_ids FROM sys_tenant WHERE tenant_id=?", TENANT);
        String rootName = jdbc.queryForObject("SELECT dept_name FROM sys_dept WHERE dept_id=997000 AND tenant_id=?", String.class, TENANT);
        switch (boundary) {
            case "user" -> jdbc.update("UPDATE sys_user SET status='1' WHERE user_id=? AND tenant_id=?", administrator, TENANT);
            case "role" -> jdbc.update("DELETE FROM sys_user_role WHERE user_id=? AND tenant_id=? AND role_id=1", administrator, TENANT);
            case "permission" -> jdbc.update("DELETE FROM sys_role_menu WHERE tenant_id=? AND role_id=1 AND menu_id=1784", TENANT);
            case "package" -> jdbc.update("UPDATE sys_tenant SET package_id=990100,package_version=0,effective_menu_ids='[6,1785]' WHERE tenant_id=?", TENANT);
            case "configuration" -> jdbc.update("UPDATE sys_im_config SET status='DISABLED' WHERE tenant_id=? AND config_id=?", TENANT, run.getConfigId());
            case "version" -> jdbc.update("UPDATE sys_im_config SET version=version+1 WHERE tenant_id=? AND config_id=?", TENANT, run.getConfigId());
            case "local" -> jdbc.update("UPDATE sys_dept SET dept_name='同步期间本地修改' WHERE tenant_id=? AND dept_id=997000", TENANT);
            case "tenant" -> jdbc.update("UPDATE sys_tenant SET deleted=1,status='1' WHERE tenant_id=?", TENANT);
            default -> throw new AssertionError("unknown boundary");
        }
        try {
            ImSyncRunner.Sweep sweep = runner().recoverDue();
            equal(new ImSyncRunner.Sweep(1, 0, 0, 1), sweep, boundary + " reports blocked business continuation as failed");
            ImSyncApplication stopped = state(run);
            if ("version".equals(boundary)) {
                equal("PARTIAL", stopped.status(), "superseded configuration ends old run with explicit unexecuted conflicts");
                equal(first.summary().actual().usersUpdated(), stopped.summary().actual().usersUpdated(), "superseded remainder performs no organization writes");
            } else equal(first.next(), stopped.next(), boundary + " prevents additional organization writes");
            check(!stopped.effectsPending(), boundary + " still permits actual security cleanup");
            if (!"version".equals(boundary)) check(!stopped.finished(), boundary + " is not reported completed");
        } finally {
            switch (boundary) {
                case "user" -> jdbc.update("UPDATE sys_user SET status='0' WHERE user_id=? AND tenant_id=?", administrator, TENANT);
                case "role" -> jdbc.update("INSERT INTO sys_user_role(user_id,role_id,tenant_id) VALUES (?,1,?)", administrator, TENANT);
                case "permission" -> jdbc.update("INSERT INTO sys_role_menu(role_id,menu_id,tenant_id) VALUES (1,1784,?)", TENANT);
                case "package" -> jdbc.update("UPDATE sys_tenant SET package_id=?,package_version=?,effective_menu_ids=? WHERE tenant_id=?",
                        tenant.get("package_id"), tenant.get("package_version"), tenant.get("effective_menu_ids"), TENANT);
                case "configuration" -> jdbc.update("UPDATE sys_im_config SET status='ENABLED' WHERE tenant_id=? AND config_id=?", TENANT, run.getConfigId());
                case "version" -> jdbc.update("UPDATE sys_im_config SET version=? WHERE tenant_id=? AND config_id=?", run.getConfigVersion(), TENANT, run.getConfigId());
                case "local" -> jdbc.update("UPDATE sys_dept SET dept_name=? WHERE tenant_id=? AND dept_id=997000", rootName, TENANT);
                case "tenant" -> jdbc.update("UPDATE sys_tenant SET deleted=0,status='0' WHERE tenant_id=?", TENANT);
                default -> throw new AssertionError("unknown boundary");
            }
        }
        check(runner().recover(TENANT, run.getSyncRunId(), deadline()).finished(), boundary + " recovers when exact original prerequisites are restored");
        System.out.println("G4_IM_RUNNER_STAGE: boundary=" + boundary + "; security_cleanup=passed; business_write_blocked=true; "
                + ("version".equals(boundary) ? "superseded_partial_retained=true" : "restored_resume=passed"));
    }

    private void legacyRecovery() throws Exception {
        ImSyncRunRow run = previews.create("旧格式");
        ImSyncApplication first = batches.get().step(run.getSyncRunId(), run.getConfigVersion(), run.getSnapshotHash());
        ImSyncApplication legacy = new ImSyncApplication(first.preview(), first.previewHash(), first.localHash(), first.outcomes(), first.pendingUsers(), first.pendingDepartments());
        ImOrgSnapshotCodec.Sealed sealed = codec.encodeApplication(legacy);
        jdbc.update("UPDATE sys_im_sync_run SET snapshot_encrypted=?,progress_cursor=? WHERE tenant_id=? AND sync_run_id=?",
                sealed.encrypted(), sealed.hash(), TENANT, run.getSyncRunId());
        equal(0L, state(run).confirmedBy(), "legacy row has no invented administrator");
        rejected(() -> runner().recover(TENANT, run.getSyncRunId(), deadline()), "IM_AUTHENTICATION_REQUIRED");
        equal(first.next(), state(run).next(), "unconfirmed legacy continuation cannot write organization");
        check(!state(run).effectsPending(), "legacy safety work finishes independently of confirmation");
        login.apply(administrator, TENANT);
        runner().apply(run.getSyncRunId(), request(run));
        equal(administrator, state(run).confirmedBy(), "real administrator reconfirms old execution");
        check(runner().recover(TENANT, run.getSyncRunId(), deadline()).finished(), "reconfirmed old execution completes");
        System.out.println("G4_IM_RUNNER_STAGE: legacy_confirmation=passed; automatic_unconfirmed_writes=0");
    }

    private void concurrentRecovery() throws Exception {
        ImSyncRunRow run = previews.create("并发");
        batches.get().step(run.getSyncRunId(), run.getConfigVersion(), run.getSnapshotHash());
        int before = audits(run);
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService workers = Executors.newFixedThreadPool(2);
        try {
            Future<ImSyncApplication> first = workers.submit(() -> { start.await(); return runner().recover(TENANT, run.getSyncRunId(), deadline()); });
            Future<ImSyncApplication> second = workers.submit(() -> { start.await(); return runner().recover(TENANT, run.getSyncRunId(), deadline()); });
            start.countDown();
            ImSyncApplication completed = first.get(180, TimeUnit.SECONDS);
            equal(completed, second.get(180, TimeUnit.SECONDS), "two independent runners agree on durable final state");
            check(completed.finished(), "concurrent runners finish organization and security cleanup");
            equal(1, audits(run) - before, "remaining business batch commits once across concurrent recovery");
            System.out.println("G4_IM_RUNNER_STAGE: concurrent_recovery=passed; remaining_business_batches=1");
        } finally { workers.shutdownNow(); check(workers.awaitTermination(10, TimeUnit.SECONDS), "runner workers exit before cleanup"); }
    }

    private void fairDirectory() throws Exception {
        for (int index = 0; index < 101; index++) jdbc.update("INSERT INTO sys_im_sync_run(tenant_id,config_id,config_version,mode,snapshot_hash,full_snapshot_flag,status,requested_by,started_time,create_by) VALUES (?,999001,0,'APPLY',REPEAT('0',64),1,'RUNNING',999001,NOW(),'runner-invalid-fixture')", OTHER);
        try {
            ImSyncRunRow run = previews.create("公平");
            batches.get().step(run.getSyncRunId(), run.getConfigVersion(), run.getSnapshotHash());
            ImSyncRunner recovery = runner();
            equal(new ImSyncRunner.Sweep(100, 0, 0, 100), recovery.recoverDue(), "first directory page bounded to 100 invalid targets");
            equal(new ImSyncRunner.Sweep(2, 0, 0, 2), recovery.recoverDue(), "second page reaches applicable changes and reports known fixture conflicts separately from full success");
            check(state(run).finished(), "bad records cannot starve later healthy tenant");
            equal(new ImSyncRunner.Sweep(100, 0, 0, 100), recovery.recoverDue(), "cursor rotates to retry earlier pending targets after final page");
            check(!TenantContext.getTenantSkip(), "global directory does not leak tenant bypass after failures");
        } finally { jdbc.update("UPDATE sys_im_sync_run SET status='FAILED' WHERE tenant_id=? AND create_by='runner-invalid-fixture'", OTHER); }
    }

    private ImSyncRunner runner() { return new ImSyncRunner(batches.get(), effects, database, writes, codec); }
    private ImSyncApplication state(ImSyncRunRow run) { return database.read(TENANT, mapper -> codec.decodeRun(mapper.syncRun(TENANT, run.getSyncRunId()))); }
    private int audits(ImSyncRunRow run) { return jdbc.queryForObject("SELECT COUNT(*) FROM sys_audit_log WHERE tenant_id=? AND audit_name='IM_SYNC_BATCH' AND audit_field=?", Integer.class, TENANT, "im_sync:" + run.getSyncRunId()); }
    private static long deadline() { return System.nanoTime() + Duration.ofMinutes(4).toNanos(); }
    private static ImSyncApplyRequest request(ImSyncRunRow run) { ImSyncApplyRequest request = new ImSyncApplyRequest(); request.setVersion(run.getConfigVersion()); request.setHash(run.getSnapshotHash()); return request; }
    private void rejected(Runnable operation, String reason) {
        try { operation.run(); throw new AssertionError("Expected safe rejection: " + reason); }
        catch (ImFailure failure) { equal(reason, failure.getReasonCode(), "safe rejection reason"); }
    }
    private void equal(Object expected, Object actual, String message) { check(Objects.equals(expected, actual), message); }
    private void check(boolean success, String message) { assertions++; if (!success) throw new AssertionError(message); }
}
