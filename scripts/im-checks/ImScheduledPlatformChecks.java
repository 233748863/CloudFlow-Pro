package com.cloudflow.auth.im;

import com.cloudflow.auth.domain.dto.SysJobDTO;
import com.cloudflow.auth.mapper.SysJobHandlerMapper;
import com.cloudflow.auth.mapper.SysJobLogMapper;
import com.cloudflow.auth.mapper.SysJobMapper;
import com.cloudflow.auth.service.JobDispatchClient;
import com.cloudflow.auth.service.JobPlatformService;
import com.cloudflow.auth.service.jobclient.AuthJobExecutionClient;
import com.cloudflow.common.audit.mapper.SysAuditLogMapper;
import com.cloudflow.common.config.ContextTaskDecorator;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.job.aspect.DistributedJobAspect;
import com.cloudflow.common.job.client.JobReportClient;
import com.cloudflow.common.job.config.JobExecutionStore;
import com.cloudflow.common.job.config.JobHandlerRegistry;
import com.cloudflow.common.job.config.JobInvocationContext;
import com.cloudflow.common.job.model.JobAcceptVO;
import com.cloudflow.common.job.model.JobExecuteDTO;
import com.cloudflow.common.job.model.JobResultReportDTO;
import com.cloudflow.common.job.model.JobStatusVO;
import com.cloudflow.common.job.service.JobExecutionService;
import com.cloudflow.common.tenant.TenantBroker;
import com.cloudflow.common.tenant.TenantContext;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Proxy;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.BooleanSupplier;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.aop.aspectj.annotation.AspectJProxyFactory;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.context.support.GenericApplicationContext;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.serializer.StringRedisSerializer;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.client.RestClient;

final class ImScheduledPlatformChecks {
    private final JdbcTemplate jdbc;
    private final SqlSessionTemplate sessions;
    private final ImSyncEffectsDatabaseChecks.Runtime runtime;
    private final ImScheduledSync handler;
    private final long jobId;
    private int assertions;

    ImScheduledPlatformChecks(JdbcTemplate jdbc, SqlSessionTemplate sessions, ImSyncEffectsDatabaseChecks.Runtime runtime,
            ImScheduledSync handler, long jobId) {
        this.jdbc = jdbc; this.sessions = sessions; this.runtime = runtime; this.handler = handler; this.jobId = jobId;
    }

