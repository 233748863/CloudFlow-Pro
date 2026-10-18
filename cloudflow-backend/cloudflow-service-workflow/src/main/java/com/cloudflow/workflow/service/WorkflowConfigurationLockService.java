package com.cloudflow.workflow.service;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.workflow.domain.WfFormDefinition;
import com.cloudflow.workflow.domain.WfProcessDefinition;
import com.cloudflow.workflow.exception.WorkflowException;
import com.cloudflow.workflow.mapper.WorkflowConfigurationLockMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.TreeSet;

@Service
@RequiredArgsConstructor
@Transactional(propagation = Propagation.MANDATORY, rollbackFor = Exception.class)
public class WorkflowConfigurationLockService {
    private final WorkflowConfigurationLockMapper mapper;

    public LockedConfiguration lockDefinition(String definitionId) {
        return lockDefinition(definitionId, null);
    }

    public LockedConfiguration lockDefinition(String definitionId, String additionalFormId) {
        Long tenantId = requireTransactionTenant();
        String processKey = requireProcessKey(tenantId, definitionId);
        LockedConfiguration locked = lockKeys(tenantId, List.of(processKey), additionalFormId);
        locked.requireDefinition(definitionId);
        return locked;
    }

    public LockedConfiguration lockForSave(String definitionId, String processKey, String formId) {
        Long tenantId = requireTransactionTenant();
        if (!StringUtils.hasText(processKey)) throw WorkflowException.validationError("流程Key不能为空");
        Collection<String> processKeys = new TreeSet<>();
        processKeys.add(processKey);
        if (StringUtils.hasText(definitionId)) processKeys.add(requireProcessKey(tenantId, definitionId));
        LockedConfiguration locked = lockKeys(tenantId, processKeys, formId);
        if (StringUtils.hasText(definitionId)) locked.requireDefinition(definitionId);
        return locked;
    }

    public WfFormDefinition lockForm(String formId) {
        Long tenantId = requireTransactionTenant();
        if (!StringUtils.hasText(formId)) throw WorkflowException.validationError("表单ID不能为空");
        return lockKeys(tenantId, mapper.findFormProcessKeys(tenantId, formId), formId).form(formId);
    }

    public long countDefinitionInstances(WfProcessDefinition definition, List<String> statuses) {
        Long tenantId = requireTransactionTenant();
        if (!Objects.equals(tenantId, definition.getTenantId())) {
            throw WorkflowException.permissionDenied("查询其他租户的流程实例");
        }
        return mapper.countDefinitionInstances(tenantId, definition.getDefinitionId(), statuses);
    }

    public long countProcessInstances(WfProcessDefinition definition, List<String> statuses) {
        Long tenantId = requireTransactionTenant();
        if (!Objects.equals(tenantId, definition.getTenantId())) {
            throw WorkflowException.permissionDenied("查询其他租户的流程实例");
        }
        return mapper.countProcessInstances(tenantId, definition.getProcessKey(), statuses);
    }

    private String requireProcessKey(Long tenantId, String definitionId) {
        if (!StringUtils.hasText(definitionId)) throw WorkflowException.validationError("流程定义ID不能为空");
        String processKey = mapper.findProcessKey(tenantId, definitionId);
        if (!StringUtils.hasText(processKey)) throw WorkflowException.processNotFound(definitionId);
        return processKey;
    }

    private LockedConfiguration lockKeys(Long tenantId, Collection<String> processKeys, String additionalFormId) {
        List<WfProcessDefinition> definitions = new ArrayList<>();
        for (String processKey : new TreeSet<>(processKeys)) {
            definitions.addAll(mapper.lockDefinitions(tenantId, processKey));
        }
        TreeSet<String> formIds = new TreeSet<>();
        TreeSet<String> definitionIds = new TreeSet<>();
        if (StringUtils.hasText(additionalFormId)) formIds.add(additionalFormId);
        for (WfProcessDefinition definition : definitions) {
            if (!Objects.equals(tenantId, definition.getTenantId())) {
                throw WorkflowException.permissionDenied("修改其他租户的流程配置");
            }
            definitionIds.add(definition.getDefinitionId());
            if (StringUtils.hasText(definition.getFormId())) formIds.add(definition.getFormId());
        }
        Map<String, WfFormDefinition> forms = new LinkedHashMap<>();
        for (String formId : formIds) {
            WfFormDefinition form = mapper.lockForm(tenantId, formId);
            if (form != null) {
                if (!Objects.equals(tenantId, form.getTenantId())) {
                    throw WorkflowException.permissionDenied("修改其他租户的表单配置");
                }
                forms.put(formId, form);
            }
        }
        for (String definitionId : definitionIds) mapper.lockStartPermissions(tenantId, definitionId);
        return new LockedConfiguration(tenantId, List.copyOf(definitions), Map.copyOf(forms));
    }

    private Long requireTransactionTenant() {
        if (!TransactionSynchronizationManager.isActualTransactionActive()) {
            throw WorkflowException.invalidState("流程配置锁必须在写入事务中获取");
        }
        Long tenantId = UserContext.getTenantId();
        if (tenantId == null) throw WorkflowException.permissionDenied("缺少当前租户上下文");
        return tenantId;
    }

    public record LockedConfiguration(Long tenantId, List<WfProcessDefinition> definitions,
                                      Map<String, WfFormDefinition> forms) {
        public WfProcessDefinition requireDefinition(String definitionId) {
            return definitions.stream().filter(definition -> Objects.equals(definitionId, definition.getDefinitionId())
                            && !Integer.valueOf(1).equals(definition.getDeleted()))
                    .findFirst().orElseThrow(() -> WorkflowException.invalidState("流程定义已变更或不可用，请刷新后重试"));
        }

        public List<WfProcessDefinition> versions(String processKey) {
            return definitions.stream().filter(definition -> Objects.equals(processKey, definition.getProcessKey())
                    && !Integer.valueOf(1).equals(definition.getDeleted())).toList();
        }

        public WfProcessDefinition latest(String processKey) {
            return versions(processKey).stream().max(Comparator.comparingInt(definition ->
                    definition.getVersion() == null ? 0 : definition.getVersion())).orElse(null);
        }

        public WfFormDefinition form(String formId) {
            return StringUtils.hasText(formId) ? forms.get(formId) : null;
        }

        public WfFormDefinition requireBoundForm(String formId) {
            if (!StringUtils.hasText(formId)) return null;
            WfFormDefinition form = form(formId);
            if (form == null) throw WorkflowException.validationError("绑定表单不存在或不属于当前租户");
            return form;
        }
    }
}
