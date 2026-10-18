package com.cloudflow.workflow.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.workflow.domain.WfFormFieldPermission;
import com.cloudflow.workflow.domain.vo.FieldPermissionVO;
import com.cloudflow.workflow.mapper.WfFormFieldPermissionMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.ArrayList;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class WorkflowFieldPermissionCache {
    private final WfFormFieldPermissionMapper permissions;

    @Cacheable(value = "workflowFormPermissions", key = "#tenantId + ':' + #definitionId", sync = true)
    public List<FieldPermissionVO> get(Long tenantId, String definitionId) {
        return permissions.selectList(new LambdaQueryWrapper<WfFormFieldPermission>()
                .eq(WfFormFieldPermission::getTenantId, tenantId).eq(WfFormFieldPermission::getDefinitionId, definitionId))
                .stream().map(permission -> new FieldPermissionVO(permission.getNodeKey(), permission.getFieldId(),
                        permission.getVisibleFlag(), permission.getEditableFlag(), permission.getRequiredFlag())).collect(Collectors.toCollection(ArrayList::new));
    }
}