    void run(Runnable updateConfiguration, Runnable stopConfiguration) throws Exception {
        ObjectMapper json = new ObjectMapper().findAndRegisterModules();
        String prefix = "g4:schedule-check:" + UUID.randomUUID() + ":";
        StringRedisTemplate raw = new StringRedisTemplate(Objects.requireNonNull(runtime.strings().getConnectionFactory()));
        check(Set.of().equals(raw.keys(prefix + "*")), "fresh platform namespace initially empty");
        StringRedisTemplate isolated = new StringRedisTemplate(Objects.requireNonNull(runtime.strings().getConnectionFactory()));
        isolated.setKeySerializer(new StringRedisSerializer() {
            @Override public byte[] serialize(String value) { return value == null ? null : (prefix + value).getBytes(StandardCharsets.UTF_8); }
        });
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(2); executor.setMaxPoolSize(2); executor.setTaskDecorator(new ContextTaskDecorator()); executor.initialize();
        ThreadPoolTaskScheduler clock = new ThreadPoolTaskScheduler(); clock.setPoolSize(2); clock.initialize();
        HttpServer reports = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        AtomicReference<JobPlatformService> platform = new AtomicReference<>();
        AtomicReference<Throwable> reportFailure = new AtomicReference<>();
        AtomicInteger reported = new AtomicInteger();
        reports.createContext("/inner/job/report", exchange -> {
            try {
                JobResultReportDTO result = json.readValue(exchange.getRequestBody(), JobResultReportDTO.class);
                TenantBroker.applyAs(100000L, ignored -> { platform.get().reportResult(result, "auth"); return null; });
                reported.incrementAndGet();
                exchange.sendResponseHeaders(200, -1);
            } catch (Throwable failure) { reportFailure.set(failure); exchange.sendResponseHeaders(500, -1); }
            finally { exchange.close(); }
        });
        try (GenericApplicationContext context = new GenericApplicationContext()) {
            AspectJProxyFactory advice = new AspectJProxyFactory(handler);
            advice.setProxyTargetClass(true); advice.addAspect(new DistributedJobAspect(runtime.locks()));
            ImScheduledSync advised = advice.getProxy();
            context.registerBean("scheduledSync", ImScheduledSync.class, () -> advised); context.refresh();
            JobHandlerRegistry registry = new JobHandlerRegistry(context); registry.refresh();
            check(registry.contains(ImSyncSchedules.HANDLER), "real handler registry discovers scheduled entry");
            JobExecutionStore store = new JobExecutionStore(isolated, json);
            reports.start();
            JobReportClient reportClient = new JobReportClient(RestClient.builder(), "cloudflow-auth", "http://127.0.0.1:" + reports.getAddress().getPort(), true, ImJobSigningFixture.auth(), null);
            JobExecutionService execution = new JobExecutionService(registry, store, runtime.locks(), reportClient, executor);
            AuthJobExecutionClient transport = new AuthJobExecutionClient() {
                @Override public R<JobAcceptVO> execute(String tenantId, JobExecuteDTO request) {
                    return TenantBroker.applyAs(Long.parseLong(tenantId), ignored -> execution.execute(request));
                }
                @Override public R<JobStatusVO> status(String tenantId, String executeNo) {
                    return TenantBroker.applyAs(Long.parseLong(tenantId), ignored -> execution.status(executeNo));
                }
            };
            AtomicReference<Runnable> beforeLogUpdate = new AtomicReference<>(() -> { });
            SysJobLogMapper realLogs = sessions.getMapper(SysJobLogMapper.class);
            SysJobLogMapper racingLogs = (SysJobLogMapper) Proxy.newProxyInstance(getClass().getClassLoader(), new Class<?>[]{SysJobLogMapper.class}, (proxy, method, arguments) -> {
                if (method.getName().equals("update")) beforeLogUpdate.getAndSet(() -> { }).run();
                try { return method.invoke(realLogs, arguments); }
                catch (InvocationTargetException failure) { throw failure.getCause(); }
            });
            JobPlatformService target = new JobPlatformService(sessions.getMapper(SysJobMapper.class), racingLogs,
                    sessions.getMapper(SysJobHandlerMapper.class), runtime.locks(), clock, executor,
                    new JobDispatchClient(transport, null, null, null, null), isolated, json, null, sessions.getMapper(SysAuditLogMapper.class));
            java.lang.reflect.Field offlineThreshold = JobPlatformService.class.getDeclaredField("handlerOfflineThresholdSeconds");
            offlineThreshold.setAccessible(true); offlineThreshold.setLong(target, 180L);
            ProxyFactory transactional = new ProxyFactory(target); transactional.setProxyTargetClass(true);
            TransactionInterceptor transactions = new TransactionInterceptor();
            transactions.setTransactionManager(new DataSourceTransactionManager(Objects.requireNonNull(jdbc.getDataSource())));
            transactions.setTransactionAttributeSource(new AnnotationTransactionAttributeSource());
            transactional.addAdvice(transactions);
            platform.set((JobPlatformService) transactional.getProxy());
            sessions.getMapper(SysJobHandlerMapper.class).upsert("auth", ImSyncSchedules.HANDLER, "定时同步专项", LocalDateTime.now());
            jdbc.update("UPDATE sys_job SET status='PAUSED' WHERE job_id<>?", jobId);
            jdbc.update("UPDATE sys_job_log SET execute_status='FAILED' WHERE job_id=? AND execute_status='RUNNING'", jobId);
            rejectGenericManagement(platform.get());
            resultLinkRace(platform.get(), beforeLogUpdate);
            long before = reports();
            platform.get().loadSchedules();
            await(() -> reports() > before, "real CRON trigger writes successful retained execution report");
            for (int revision = 0; revision < 3; revision++) {
                int previousVersion = jdbc.queryForObject("SELECT version FROM sys_im_config WHERE tenant_id=100000", Integer.class);
                updateConfiguration.run();
                await(() -> jdbc.queryForObject("SELECT COUNT(*) FROM sys_im_sync_run WHERE tenant_id=100000 AND config_version>? AND status='COMPLETED'", Integer.class, previousVersion) > 0,
                        "unchanged cron reloads updated configuration revision");
            }
            stopConfiguration.run();
            await(() -> jdbc.queryForObject("SELECT COUNT(*) FROM sys_job_log WHERE job_id=? AND execute_status='RUNNING'", Integer.class, jobId) == 0,
                    "scheduled reports terminate running execution");
            check(reportFailure.get() == null, "production report receiver service accepted all callbacks");
            check(reported.get() >= 4, "real HTTP reports include initial and three updated config revisions");
            long afterStop = reports();
            Thread.sleep(6500);
            check(reports() == afterStop, "disabled configuration does not produce another successful sync");
            check(JobInvocationContext.execution() == null, "scheduler never leaks execution identity into caller");
            System.out.println("G4_IM_SCHEDULE_PLATFORM: assertions=" + assertions + "; failed=0; http_reports=" + reported.get()
                    + "; configuration_revisions=4; real_cron=true; real_platform=true; real_registry=true; real_redis=true; real_context_decorator=true; real_report_service=true; dispatch_transport=in_process; vendor_service=false");
        } finally {
            if (platform.get() != null) platform.get().shutdownSchedules();
            clock.shutdown(); executor.shutdown(); reports.stop(0);
            executor.getThreadPoolExecutor().awaitTermination(10, java.util.concurrent.TimeUnit.SECONDS);
            Set<String> owned = raw.keys(prefix + "*");
            if (owned != null && !owned.isEmpty()) raw.delete(owned);
            check(Set.of().equals(raw.keys(prefix + "*")), "raw Redis connection confirms platform namespace cleanup");
            System.out.println("G4_IM_SCHEDULE_PLATFORM_CLEANUP: owned_redis_remaining=0; shared_flush=false");
        }
    }

