package com.cloudflow.auth.im;

import cn.dev33.satoken.stp.StpUtil;
import com.cloudflow.auth.domain.SysJob;
import com.cloudflow.common.audit.mapper.SysAuditLogMapper;
import com.cloudflow.common.job.config.JobInvocationContext;
import com.cloudflow.common.job.model.JobExecuteDTO;
import com.cloudflow.common.job.model.JobResult;
import com.cloudflow.common.tenant.TenantContext;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.BiFunction;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.mybatis.spring.SqlSessionTemplate;

final class ImScheduledSyncDatabaseChecks {
    private static final long TENANT = 100000;
    private final JdbcTemplate jdbc;
    private final ImDatabase database;
    private final ImConfigService configs;
    private final ImSyncService previews;
    private final ImScheduledSync scheduled;
    private final ImSyncBatchExecutor batches;
    private final ImSyncRunner runner;
    private final ImOrgSnapshotCodec codec;
    private final SqlSessionTemplate sessions;
    private final ImSyncEffectsDatabaseChecks.Runtime runtime;
    private final BiFunction<Long, Long, String> login;
    private final AtomicBoolean failAudit;
    private final AtomicReference<String> failWrite;
    private final AtomicInteger remoteCalls = new AtomicInteger();
    private final AtomicInteger members = new AtomicInteger(1);
    private final AtomicReference<Runnable> remoteHook = new AtomicReference<>(() -> { });
    private final AtomicReference<String> name = new AtomicReference<>("定时成员甲");
    private final long configId;
    private final long admin;
    private int assertions;
    private long jobId;

    ImScheduledSyncDatabaseChecks(JdbcTemplate jdbc, ImDatabase database, ImConfigService configs, ImActors actors,
            ImConfigRules rules, ImProperties properties, ImOrgSnapshotCodec codec, SysAuditLogMapper audits,
            ImSyncBatchExecutor batches, ImSyncRunner runner, BiFunction<Long, Long, String> login,
            AtomicBoolean failAudit, AtomicReference<String> failWrite, long configId, long admin,
            SqlSessionTemplate sessions, ImSyncEffectsDatabaseChecks.Runtime runtime) {
        this.jdbc = jdbc; this.database = database; this.configs = configs; this.batches = batches; this.runner = runner;
        this.codec = codec;
        this.login = login; this.failAudit = failAudit; this.failWrite = failWrite; this.configId = configId; this.admin = admin;
        this.sessions = sessions; this.runtime = runtime;
        ImOrgProvider provider = new ImOrgProvider() {
            @Override public String providerType() { return "WECOM"; }
            @Override public List<ImOrgSnapshot.Department> departments(WeComCredentials credentials) { throw new AssertionError("unused scope chooser"); }
            @Override public ImOrgSnapshot snapshot(WeComCredentials credentials, ImConfigRequest.SyncScope scope, Set<String> managed) {
                check(!TransactionSynchronizationManager.isActualTransactionActive(), "scheduled vendor read outside transaction");
                check(!TenantContext.getTenantSkip() && Objects.equals(TENANT, TenantContext.getTenantId()), "scheduled vendor tenant scope");
                remoteCalls.incrementAndGet();
                remoteHook.get().run();
                List<ImOrgSnapshot.Member> source = new java.util.ArrayList<>();
                for (int index = 0; index < members.get(); index++) source.add(new ImOrgSnapshot.Member(index == 0 ? "scheduled-member" : "scheduled-" + index,
                        index == 0 ? name.get() : "定时分批成员" + index, List.of(2L), 1,
                        new ImOrgSnapshot.Field(false, null), new ImOrgSnapshot.Field(false, null), new ImOrgSnapshot.Field(false, null)));
                return new ImOrgSnapshot(TENANT, configId, credentials.version(), credentials.corpId(), credentials.agentId(), Instant.now(),
                        scope.getLocalRootDeptId(), Set.copyOf(scope.getRemoteDepartmentIds()), Map.of(),
                        List.of(new ImOrgSnapshot.Department(2, 1, "自动同步部门", 0)), source);
            }
        };
        previews = new ImSyncService(actors, database, rules, provider,
                new ImLocalOrganizationReader(new com.cloudflow.auth.platform.PlatformAccessProperties(), new com.cloudflow.auth.oauth2.OAuthProperties()),
                new ImSyncPlanner(), codec, audits, properties);
        scheduled = new ImScheduledSync(database, previews, batches, runner);
    }

