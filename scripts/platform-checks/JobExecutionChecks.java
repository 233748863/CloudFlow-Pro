package com.cloudflow.common.job.service;

import com.cloudflow.common.job.client.JobReportClient;
import com.cloudflow.common.job.config.JobExecutionStore;
import com.cloudflow.common.job.config.JobHandlerRegistry;
import com.cloudflow.common.job.config.JobInvocationContext;
import com.cloudflow.common.job.model.JobExecuteDTO;
import com.cloudflow.common.job.model.JobResult;
import com.cloudflow.common.job.model.JobResultReportDTO;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.RejectedExecutionException;
import java.util.function.Supplier;
import org.springframework.web.client.RestClient;

public class JobExecutionChecks {
    private static int checks;

    public static void main(String[] arguments) {
        MemoryStore store = new MemoryStore();
        MemoryReports reports = new MemoryReports();
        MemoryRegistry registry = new MemoryRegistry();
        List<Runnable> queue = new ArrayList<>();
        JobExecutionService service = new JobExecutionService(registry, store, null, reports, queue::add);
        JobExecuteDTO synchronous = request();
        Thread caller = Thread.currentThread();
        registry.handler = () -> {
            check(Thread.currentThread() == caller, "synchronous execution retains the request thread");
            check("RUNNING".equals(store.get(synchronous.getExecuteNo()).getExecuteStatus()), "synchronous execution registers observable running state before work");
            check(JobInvocationContext.consumePlatformLock(), "synchronous handler receives managed lock context");
            return JobResult.success(7, "完成");
        };
        check(service.executeInline(synchronous).getData().isAccepted(), "synchronous execution is accepted");
        check(queue.isEmpty() && registry.invocations == 1, "synchronous execution never enters the background queue");
        check("SUCCESS".equals(service.status(synchronous.getExecuteNo()).getData().getExecuteStatus()), "synchronous response waits for the terminal result");
        check(reports.results.size() == 1 && reports.results.get(0).getAffectedRows() == 7, "synchronous execution reports its real result");
        check(!JobInvocationContext.consumePlatformLock(), "synchronous completion restores invocation context");
        check(service.executeInline(synchronous).getData().isAccepted() && registry.invocations == 1 && reports.results.size() == 1, "duplicate execution identity cannot run or report twice");

        registry.handler = () -> { throw new IllegalStateException("受控失败"); };
        JobExecuteDTO failed = request();
        service.executeInline(failed);
        check("FAILED".equals(store.get(failed.getExecuteNo()).getExecuteStatus()) && "FAILED".equals(reports.results.get(1).getExecuteStatus()), "synchronous handler failure is cached and reported");
        check(!JobInvocationContext.consumePlatformLock(), "synchronous failure also restores invocation context");

        registry.handler = () -> JobResult.success(1, "完成");
        JobExecuteDTO asynchronous = request();
        check(service.execute(asynchronous).getData().isAccepted() && queue.size() == 1, "background execution still uses its configured queue");
        check("RUNNING".equals(service.status(asynchronous.getExecuteNo()).getData().getExecuteStatus()) && reports.results.size() == 2, "background execution returns before handler completion");
        queue.remove(0).run();
        check("SUCCESS".equals(service.status(asynchronous.getExecuteNo()).getData().getExecuteStatus()) && reports.results.size() == 3, "background execution preserves result reporting");

        JobExecuteDTO invalid = request();
        invalid.setHandlerName("unregistered");
        check(!service.executeInline(invalid).getData().isAccepted() && store.get(invalid.getExecuteNo()) == null, "synchronous entry rejects unregistered handlers");
        check(!service.executeInline(null).getData().isAccepted(), "synchronous entry rejects absent execution requests");
        JobExecutionService rejecting = new JobExecutionService(registry, store, null, reports, task -> { throw new RejectedExecutionException(); });
        JobExecuteDTO rejected = request();
        check(!rejecting.execute(rejected).getData().isAccepted() && store.get(rejected.getExecuteNo()) == null, "queue rejection releases its execution claim");
        JobExecuteDTO independent = request();
        check(rejecting.executeInline(independent).getData().isAccepted() && "SUCCESS".equals(store.get(independent.getExecuteNo()).getExecuteStatus()), "synchronous work remains independent of a rejected background queue");
        System.out.println("Batch G job execution checks passed: " + checks);
    }

    private static JobExecuteDTO request() {
        JobExecuteDTO request = new JobExecuteDTO();
        request.setExecuteNo(UUID.randomUUID().toString());
        request.setHandlerName("batchImport");
        request.setHandlerParam("{}");
        request.setConcurrentFlag(1);
        request.setTimeoutSeconds(1800);
        return request;
    }

    private static void check(boolean condition, String label) {
        if (!condition) throw new AssertionError(label);
        checks++;
    }

    private static final class MemoryStore extends JobExecutionStore {
        private final Map<String, JobResult> results = new ConcurrentHashMap<>();
        private MemoryStore() { super(null, new ObjectMapper()); }
        @Override public void put(String executeNo, JobResult result, Duration ttl) { results.put(executeNo, result); }
        @Override public boolean putIfAbsent(String executeNo, JobResult result, Duration ttl) { return results.putIfAbsent(executeNo, result) == null; }
        @Override public JobResult get(String executeNo) { return results.get(executeNo); }
        @Override public void remove(String executeNo) { results.remove(executeNo); }
    }

    private static final class MemoryReports extends JobReportClient {
        private final List<JobResultReportDTO> results = new ArrayList<>();
        private MemoryReports() { super(RestClient.builder(), "cloudflow-service-oa", "http://127.0.0.1", false, null, null); }
        @Override public void reportResult(JobResultReportDTO request) { results.add(request); }
    }

    private static final class MemoryRegistry extends JobHandlerRegistry {
        private Supplier<JobResult> handler;
        private int invocations;
        private MemoryRegistry() { super(null); }
        @Override public boolean contains(String name) { return "batchImport".equals(name); }
        @Override public JobResult invoke(String name, String parameter) { invocations++; return handler.get(); }
    }
}
