package com.cloudflow.workflow.controller;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.printing.PrintData;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.common.security.annotation.Inner;
import com.cloudflow.workflow.service.WorkflowPrintService;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/inner/workflow/print")
@RequiredArgsConstructor
public class WorkflowPrintController {
    private final WorkflowPrintService printing;

    @PostMapping("/filter")
    @Inner(allowedServices = "cloudflow-auth")
    @RepeatSubmit.Disabled
    @SysLog(value = "过滤打印字段权限", logParams = false)
    public R<Map<String, Object>> filter(@RequestBody PrintData data) {
        return R.ok(printing.filter(data));
    }
}