    void run() throws Exception {
        registration();
        invocationContext();
        automaticChanges();
        stoppedManagement();
        boundaries();
        racesAndRecovery();
        supersededConfiguration();
        configurationBetweenRecoverySteps();
        transactionBudget();
        login.apply(admin, TENANT);
        ImConfigRequest automatic = request(true); automatic.setSyncCron("*/2 * * * * *"); configs.update(automatic);
        new ImScheduledPlatformChecks(jdbc, sessions, runtime, scheduled, jobId).run(() -> {
            login.apply(admin, TENANT);
            name.set("平台下一轮新名称");
            ImConfigRequest updated = request(true); updated.setSyncCron("*/2 * * * * *"); configs.update(updated);
        }, () -> { login.apply(admin, TENANT); configs.update(request(false)); });
        login.apply(admin, TENANT);
        configs.update(request(false));
        equal("PAUSED", job().getStatus(), "turning off synchronization pauses owned job");
        equal(0, jdbc.queryForObject("SELECT COUNT(*) FROM sys_role_menu WHERE role_id=5 AND menu_id BETWEEN 1780 AND 1787", Integer.class), "employee receives no IM management grant");
        System.out.println("G4_IM_SCHEDULE_DATABASE: assertions=" + assertions + "; failed=0; remote_reads=" + remoteCalls.get()
                + "; real_mysql=true; real_mybatis=true; real_transactions=true; real_security_effects=true; source_fixture=true; dispatcher=false; production_modified=false");
    }

    private void registration() {
        login.apply(admin, TENANT);
        equal(0, jobCount(), "disabled configurations register no automatic task");
        ImConfigRequest request = request(true);
        int version = config().getVersion();
        failAudit.set(true);
        try { rejected(() -> configs.update(request), "IM_AUDIT_UNAVAILABLE"); }
        finally { failAudit.set(false); }
        equal(0, jobCount(), "failed audit rolls back task registration");
        equal(version, config().getVersion(), "failed audit rolls back configuration revision");
        jdbc.update("DELETE FROM sys_role_menu WHERE tenant_id=100000 AND role_id=1 AND menu_id=1784");
        try { rejected(() -> configs.update(request), "IM_PERMISSION_DENIED"); }
        finally { jdbc.update("INSERT INTO sys_role_menu(role_id,menu_id,tenant_id) VALUES (1,1784,100000)"); }
        equal(0, jobCount(), "missing execution grant cannot register scheduled write");
        request.setSyncCron(null);
        rejected(() -> configs.update(request), "IM_CONFIGURATION_INVALID");
        configs.update(request(true));
        equal(1, jobCount(), "one configuration registers one task");
        jobId = jdbc.queryForObject("SELECT job_id FROM sys_job WHERE tenant_id=100000 AND handler_name='imOrganizationSync'", Long.class);
        check(ImSyncSchedules.shape(job()), "registered cron matches all execution safety fields");
        equal("ENABLED", job().getStatus(), "enabled config registers enabled task");
        equal(configId, ImSyncSchedules.command(job().getHandlerParam()).configId(), "task linked to saved config");
        equal(config().getVersion(), ImSyncSchedules.command(job().getHandlerParam()).version(), "task captures saved revision");
        configs.update(request(true));
        equal(1, jobCount(), "updates reuse same job identifier");
        equal(jobId, job().getJobId(), "owned task stable identifier");
    }

    private void invocationContext() throws Exception {
        check(JobInvocationContext.execution() == null, "no invocation identity before execution");
        JobExecuteDTO outer = execution();
        JobInvocationContext.callWithPlatformLock(outer, () -> {
            equal(outer.getExecuteNo(), JobInvocationContext.execution().executeNo(), "execution identity installed");
            JobExecuteDTO inner = execution();
            try { JobInvocationContext.callWithPlatformLock(inner, () -> { throw new IllegalStateException("controlled failure"); }); }
            catch (IllegalStateException expected) { equal(outer.getExecuteNo(), JobInvocationContext.execution().executeNo(), "nested failure restores identity"); }
            return null;
        });
        check(JobInvocationContext.execution() == null, "identity removed after outer completion");
        check(!JobInvocationContext.consumePlatformLock(), "platform lock marker restored");
    }

