package com.cloudflow.common.datasource.runtime;

import com.baomidou.dynamic.datasource.DynamicRoutingDataSource;
import com.cloudflow.common.datasource.domain.RuntimeDataSourceConfig;
import com.cloudflow.common.datasource.domain.RuntimeDataSourceRegistration;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.zaxxer.hikari.HikariDataSource;
import jakarta.annotation.PreDestroy;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

@Slf4j
@Component
public class DataSourceRuntimeManager {
    private final DataSourceRuntimeProperties properties;
    private final DataSourceControlStore store;
    private final DataSourceKeyPolicy keys;
    private final DataSourceNetworkPolicy network;
    private final DataSourcePoolFactory pools;
    private final DataSourceInstanceIdentity identity;
    private final DynamicRoutingDataSource routing;
    private final ObjectMapper json;
    private final Map<Long, ManagedRuntimeDataSource> managed = new ConcurrentHashMap<>();
    private final Map<Long, RuntimeDataSourceConfig> applied = new ConcurrentHashMap<>();
    private final ScheduledExecutorService retirement = Executors.newSingleThreadScheduledExecutor(task -> {
        Thread thread = new Thread(task, "runtime-data-source-retirement");
        thread.setDaemon(true);
        return thread;
    });

    public DataSourceRuntimeManager(DataSourceRuntimeProperties properties, DataSourceControlStore store,
            DataSourceKeyPolicy keys, DataSourceNetworkPolicy network, DataSourcePoolFactory pools,
            DataSourceInstanceIdentity identity, DynamicRoutingDataSource routing, ObjectMapper json) {
        this.properties = properties;
        this.store = store;
        this.keys = keys;
        this.network = network;
        this.pools = pools;
        this.identity = identity;
        this.routing = routing;
        this.json = json;
    }

    public synchronized ApplyResult applyVersion(DataSourceApplyRequest request) {
        if (!properties.configured()) throw DataSourceFailure.disabled();
        if (request == null) throw new DataSourceFailure("INVALID_COMMAND", "缺少数据源应用指令", 400);
        request.validate();
        RuntimeDataSourceConfig snapshot = store.read(mapper -> mapper.find(store.tenantId(), request.getConfigId()));
        requireVersion(snapshot, request);
        String instance = identity.key();
        try {
            keys.validate(snapshot.getDsKey(), snapshot.getConfigId());
            List<String> targets = targets(snapshot);
            network.validateServices(targets);
            boolean active = "ENABLED".equals(snapshot.getStatus()) && targets.contains(identity.service());
            if (!"ENABLED".equals(snapshot.getStatus()) && !"DISABLED".equals(snapshot.getStatus())) {
                throw new DataSourceFailure("INVALID_STATUS", "数据源配置状态不合法", 409);
            }
            ManagedRuntimeDataSource route = route(snapshot);
            synchronized (route) {
                ManagedRuntimeDataSource.State previous = route.state();
                if (previous.version() > request.getVersion()) throw DataSourceFailure.conflict();
                boolean unchanged = previous.version() == request.getVersion()
                        && active == (previous.pool() != null && !previous.pool().isClosed())
                        && applied.containsKey(snapshot.getConfigId()) && sameConfig(applied.get(snapshot.getConfigId()), snapshot);
                HikariDataSource candidate = unchanged ? previous.pool() : active ? pools.createVerified(snapshot) : null;
                ManagedRuntimeDataSource.State replacement = new ManagedRuntimeDataSource.State(candidate, request.getVersion());
                try {
                    store.write(mapper -> {
                        RuntimeDataSourceConfig current = mapper.lock(store.tenantId(), snapshot.getConfigId());
                        requireVersion(current, request);
                        if (!sameConfig(snapshot, current)) throw DataSourceFailure.conflict();
                        route.exchange(replacement);
                        RuntimeDataSourceRegistration result = registration(snapshot.getConfigId(), instance,
                                replacement.version(), active ? "ACTIVE" : "DISABLED", null);
                        if (mapper.recordRegistration(result) < 1) throw new DataSourceFailure("REGISTRATION_FAILED", "实例应用结果保存失败", 503);
                        return null;
                    });
                } catch (RuntimeException failure) {
                    route.exchange(previous);
                    if (candidate != null && candidate != previous.pool()) candidate.close();
                    throw failure;
                }
                applied.put(snapshot.getConfigId(), snapshot);
                route.retire(previous);
                return new ApplyResult(snapshot.getConfigId(), identity.service(), instance, replacement.version(),
                        active ? "ACTIVE" : "DISABLED", null);
            }
        } catch (DataSourceFailure failure) {
            return failure(snapshot, instance, request, failure.getErrorCode());
        } catch (RuntimeException failure) {
            return failure(snapshot, instance, request, "APPLICATION_FAILED");
        }
    }

