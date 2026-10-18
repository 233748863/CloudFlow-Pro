package com.cloudflow.auth.datasource;

import com.cloudflow.auth.platform.PlatformAccessService;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.audit.annotation.HighRiskAction;
import com.cloudflow.common.audit.domain.SysAuditLogEntity;
import com.cloudflow.common.audit.mapper.SysAuditLogMapper;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.datasource.domain.RuntimeDataSourceConfig;
import com.cloudflow.common.datasource.runtime.DataSourceControlStore;
import com.cloudflow.common.datasource.runtime.DataSourceFailure;
import com.cloudflow.common.datasource.runtime.DataSourceKeyPolicy;
import com.cloudflow.common.datasource.runtime.DataSourceNetworkPolicy;
import com.cloudflow.common.datasource.runtime.DataSourcePoolFactory;
import com.cloudflow.common.datasource.runtime.DataSourceRuntimeManager;
import com.cloudflow.common.datasource.runtime.DataSourceRuntimeProperties;
import com.cloudflow.common.datasource.runtime.DataSourceSecretCipher;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Objects;
import java.util.concurrent.TimeUnit;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class DataSourceManagementService {
    private final PlatformAccessService access;
    private final DataSourceRuntimeProperties properties;
    private final DataSourceControlStore store;
    private final DataSourceNetworkPolicy network;
    private final DataSourceKeyPolicy keys;
    private final DataSourceSecretCipher cipher;
    private final DataSourcePoolFactory pools;
    private final DataSourceRuntimeManager runtime;
    private final DataSourceReconciler reconciler;
    private final SysAuditLogMapper audits;
    private final ObjectMapper json;

    @Audit(name = "读取平台数据源配置")
    public DataSourceViews.Overview list(int pageNum, int pageSize) {
        PlatformAccessService.Operator operator = access.requireRecent("system:data-source:list");
        if (pageNum < 1 || pageNum > 1000000 || pageSize < 1 || pageSize > 100) {
            throw new DataSourceFailure("INVALID_PAGE", "数据源分页参数不合法", 400);
        }
        if (!properties.configured()) {
            store.recordAudit(operator.tenantId(), () -> audit(operator, "LIST", null, "", "FEATURE_DISABLED", false));
            return new DataSourceViews.Overview(false, false, "动态数据源尚未完成部署配置，功能已停用", List.of(),
                    new PageResult<>(List.of(), 0, pageNum, pageSize));
        }
        requireFeature(operator);
        DataSourceViews.Overview result = store.read(mapper -> {
            List<DataSourceViews.Config> rows = mapper.page(store.tenantId(), (long) (pageNum - 1) * pageSize, pageSize)
                    .stream().map(this::view).toList();
            return new DataSourceViews.Overview(true, pools.accountVerificationReady(),
                    pools.accountVerificationReady() ? "保存配置后按实例分别应用；默认业务数据库不受影响"
                            : "只读账号权限核验尚未启用，数据源连接操作已停用",
                    properties.getAllowedServices().stream().filter(DataSourceNetworkPolicy.SERVICES::contains).sorted().toList(),
                    new PageResult<>(rows, mapper.count(store.tenantId()), pageNum, pageSize));
        });
        store.write(mapper -> { audit(operator, "LIST", null, "", "rows=" + result.page().getRows().size(), false); return null; });
        return result;
    }

    @Audit(name = "读取平台数据源详情")
    public DataSourceViews.Config detail(Long configId) {
        PlatformAccessService.Operator operator = require("system:data-source:list");
        RuntimeDataSourceConfig config = find(configId);
        DataSourceViews.Config result = view(config);
        store.write(mapper -> { audit(operator, "DETAIL", configId, "", state(config), false); return null; });
        return result;
    }

    @HighRiskAction
    @Audit(name = "新增平台数据源配置", highRisk = true)
    public DataSourceViews.Config create(DataSourceSaveRequest request) {
        PlatformAccessService.Operator operator = require("system:data-source:manage");
        if (request.getConfigId() != null || request.getVersion() != null) {
            throw new DataSourceFailure("INVALID_CREATE", "新增配置不能指定编号或版本", 400);
        }
        validateSave(request, null);
        RuntimeDataSourceConfig config = new RuntimeDataSourceConfig();
        config.setTenantId(operator.tenantId());
        config.setDsKey(request.getDsKey());
        config.setDriverClass("com.mysql.cj.jdbc.Driver");
        config.setInitSize(0);
        config.setDeleted(0);
        config.setVersion(0);
        config.setStatus("DISABLED");
        config.setPasswordEncrypted("");
        assign(config, request, operator);
        config.setCreateBy(String.valueOf(operator.userId()));
        config.setCreateTime(config.getUpdateTime());
        try {
            store.write(mapper -> {
                if (mapper.countKey(store.tenantId(), config.getDsKey()) != 0) throw duplicateKey();
                if (mapper.insertConfig(config) != 1) throw new DataSourceFailure("SAVE_FAILED", "数据源配置保存失败", 503);
                audit(operator, "CREATE", config.getConfigId(), "", state(config), true);
                return null;
            });
        } catch (DuplicateKeyException failure) { throw duplicateKey(); }
        return view(config);
    }

    @HighRiskAction
    @Audit(name = "修改平台数据源配置", highRisk = true)
    public DataSourceViews.Config update(DataSourceSaveRequest request) {
        PlatformAccessService.Operator operator = require("system:data-source:manage");
        if (request.getConfigId() == null || request.getVersion() == null) throw DataSourceFailure.conflict();
        validateSave(request, request.getConfigId());
        RuntimeDataSourceConfig updated = store.write(mapper -> {
            RuntimeDataSourceConfig current = mapper.lock(store.tenantId(), request.getConfigId());
            requireVersion(current, request.getVersion());
            if (!current.getDsKey().equals(request.getDsKey())) {
                throw new DataSourceFailure("IMMUTABLE_KEY", "配置创建后不能更改注册键，请另建配置", 409);
            }
            String before = state(current);
            assign(current, request, operator);
            if (mapper.updateConfig(current) != 1) throw DataSourceFailure.conflict();
            current.setVersion(Math.addExact(current.getVersion(), 1));
            audit(operator, "UPDATE", current.getConfigId(), before, state(current), true);
            return current;
        });
        reconciler.enqueue(updated.getConfigId(), updated.getVersion());
        return view(updated);
    }

    @HighRiskAction
    @Audit(name = "测试平台数据源连接", highRisk = true)
    public DataSourceViews.TestResult testConnection(Long configId, DataSourceVersionRequest request) {
        PlatformAccessService.Operator operator = require("system:data-source:test");
        RuntimeDataSourceConfig config = find(configId);
        requireVersion(config, request.getVersion());
        long started = System.nanoTime();
        DataSourceViews.TestResult result;
        try {
            pools.testVerified(config);
            result = new DataSourceViews.TestResult(true, null, "固定连接测试通过", elapsed(started));
        } catch (DataSourceFailure failure) {
            result = new DataSourceViews.TestResult(false, failure.getErrorCode(), failure.getMessage(), elapsed(started));
        }
        DataSourceViews.TestResult tested = result;
        store.write(mapper -> {
            RuntimeDataSourceConfig current = mapper.lock(store.tenantId(), configId);
            requireVersion(current, request.getVersion());
            audit(operator, "TEST", configId, state(config), tested.successful() ? "CONNECTION_VERIFIED" : tested.errorCode(), true);
            return null;
        });
        return result;
    }

    @HighRiskAction
    @Audit(name = "注册平台数据源版本", highRisk = true)
    public DataSourceViews.Config register(Long configId, DataSourceActivationRequest request) {
        PlatformAccessService.Operator operator = require("system:data-source:register");
        if (!pools.accountVerificationReady()) throw new DataSourceFailure("ACCOUNT_VERIFICATION_UNAVAILABLE",
                "只读账号权限核验尚未启用，数据源连接操作已停用", 503);
        network.validateServices(request.getTargetServices());
        return activation(configId, request, operator, true);
    }

    @HighRiskAction
    @Audit(name = "停用平台数据源版本", highRisk = true)
    public DataSourceViews.Config disable(Long configId, DataSourceActivationRequest request) {
        PlatformAccessService.Operator operator = require("system:data-source:register");
        if (request.getTargetServices() != null) throw new DataSourceFailure("INVALID_DISABLE", "停用指令不接受目标服务变更", 400);
        return activation(configId, request, operator, false);
    }

    private DataSourceViews.Config activation(Long configId, DataSourceActivationRequest request,
            PlatformAccessService.Operator operator, boolean enabled) {
        RuntimeDataSourceConfig changed = store.write(mapper -> {
            RuntimeDataSourceConfig current = mapper.lock(store.tenantId(), configId);
            requireVersion(current, request.getVersion());
            if (!current.getDsKey().equals(request.getConfirmation())) {
                throw new DataSourceFailure("CONFIRMATION_REQUIRED", "请准确输入注册键进行二次确认", 400);
            }
            if (enabled) {
                keys.validate(current.getDsKey(), configId);
                network.validate(current.getUrl(), current.getUsername());
                cipher.decrypt(current.getPasswordEncrypted());
            }
            String before = state(current);
            String services = enabled ? targetJson(request.getTargetServices()) : current.getTargetServices();
            String desired = enabled ? "ENABLED" : "DISABLED";
            if (mapper.updateActivation(store.tenantId(), configId, request.getVersion(), desired, services,
                    String.valueOf(operator.userId()), LocalDateTime.now()) != 1) throw DataSourceFailure.conflict();
            current.setTargetServices(services);
            current.setStatus(desired);
            current.setVersion(Math.addExact(current.getVersion(), 1));
            current.setUpdateTime(LocalDateTime.now());
            audit(operator, enabled ? "REGISTER" : "DISABLE", configId, before, state(current), true);
            return current;
        });
        reconciler.enqueue(changed.getConfigId(), changed.getVersion());
        return view(changed);
    }

    private void validateSave(DataSourceSaveRequest request, Long configId) {
        cipher.requireKey();
        keys.validate(request.getDsKey(), configId);
        network.validate(request.getUrl(), request.getUsername());
        network.validateServices(request.getTargetServices());
        if (request.getMaxActive() == null || request.getMaxActive() < 1 || request.getMaxActive() > 20
                || request.getSecretAction() == null || request.getConfigName() == null || request.getConfigName().isBlank()) {
            throw new DataSourceFailure("INVALID_CONFIG", "数据源配置不合法", 400);
        }
    }

    private void assign(RuntimeDataSourceConfig config, DataSourceSaveRequest request, PlatformAccessService.Operator operator) {
        if (request.getSecretAction() != DataSourceSaveRequest.SecretAction.REPLACE && request.getPassword() != null
                && !request.getPassword().isEmpty()) {
            throw new DataSourceFailure("AMBIGUOUS_SECRET", "只有替换密码操作可以提交新密码", 400);
        }
        switch (request.getSecretAction()) {
            case REPLACE -> config.setPasswordEncrypted(cipher.encrypt(request.getPassword()));
            case KEEP -> {
                if (config.getConfigId() == null) throw new DataSourceFailure("MISSING_SECRET", "新增配置请选择替换或清除密码", 400);
            }
            case CLEAR -> {
                if (!"DISABLED".equals(config.getStatus())) throw new DataSourceFailure("ACTIVE_SECRET_CLEAR", "请先停用配置再清除密码", 409);
                config.setPasswordEncrypted("");
            }
        }
        config.setConfigName(request.getConfigName().trim());
        config.setUrl(request.getUrl());
        config.setUsername(request.getUsername());
        config.setMaxActive(request.getMaxActive());
        config.setTargetServices(targetJson(request.getTargetServices()));
        config.setRemark(request.getRemark());
        config.setUpdateBy(String.valueOf(operator.userId()));
        config.setUpdateTime(LocalDateTime.now());
    }

    private DataSourceViews.Config view(RuntimeDataSourceConfig config) {
        List<DataSourceViews.Instance> instances = store.read(mapper -> mapper.registrations(store.tenantId(), config.getConfigId()))
                .stream().map(row -> new DataSourceViews.Instance(row.getServiceName(), row.getInstanceKey(),
                        row.getAppliedVersion(), row.getStatus(), row.getErrorCode(), row.getCheckedTime())).toList();
        return new DataSourceViews.Config(config.getConfigId(), config.getConfigName(), config.getDsKey(), config.getUrl(),
                config.getUsername(), config.getPasswordEncrypted() != null && !config.getPasswordEncrypted().isBlank(),
                config.getInitSize(), config.getMaxActive(), runtime.targets(config), config.getStatus(), config.getRemark(),
                config.getVersion(), config.getUpdateTime(), instances);
    }

    private RuntimeDataSourceConfig find(Long configId) {
        if (configId == null || configId <= 0) throw new DataSourceFailure("CONFIG_NOT_FOUND", "数据源配置不存在", 404);
        RuntimeDataSourceConfig config = store.read(mapper -> mapper.find(store.tenantId(), configId));
        if (config == null) throw new DataSourceFailure("CONFIG_NOT_FOUND", "数据源配置不存在", 404);
        return config;
    }

    private PlatformAccessService.Operator require(String permission) {
        PlatformAccessService.Operator operator = access.requireRecent(permission);
        requireFeature(operator);
        return operator;
    }

    private void requireFeature(PlatformAccessService.Operator operator) {
        if (!properties.configured()) throw DataSourceFailure.disabled();
        if (!operator.tenantId().equals(properties.getManagementTenantId())) {
            throw new DataSourceFailure("MANAGEMENT_TENANT_MISMATCH", "平台管理租户与数据源部署配置不一致", 403);
        }
    }

    private void audit(PlatformAccessService.Operator operator, String action, Long configId, String before, String after, boolean highRisk) {
        SysAuditLogEntity entry = new SysAuditLogEntity();
        entry.setTenantId(operator.tenantId());
        entry.setBizModule("system");
        entry.setAuditName("DATA_SOURCE_" + action);
        entry.setAuditField(configId == null ? "data_source_catalogue" : "data_source:" + configId);
        entry.setBeforeVal(before);
        entry.setAfterVal(after);
        entry.setHighRisk(highRisk ? 1 : 0);
        entry.setRiskLevel(highRisk ? "HIGH" : "LOW");
        entry.setCreateBy(String.valueOf(operator.userId()));
        entry.setCreateTime(LocalDateTime.now());
        if (audits.insert(entry) != 1) throw new DataSourceFailure("AUDIT_FAILED", "数据源操作审计保存失败", 503);
    }

    private String targetJson(List<String> services) {
        try { return json.writeValueAsString(services.stream().sorted().toList()); }
        catch (JsonProcessingException failure) { throw new DataSourceFailure("INVALID_TARGETS", "目标服务配置不合法", 400); }
    }

    private static void requireVersion(RuntimeDataSourceConfig config, Integer version) {
        if (config == null) throw new DataSourceFailure("CONFIG_NOT_FOUND", "数据源配置不存在", 404);
        if (version == null || version < 0 || !Objects.equals(config.getVersion(), version) || version == Integer.MAX_VALUE) {
            throw DataSourceFailure.conflict();
        }
    }

    private static String state(RuntimeDataSourceConfig config) { return "version=" + config.getVersion() + ";status=" + config.getStatus(); }
    private static long elapsed(long started) { return TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started); }
    private static DataSourceFailure duplicateKey() { return new DataSourceFailure("DUPLICATE_KEY", "数据源注册键已存在", 409); }
}