    private void automaticChanges() throws Exception {
        StpUtil.logout(admin);
        JobExecuteDTO first = execution();
        JobResult result = invoke(first);
        equal("SUCCESS", result.getExecuteStatus(), "scheduled synchronization succeeds without original session");
        check(result.getResultMsg().contains("status=COMPLETED"), "full result explicitly reports completion");
        long runId = linkedId(first);
        equal("APPLY", row(runId).getMode(), "scheduled snapshot automatically applied");
        equal(admin, row(runId).getRequestedBy(), "recorded configuration author retained");
        equal("COMPLETED", row(runId).getStatus(), "durable result completed");
        check(config().getLastSyncTime() != null, "full completion updates last synchronization time");
        equal(0, jdbc.queryForObject("SELECT COUNT(*) FROM sys_user_role WHERE user_id IN (SELECT user_id FROM sys_im_user_mapping WHERE config_id=? AND im_user_id='scheduled-member')", Integer.class, configId), "automatic new account has zero roles");
        int reads = remoteCalls.get();
        long count = countRuns();
        equal("SUCCESS", invoke(first).getExecuteStatus(), "same execution recovers existing result");
        equal(reads, remoteCalls.get(), "same execution does not fetch fresh source");
        equal(count, countRuns(), "same execution creates no second report");
        name.set("定时发现新名称");
        JobExecuteDTO second = execution();
        equal("SUCCESS", invoke(second).getExecuteStatus(), "next scheduled round automatically applies newly found change");
        check(linkedId(second) != runId, "next round preserves separate report");
        equal(name.get(), jdbc.queryForObject("SELECT nick_name FROM sys_user WHERE user_id=(SELECT user_id FROM sys_im_user_mapping WHERE config_id=? AND im_user_id='scheduled-member')", String.class, configId), "fresh source name applied");
        jdbc.update("UPDATE sys_job_log SET execute_status='SUCCESS' WHERE execute_no=?", first.getExecuteNo());
        check(invoke(first).getResultMsg().contains("IM_PERMISSION_DENIED"), "terminal execution cannot replay after Redis loss");
    }

    private void stoppedManagement() throws Exception {
        long userId = jdbc.queryForObject("SELECT user_id FROM sys_im_user_mapping WHERE config_id=? AND im_user_id='scheduled-member'", Long.class, configId);
        jdbc.update("UPDATE sys_im_user_mapping SET status='DISABLED',version=version+1 WHERE config_id=? AND im_user_id='scheduled-member'", configId);
        List<Map<String, Object>> account = jdbc.queryForList("SELECT * FROM sys_user WHERE tenant_id=100000 AND user_id=?", userId);
        List<Map<String, Object>> mapping = jdbc.queryForList("SELECT * FROM sys_im_user_mapping WHERE config_id=? AND im_user_id='scheduled-member'", configId);
        name.set("停止管理后禁止自动覆盖");
        for (int round = 0; round < 2; round++) {
            JobExecuteDTO execution = execution();
            equal("SUCCESS", invoke(execution).getExecuteStatus(), "stopped employee does not fail automatic synchronization");
            ImSyncApplication application = codec.decodeRun(row(linkedId(execution)));
            ImSyncApplication.Outcome outcome = application.outcomes().stream().filter(value -> value.kind() == ImSyncApplication.Kind.USER
                    && value.externalId().equals("scheduled-member")).findFirst().orElseThrow();
            equal(ImSyncPreview.Action.SKIP, outcome.action(), "automatic job explicitly skips stopped employee");
            equal(List.of(ImSyncPreview.Reason.SYNC_MANAGEMENT_STOPPED), outcome.reasons(), "automatic report preserves stopped reason");
            equal(account, jdbc.queryForList("SELECT * FROM sys_user WHERE tenant_id=100000 AND user_id=?", userId), "automatic job preserves complete stopped account");
            equal(mapping, jdbc.queryForList("SELECT * FROM sys_im_user_mapping WHERE config_id=? AND im_user_id='scheduled-member'", configId), "automatic job preserves stopped mapping and synchronization timestamp");
            equal("SUCCESS", invoke(execution).getExecuteStatus(), "automatic execution recovery preserves skip result");
        }
        jdbc.update("UPDATE sys_im_user_mapping SET status='ACTIVE',version=version+1 WHERE config_id=? AND im_user_id='scheduled-member'", configId);
        name.set("管理员重新纳入后定时更新");
        equal("SUCCESS", invoke(execution()).getExecuteStatus(), "explicit resumption enables later automatic update");
        equal(name.get(), jdbc.queryForObject("SELECT nick_name FROM sys_user WHERE tenant_id=100000 AND user_id=?", String.class, userId), "automatic resumption updates original local account");
        System.out.println("G4_IM_SCHEDULE_STOPPED: fresh_rounds=2; recovery_replay=true; complete_user_and_mapping_preserved=true; explicit_resume_same_account=true; source_fixture=true");
    }