    @EventListener(ApplicationReadyEvent.class)
    public void restoreOnStartup() {
        if (!properties.configured()) return;
        long cursor = 0;
        try {
            while (true) {
                long afterId = cursor;
                List<RuntimeDataSourceConfig> batch = store.read(mapper -> mapper.scan(store.tenantId(), afterId));
                if (batch.isEmpty()) return;
                for (RuntimeDataSourceConfig config : batch) {
                    cursor = config.getConfigId();
                    if (!targets(config).contains(identity.service())) continue;
                    DataSourceApplyRequest request = new DataSourceApplyRequest();
                    request.setConfigId(config.getConfigId());
                    request.setVersion(config.getVersion());
                    ApplyResult result = applyVersion(request);
                    log.info("运行时数据源启动恢复：configId={}, version={}, status={}", result.configId(), result.appliedVersion(), result.status());
                }
            }
        } catch (RuntimeException failure) {
            log.warn("运行时数据源启动恢复暂不可用，等待集中核对补应用");
        }
    }

    public List<String> targets(RuntimeDataSourceConfig config) {
        try {
            List<String> targets = json.readValue(config.getTargetServices(), new TypeReference<List<String>>() { });
            if (targets == null) throw new IllegalArgumentException();
            return targets;
        } catch (Exception failure) { throw new DataSourceFailure("INVALID_TARGETS", "数据源目标服务配置不合法", 409); }
    }

    private ManagedRuntimeDataSource route(RuntimeDataSourceConfig config) {
        synchronized (routing) {
            keys.validate(config.getDsKey(), config.getConfigId());
            ManagedRuntimeDataSource existing = managed.get(config.getConfigId());
            if (existing != null) {
                if (routing.getDataSources().get(config.getDsKey()) != existing) {
                    throw new DataSourceFailure("ROUTING_CHANGED", "数据源路由已由部署配置更改", 409);
                }
                return existing;
            }
            ManagedRuntimeDataSource created = new ManagedRuntimeDataSource(config.getConfigId(), retirement);
            routing.addDataSource(config.getDsKey(), created);
            managed.put(config.getConfigId(), created);
            return created;
        }
    }

    private ApplyResult failure(RuntimeDataSourceConfig snapshot, String instance, DataSourceApplyRequest request, String errorCode) {
        ManagedRuntimeDataSource existing = managed.get(snapshot.getConfigId());
        int actual = existing == null ? 0 : existing.state().version();
        store.write(mapper -> {
            RuntimeDataSourceConfig current = mapper.lock(store.tenantId(), snapshot.getConfigId());
            requireVersion(current, request);
            if (mapper.recordRegistration(registration(snapshot.getConfigId(), instance, actual, "FAILED", errorCode)) < 1) {
                throw new DataSourceFailure("REGISTRATION_FAILED", "实例应用结果保存失败", 503);
            }
            return null;
        });
        return new ApplyResult(snapshot.getConfigId(), identity.service(), instance, actual, "FAILED", errorCode);
    }

    private RuntimeDataSourceRegistration registration(Long configId, String instance, int version, String status, String errorCode) {
        RuntimeDataSourceRegistration result = new RuntimeDataSourceRegistration();
        result.setTenantId(store.tenantId());
        result.setConfigId(configId);
        result.setServiceName(identity.service());
        result.setInstanceKey(instance);
        result.setAppliedVersion(version);
        result.setStatus(status);
        result.setErrorCode(errorCode);
        result.setCheckedTime(LocalDateTime.now());
        return result;
    }

    private static void requireVersion(RuntimeDataSourceConfig config, DataSourceApplyRequest request) {
        if (config == null) throw new DataSourceFailure("CONFIG_NOT_FOUND", "数据源配置不存在", 404);
        if (!Objects.equals(config.getVersion(), request.getVersion())) throw DataSourceFailure.conflict();
    }

    private static boolean sameConfig(RuntimeDataSourceConfig expected, RuntimeDataSourceConfig actual) {
        return Objects.equals(expected.getDsKey(), actual.getDsKey()) && Objects.equals(expected.getUrl(), actual.getUrl())
                && Objects.equals(expected.getUsername(), actual.getUsername())
                && Objects.equals(expected.getPasswordEncrypted(), actual.getPasswordEncrypted())
                && Objects.equals(expected.getDriverClass(), actual.getDriverClass())
                && Objects.equals(expected.getInitSize(), actual.getInitSize())
                && Objects.equals(expected.getMaxActive(), actual.getMaxActive())
                && Objects.equals(expected.getTargetServices(), actual.getTargetServices())
                && Objects.equals(expected.getStatus(), actual.getStatus());
    }

    @PreDestroy
    public synchronized void close() {
        for (ManagedRuntimeDataSource source : managed.values()) source.close();
        retirement.shutdownNow();
    }

    public record ApplyResult(Long configId, String serviceName, String instanceKey, int appliedVersion,
            String status, String errorCode) { }
}
