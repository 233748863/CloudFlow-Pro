package com.cloudflow.auth.datasource;

import com.cloudflow.common.core.constant.SecurityConstants;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.datasource.domain.RuntimeDataSourceConfig;
import com.cloudflow.common.datasource.domain.RuntimeDataSourceRegistration;
import com.cloudflow.common.datasource.runtime.DataSourceApplyRequest;
import com.cloudflow.common.datasource.runtime.DataSourceControlSignature;
import com.cloudflow.common.datasource.runtime.DataSourceControlStore;
import com.cloudflow.common.datasource.runtime.DataSourceNetworkPolicy;
import com.cloudflow.common.datasource.runtime.DataSourceRuntimeManager;
import com.cloudflow.common.datasource.runtime.DataSourceRuntimeProperties;
import com.cloudflow.common.job.annotation.JobHandler;
import com.cloudflow.common.job.model.JobResult;
import jakarta.annotation.PreDestroy;
import java.net.URI;
import java.net.http.HttpClient;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cloud.client.ServiceInstance;
import org.springframework.cloud.client.discovery.DiscoveryClient;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

@Slf4j
@Component
public class DataSourceReconciler {
    private final DataSourceRuntimeProperties properties;
    private final DataSourceControlStore store;
    private final DataSourceRuntimeManager runtime;
    private final DataSourceControlSignature signatures;
    private final DiscoveryClient discovery;
    private final RestClient http;
    private final ThreadPoolExecutor executor = new ThreadPoolExecutor(2, 2, 0, TimeUnit.SECONDS,
            new ArrayBlockingQueue<>(100), task -> {
                Thread thread = new Thread(task, "data-source-application");
                thread.setDaemon(true);
                return thread;
            }, new ThreadPoolExecutor.AbortPolicy());