    private void boundaries() throws Exception {
        int reads = remoteCalls.get();
        TenantContext.clear();
        equal("FAILED", scheduled.execute(job().getHandlerParam()).getExecuteStatus(), "missing tenant rejected");
        TenantContext.setTenantId(TENANT);
        equal("FAILED", scheduled.execute(job().getHandlerParam()).getExecuteStatus(), "missing platform identity rejected");
        for (String parameter : List.of("{}", "null", "{\"configId\":1,\"version\":0,\"actor\":1}",
                "{\"configId\":1,\"configId\":2,\"version\":0}", "{\"configId\":\"1\",\"version\":0}",
                "{\"configId\":1,\"version\":0.5}", "{\"configId\":1,\"version\":0} {}")) {
            JobExecuteDTO invalid = execution(); invalid.setHandlerParam(parameter);
            equal("FAILED", invoke(invalid).getExecuteStatus(), "forged command refused");
        }
        JobExecuteDTO missing = execution();
        jdbc.update("DELETE FROM sys_job_log WHERE execute_no=?", missing.getExecuteNo());
        equal("FAILED", invoke(missing).getExecuteStatus(), "nonexistent execution refused");
        JobExecuteDTO manual = execution();
        jdbc.update("UPDATE sys_job_log SET trigger_type='MANUAL' WHERE execute_no=?", manual.getExecuteNo());
        equal("FAILED", invoke(manual).getExecuteStatus(), "manual invocation cannot bypass configuration approval");
        JobExecuteDTO foreign = execution();
        TenantContext.setTenantId(990100L);
        JobResult rejected = JobInvocationContext.callWithPlatformLock(foreign, () -> scheduled.execute(foreign.getHandlerParam()));
        equal("FAILED", rejected.getExecuteStatus(), "cross-tenant execution refused");
        TenantContext.setTenantId(TENANT);
        equal(reads, remoteCalls.get(), "unauthorized invocations issue no vendor request");
        login.apply(admin, TENANT);
        ImVersionRequest version = new ImVersionRequest(); version.setVersion(config().getVersion());
        ImSyncViews.Report manualPreview = previews.preview(configId, version);
        runner.recoverDue();
        equal("PREVIEW", row(manualPreview.header().syncRunId()).getMode(), "recovery never auto-confirms manual preview");
    }

