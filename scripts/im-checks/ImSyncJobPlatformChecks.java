package com.cloudflow.auth.im;

import com.cloudflow.auth.job.ImSyncRecoveryJob;
import com.cloudflow.common.core.constant.SecurityConstants;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.job.client.JobReportClient;
import com.cloudflow.common.job.config.JobExecutionStore;
import com.cloudflow.common.job.config.JobHandlerRegistry;
import com.cloudflow.common.job.model.JobAcceptVO;
import com.cloudflow.common.job.model.JobExecuteDTO;
import com.cloudflow.common.job.model.JobResult;
import com.cloudflow.common.job.service.JobExecutionService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.time.Duration;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.redisson.api.RLock;
import org.springframework.aop.support.AopUtils;
import org.springframework.context.ApplicationContext;
import org.springframework.web.client.RestClient;

final class ImSyncJobPlatformChecks implements AutoCloseable {
    private static final ObjectMapper JSON = new ObjectMapper().findAndRegisterModules();
    private final ImSyncEffectsDatabaseChecks.Runtime runtime;
    private final JobExecutionStore store;
    private final JobExecutionService execution;
    private final HttpServer reports;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final Map<String, JsonNode> received = new ConcurrentHashMap<>();
    private final AtomicInteger reportRequests = new AtomicInteger();
    private int assertions;
    private int executions;

    ImSyncJobPlatformChecks(ApplicationContext context, ImSyncEffectsDatabaseChecks.Runtime runtime) throws Exception {
        this.runtime = runtime;
        JobHandlerRegistry registry = new JobHandlerRegistry(context);
        registry.refresh();
        check(registry.contains("imSyncRecovery"), "real annotation registry discovers recovery handler");
        check(registry.list().size() == 1, "test context exposes only real recovery handler");
        check(registry.lockName("imSyncRecovery").equals("im-sync-recovery"), "platform and annotation share lock name");
        check(AopUtils.isAopProxy(context.getBean(ImSyncRecoveryJob.class)), "real distributed job advice enabled");
        reports = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        reports.createContext("/inner/job/report", exchange -> {
            try {
                check(exchange.getRequestMethod().equals("POST"), "real result client posts report");
                check(SecurityConstants.INNER_CALL_VALUE.equals(exchange.getRequestHeaders().getFirst(SecurityConstants.INNER_CALL_HEADER)), "internal report header");
                check("cloudflow-auth".equals(exchange.getRequestHeaders().getFirst(SecurityConstants.FROM_SERVICE_HEADER)), "auth reports own execution");
                JsonNode report = JSON.readTree(exchange.getRequestBody());
                received.put(report.path("executeNo").asText(), report);
                reportRequests.incrementAndGet();
                exchange.sendResponseHeaders(200, -1);
            } finally { exchange.close(); }
        });
        reports.start();
        store = new JobExecutionStore(runtime.strings(), JSON);
        JobReportClient client = new JobReportClient(RestClient.builder(), "cloudflow-auth", "http://127.0.0.1:" + reports.getAddress().getPort(), true, ImJobSigningFixture.auth(), null);
        execution = new JobExecutionService(registry, store, runtime.locks(), client, executor);
    }

