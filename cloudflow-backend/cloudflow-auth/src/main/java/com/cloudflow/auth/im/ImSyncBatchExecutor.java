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
import java.util.Objects;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class ImSyncBatchExecutor {
    private static final String RUN = "system:im:sync:run";
    private final ImActors actors;
    private final ImDatabase database;
    private final ImOrganizationMapper writes;
    private final ImConfigRules rules;
    private final ImLocalOrganizationReader reader;
    private final ImSyncPlanner planner;
    private final ImOrgSnapshotCodec codec;
    private final ImOrganizationWriter writer;
    private final SysAuditLogMapper audits;
    private final ObjectMapper json = JsonMapper.builder().enable(JsonParser.Feature.STRICT_DUPLICATE_DETECTION)
            .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS, DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES,
                    DeserializationFeature.FAIL_ON_MISSING_CREATOR_PROPERTIES, DeserializationFeature.FAIL_ON_NULL_FOR_PRIMITIVES)
            .disable(DeserializationFeature.ACCEPT_FLOAT_AS_INT).disable(MapperFeature.ALLOW_COERCION_OF_SCALARS).build();

    ImSyncApplication step(long runId, int version, String previewHash) {
        ImActors.Actor actor = actors.management(RUN);
        return step(actor.tenantId(), runId, version, previewHash, actor, null);
    }

    ImSyncApplication recover(long tenantId, long runId, int version, String previewHash) {
        return step(tenantId, runId, version, previewHash, null, null);
    }

    ImSyncApplication scheduled(ImScheduledClaim claim, long runId, String previewHash) {
        return step(claim.actor().tenantId(), runId, claim.command().version(), previewHash, claim.actor(), claim);
    }

    private ImSyncApplication step(long tenantId, long runId, int version, String previewHash, ImActors.Actor authenticated, ImScheduledClaim claim) {
        if (runId <= 0 || version < 0 || previewHash == null || !previewHash.matches("[a-f0-9]{64}")) throw ImFailure.configuration();
        rules.requireDeployment();
        try {
            return database.exclusive(tenantId, mapper -> {
                if (!Objects.equals(writes.lockTenant(tenantId), tenantId)) throw ImFailure.unauthenticated();
                ImSyncRunRow row = writes.lockRun(tenantId, runId);
                if (row == null) throw ImFailure.orgNotFound();
                ImSyncApplication committed = authenticated == null ? codec.decodeRun(row) : null;
                ImActors.Actor actor = authenticated == null ? new ImActors.Actor(tenantId, committed.confirmedBy(), null) : authenticated;
                if (claim != null) {
                    claim.verify(mapper, actors, true);
                    ImSyncRunRow linked = claim.linked(mapper, true);
                    if (linked == null || !Objects.equals(linked.getSyncRunId(), runId)) throw ImFailure.forbidden();
                } else if (authenticated == null) actors.verifyRecorded(mapper, actor, RUN, true);
                else actors.verify(mapper, actor, RUN, true);
                ImConfigRow config = mapper.lockConfig(tenantId, row.getConfigId());
                ImConfigRules.version(config, version);
                if (!Objects.equals(row.getConfigVersion(), version) || !Objects.equals(row.getSnapshotHash(), previewHash)
                        || !Boolean.TRUE.equals(row.getFullSnapshotFlag())) throw ImFailure.orgLocal();
                if (!"WECOM".equals(config.getImType())) throw ImFailure.unsupported();
                if (!"ENABLED".equals(config.getStatus())) throw ImFailure.disabled();
                rules.requireDeployment();
                ImOrgSnapshotCodec.Context context = ImOrgSnapshotCodec.context(rules.credentials(config));
                ImSyncApplication application = decode(row, context);
                ImOrgScope scope = ImOrgScope.copy(rules.readScope(config.getSyncScope()));
                ImOrgSnapshot source = application.preview().source();
                if (scope.localRootDeptId() != source.localRootDeptId() || !scope.roots().equals(source.roots())
                        || !scope.primaryDepartments().equals(source.primaryDepartments())) throw ImFailure.orgLocal();
                if (application.finished() || application.effectsPending()) return application;
                if (writes.otherRunning(actor.tenantId(), runId) != 0) throw ImFailure.orgLocal();
                if (application.next() == 0) {
                    ImLocalOrganization local = reader.read(mapper, actor.tenantId(), config.getConfigId());
                    if (!planner.preview(source, local, codec.localHash(local)).equals(application.preview())) throw ImFailure.orgLocal();
                }
                ImSyncApplication completed = writer.write(mapper, application.authorize(actor.userId()), actor);
                String previousMode = row.getMode();
                String previousCursor = row.getProgressCursor();
                ImOrgSnapshotCodec.Sealed sealed = codec.encodeApplication(completed);
                row.setMode("APPLY");
                row.setSnapshotEncrypted(sealed.encrypted());
                row.setProgressCursor(sealed.hash());
                row.setResultSummary(serialize(completed.summary()));
                row.setStatus(completed.status());
                row.setCompletedTime(completed.finished() ? LocalDateTime.now() : null);
                row.setUpdateBy(Long.toString(actor.userId()));
                row.setUpdateTime(LocalDateTime.now());
                if (writes.checkpoint(row, previousMode, previousCursor) != 1) throw ImFailure.orgApplyPersistence();
                if ("COMPLETED".equals(completed.status())) mapper.markSynchronized(tenantId, row.getConfigId(), version, row.getCompletedTime());
                audit(row, application.next(), completed.next());
                return completed;
            });
        } catch (DataAccessException failure) { throw ImFailure.orgApplyPersistence(); }
    }

    private ImSyncApplication decode(ImSyncRunRow row, ImOrgSnapshotCodec.Context context) {
        if ("PREVIEW".equals(row.getMode()) && "PREVIEWED".equals(row.getStatus()) && row.getProgressCursor() == null) {
            ImSyncPreview preview = codec.decodePreview(context, new ImOrgSnapshotCodec.Sealed(row.getSnapshotHash(), row.getSnapshotEncrypted()));
            requireSummary(row.getResultSummary(), preview.summary(), ImSyncPreview.Summary.class);
            return ImSyncApplication.start(preview, row.getSnapshotHash());
        }
        if (!"APPLY".equals(row.getMode())) throw ImFailure.orgLocal();
        ImSyncApplication application = codec.decodeRun(row);
        ImOrgSnapshot source = application.preview().source();
        if (source.tenantId() != context.tenantId() || source.configId() != context.configId() || source.configVersion() != context.version()
                || source.agentId() != context.agentId() || !source.corpId().equals(context.corpId())) throw ImFailure.secret();
        return application;
    }

    private void audit(ImSyncRunRow row, int before, int after) {
        SysAuditLogEntity audit = new SysAuditLogEntity();
        audit.setTenantId(row.getTenantId());
        audit.setBizModule("system");
        audit.setAuditName("IM_SYNC_BATCH");
        audit.setAuditField("im_sync:" + row.getSyncRunId());
        audit.setBeforeVal("processed=" + before);
        audit.setAfterVal("processed=" + after + ";status=" + row.getStatus() + ";hash=" + row.getProgressCursor() + ";summary=" + row.getResultSummary());
        audit.setHighRisk(1);
        audit.setRiskLevel("HIGH");
        audit.setCreateBy(row.getUpdateBy());
        audit.setCreateTime(row.getUpdateTime());
        try { if (audits.insert(audit) != 1) throw ImFailure.audit(); }
        catch (RuntimeException failure) { throw ImFailure.audit(); }
    }

    private <Summary> void requireSummary(String value, Summary expected, Class<Summary> type) {
        try { if (!Objects.equals(json.readValue(value, type), expected)) throw ImFailure.secret(); }
        catch (JsonProcessingException | IllegalArgumentException failure) { throw ImFailure.secret(); }
    }

    private String serialize(Object value) {
        try { return json.writeValueAsString(value); }
        catch (JsonProcessingException failure) { throw ImFailure.orgApplyPersistence(); }
    }
}