    private void racesAndRecovery() throws Exception {
        long before = countRuns();
        JobExecuteDTO changed = execution();
        remoteHook.set(() -> jdbc.update("UPDATE sys_im_config SET version=version+1 WHERE config_id=?", configId));
        try { check(invoke(changed).getResultMsg().contains("IM_VERSION_CONFLICT"), "configuration changed during read stops commit"); }
        finally { remoteHook.set(() -> { }); }
        equal(before, countRuns(), "changed configuration produces no stale snapshot commit");
        login.apply(admin, TENANT); configs.update(request(true));
        JobExecuteDTO revoked = execution();
        remoteHook.set(() -> jdbc.update("DELETE FROM sys_role_menu WHERE tenant_id=100000 AND role_id=1 AND menu_id=1784"));
        try { check(invoke(revoked).getResultMsg().contains("IM_PERMISSION_DENIED"), "revoked author stops automatic commit"); }
        finally { remoteHook.set(() -> { }); jdbc.update("INSERT INTO sys_role_menu(role_id,menu_id,tenant_id) VALUES (1,1784,100000)"); }
        equal(before, countRuns(), "revocation leaves business and report uncommitted");
        name.set("事务重试后名称");
        JobExecuteDTO retry = execution();
        failWrite.set("checkpoint");
        try { check(invoke(retry).getResultMsg().contains("IM_ORG_APPLY_SAVE_FAILED"), "batch failure reports stable run reference"); }
        finally { failWrite.set(null); }
        long retryId = linkedId(retry);
        equal("PREVIEW", row(retryId).getMode(), "failed first batch rolls back progress");
        int reads = remoteCalls.get();
        equal("SUCCESS", invoke(retry).getExecuteStatus(), "same platform execution retries linked preview");
        equal(reads, remoteCalls.get(), "linked retry uses same frozen snapshot");
        equal(retryId, linkedId(retry), "linked retry retains report identity");
        JobExecuteDTO concurrent = execution();
        CountDownLatch arrived = new CountDownLatch(2);
        remoteHook.set(() -> {
            arrived.countDown();
            try { check(arrived.await(10, TimeUnit.SECONDS), "both duplicate readers reached source"); }
            catch (InterruptedException failure) { Thread.currentThread().interrupt(); throw new AssertionError(failure); }
        });
        ExecutorService workers = Executors.newFixedThreadPool(2);
        long concurrentBefore = countRuns();
        try {
            Future<Long> first = workers.submit(() -> preview(concurrent));
            Future<Long> second = workers.submit(() -> preview(concurrent));
            equal(first.get(20, TimeUnit.SECONDS), second.get(20, TimeUnit.SECONDS), "duplicate database link serializes snapshot insertion");
            equal(concurrentBefore + 1, countRuns(), "concurrent duplicate saves one report");
        } finally { remoteHook.set(() -> { }); workers.shutdownNow(); check(workers.awaitTermination(10, TimeUnit.SECONDS), "owned duplicate workers stopped"); }
        equal("SUCCESS", invoke(concurrent).getExecuteStatus(), "linked snapshot remains automatically executable");
    }

    private void transactionBudget() throws Exception {
        int version = config().getVersion();
        try {
            ImSyncBudget.within(System.nanoTime() + Duration.ofMillis(150).toNanos(), () -> database.exclusive(TENANT, mapper -> {
                jdbc.update("UPDATE sys_im_config SET version=version+1 WHERE config_id=?", configId);
                try { Thread.sleep(220); }
                catch (InterruptedException failure) { Thread.currentThread().interrupt(); throw new AssertionError(failure); }
                return null;
            }));
            throw new AssertionError("expected exhausted transaction budget");
        } catch (ImSyncBudget.Exhausted expected) { equal(version, config().getVersion(), "deadline before commit rolls back actual write"); }
        check(!ImSyncBudget.active(), "transaction budget restores thread context");
        CountDownLatch acquired = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        ExecutorService worker = Executors.newSingleThreadExecutor();
        try {
            Future<?> held = worker.submit(() -> database.write(TENANT, mapper -> {
                mapper.lockConfig(TENANT, configId); acquired.countDown();
                try { check(release.await(10, TimeUnit.SECONDS), "held row released by test"); }
                catch (InterruptedException failure) { Thread.currentThread().interrupt(); throw new AssertionError(failure); }
                return null;
            }));
            check(acquired.await(5, TimeUnit.SECONDS), "independent transaction holds real MySQL row");
            long started = System.nanoTime();
            try {
                ImSyncBudget.within(started + Duration.ofMillis(300).toNanos(), () -> database.exclusive(TENANT, mapper -> mapper.lockConfig(TENANT, configId)));
                throw new AssertionError("held query should time out");
            } catch (ImSyncBudget.Exhausted expected) { check(System.nanoTime() - started < Duration.ofSeconds(5).toNanos(), "JDBC timeout interrupts actual lock wait"); }
            finally { release.countDown(); }
            held.get(5, TimeUnit.SECONDS);
        } finally { release.countDown(); worker.shutdownNow(); check(worker.awaitTermination(10, TimeUnit.SECONDS), "owned lock worker stopped"); }
    }

