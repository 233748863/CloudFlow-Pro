package com.cloudflow.job.checks;

import com.cloudflow.common.job.client.JobReportClient;
import com.cloudflow.common.job.model.BusinessJobStartRequest;
import com.cloudflow.common.job.model.JobExecuteDTO;
import com.cloudflow.common.job.model.JobResultReportDTO;
import com.cloudflow.common.job.security.JobRequestSignature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.security.SecureRandom;
import java.time.Clock;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.springframework.cloud.client.DefaultServiceInstance;
import org.springframework.cloud.client.ServiceInstance;
import org.springframework.cloud.client.loadbalancer.LoadBalancerClientsProperties;
import org.springframework.cloud.loadbalancer.annotation.LoadBalancerClientSpecification;
import org.springframework.cloud.loadbalancer.blocking.client.BlockingLoadBalancerClient;
import org.springframework.cloud.loadbalancer.core.ServiceInstanceListSupplier;
import org.springframework.cloud.loadbalancer.support.LoadBalancerClientFactory;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpHeaders;
import org.springframework.web.client.RestClient;
import reactor.core.publisher.Flux;

/** Real Spring instance selection and signed HTTP; only the discovery list is controlled. */
public final class JobReportRoutingChecks {
    private static final String AUTH = "cloudflow-auth";
    private static final String HR = "cloudflow-service-hr";
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final AtomicReference<List<ServiceInstance>> DISCOVERED = new AtomicReference<>(List.of());
    private static final AtomicInteger CHECKS = new AtomicInteger();

    @Configuration(proxyBeanMethods = false)
    public static class Discovery {
        @Bean
        ServiceInstanceListSupplier instances() {
            return new ServiceInstanceListSupplier() {
                @Override public String getServiceId() { return AUTH; }
                @Override public Flux<List<ServiceInstance>> get() { return Flux.defer(() -> Flux.just(DISCOVERED.get())); }
            };
        }
    }

    public static void main(String[] args) throws Exception {
        Map<String, String> keys = new LinkedHashMap<>();
        SecureRandom random = new SecureRandom();
        for (String name : JobRequestSignature.SERVICES) {
            byte[] key = new byte[32]; random.nextBytes(key); keys.put(name, Base64.getEncoder().encodeToString(key));
        }
        JobRequestSignature sender = new JobRequestSignature(HR, keys, Clock.systemUTC());
        JobRequestSignature receiver = new JobRequestSignature(AUTH, keys, Clock.systemUTC());
        try (Endpoint first = new Endpoint("first", receiver); Endpoint second = new Endpoint("second", receiver);
             AnnotationConfigApplicationContext parent = new AnnotationConfigApplicationContext()) {
            parent.refresh();
            LoadBalancerClientFactory factory = new LoadBalancerClientFactory(new LoadBalancerClientsProperties());
            parent.getBeanFactory().registerSingleton("loadBalancerClientFactory", factory);
            factory.setApplicationContext(parent);
            factory.setConfigurations(List.of(new LoadBalancerClientSpecification(AUTH, new Class<?>[]{Discovery.class})));
            try {
                DISCOVERED.set(List.of(first.instance(), second.instance()));
                BlockingLoadBalancerClient loadBalancer = new BlockingLoadBalancerClient(factory);
                RestClient.Builder sharedBuilder = RestClient.builder();
                JobReportClient reports = new JobReportClient(sharedBuilder, HR, "", true, sender, loadBalancer);
                for (int index = 0; index < 4; index++) triplet(reports);
                check(first.count.get() == 6 && second.count.get() == 6, "real round robin reaches both auth instances");
                for (String route : List.of("/inner/job/handler/report", "/inner/job/report", "/inner/job/business/register")) {
                    check(first.paths.getOrDefault(route, 0) == 2 && second.paths.getOrDefault(route, 0) == 2, "each report protocol uses service discovery");
                }
                JobReportClient direct = new JobReportClient(sharedBuilder, HR, first.url(), true, sender, loadBalancer);
                triplet(direct);
                check(first.count.get() == 9 && second.count.get() == 6, "explicit deployment address remains exact");
                triplet(reports);
                check(first.count.get() + second.count.get() == 18 && second.count.get() > 6, "shared builder clients retain independent routing");
                first.close(); DISCOVERED.set(List.of(second.instance()));
                int before = second.count.get();
                for (int index = 0; index < 3; index++) triplet(reports);
                check(second.count.get() == before + 9, "removed and stopped instance is never selected for three protocols");
                JobReportClient blank = new JobReportClient(sharedBuilder, HR, "  ", true, sender, loadBalancer);
                triplet(blank);
                check(second.count.get() == before + 12, "whitespace override uses discovered auth");
                DISCOVERED.set(List.of()); before = second.count.get();
                reports.reportHandlers(List.of()); reports.reportResult(result());
                expectRegistrationFailure(reports);
                check(second.count.get() == before, "empty discovery does not silently report success or use localhost fallback");
                DISCOVERED.set(List.of(second.instance())); triplet(reports);
                check(second.count.get() == before + 3, "same client resumes after discovery recovery");
                JobReportClient disabled = new JobReportClient(sharedBuilder, HR, "", false, sender, loadBalancer);
                before = second.count.get(); disabled.reportHandlers(List.of()); disabled.reportResult(result()); expectRegistrationFailure(disabled);
                check(second.count.get() == before, "disabled reporting makes no network requests");
                second.unavailable = true;
                reports.reportHandlers(List.of()); reports.reportResult(result()); expectRegistrationFailure(reports);
                check(second.count.get() == before + 3, "HTTP failures preserve best-effort reports and fail business registration");
                check(first.failure.get() == null && second.failure.get() == null, "all actual requests validate logical auth recipient and serialized bytes");
                System.out.println("JOB_REPORT_ROUTING_CHECKS: passed=" + CHECKS.get() + "; failed=0; real_spring_load_balancer=true; real_http=true; controlled_discovery=true; stopped_instance_removed=true; full_runtime_failover=false; credentials_printed=false");
            } finally { factory.destroy(); }
        }
    }

