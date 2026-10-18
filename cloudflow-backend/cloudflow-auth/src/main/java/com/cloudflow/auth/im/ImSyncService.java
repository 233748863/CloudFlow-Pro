package com.cloudflow.auth.im;

import com.cloudflow.auth.mapper.ImMapper;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.audit.annotation.HighRiskAction;
import com.cloudflow.common.audit.domain.SysAuditLogEntity;
import com.cloudflow.common.audit.mapper.SysAuditLogMapper;
import com.cloudflow.common.core.domain.PageResult;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.MapperFeature;
import com.fasterxml.jackson.databind.json.JsonMapper;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.HashMap;
import java.util.Objects;
import java.util.Set;
import java.util.Locale;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Service
@RequiredArgsConstructor
public class ImSyncService {
    private static final String PREVIEW = "system:im:sync:preview";
    private static final String LIST = "system:im:sync:list";
    private static final String EMPTY_HASH = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
    private static final Set<String> REMOTE_FAILURES = Set.of("IM_ORG_SCOPE_UNVERIFIED", "IM_ORG_SNAPSHOT_INCOMPLETE",
            "IM_ORG_SNAPSHOT_CHANGED", "IM_PROVIDER_REJECTED", "IM_PROVIDER_UNCERTAIN", "IM_TOKEN_REJECTED", "IM_DISABLED",
            "IM_CONFIGURATION_INVALID", "IM_SECRET_UNAVAILABLE", "IM_PROVIDER_UNSUPPORTED");
    private final ImActors actors;
    private final ImDatabase database;
    private final ImConfigRules rules;
    private final ImOrgProvider provider;
    private final ImLocalOrganizationReader localReader;
    private final ImSyncPlanner planner;
    private final ImOrgSnapshotCodec codec;
    private final SysAuditLogMapper audits;
    private final ImProperties properties;
    private final ObjectMapper json = JsonMapper.builder().enable(JsonParser.Feature.STRICT_DUPLICATE_DETECTION)
            .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS, DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES,
                    DeserializationFeature.FAIL_ON_MISSING_CREATOR_PROPERTIES, DeserializationFeature.FAIL_ON_NULL_FOR_PRIMITIVES)
            .disable(DeserializationFeature.ACCEPT_FLOAT_AS_INT).disable(MapperFeature.ALLOW_COERCION_OF_SCALARS).build();

    @HighRiskAction
    @Audit(name = "预览企业微信组织同步", highRisk = true)
    public ImSyncViews.Report preview(Long configId, ImVersionRequest request) {
        ImActors.Actor actor = actors.management(PREVIEW);
        if (configId == null || configId <= 0 || request == null) throw ImFailure.configuration();
        return preview(actor, configId, request.getVersion(), null);
    }

    ImSyncViews.Report scheduledPreview(ImScheduledClaim claim) {
        return preview(claim.actor(), claim.command().configId(), claim.command().version(), claim);
    }

    private ImSyncViews.Report preview(ImActors.Actor actor, Long configId, Integer version, ImScheduledClaim claim) {
        if (TransactionSynchronizationManager.isActualTransactionActive()) throw ImFailure.orgLocal();
        rules.requireDeployment();
        ImConfigRow config = database.read(actor.tenantId(), mapper -> {
            if (claim != null) return claim.verify(mapper, actors, false);
            actors.verify(mapper, actor, PREVIEW, false);
            ImConfigRow current = mapper.config(actor.tenantId(), configId);
            ImConfigRules.version(current, version);
            requireActive(current);
            return current;
        });
        if (claim != null) {
            ImSyncViews.Report existing = database.read(actor.tenantId(), mapper -> {
                ImSyncRunRow linked = claim.linked(mapper, false);
                if (linked != null) return report(linked, config, 1, 50);
                if (mapper.runningSynchronizations(actor.tenantId()) != 0) throw ImFailure.orgLocal();
                return null;
            });
            if (existing != null) return existing;
        }
        ImConfigRequest.SyncScope scope = rules.readScope(config.getSyncScope());
        ImOrgScope frozen = ImOrgScope.copy(scope);
        Set<String> managedUserIds = database.read(actor.tenantId(), mapper -> managedUsers(
                localReader.read(mapper, actor.tenantId(), configId), frozen.localRootDeptId()));
        WeComCredentials credentials = rules.credentials(config);
        LocalDateTime started = LocalDateTime.now();
        ImOrgSnapshot source;
        try {
            if (!provider.providerType().equals(config.getImType())) throw ImFailure.unsupported();
            source = provider.snapshot(credentials, scope, managedUserIds);
        } catch (ImFailure failure) {
            if (!REMOTE_FAILURES.contains(failure.getReasonCode())) throw failure;
            return failed(actor, config, failure.getReasonCode(), started, claim);
        }
        ImOrgSnapshotCodec.Context expected = ImOrgSnapshotCodec.context(credentials);
        if (source == null) throw ImFailure.orgIncomplete();
        if (source.tenantId() != expected.tenantId() || source.configId() != expected.configId() || source.configVersion() != expected.version()
                || source.agentId() != expected.agentId() || !source.corpId().equals(expected.corpId())
                || source.localRootDeptId() != frozen.localRootDeptId() || !source.roots().equals(frozen.roots())
                || !source.primaryDepartments().equals(frozen.primaryDepartments())) throw ImFailure.orgChanged();
        Set<String> managedKeys = managedUserIds.stream().map(identifier -> identifier.toLowerCase(Locale.ROOT)).collect(Collectors.toSet());
        if (source.outOfScopeMembers().stream().anyMatch(member -> !managedKeys.contains(member.id().toLowerCase(Locale.ROOT)))) throw ImFailure.orgChanged();
        try {
            return database.write(actor.tenantId(), mapper -> {
                ImConfigRow current = recheck(mapper, actor, config, claim);
                if (claim != null) {
                    ImSyncRunRow linked = claim.linked(mapper, true);
                    if (linked != null) return report(linked, current, 1, 50);
                }
                ImLocalOrganization local = localReader.read(mapper, actor.tenantId(), configId);
                if (!managedUserIds.equals(managedUsers(local, frozen.localRootDeptId()))) throw ImFailure.orgChanged();
                ImSyncPreview preview = planner.preview(source, local, codec.localHash(local));
                ImOrgSnapshotCodec.Sealed sealed = codec.encodePreview(preview);
                ImSyncRunRow row = row(actor, config, started);
                row.setStatus("PREVIEWED");
                row.setFullSnapshotFlag(true);
                row.setSnapshotHash(sealed.hash());
                row.setSnapshotEncrypted(sealed.encrypted());
                row.setResultSummary(serialize(preview.summary()));
                persist(mapper, actor, row, "IM_SYNC_PREVIEW");
                if (claim != null) claim.link(mapper, row);
                return ImSyncViews.report(row, current.getVersion(), preview, null, 1, 50);
            });
        } catch (DataAccessException failure) { throw ImFailure.orgPersistence(); }
    }

    public PageResult<ImSyncViews.Header> list(Long configId, int pageNum, int pageSize) {
        ImActors.Actor actor = actors.management(LIST);
        page(pageNum, pageSize);
        if (configId == null || configId <= 0) throw ImFailure.configuration();
        return database.read(actor.tenantId(), mapper -> {
            actors.verify(mapper, actor, LIST, false);
            if (mapper.config(actor.tenantId(), configId) == null) throw ImFailure.notFound();
            List<ImSyncViews.Header> rows = mapper.syncRuns(actor.tenantId(), configId, (long) (pageNum - 1) * pageSize, pageSize)
                    .stream().map(ImSyncViews::header).toList();
            return new PageResult<>(rows, mapper.countSyncRuns(actor.tenantId(), configId), pageNum, pageSize);
        });
    }

    public ImSyncViews.Overview configurations() {
        ImActors.Actor actor = actors.management(LIST);
        return database.read(actor.tenantId(), mapper -> {
            actors.verify(mapper, actor, LIST, false);
            List<ImSyncViews.Configuration> configurations = mapper.configurations(actor.tenantId(), 0, 100).stream()
                    .filter(config -> "WECOM".equals(config.getImType()))
                    .map(config -> new ImSyncViews.Configuration(config.getConfigId(), config.getCorpId(), config.getAgentId(),
                            config.getStatus(), config.getVersion(), rules.readScope(config.getSyncScope()))).toList();
            return new ImSyncViews.Overview(properties.isEnabled(), rules.canConfigure(), rules.reason(), configurations);
        });
    }

    public ImSyncViews.Report report(Long syncRunId, int pageNum, int pageSize) {
        ImActors.Actor actor = actors.management(LIST);
        page(pageNum, pageSize);
        if (syncRunId == null || syncRunId <= 0) throw ImFailure.configuration();
        return database.read(actor.tenantId(), mapper -> {
            actors.verify(mapper, actor, LIST, false);
            ImSyncRunRow row = mapper.syncRun(actor.tenantId(), syncRunId);
            if (row == null) throw ImFailure.orgNotFound();
            ImConfigRow config = mapper.config(actor.tenantId(), row.getConfigId());
            if (config == null) throw ImFailure.notFound();
            return report(row, config, pageNum, pageSize);
        });
    }

    private ImSyncViews.Report report(ImSyncRunRow row, ImConfigRow config, int pageNum, int pageSize) {
            if ("APPLY".equals(row.getMode())) {
                return ImSyncViews.appliedReport(row, config.getVersion(), codec.decodeRun(row), pageNum, pageSize);
            }
            if ("FAILED".equals(row.getStatus()) && Boolean.FALSE.equals(row.getFullSnapshotFlag())
                    && row.getSnapshotEncrypted() == null && EMPTY_HASH.equals(row.getSnapshotHash())) {
                FailureSummary failure = failureSummary(row.getResultSummary());
                return ImSyncViews.report(row, config.getVersion(), null, failure.reasonCode(), pageNum, pageSize);
            }
            if (!"PREVIEWED".equals(row.getStatus()) || !Boolean.TRUE.equals(row.getFullSnapshotFlag()) || !"PREVIEW".equals(row.getMode())) throw ImFailure.orgLocal();
            ImOrgSnapshotCodec.Context context = new ImOrgSnapshotCodec.Context(row.getTenantId(), config.getConfigId(), row.getConfigVersion(), config.getCorpId(), agent(config.getAgentId()));
            ImSyncPreview preview = codec.decodePreview(context, new ImOrgSnapshotCodec.Sealed(row.getSnapshotHash(), row.getSnapshotEncrypted()));
            try {
                if (!Objects.equals(json.readValue(row.getResultSummary(), ImSyncPreview.Summary.class), preview.summary())) throw ImFailure.secret();
            } catch (JsonProcessingException | IllegalArgumentException failure) { throw ImFailure.secret(); }
            return ImSyncViews.report(row, config.getVersion(), preview, null, pageNum, pageSize);
    }

    private ImSyncViews.Report failed(ImActors.Actor actor, ImConfigRow config, String reason, LocalDateTime started, ImScheduledClaim claim) {
        try {
            return database.write(actor.tenantId(), mapper -> {
                ImConfigRow current = recheck(mapper, actor, config, claim);
                if (claim != null) {
                    ImSyncRunRow linked = claim.linked(mapper, true);
                    if (linked != null) return report(linked, current, 1, 50);
                }
                ImSyncRunRow row = row(actor, config, started);
                row.setStatus("FAILED");
                row.setFullSnapshotFlag(false);
                row.setSnapshotHash(EMPTY_HASH);
                row.setResultSummary(serialize(new FailureSummary(reason)));
                persist(mapper, actor, row, "IM_SYNC_PREVIEW_FAILED");
                if (claim != null) claim.link(mapper, row);
                return ImSyncViews.report(row, current.getVersion(), null, reason, 1, 50);
            });
        } catch (DataAccessException failure) { throw ImFailure.orgPersistence(); }
    }

    private ImConfigRow recheck(ImMapper mapper, ImActors.Actor actor, ImConfigRow original, ImScheduledClaim claim) {
        if (claim != null) claim.verify(mapper, actors, true);
        else actors.verify(mapper, actor, PREVIEW, true);
        ImConfigRow current = mapper.lockConfig(actor.tenantId(), original.getConfigId());
        ImConfigRules.version(current, original.getVersion());
        rules.requireDeployment();
        requireActive(current);
        if (!Objects.equals(current.getSyncScope(), original.getSyncScope()) || !Objects.equals(current.getCorpId(), original.getCorpId())
                || !Objects.equals(current.getAgentId(), original.getAgentId())) throw ImFailure.conflict();
        return current;
    }

    private static void requireActive(ImConfigRow config) {
        if (!"WECOM".equals(config.getImType())) throw ImFailure.unsupported();
        if (!"ENABLED".equals(config.getStatus())) throw ImFailure.disabled();
    }

    private static Set<String> managedUsers(ImLocalOrganization local, long rootId) {
        Map<Long, ImLocalOrganization.Department> departments = new HashMap<>();
        for (ImLocalOrganization.Department department : local.departments()) departments.put(department.id(), department);
        Set<Long> within = ImSyncPlanner.localTree(departments, rootId);
        Set<Long> users = local.users().stream().filter(user -> user.deleted() == 0 && user.departmentId() != null && within.contains(user.departmentId()))
                .map(ImLocalOrganization.User::id).collect(Collectors.toSet());
        return local.userMappings().stream().filter(mapping -> "ACTIVE".equals(mapping.status()) && mapping.lastSyncTime() != null && users.contains(mapping.userId()))
                .map(ImLocalOrganization.UserMapping::externalId).collect(Collectors.toUnmodifiableSet());
    }

    private void persist(ImMapper mapper, ImActors.Actor actor, ImSyncRunRow row, String action) {
        if (mapper.insertSyncRun(row) != 1 || row.getSyncRunId() == null) throw ImFailure.orgPersistence();
        SysAuditLogEntity audit = new SysAuditLogEntity();
        audit.setTenantId(actor.tenantId());
        audit.setBizModule("system");
        audit.setAuditName(action);
        audit.setAuditField("im_sync:" + row.getSyncRunId());
        audit.setBeforeVal("");
        audit.setAfterVal("configId=" + row.getConfigId() + ";version=" + row.getConfigVersion() + ";status=" + row.getStatus()
                + ";full=" + row.getFullSnapshotFlag() + ";hash=" + row.getSnapshotHash() + ";summary=" + row.getResultSummary());
        audit.setHighRisk(1);
        audit.setRiskLevel("HIGH");
        audit.setCreateBy(Long.toString(actor.userId()));
        audit.setCreateTime(LocalDateTime.now());
        try { if (audits.insert(audit) != 1) throw ImFailure.audit(); }
        catch (RuntimeException failure) { throw ImFailure.audit(); }
    }

    private static ImSyncRunRow row(ImActors.Actor actor, ImConfigRow config, LocalDateTime started) {
        ImSyncRunRow row = new ImSyncRunRow();
        row.setTenantId(actor.tenantId());
        row.setConfigId(config.getConfigId());
        row.setConfigVersion(config.getVersion());
        row.setMode("PREVIEW");
        row.setRequestedBy(actor.userId());
        row.setStartedTime(started);
        row.setCompletedTime(LocalDateTime.now());
        row.setCreateTime(row.getCompletedTime());
        row.setUpdateTime(row.getCompletedTime());
        row.setCreateBy(Long.toString(actor.userId()));
        row.setUpdateBy(row.getCreateBy());
        return row;
    }

    private String serialize(Object value) {
        try { return json.writeValueAsString(value); }
        catch (JsonProcessingException failure) { throw ImFailure.orgPersistence(); }
    }

    private FailureSummary failureSummary(String value) {
        try {
            FailureSummary summary = json.readValue(value, FailureSummary.class);
            if (summary == null || summary.reasonCode() == null || !REMOTE_FAILURES.contains(summary.reasonCode())) throw ImFailure.secret();
            return summary;
        } catch (JsonProcessingException | IllegalArgumentException failure) { throw ImFailure.secret(); }
    }

    private static long agent(String value) {
        try { return Long.parseLong(value); }
        catch (NumberFormatException failure) { throw ImFailure.secret(); }
    }

    private static void page(int pageNum, int pageSize) {
        if (pageNum < 1 || pageNum > 1000000 || pageSize < 1 || pageSize > 100) throw ImFailure.configuration();
    }

    private record FailureSummary(String reasonCode) { }
}