    JobResult recover(boolean asynchronous) throws Exception {
        JobExecuteDTO request = request();
        int previousReports = reportRequests.get();
        R<JobAcceptVO> accepted = asynchronous ? execution.execute(request) : execution.executeInline(request);
        check(accepted.isSuccess() && accepted.getData().isAccepted(), "platform accepts registered recovery");
        long deadline = System.nanoTime() + Duration.ofSeconds(260).toNanos();
        JobResult result;
        do {
            result = store.get(request.getExecuteNo());
            if (result != null && !"RUNNING".equals(result.getExecuteStatus()) && received.containsKey(request.getExecuteNo())
                    && !runtime.locks().getLock("cloudflow:job:lock:im-sync-recovery").isLocked()) break;
            Thread.sleep(20);
        } while (System.nanoTime() < deadline);
        check(result != null && !"RUNNING".equals(result.getExecuteStatus()), "terminal execution stored in real Redis");
        JsonNode report = received.get(request.getExecuteNo());
        check(report != null && report.path("executeStatus").asText().equals(result.getExecuteStatus()), "real HTTP result matches stored status");
        check(report.path("resultMsg").asText().equals(result.getResultMsg()), "reported sweep counts match actual result");
        check(reportRequests.get() == previousReports + 1, "exactly one report per execution");
        check(execution.status(request.getExecuteNo()).getData().getExecuteStatus().equals(result.getExecuteStatus()), "production status lookup reads real store");
        Long ttl = runtime.strings().getExpire("cloudflow:job:execution:" + request.getExecuteNo(), TimeUnit.SECONDS);
        check(ttl != null && ttl > 0 && ttl <= 480, "execution status expiry uses seeded timeout");
        check(!runtime.locks().getLock("cloudflow:job:lock:im-sync-recovery").isLocked(), "platform releases owned lock");
        String before = JSON.writeValueAsString(result);
        check(execution.executeInline(request).getData().isAccepted(), "duplicate execute number acknowledged");
        check(before.equals(JSON.writeValueAsString(store.get(request.getExecuteNo()))), "duplicate delivery does not replace execution result");
        check(reportRequests.get() == previousReports + 1, "duplicate delivery never invokes handler again");
        executions++;
        return result;
    }

    void lockHeld() throws Exception {
        JobExecuteDTO request = request();
        RLock lock = runtime.locks().getLock("cloudflow:job:lock:im-sync-recovery");
        check(lock.tryLock(0, 30, TimeUnit.SECONDS), "independent scheduler owns actual Redis lock");
        int previousReports = reportRequests.get();
        try {
            JobAcceptVO blocked = execution.executeInline(request).getData();
            check(!blocked.isAccepted() && "LOCK_HELD".equals(blocked.getReason()), "second scheduler cannot enter recovery");
            check("SKIPPED".equals(store.get(request.getExecuteNo()).getExecuteStatus()), "lock conflict stored without running business");
            check(!execution.executeInline(request).getData().isAccepted(), "same skipped delivery remains skipped");
            check(reportRequests.get() == previousReports, "lock conflict creates no successful business report");
            check(lock.isHeldByCurrentThread(), "rejected execution never releases another owner's lock");
        } finally { lock.unlock(); }
        JobExecuteDTO unknown = request(); unknown.setHandlerName("unregisteredImRecovery");
        check(!execution.executeInline(unknown).getData().isAccepted(), "unknown handler refused");
        check(store.get(unknown.getExecuteNo()) == null, "unknown handler cannot create execution status");
    }

    void summary() {
        System.out.println("G4_IM_SYNC_JOB_PLATFORM: assertions=" + assertions + "; failed=0; executions=" + executions
                + "; reports=" + reportRequests.get() + "; real_registry=true; real_distributed_advice=true; real_redis_store=true; real_redis_lock=true; real_execution_service=true; real_http_report_client=true; report_receiver=loopback_fixture; dispatcher=false; production_modified=false");
    }

    private JobExecuteDTO request() {
        JobExecuteDTO request = new JobExecuteDTO();
        request.setExecuteNo(UUID.randomUUID().toString()); request.setJobId(1784L); request.setHandlerName("imSyncRecovery");
        request.setTimeoutSeconds(240); request.setLockTimeSeconds(300); request.setConcurrentFlag(0);
        return request;
    }

    private synchronized void check(boolean condition, String message) { assertions++; if (!condition) throw new AssertionError(message); }

    @Override public void close() throws InterruptedException {
        executor.shutdownNow();
        try { check(executor.awaitTermination(10, TimeUnit.SECONDS), "owned job executor stopped"); }
        finally { reports.stop(0); }
    }
}
