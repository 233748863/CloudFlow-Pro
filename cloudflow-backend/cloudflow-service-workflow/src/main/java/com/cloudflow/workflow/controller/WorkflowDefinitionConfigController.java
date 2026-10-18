package com.cloudflow.workflow.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.workflow.domain.dto.FieldPermissionDTO;
import com.cloudflow.workflow.domain.vo.FieldPermissionVO;
import com.cloudflow.workflow.domain.vo.NodeOptionVO;
import com.cloudflow.workflow.domain.vo.StartAssigneeNodeVO;
import com.cloudflow.workflow.service.WorkflowDefinitionConfigService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/wf/definition")
@RequiredArgsConstructor
@Validated
public class WorkflowDefinitionConfigController {
    private final WorkflowDefinitionConfigService configurations;

    @GetMapping("/{definitionId}/selectable-nodes")
    @SaCheckPermission("workflow:definition:list")
    public R<List<NodeOptionVO>> selectableNodes(@PathVariable String definitionId, @RequestParam String currentNodeKey) {
        return R.ok(configurations.selectableNodes(definitionId, currentNodeKey));
    }

    @GetMapping("/{definitionId}/start-assignee-nodes")
    @SaCheckPermission("workflow:process:start")
    public R<List<StartAssigneeNodeVO>> startAssigneeNodes(@PathVariable String definitionId) {
        return R.ok(configurations.startAssigneeNodes(definitionId));
    }

    @GetMapping("/{definitionId}/field-permissions")
    @SaCheckPermission("workflow:definition:list")
    public R<List<FieldPermissionVO>> fieldPermissions(@PathVariable String definitionId) {
        return R.ok(configurations.fieldPermissions(definitionId));
    }

    @PutMapping("/{definitionId}/field-permissions")
    @SaCheckPermission("workflow:definition:edit")
    @SysLog("保存表单字段权限")
    @RepeatSubmit
    public R<Void> saveFieldPermissions(@PathVariable String definitionId, @RequestBody List<@Valid FieldPermissionDTO> fields) {
        configurations.saveFieldPermissions(definitionId, fields);
        return R.ok();
    }
}
