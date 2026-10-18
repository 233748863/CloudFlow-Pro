package com.cloudflow.workflow.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.workflow.domain.vo.WorkflowFormReferenceVO;
import com.cloudflow.workflow.service.WorkflowTaskReferenceService;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/wf/task/{taskId}/form-references")
@RequiredArgsConstructor
public class WorkflowTaskReferenceController {
    private final WorkflowTaskReferenceService references;

    @GetMapping("/{fieldId}")
    @SaCheckPermission("workflow:task:complete")
    public R<PageResult<WorkflowFormReferenceVO>> options(@PathVariable String taskId, @PathVariable String fieldId,
                                                       @ModelAttribute PageQuery query, HttpServletResponse response) {
        response.setHeader("Cache-Control", "private, no-store");
        return R.ok(references.options(taskId, fieldId, query));
    }
}
