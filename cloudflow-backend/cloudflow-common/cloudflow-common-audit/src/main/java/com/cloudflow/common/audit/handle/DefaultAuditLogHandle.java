package com.cloudflow.common.audit.handle;

import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.audit.domain.SysAuditLogEntity;
import com.cloudflow.common.audit.mapper.SysAuditLogMapper;
import com.cloudflow.common.audit.support.AuditBizModuleResolver;
import com.cloudflow.common.core.context.UserContext;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.flipkart.zjsonpatch.JsonDiff;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.javers.core.Changes;
import org.javers.core.diff.Change;
import org.javers.core.diff.changetype.PropertyChange;
import org.javers.core.diff.changetype.ValueChange;
import org.springframework.scheduling.annotation.Async;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/** 将一次业务变更的字段与脱敏快照写入本租户审计记录。 */
@Slf4j
@RequiredArgsConstructor
public class DefaultAuditLogHandle implements IAuditLogHandle {
    private final SysAuditLogMapper auditLogMapper;
    private final ObjectMapper objectMapper;
    private final AuditBizModuleResolver auditBizModuleResolver;

    @Override
    public void handle(Audit audit, Changes changes) {
        handle(audit, changes, null, null, null);
    }

    public void handle(Audit audit, Changes changes, Object oldVal, Object newVal) {
        handle(audit, changes, oldVal, newVal, null);
    }

    @Override
    public void handle(Audit audit, Changes changes, Object oldVal, Object newVal, Class<?> sourceClass) {
        if (changes.isEmpty()) return;
        Identity identity = identity(audit);
        if (identity == null) return;
        boolean needsJson = audit.diff() || changes.stream().anyMatch(change -> !(change instanceof ValueChange));
        JsonNode beforeNode = null;
        JsonNode afterNode = null;
        String beforeJson = null;
        String afterJson = null;
        String diffJson = null;
        if (needsJson) {
            try {
                beforeNode = objectMapper.valueToTree(oldVal);
                afterNode = objectMapper.valueToTree(newVal);
                if (audit.diff()) {
                    beforeJson = beforeNode.toString();
                    afterJson = afterNode.toString();
                    diffJson = JsonDiff.asJson(beforeNode, afterNode).toString();
                }
            } catch (RuntimeException failure) {
                comparisonFailed(audit, sourceClass, failure);
                return;
            }
        }
        List<SysAuditLogEntity> entries = new ArrayList<>();
        for (Change change : changes) {
            if (!(change instanceof PropertyChange<?> property)) continue;
            SysAuditLogEntity entry = entry(audit, sourceClass, identity);
            entry.setAuditField(property.getPropertyName());
            if (change instanceof ValueChange value) {
                entry.setBeforeVal(value.getLeft() == null ? null : value.getLeft().toString());
                entry.setAfterVal(value.getRight() == null ? null : value.getRight().toString());
            } else {
                entry.setBeforeVal(propertyJson(beforeNode, property.getPropertyName()));
                entry.setAfterVal(propertyJson(afterNode, property.getPropertyName()));
            }
            entry.setBeforeJson(beforeJson);
            entry.setAfterJson(afterJson);
            entry.setDiffJson(diffJson);
            entries.add(entry);
        }
        if (entries.isEmpty()) {
            SysAuditLogEntity entry = entry(audit, sourceClass, identity);
            entry.setAuditField(oldVal == null ? "CREATED" : newVal == null ? "DELETED" : "STRUCTURE_CHANGED");
            entry.setBeforeVal(beforeNode == null || beforeNode.isNull() ? null : beforeNode.toString());
            entry.setAfterVal(afterNode == null || afterNode.isNull() ? null : afterNode.toString());
            entry.setBeforeJson(beforeJson);
            entry.setAfterJson(afterJson);
            entry.setDiffJson(diffJson);
            entries.add(entry);
        }
        asyncSave(entries);
    }

    @Override
    public void comparisonFailed(Audit audit, Class<?> sourceClass, RuntimeException failure) {
        log.error("审计快照比较失败: audit={}, failureType={}", audit.name(), failure.getClass().getName());
        Identity identity = identity(audit);
        if (identity == null) return;
        SysAuditLogEntity entry = entry(audit, sourceClass, identity);
        entry.setAuditField("COMPARISON_FAILED");
        entry.setAfterVal(failure.getClass().getName());
        asyncSave(List.of(entry));
    }

    private String propertyJson(JsonNode node, String property) {
        if (node == null || node.isNull()) return null;
        JsonNode value = node.get(property);
        return value == null ? node.toString() : value.toString();
    }

    private Identity identity(Audit audit) {
        Long tenantId = UserContext.getTenantId();
        String username = UserContext.getUserName();
        if (tenantId == null || tenantId <= 0 || username == null || username.isBlank()) {
            log.error("审计缺少明确归属，记录未保存: audit={}, tenantId={}, hasOperator={}",
                    audit.name(), tenantId, username != null && !username.isBlank());
            return null;
        }
        return new Identity(tenantId, username, LocalDateTime.now());
    }

    private SysAuditLogEntity entry(Audit audit, Class<?> sourceClass, Identity identity) {
        SysAuditLogEntity entry = new SysAuditLogEntity();
        entry.setTenantId(identity.tenantId());
        entry.setCreateBy(identity.username());
        entry.setCreateTime(identity.time());
        entry.setBizModule(auditBizModuleResolver.resolve(sourceClass));
        entry.setAuditName(audit.name());
        entry.setHighRisk(audit.highRisk() ? 1 : 0);
        entry.setRiskLevel(audit.highRisk() ? "HIGH" : "NORMAL");
        return entry;
    }

    private record Identity(Long tenantId, String username, LocalDateTime time) { }

    @Async
    @Override
    public void asyncSave(List<SysAuditLogEntity> entries) {
        try {
            for (SysAuditLogEntity entry : entries) auditLogMapper.insert(entry);
        } catch (RuntimeException failure) {
            log.error("审计日志入库失败: count={}, failureType={}", entries.size(), failure.getClass().getName(), failure);
        }
    }
}
