package com.cloudflow.workflow.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.audit.domain.SysAuditLogEntity;
import com.cloudflow.common.audit.mapper.SysAuditLogMapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.workflow.domain.WfFormDefinition;
import com.cloudflow.workflow.exception.WorkflowException;
import com.cloudflow.workflow.mapper.WfFormDefinitionMapper;
import com.cloudflow.workflow.security.WorkflowSecurityUtils;
import com.cloudflow.workflow.validator.JsonSchemaValidator;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class WorkflowFormVersionService {
    private final WfFormDefinitionMapper forms;
    private final WorkflowConfigurationLockService locks;
    private final WorkflowPermissionService permissions;
    private final JsonSchemaValidator validator;
    private final WorkflowFormVersionDiff differences;
    private final WorkflowSecurityUtils security;
    private final WorkflowDraftJson json;
    private final SysAuditLogMapper audits;
    private final IWorkflowCacheService cache;

    @Transactional(rollbackFor = Exception.class)
    public WfFormDefinition save(WfFormDefinition requested) {
        permissions.checkDefinitionPermission("保存表单版本");
        Long tenantId = WorkflowLaunchContextService.requireTenant();
        if (requested == null || requested.getTenantId() != null && !tenantId.equals(requested.getTenantId())) throw denied();
        String formId = StringUtils.hasText(requested.getFormId()) ? identifier(requested.getFormId()) : UUID.randomUUID().toString();
        WfFormDefinition latest = locks.lockForm(formId);
        if (latest != null && (requested.getVersionLock() == null || !Objects.equals(requested.getVersionLock(), latest.getVersionLock()))) throw conflict();
        String formKey = latest != null && StringUtils.hasText(latest.getFormKey()) ? latest.getFormKey()
                : StringUtils.hasText(requested.getFormKey()) ? identifier(requested.getFormKey()) : formId;
        if (latest != null && StringUtils.hasText(requested.getFormKey()) && !Objects.equals(requested.getFormKey(), formKey)) throw WorkflowException.validationError("表单业务Key不能随版本变更");
        for (String identity : List.of(formId, formKey)) {
            if (forms.resolveIdentifier(tenantId, identity).stream().anyMatch(form -> !formId.equals(form.getFormId()))) throw WorkflowException.validationError("表单业务标识已被使用");
        }
        return persist(requested, latest, tenantId, formId, formKey, null);
    }

    public PageResult<WfFormDefinition> versions(String identifier, PageQuery query) {
        permissions.checkDefinitionPermission("读取表单版本历史");
        WfFormDefinition latest = resolve(identifier);
        Page<WfFormDefinition> page = forms.selectVersions(new Page<>(query.getPageNum(), query.getPageSize()), latest.getTenantId(), latest.getFormId());
        return new PageResult<>(page.getRecords(), page.getTotal(), page.getCurrent(), page.getSize());
    }

    public WfFormDefinition version(String identifier, Integer version) {
        permissions.checkDefinitionPermission("读取表单历史版本");
        WfFormDefinition latest = resolve(identifier);
        return requireVersion(latest, version);
    }

    public WorkflowFormVersionDiff.Difference compare(String identifier, Integer from, Integer to) {
        permissions.checkDefinitionPermission("比较表单版本");
        WfFormDefinition latest = resolve(identifier);
        WfFormDefinition before = requireVersion(latest, from); WfFormDefinition after = requireVersion(latest, to);
        return differences.compare(before.getFieldsJson(), after.getFieldsJson(), from, to);
    }

    @Transactional(rollbackFor = Exception.class)
    public WfFormDefinition rollback(String identifier, Integer targetVersion, Integer expectedLock, String changeLog) {
        permissions.checkDefinitionPermission("回滚表单版本");
        WfFormDefinition pointer = resolve(identifier);
        WfFormDefinition latest = locks.lockForm(pointer.getFormId());
        if (latest == null || expectedLock == null || !expectedLock.equals(latest.getVersionLock())) throw conflict();
        WfFormDefinition target = requireVersion(latest, targetVersion);
        WfFormDefinition requested = new WfFormDefinition();
        requested.setFormName(target.getFormName()); requested.setFieldsJson(target.getFieldsJson());
        requested.setChangeLog(StringUtils.hasText(changeLog) ? changeLog : "回滚至v" + targetVersion);
        return persist(requested, latest, latest.getTenantId(), latest.getFormId(), latest.getFormKey(), targetVersion);
    }

    public List<String> cleanupFormIds() { return forms.latestFormIds(WorkflowLaunchContextService.requireTenant()); }

    @Transactional(rollbackFor = Exception.class)
    public int cleanupForm(String formId) {
        Long tenantId = WorkflowLaunchContextService.requireTenant();
        WfFormDefinition latest = forms.lockLatest(tenantId, formId);
        if (latest == null || latest.getVersion() <= 20) return 0;
        int removed = 0;
        for (WfFormDefinition candidate : forms.cleanupCandidates(tenantId, formId, latest.getVersion() - 19)) {
            removed += forms.deleteUnusedVersion(tenantId, candidate.getId(), formId, candidate.getVersion());
        }
        return removed;
    }

    private WfFormDefinition persist(WfFormDefinition requested, WfFormDefinition latest, Long tenantId, String formId, String formKey, Integer rollbackFrom) {
        if (!StringUtils.hasText(requested.getFormName()) || requested.getFormName().trim().length() > 64) throw WorkflowException.validationError("表单名称须为1至64个字符");
        String name = security.sanitizeXss(requested.getFormName().trim());
        if (!StringUtils.hasText(name)) throw WorkflowException.validationError("表单名称无效");
        String source = StringUtils.hasText(requested.getFieldsJson()) ? requested.getFieldsJson() : requested.getFormSchema();
        validator.validateFormSchema(source);
        String schema = differences.normalized(source); String checksum = differences.checksum(schema);
        String changeLog = requested.getChangeLog() == null ? "" : requested.getChangeLog().trim();
        if (changeLog.length() > 500) throw WorkflowException.validationError("变更说明最多500个字符");
        if (latest != null && rollbackFrom == null && checksum.equals(differences.checksum(latest.getFieldsJson()))) {
            if (forms.updateVersionLockOnly(tenantId, latest.getId(), latest.getVersionLock(), name, formKey, checksum) != 1) throw conflict();
            latest.setVersionLock(Math.addExact(latest.getVersionLock(), 1)); latest.setFormName(name); latest.setFormKey(formKey); latest.setChecksum(checksum);
            cache.evictForm(formId); return latest;
        }
        WorkflowFormVersionDiff.Difference diff = differences.compare(latest == null ? "[]" : latest.getFieldsJson(), schema, latest == null ? null : latest.getVersion(), latest == null ? 1 : latest.getVersion() + 1);
        WfFormDefinition saved = new WfFormDefinition();
        saved.setTenantId(tenantId); saved.setFormId(formId); saved.setFormKey(formKey); saved.setFormName(name);
        saved.setFieldsJson(schema); saved.setFormSchema(schema); saved.setVersion(latest == null ? 1 : Math.addExact(latest.getVersion(), 1));
        saved.setVersionLock(latest == null ? 0 : Math.addExact(latest.getVersionLock(), 1)); saved.setIsLatest(1);
        saved.setStatus(latest == null ? "ACTIVE" : latest.getStatus()); saved.setChecksum(checksum);
        saved.setChangeType("UNCHANGED".equals(diff.changeType()) ? "MODIFY_FIELD" : diff.changeType());
        saved.setChangeLog(changeLog.isEmpty() ? diff.summary() : security.sanitizeXss(changeLog));
        saved.setIsRollback(rollbackFrom == null ? 0 : 1); saved.setRollbackFromVersion(rollbackFrom);
        saved.setCreateTime(LocalDateTime.now()); saved.setCreateBy(String.valueOf(WorkflowLaunchContextService.requireUser()));
        try {
            if (forms.insert(saved) != 1 || latest != null && forms.markNotLatest(tenantId, latest.getId(), latest.getVersionLock()) != 1) throw conflict();
        } catch (DuplicateKeyException duplicate) { throw conflict(); }
        SysAuditLogEntity audit = new SysAuditLogEntity();
        audit.setTenantId(tenantId); audit.setBizModule("workflow"); audit.setAuditName(rollbackFrom == null ? "保存表单版本" : "回滚表单版本"); audit.setAuditField("formVersion");
        audit.setBeforeVal(latest == null ? "" : String.valueOf(latest.getVersion())); audit.setAfterVal(String.valueOf(saved.getVersion()));
        audit.setAfterJson(json.canonical(Map.of("formId", formId, "version", saved.getVersion(), "checksum", checksum, "isRollback", saved.getIsRollback())));
        audit.setCreateBy(saved.getCreateBy()); audit.setCreateTime(saved.getCreateTime()); audit.setHighRisk(rollbackFrom == null ? 0 : 1); audit.setRiskLevel(rollbackFrom == null ? "LOW" : "MEDIUM");
        if (audits.insert(audit) != 1) throw WorkflowException.invalidState("表单版本审计保存失败");
        cache.evictForm(formId);
        return saved;
    }

    private WfFormDefinition resolve(String identifier) {
        List<WfFormDefinition> matches = forms.resolveIdentifier(WorkflowLaunchContextService.requireTenant(), identifier(identifier));
        if (matches.size() != 1) throw WorkflowException.validationError("表单不存在或业务标识不唯一");
        return matches.get(0);
    }

    private WfFormDefinition requireVersion(WfFormDefinition latest, Integer version) {
        if (version == null || version < 1) throw WorkflowException.validationError("表单版本号无效");
        WfFormDefinition found = forms.selectVersion(latest.getTenantId(), latest.getFormId(), version);
        if (found == null) throw WorkflowException.validationError("表单历史版本不存在或已按保留策略清理");
        return found;
    }

    private String identifier(String value) {
        if (value == null || !value.matches("[A-Za-z0-9_-]{1,64}")) throw WorkflowException.validationError("表单业务标识无效");
        return value;
    }

    private WorkflowException denied() { return WorkflowException.permissionDenied("无权保存其他租户的表单"); }
    private WorkflowException conflict() { return new WorkflowException("FORM_VERSION_CONFLICT", "表单已被其他用户修改，请重新读取最新版本后保存"); }
}