    private void supersededConfiguration() throws Exception {
        members.set(103);
        JobExecuteDTO old = execution();
        long runId = preview(old);
        TenantContext.setTenantId(TENANT);
        ImSyncApplication first = JobInvocationContext.callWithPlatformLock(old, () -> {
            ImScheduledClaim claim = database.read(TENANT, mapper -> ImScheduledClaim.capture(mapper, old.getHandlerParam()));
            return batches.scheduled(claim, runId, row(runId).getSnapshotHash());
        });
        check(first.effectsPending() && !first.finished(), "first scheduled chunk commits with unfinished remainder");
        int userCount = jdbc.queryForObject("SELECT COUNT(*) FROM sys_user WHERE tenant_id=100000", Integer.class);
        login.apply(admin, TENANT); configs.update(request(true));
        ImSyncApplication stopped = runner.recover(TENANT, runId, System.nanoTime() + Duration.ofSeconds(30).toNanos());
        equal("PARTIAL", stopped.status(), "new configuration finalizes old remainder explicitly");
        check(!stopped.effectsPending(), "security cleanup finishes before superseding old remainder");
        equal(userCount, jdbc.queryForObject("SELECT COUNT(*) FROM sys_user WHERE tenant_id=100000", Integer.class), "superseded run inserts no additional employee");
        check(stopped.outcomes().subList(first.next(), stopped.total()).stream().allMatch(outcome -> outcome.reasons().contains(ImSyncPreview.Reason.CONFIGURATION_CHANGED)), "every skipped old item retains a specific reason");
        equal("SUCCESS", invoke(execution()).getExecuteStatus(), "new scope revision proceeds after old run closes");
    }

    private long preview(JobExecuteDTO request) throws Exception {
        TenantContext.setTenantId(TENANT);
        try {
            return JobInvocationContext.callWithPlatformLock(request, () -> {
                ImScheduledClaim claim = database.read(TENANT, mapper -> ImScheduledClaim.capture(mapper, request.getHandlerParam()));
                return previews.scheduledPreview(claim).header().syncRunId();
            });
        } finally { TenantContext.clear(); }
    }

    private void configurationBetweenRecoverySteps() throws Exception {
        members.set(205);
        JobExecuteDTO execution = execution();
        long runId = preview(execution);
        TenantContext.setTenantId(TENANT);
        JobInvocationContext.callWithPlatformLock(execution, () -> {
            ImScheduledClaim claim = database.read(TENANT, mapper -> ImScheduledClaim.capture(mapper, execution.getHandlerParam()));
            return batches.scheduled(claim, runId, row(runId).getSnapshotHash());
        });
        ImSyncApplication ready;
        do { ready = runtime.recovery().recover(TENANT, runId); } while (ready.effectsPending());
        check(!ready.finished(), "interleaved configuration test has unfinished organization work");
        int userCount = jdbc.queryForObject("SELECT COUNT(*) FROM sys_user WHERE tenant_id=100000", Integer.class);
        AtomicBoolean changed = new AtomicBoolean();
        ImSyncEffectsExecutor interleaved = new ImSyncEffectsExecutor(null, null, null, null, null) {
            @Override ImSyncApplication recover(long tenantId, long identifier) {
                ImSyncApplication recovered = runtime.recovery().recover(tenantId, identifier);
                if (changed.compareAndSet(false, true)) jdbc.update("UPDATE sys_im_config SET version=version+1 WHERE config_id=?", configId);
                return recovered;
            }
        };
        ImSyncRunner racing = new ImSyncRunner(batches, interleaved, database,
                sessions.getMapper(com.cloudflow.auth.mapper.ImOrganizationMapper.class), codec);
        ImSyncApplication closed = racing.recover(TENANT, runId, System.nanoTime() + Duration.ofSeconds(30).toNanos());
        check(changed.get(), "configuration changes after safety recheck and before next write transaction");
        equal("PARTIAL", closed.status(), "mid-step configuration race closes old work in same recovery invocation");
        equal(userCount, jdbc.queryForObject("SELECT COUNT(*) FROM sys_user WHERE tenant_id=100000", Integer.class), "mid-step configuration race performs no stale organization writes");
        equal(ready.outcomes(), closed.outcomes().subList(0, ready.next()), "mid-step closure retains previously committed outcomes");
        check(closed.outcomes().subList(ready.next(), closed.total()).stream().allMatch(outcome ->
                outcome.action() == ImSyncPreview.Action.CONFLICT && outcome.reasons().contains(ImSyncPreview.Reason.CONFIGURATION_CHANGED)),
                "mid-step closure records configuration change for every remaining item");
        login.apply(admin, TENANT); configs.update(request(true));
        equal("SUCCESS", invoke(execution()).getExecuteStatus(), "new configuration continues immediately after interleaved closure");
        System.out.println("G4_IM_SCHEDULE_REVISION_RACE: changed_between_steps=true; stale_writes=0; old_run=PARTIAL; next_run=COMPLETED");
    }

