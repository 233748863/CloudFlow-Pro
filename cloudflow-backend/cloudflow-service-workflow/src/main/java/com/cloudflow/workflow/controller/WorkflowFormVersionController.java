package com.cloudflow.workflow.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.workflow.domain.WfFormDefinition;
import com.cloudflow.workflow.service.WorkflowFormVersionDiff;
import com.cloudflow.workflow.service.WorkflowFormVersionService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/wf/form/{formId}")
@RequiredArgsConstructor
public class WorkflowFormVersionController {
    private final WorkflowFormVersionService versions;

    @GetMapping("/versions")
    @SaCheckPermission("workflow:form:history")
    public R<PageResult<WfFormDefinition>> list(@PathVariable String formId, @ModelAttribute PageQuery query) { return R.ok(versions.versions(formId, query)); }

    @GetMapping("/versions/{version}")
    @SaCheckPermission("workflow:form:history")
    public R<WfFormDefinition> detail(@PathVariable String formId, @PathVariable Integer version) { return R.ok(versions.version(formId, version)); }

    @GetMapping("/versions/compare")
    @SaCheckPermission("workflow:form:history")
    public R<WorkflowFormVersionDiff.Difference> compare(@PathVariable String formId, @RequestParam Integer from, @RequestParam Integer to) { return R.ok(versions.compare(formId, from, to)); }

    @PostMapping("/rollback/{version}")
    @SaCheckPermission("workflow:form:rollback")
    @RepeatSubmit
    @SysLog(value = "回滚表单版本", logParams = false)
    public R<WfFormDefinition> rollback(@PathVariable String formId, @PathVariable Integer version, @RequestBody Rollback request) {
        return R.ok(versions.rollback(formId, version, request.versionLock(), request.changeLog()));
    }

    public record Rollback(Integer versionLock, String changeLog) { }
}