    private static void triplet(JobReportClient client) {
        client.reportHandlers(List.of()); client.reportResult(result());
        BusinessJobStartRequest request = new BusinessJobStartRequest(); request.setExecuteNo(UUID.randomUUID().toString());
        request.setHandlerName("routingProbe"); request.setHandlerParam("中文内容");
        JobExecuteDTO response = client.registerBusinessJob(request);
        check(request.getExecuteNo().equals(response.getExecuteNo()), "business registration returns the actual signed request identifier");
    }

    private static JobResultReportDTO result() {
        JobResultReportDTO result = new JobResultReportDTO(); result.setExecuteNo(UUID.randomUUID().toString());
        result.setExecuteStatus("SUCCESS"); result.setResultMsg("中文回报内容"); result.setAffectedRows(0); return result;
    }

    private static void expectRegistrationFailure(JobReportClient client) {
        boolean failed = false;
        try { client.registerBusinessJob(new BusinessJobStartRequest()); } catch (RuntimeException expected) { failed = true; }
        check(failed, "unavailable registration fails to caller");
    }

    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message); CHECKS.incrementAndGet();
    }

    private static final class Endpoint implements AutoCloseable {
        private final String id;
        private final HttpServer server;
        private final AtomicInteger count = new AtomicInteger();
        private final Map<String, Integer> paths = new ConcurrentHashMap<>();
        private final AtomicReference<Throwable> failure = new AtomicReference<>();
        private boolean stopped;
        private volatile boolean unavailable;

        private Endpoint(String id, JobRequestSignature receiver) throws Exception {
            this.id = id; server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            server.createContext("/inner/job/", exchange -> {
                try {
                    byte[] body = exchange.getRequestBody().readAllBytes();
                    HttpHeaders headers = new HttpHeaders(); exchange.getRequestHeaders().forEach((name, values) -> headers.put(name, new ArrayList<>(values)));
                    check(receiver.verify(headers, exchange.getRequestMethod(), JobRequestSignature.requestTarget(exchange.getRequestURI()))
                            && receiver.matchesBody(headers, body), "instance routing preserves auth signature and payload");
                    String route = exchange.getRequestURI().getPath(); count.incrementAndGet(); paths.merge(route, 1, Integer::sum);
                    JsonNode request = JSON.readTree(body);
                    Map<String, Object> response = new LinkedHashMap<>(); response.put("code", unavailable ? 503 : 200);
                    if (route.endsWith("/business/register")) response.put("data", Map.of("jobId", 1, "executeNo", request.path("executeNo").asText()));
                    byte[] bytes = JSON.writeValueAsBytes(response);
                    exchange.getResponseHeaders().set("Content-Type", "application/json; charset=UTF-8");
                    exchange.sendResponseHeaders(unavailable ? 503 : 200, bytes.length); exchange.getResponseBody().write(bytes);
                } catch (Throwable error) { failure.compareAndSet(null, error); exchange.sendResponseHeaders(500, -1); }
                finally { exchange.close(); }
            });
            server.start();
        }

        private String url() { return "http://127.0.0.1:" + server.getAddress().getPort(); }
        private ServiceInstance instance() { return new DefaultServiceInstance(id, AUTH, "127.0.0.1", server.getAddress().getPort(), false); }
        @Override public void close() { if (!stopped) { stopped = true; server.stop(0); } }
    }
}
