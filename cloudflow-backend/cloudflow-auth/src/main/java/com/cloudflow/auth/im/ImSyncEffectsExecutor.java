package com.cloudflow.auth.im;

import com.cloudflow.auth.mapper.ImOrganizationMapper;
import com.cloudflow.common.audit.domain.SysAuditLogEntity;
import com.cloudflow.common.audit.mapper.SysAuditLogMapper;
import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.MapperFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.json.JsonMapper;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Objects;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class ImSyncEffectsExecutor {
    private final ImDatabase database;
    private final ImOrganizationMapper writes;
    private final ImOrgSnapshotCodec codec;
    private final ImSecurityEffects effects;
    private final SysAuditLogMapper audits;
    private final ObjectMapper json = JsonMapper.builder().enable(JsonParser.Feature.STRICT_DUPLICATE_DETECTION)
            .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS, DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES,
                    DeserializationFeature.FAIL_ON_MISSING_CREATOR_PROPERTIES, DeserializationFeature.FAIL_ON_NULL_FOR_PRIMITIVES)
            .disable(DeserializationFeature.ACCEPT_FLOAT_AS_INT).disable(MapperFeature.ALLOW_COERCION_OF_SCALARS).build();

    ImSyncApplication recover(long tenantId, long runId) {
        if (tenantId <= 0 || runId <= 0) throw ImFailure.orgLocal();
        try {
            return database.exclusive(tenantId, mapper -> {
                if (!Objects.equals(writes.lockRecoveryTenant(tenantId), tenantId)) throw ImFailure.orgNotFound();
                ImSyncRunRow row = writes.lockRun(tenantId, runId);
                if (row == null) throw ImFailure.orgNotFound();
                ImSyncApplication application = codec.decodeRun(row);
                if (application.finished()) return application;
                ImSyncApplication completed;
                boolean superseded = false;
                if (application.effectsPending()) {
                    List<Long> users = application.pendingUsers().subList(0, Math.min(ImSyncApplication.BATCH_SIZE, application.pendingUsers().size()));
                    effects.users(tenantId, users);
                    if (users.size() == application.pendingUsers().size()) effects.finish(tenantId);
                    completed = application.effectsApplied(users);
                } else {
                    ImConfigRow config = mapper.lockConfig(tenantId, row.getConfigId());
                    if (config != null && Objects.equals(config.getVersion(), row.getConfigVersion())) return application;
                    completed = application.superseded();
                    superseded = true;
                }
                String previousCursor = row.getProgressCursor();
                ImOrgSnapshotCodec.Sealed sealed = codec.encodeApplication(completed);
                row.setSnapshotEncrypted(sealed.encrypted());
                row.setProgressCursor(sealed.hash());
                row.setResultSummary(serialize(completed.summary()));
                row.setStatus(completed.status());
                row.setCompletedTime(completed.finished() ? LocalDateTime.now() : null);
                row.setUpdateBy("im-security-recovery");
                row.setUpdateTime(LocalDateTime.now());
                if (writes.checkpoint(row, "APPLY", previousCursor) != 1) throw ImFailure.orgApplyPersistence();
                if ("COMPLETED".equals(completed.status())) mapper.markSynchronized(tenantId, row.getConfigId(), row.getConfigVersion(), row.getCompletedTime());
                audit(row, superseded ? application.next() : application.pendingUsers().size(),
                        superseded ? completed.next() : completed.pendingUsers().size(), superseded);
                return completed;
            });
        } catch (ImSyncBudget.Exhausted failure) { throw failure; }
        catch (ImFailure failure) { throw failure; }
        catch (RuntimeException failure) { throw ImFailure.orgEffectsUnavailable(); }
    }

    private void audit(ImSyncRunRow row, int before, int after, boolean superseded) {
        SysAuditLogEntity audit = new SysAuditLogEntity();
        audit.setTenantId(row.getTenantId());
        audit.setBizModule("system");
        audit.setAuditName(superseded ? "IM_SYNC_SUPERSEDED" : "IM_SYNC_SECURITY_RECOVERY");
        audit.setAuditField("im_sync:" + row.getSyncRunId());
        String field = superseded ? "processed=" : "pendingUsers=";
        audit.setBeforeVal(field + before);
        audit.setAfterVal(field + after + ";status=" + row.getStatus() + ";hash=" + row.getProgressCursor());
        audit.setHighRisk(1);
        audit.setRiskLevel("HIGH");
        audit.setCreateBy(row.getUpdateBy());
        audit.setCreateTime(row.getUpdateTime());
        if (audits.insert(audit) != 1) throw ImFailure.audit();
    }

    private String serialize(Object value) {
        try { return json.writeValueAsString(value); }
        catch (JsonProcessingException failure) { throw ImFailure.orgApplyPersistence(); }
    }
}