    private void rejectGenericManagement(JobPlatformService platform) {
        TenantContext.setTenantId(100000L);
        rejected(() -> platform.trigger(jobId, null));
        rejected(() -> platform.toggle(jobId, null));
        rejected(() -> platform.remove(List.of(jobId), true));
        SysJobDTO request = new SysJobDTO(); request.setJobName("绕过配置入口"); request.setServiceName("auth");
        request.setHandlerName(ImSyncSchedules.HANDLER); request.setCronExpression("0 0 2 * * *");
        rejected(() -> platform.add(request));
        request.setJobId(jobId); rejected(() -> platform.edit(request));
    }

    private void resultLinkRace(JobPlatformService platform, AtomicReference<Runnable> beforeUpdate) {
        String executeNo = UUID.randomUUID().toString();
        long runId = jdbc.queryForObject("SELECT MAX(sync_run_id) FROM sys_im_sync_run WHERE tenant_id=100000", Long.class);
        String reference = ImScheduledClaim.reference(runId);
        jdbc.update("INSERT INTO sys_job_log(tenant_id,job_id,job_name,handler_name,execute_no,trigger_type,start_time,execute_status) VALUES (100000,?,'结果竞争专项','imOrganizationSync',?,'CRON',NOW(),'RUNNING')", jobId, executeNo);
        ExecutorService linker = Executors.newSingleThreadExecutor();
        try {
            beforeUpdate.set(() -> {
                check(TransactionSynchronizationManager.isActualTransactionActive(), "result receiver runs inside real transaction");
                equalIsolation(jdbc.queryForObject("SELECT @@transaction_isolation", String.class));
                try {
                    check(linker.submit(() -> jdbc.update("UPDATE sys_job_log SET result_msg=? WHERE execute_no=? AND result_msg IS NULL", reference, executeNo))
                            .get(5, TimeUnit.SECONDS) == 1, "independent transaction commits run link after receiver snapshot");
                } catch (Exception failure) { throw new AssertionError("independent result-link writer failed", failure); }
            });
            JobResultReportDTO result = new JobResultReportDTO(); result.setExecuteNo(executeNo); result.setExecuteStatus("FAILED"); result.setResultMsg("controlled-timeout");
            platform.reportResult(result, "auth");
        } finally {
            linker.shutdownNow();
            try { check(linker.awaitTermination(10, TimeUnit.SECONDS), "independent result-link writer stopped"); }
            catch (InterruptedException failure) { Thread.currentThread().interrupt(); throw new AssertionError(failure); }
        }
        check((reference + "controlled-timeout").equals(jdbc.queryForObject("SELECT result_msg FROM sys_job_log WHERE execute_no=?", String.class, executeNo)), "concurrent fallback report preserves newly committed run link");
        check("FAILED".equals(jdbc.queryForObject("SELECT execute_status FROM sys_job_log WHERE execute_no=?", String.class, executeNo)), "result/link race terminates exactly once");
        String timedOut = UUID.randomUUID().toString();
        jdbc.update("INSERT INTO sys_job_log(tenant_id,job_id,job_name,handler_name,execute_no,trigger_type,start_time,execute_status,result_msg) VALUES (100000,?,'超时关联专项','imOrganizationSync',?,'CRON',DATE_SUB(NOW(),INTERVAL 5 MINUTE),'RUNNING',?)", jobId, timedOut, reference);
        platform.inspectTimeouts();
        check("TIMEOUT".equals(jdbc.queryForObject("SELECT execute_status FROM sys_job_log WHERE execute_no=?", String.class, timedOut)), "lost execution reaches explicit timeout");
        check((reference + "结果未知").equals(jdbc.queryForObject("SELECT result_msg FROM sys_job_log WHERE execute_no=?", String.class, timedOut)), "timeout fallback preserves committed run reference");
        System.out.println("G4_IM_SCHEDULE_RESULT_RACE: independent_transaction=true; isolation=REPEATABLE_READ; retained_link=true; timeout_retained_link=true");
    }