    public DataSourceReconciler(DataSourceRuntimeProperties properties, DataSourceControlStore store,
            DataSourceRuntimeManager runtime, DataSourceControlSignature signatures, DiscoveryClient discovery) {
        this.properties = properties;
        this.store = store;
        this.runtime = runtime;
        this.signatures = signatures;
        this.discovery = discovery;
        HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3))
                .followRedirects(HttpClient.Redirect.NEVER).build();
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(client);
        factory.setReadTimeout(Duration.ofSeconds(20));
        http = RestClient.builder().requestFactory(factory).build();
    }

    public void enqueue(Long configId, int version) {
        try {
            executor.execute(() -> {
                try { broadcast(configId, version); }
                catch (RuntimeException failure) { log.warn("数据源配置{}版本{}等待集中核对补应用", configId, version); }
            });
        } catch (RejectedExecutionException failure) {
            log.warn("数据源配置{}版本{}已保存，等待集中核对处理", configId, version);
        }
    }

    @JobHandler(value = "dataSourceReconcile", desc = "逐实例核对动态数据源并补应用失败或离线版本")
    public JobResult reconcileAll() {
        if (!properties.configured()) return JobResult.success(0, "动态数据源部署未启用，无连接操作");
        int instances = 0;
        int failures = 0;
        long cursor = 0;
        while (true) {
            long afterId = cursor;
            List<RuntimeDataSourceConfig> batch = store.read(mapper -> mapper.scan(store.tenantId(), afterId));
            if (batch.isEmpty()) break;
            for (RuntimeDataSourceConfig config : batch) {
                cursor = config.getConfigId();
                try {
                    Outcome result = broadcast(config.getConfigId(), config.getVersion());
                    instances += result.instances();
                    failures += result.failures();
                } catch (RuntimeException failure) { failures++; }
            }
        }
        String message = "数据源实例核对：已检查" + instances + "个实例，失败或离线" + failures + "项";
        return failures == 0 ? JobResult.success(instances, message) : JobResult.failed(message);
    }

    public Outcome broadcast(Long configId, int version) {
        if (!properties.configured()) return new Outcome(0, 0);
        RuntimeDataSourceConfig config = store.read(mapper -> mapper.find(store.tenantId(), configId));
        if (config == null || !Objects.equals(config.getVersion(), version)) return new Outcome(0, 0);
        List<RuntimeDataSourceRegistration> known = store.read(mapper -> mapper.registrations(store.tenantId(), configId));
        Set<String> services = new LinkedHashSet<>(runtime.targets(config));
        known.forEach(result -> services.add(result.getServiceName()));
        int instances = 0;
        int failures = 0;
        for (String service : services) {
            LocalDateTime started = LocalDateTime.now();
            if (!DataSourceNetworkPolicy.SERVICES.contains(service) || !properties.getAllowedServices().contains(service)) {
                failures++;
                continue;
            }
            List<ServiceInstance> discovered;
            try { discovered = discovery.getInstances(service); }
            catch (RuntimeException failure) { failures++; continue; }
            Set<String> online = new HashSet<>();
            if (discovered.isEmpty()) failures++;
            for (ServiceInstance instance : discovered) {
                String key = DataSourceControlSignature.instanceKey(service, instance.getHost(), instance.getPort(), instance.isSecure());
                if (!online.add(key)) continue;
                instances++;
                if (!dispatch(config, service, instance, key)) failures++;
            }
            for (RuntimeDataSourceRegistration registration : known) {
                if (service.equals(registration.getServiceName()) && !online.contains(registration.getInstanceKey())) {
                    unavailable(config, service, registration.getInstanceKey(), "STALE", "INSTANCE_OFFLINE", started);
                }
            }
        }
        return new Outcome(instances, failures);
    }

    private boolean dispatch(RuntimeDataSourceConfig config, String service, ServiceInstance instance, String instanceKey) {
        LocalDateTime started = LocalDateTime.now();
        try {
            store.write(mapper -> {
                RuntimeDataSourceConfig current = mapper.lock(store.tenantId(), config.getConfigId());
                if (current == null || !Objects.equals(current.getVersion(), config.getVersion())) return null;
                boolean exists = mapper.registrations(store.tenantId(), config.getConfigId()).stream()
                        .anyMatch(row -> service.equals(row.getServiceName()) && instanceKey.equals(row.getInstanceKey()));
                if (!exists) {
                    RuntimeDataSourceRegistration pending = new RuntimeDataSourceRegistration();
                    pending.setTenantId(store.tenantId());
                    pending.setConfigId(config.getConfigId());
                    pending.setServiceName(service);
                    pending.setInstanceKey(instanceKey);
                    pending.setAppliedVersion(0);
                    pending.setStatus("STALE");
                    pending.setErrorCode("PENDING");
                    pending.setCheckedTime(LocalDateTime.now());
                    mapper.recordRegistration(pending);
                }
                return null;
            });
            String module = service.equals("cloudflow-auth") ? "auth" : service.substring("cloudflow-service-".length());
            String path = "/inner/" + module + "/data-source/apply";
            URI target = new URI(instance.isSecure() ? "https" : "http", null, instance.getHost(), instance.getPort(), path, null, null);
            DataSourceApplyRequest command = new DataSourceApplyRequest();
            command.setConfigId(config.getConfigId());
            command.setVersion(config.getVersion());
            R<DataSourceRuntimeManager.ApplyResult> response = http.post().uri(target)
                    .headers(headers -> {
                        headers.set(SecurityConstants.INNER_CALL_HEADER, SecurityConstants.INNER_CALL_VALUE);
                        headers.set(SecurityConstants.FROM_SERVICE_HEADER, "cloudflow-auth");
                        signatures.sign(path, instanceKey, command).forEach(headers::set);
                    }).body(command).retrieve().body(new ParameterizedTypeReference<R<DataSourceRuntimeManager.ApplyResult>>() { });
            if (response == null || !response.isSuccess() || response.getData() == null) throw new IllegalStateException();
            DataSourceRuntimeManager.ApplyResult result = response.getData();
            if (!config.getConfigId().equals(result.configId()) || !service.equals(result.serviceName())
                    || !instanceKey.equals(result.instanceKey()) || result.appliedVersion() > config.getVersion()) throw new IllegalStateException();
            boolean persisted = store.read(mapper -> mapper.registrations(store.tenantId(), config.getConfigId())).stream()
                    .anyMatch(row -> service.equals(row.getServiceName()) && instanceKey.equals(row.getInstanceKey())
                            && Objects.equals(row.getAppliedVersion(), result.appliedVersion()) && Objects.equals(row.getStatus(), result.status()));
            if (!persisted) throw new IllegalStateException();
            return !"FAILED".equals(result.status()) && result.appliedVersion() == config.getVersion();
        } catch (Exception failure) {
            unavailable(config, service, instanceKey, "FAILED", "INSTANCE_UNAVAILABLE", started);
            return false;
        }
    }

    private void unavailable(RuntimeDataSourceConfig config, String service, String instance, String status,
            String errorCode, LocalDateTime before) {
        store.write(mapper -> {
            RuntimeDataSourceConfig current = mapper.lock(store.tenantId(), config.getConfigId());
            if (current != null && Objects.equals(current.getVersion(), config.getVersion())) {
                mapper.markUnavailable(store.tenantId(), config.getConfigId(), service, instance, status, errorCode, before, LocalDateTime.now());
            }
            return null;
        });
    }

    @PreDestroy
    public void close() { executor.shutdownNow(); }

    public record Outcome(int instances, int failures) { }
}
