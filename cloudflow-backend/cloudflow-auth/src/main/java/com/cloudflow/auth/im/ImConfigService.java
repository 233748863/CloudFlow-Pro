package com.cloudflow.auth.im;

import com.cloudflow.auth.mapper.ImMapper;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.audit.annotation.HighRiskAction;
import com.cloudflow.common.audit.domain.SysAuditLogEntity;
import com.cloudflow.common.audit.mapper.SysAuditLogMapper;
import com.cloudflow.common.core.domain.PageResult;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDateTime;
import java.util.HexFormat;
import java.util.List;
import java.util.Objects;
import java.util.concurrent.TimeUnit;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class ImConfigService {
    private static final String LIST = "system:im:config:list";
    private static final String MANAGE = "system:im:config:manage";
    private static final String TEST = "system:im:config:test";
    private static final List<ImViews.Provider> PROVIDERS = List.of(new ImViews.Provider("WECOM", "企业微信", true),
            new ImViews.Provider("DINGTALK", "钉钉", false), new ImViews.Provider("FEISHU", "飞书", false));
    private final ImActors actors;
    private final ImDatabase database;
    private final ImConfigRules rules;
    private final ImProperties properties;
    private final ImConnectionProbe probe;
    private final SysAuditLogMapper audits;

    public ImViews.Overview list(int pageNum, int pageSize) {
        ImActors.Actor actor = actors.management(LIST);
        if (pageNum < 1 || pageNum > 1000000 || pageSize < 1 || pageSize > 100) throw ImFailure.configuration();
        return database.read(actor.tenantId(), mapper -> {
            actors.verify(mapper, actor, LIST, false);
            List<ImViews.Config> rows = mapper.configurations(actor.tenantId(), (long) (pageNum - 1) * pageSize, pageSize)
                    .stream().map(this::view).toList();
            return new ImViews.Overview(properties.isEnabled(), rules.canConfigure(), rules.reason(), PROVIDERS,
                    new PageResult<>(rows, mapper.countConfigurations(actor.tenantId()), pageNum, pageSize));
        });
    }

    @HighRiskAction
    @Audit(name = "新增企业通信配置", highRisk = true)
    public ImViews.Config create(ImConfigRequest request) {
        ImActors.Actor actor = actors.management(MANAGE);
        rules.request(request, true);
        try {
            return database.write(actor.tenantId(), mapper -> {
                actors.verify(mapper, actor, MANAGE, true);
                authorizeSchedule(mapper, actor, request);
                if (mapper.countProvider(actor.tenantId(), request.getImType()) != 0) throw ImFailure.duplicate();
                department(mapper, actor, request);
                ImConfigRow row = new ImConfigRow();
                row.setTenantId(actor.tenantId());
                row.setImType(request.getImType());
                row.setVersion(0);
                row.setDeleted(0);
                rules.assign(row, request);
                row.setCreateBy(Long.toString(actor.userId()));
                row.setUpdateBy(row.getCreateBy());
                row.setCreateTime(LocalDateTime.now());
                row.setUpdateTime(row.getCreateTime());
                if (mapper.insertConfig(row) != 1 || row.getConfigId() == null) throw ImFailure.persistence();
                ImSyncSchedules.synchronize(mapper, row);
                audit(actor, "CREATE", row, "", state(row) + actions(request));
                return view(row);
            });
        } catch (DuplicateKeyException failure) { throw ImFailure.duplicate(); }
    }

    @HighRiskAction
    @Audit(name = "修改企业通信配置", highRisk = true)
    public ImViews.Config update(ImConfigRequest request) {
        ImActors.Actor actor = actors.management(MANAGE);
        rules.request(request, false);
        return database.write(actor.tenantId(), mapper -> {
            actors.verify(mapper, actor, MANAGE, true);
            authorizeSchedule(mapper, actor, request);
            ImConfigRow row = mapper.lockConfig(actor.tenantId(), request.getConfigId());
            ImConfigRules.version(row, request.getVersion());
            if (!Objects.equals(row.getImType(), request.getImType())) throw ImFailure.immutableIdentity();
            if ((!Objects.equals(row.getCorpId(), request.getCorpId()) || !Objects.equals(row.getAgentId(), request.getAgentId()))
                    && mapper.references(actor.tenantId(), row.getConfigId()) > 0) throw ImFailure.immutableIdentity();
            department(mapper, actor, request);
            String before = state(row);
            rules.assign(row, request);
            row.setUpdateBy(Long.toString(actor.userId()));
            row.setUpdateTime(LocalDateTime.now());
            if (mapper.updateConfig(row) != 1) throw ImFailure.conflict();
            row.setVersion(Math.addExact(row.getVersion(), 1));
            ImSyncSchedules.synchronize(mapper, row);
            audit(actor, "UPDATE", row, before, state(row) + actions(request));
            return view(row);
        });
    }

    @HighRiskAction
    @Audit(name = "测试企业通信连接", highRisk = true)
    public ImViews.TestResult testConnection(Long configId, ImVersionRequest request) {
        ImActors.Actor actor = actors.management(TEST);
        if (configId == null || configId <= 0 || request == null) throw ImFailure.configuration();
        rules.requireDeployment();
        ImConfigRow row = database.read(actor.tenantId(), mapper -> {
            actors.verify(mapper, actor, TEST, false);
            ImConfigRow current = mapper.config(actor.tenantId(), configId);
            ImConfigRules.version(current, request.getVersion());
            return current;
        });
        WeComCredentials credentials = rules.credentials(row);
        long started = System.nanoTime();
        ImViews.TestResult result;
        try {
            probe.test(credentials);
            result = new ImViews.TestResult(true, "IM_CONNECTION_VERIFIED", "企业微信凭据验证通过",
                    elapsed(started), row.getVersion());
        } catch (ImFailure failure) {
            result = new ImViews.TestResult(false, failure.getReasonCode(), failure.getMessage(), elapsed(started), row.getVersion());
        }
        ImViews.TestResult tested = result;
        return database.write(actor.tenantId(), mapper -> {
            actors.verify(mapper, actor, TEST, true);
            ImConfigRow current = mapper.lockConfig(actor.tenantId(), configId);
            ImConfigRules.version(current, request.getVersion());
            rules.requireDeployment();
            audit(actor, "TEST", current, state(current), tested.reasonCode());
            return tested;
        });
    }

    private void authorizeSchedule(ImMapper mapper, ImActors.Actor actor, ImConfigRequest request) {
        if (Boolean.TRUE.equals(request.getSyncEnabled())) {
            actors.verify(mapper, actor, "system:im:sync:preview", true);
            actors.verify(mapper, actor, "system:im:sync:run", true);
        }
    }

    private ImViews.Config view(ImConfigRow row) {
        return new ImViews.Config(row.getConfigId(), row.getImType(), row.getCorpId(), row.getAgentId(),
                present(row.getAppKeyEncrypted()), present(row.getAppSecretEncrypted()), present(row.getTokenEncrypted()),
                present(row.getAesKeyEncrypted()), row.getCallbackUrl(), rules.expectedCallbackUrl(row.getConfigId()),
                Boolean.TRUE.equals(row.getSyncEnabled()), row.getSyncCron(), Boolean.TRUE.equals(row.getLoginEnabled()),
                Boolean.TRUE.equals(row.getMessageEnabled()), Boolean.TRUE.equals(row.getTodoEnabled()), rules.readScope(row.getSyncScope()),
                row.getLastSyncTime(), row.getStatus(), row.getVersion(), row.getUpdateTime());
    }

    private void department(ImMapper mapper, ImActors.Actor actor, ImConfigRequest request) {
        if (request.getSyncScope() != null && mapper.department(actor.tenantId(), request.getSyncScope().getLocalRootDeptId()) == null) {
            throw ImFailure.configuration();
        }
    }

    private void audit(ImActors.Actor actor, String action, ImConfigRow row, String before, String after) {
        SysAuditLogEntity entry = new SysAuditLogEntity();
        entry.setTenantId(actor.tenantId());
        entry.setBizModule("system");
        entry.setAuditName("IM_CONFIG_" + action);
        entry.setAuditField("im_config:" + row.getConfigId());
        entry.setBeforeVal(before);
        entry.setAfterVal(after);
        entry.setHighRisk(1);
        entry.setRiskLevel("HIGH");
        entry.setCreateBy(Long.toString(actor.userId()));
        entry.setCreateTime(LocalDateTime.now());
        try { if (audits.insert(entry) != 1) throw ImFailure.audit(); }
        catch (RuntimeException failure) { throw ImFailure.audit(); }
    }

    private static String state(ImConfigRow row) {
        return "version=" + row.getVersion() + ";status=" + row.getStatus() + ";sync=" + row.getSyncEnabled()
                + ";login=" + row.getLoginEnabled() + ";message=" + row.getMessageEnabled() + ";todo=" + row.getTodoEnabled()
                + ";corp=" + row.getCorpId() + ";agent=" + row.getAgentId() + ";callback=" + row.getCallbackUrl()
                + ";cron=" + row.getSyncCron() + ";scopeHash=" + scopeHash(row.getSyncScope())
                + ";appKeyConfigured=" + present(row.getAppKeyEncrypted()) + ";appSecretConfigured=" + present(row.getAppSecretEncrypted())
                + ";tokenConfigured=" + present(row.getTokenEncrypted()) + ";aesKeyConfigured=" + present(row.getAesKeyEncrypted());
    }

    private static String scopeHash(String scope) {
        if (scope == null) return "NONE";
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(scope.getBytes(StandardCharsets.UTF_8))); }
        catch (NoSuchAlgorithmException failure) { throw ImFailure.audit(); }
    }

    private static String actions(ImConfigRequest request) {
        return ";appKey=" + request.getAppKey().getAction() + ";appSecret=" + request.getAppSecret().getAction()
                + ";token=" + request.getToken().getAction() + ";aesKey=" + request.getAesKey().getAction();
    }

    private static boolean present(String value) { return value != null && !value.isBlank(); }
    private static long elapsed(long started) { return TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started); }
}
