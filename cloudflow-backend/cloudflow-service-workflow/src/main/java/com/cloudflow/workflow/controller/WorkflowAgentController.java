package com.cloudflow.workflow.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.workflow.domain.dto.AgentSettingRequest;
import com.cloudflow.workflow.domain.vo.AgentDefinitionOptionVO;
import com.cloudflow.workflow.domain.vo.AgentSettingPreviewVO;
import com.cloudflow.workflow.domain.vo.AgentSettingVO;
import com.cloudflow.workflow.service.WorkflowAgentService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/agent-setting")
@RequiredArgsConstructor
public class WorkflowAgentController {
    private final WorkflowAgentService agents;

    @GetMapping("/mine")
    @SaCheckPermission("workflow:agent:mine")
    public R<PageResult<AgentSettingVO>> mine(@RequestParam(defaultValue = "1") int pageNum,
                                             @RequestParam(defaultValue = "20") int pageSize,
                                             @RequestParam(required = false) String status) {
        return R.ok(agents.mine(pageNum, pageSize, status));
    }

    @GetMapping("/mine/{settingId}")
    @SaCheckPermission("workflow:agent:mine")
    public R<AgentSettingVO> detail(@PathVariable String settingId) {
        return R.ok(agents.detail(settingId));
    }

    @GetMapping("/definitions")
    @SaCheckPermission("workflow:agent:mine")
    public R<PageResult<AgentDefinitionOptionVO>> definitions(@RequestParam(defaultValue = "1") int pageNum,
                                                              @RequestParam(defaultValue = "20") int pageSize) {
        return R.ok(agents.definitionOptions(pageNum, pageSize));
    }

    @PostMapping("/preview")
    @SaCheckPermission("workflow:agent:save")
    @RepeatSubmit.Disabled
    public R<AgentSettingPreviewVO> preview(@RequestBody @Valid AgentSettingRequest request,
                                             @RequestParam(required = false) String settingId,
                                             @RequestParam(defaultValue = "1") int pageNum,
                                             @RequestParam(defaultValue = "20") int pageSize) {
        return R.ok(agents.preview(settingId, request, pageNum, pageSize));
    }

    @PostMapping
    @SaCheckPermission("workflow:agent:save")
    @RepeatSubmit
    @SysLog(value = "新增本人审批代理设置", logParams = false)
    public R<AgentSettingVO> create(@RequestBody @Valid AgentSettingRequest request) {
        return R.ok(agents.save(null, request));
    }

    @PutMapping("/{settingId}")
    @SaCheckPermission("workflow:agent:save")
    @RepeatSubmit
    @SysLog(value = "修改本人审批代理设置", logParams = false)
    public R<AgentSettingVO> update(@PathVariable String settingId, @RequestBody @Valid AgentSettingRequest request) {
        return R.ok(agents.save(settingId, request));
    }

    @DeleteMapping("/{settingId}")
    @SaCheckPermission("workflow:agent:remove")
    @RepeatSubmit
    @SysLog(value = "停用本人审批代理设置", logParams = false)
    public R<Void> remove(@PathVariable String settingId, @RequestParam Integer version) {
        agents.disable(settingId, version);
        return R.ok();
    }
}