    private JobResult invoke(JobExecuteDTO request) throws Exception {
        TenantContext.setTenantId(TENANT);
        return JobInvocationContext.callWithPlatformLock(request, () -> scheduled.execute(request.getHandlerParam()));
    }

    private JobExecuteDTO execution() {
        SysJob job = job();
        JobExecuteDTO request = new JobExecuteDTO();
        request.setJobId(jobId); request.setExecuteNo(UUID.randomUUID().toString());
        request.setHandlerName(ImSyncSchedules.HANDLER); request.setHandlerParam(job.getHandlerParam());
        jdbc.update("INSERT INTO sys_job_log(tenant_id,job_id,job_name,handler_name,execute_no,trigger_type,start_time,execute_status) VALUES (100000,?,'定时专项','imOrganizationSync',?,'CRON',NOW(),'RUNNING')", jobId, request.getExecuteNo());
        return request;
    }

    private ImConfigRequest request(boolean enabled) {
        ImConfigRow config = config();
        ImConfigRequest request = ImConfigChecks.editRequest(config);
        request.setSyncEnabled(enabled); request.setSyncCron("0 0 2 * * *"); request.setStatus("ENABLED");
        ImConfigRequest.SyncScope scope = new ImConfigRequest.SyncScope(); scope.setLocalRootDeptId(997000L); scope.setRemoteDepartmentIds(List.of(2L));
        request.setSyncScope(scope);
        return request;
    }

    private int jobCount() { return jdbc.queryForObject("SELECT COUNT(*) FROM sys_job WHERE tenant_id=100000 AND handler_name='imOrganizationSync'", Integer.class); }
    private long countRuns() { return jdbc.queryForObject("SELECT COUNT(*) FROM sys_im_sync_run WHERE config_id=?", Long.class, configId); }
    private SysJob job() { return database.read(TENANT, mapper -> mapper.scheduledJob(TENANT, jobId)); }
    private ImConfigRow config() { return database.read(TENANT, mapper -> mapper.config(TENANT, configId)); }
    private ImSyncRunRow row(long runId) { return database.read(TENANT, mapper -> mapper.syncRun(TENANT, runId)); }
    private long linkedId(JobExecuteDTO request) {
        String reference = jdbc.queryForObject("SELECT result_msg FROM sys_job_log WHERE execute_no=?", String.class, request.getExecuteNo());
        check(reference != null && reference.startsWith(ImScheduledClaim.PREFIX), "stable report link persisted");
        return Long.parseLong(reference.substring(ImScheduledClaim.PREFIX.length(), reference.indexOf(';')));
    }
    private void rejected(Runnable operation, String code) {
        try { operation.run(); throw new AssertionError("expected " + code); }
        catch (ImFailure failure) { equal(code, failure.getReasonCode(), "safe rejection reason"); }
    }
    private synchronized void check(boolean condition, String message) { assertions++; if (!condition) throw new AssertionError(message); }
    private void equal(Object expected, Object actual, String message) { check(Objects.equals(expected, actual), message + "; expected=" + expected + "; actual=" + actual); }
}