    private void equalIsolation(String isolation) {
        check("REPEATABLE-READ".equals(isolation), "result race exercises actual MySQL repeatable read isolation");
    }

    private long reports() {
        return jdbc.queryForObject("SELECT COUNT(*) FROM sys_job_log WHERE job_id=? AND execute_status='SUCCESS' AND result_msg LIKE 'IM_SYNC_RUN=%;status=COMPLETED%'", Long.class, jobId);
    }
    private void await(BooleanSupplier condition, String message) throws InterruptedException {
        long deadline = System.nanoTime() + Duration.ofSeconds(35).toNanos();
        while (!condition.getAsBoolean() && System.nanoTime() < deadline) Thread.sleep(50);
        boolean completed = condition.getAsBoolean();
        if (!completed) {
            System.out.println("G4_IM_SCHEDULE_AWAIT_DIAGNOSTIC: configurations=" + jdbc.queryForList(
                    "SELECT version,status,sync_enabled FROM sys_im_config WHERE tenant_id=100000"));
            System.out.println("G4_IM_SCHEDULE_AWAIT_DIAGNOSTIC: runs=" + jdbc.queryForList(
                    "SELECT config_version,mode,status,COUNT(*) AS records FROM sys_im_sync_run WHERE tenant_id=100000 GROUP BY config_version,mode,status"));
            System.out.println("G4_IM_SCHEDULE_AWAIT_DIAGNOSTIC: reports=" + jdbc.queryForList(
                    "SELECT execute_status,COUNT(*) AS records FROM sys_job_log WHERE job_id=? GROUP BY execute_status", jobId));
            List<String> messages = jdbc.queryForList("SELECT result_msg FROM sys_job_log WHERE job_id=? ORDER BY log_id DESC LIMIT 5", String.class, jobId);
            for (String result : messages) System.out.println("G4_IM_SCHEDULE_AWAIT_RESULT: " +
                    (result != null && result.matches("[A-Z0-9_a-z=;]+") ? result : "redacted"));
        }
        check(completed, message);
    }
    private void rejected(Runnable operation) {
        try { operation.run(); throw new AssertionError("managed synchronization must reject generic task mutation"); }
        catch (ServiceException failure) { check(failure.getMessage().contains("企业通信配置"), "generic task operation points to authorized configuration entry"); }
    }
    private void check(boolean condition, String message) { assertions++; if (!condition) throw new AssertionError(message); }
}
