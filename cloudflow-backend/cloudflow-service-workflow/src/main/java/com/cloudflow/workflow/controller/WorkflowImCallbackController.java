package com.cloudflow.workflow.controller;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.common.security.annotation.Inner;
import com.cloudflow.common.security.im.ImTaskCallbacks;
import com.cloudflow.workflow.service.WorkflowImCallbackService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/inner/workflow/im-callback")
@RequiredArgsConstructor
public class WorkflowImCallbackController {
    private final WorkflowImCallbackService callbacks;

    @PostMapping("/complete")
    @Inner(allowedServices = "cloudflow-auth")
    @RepeatSubmit.Disabled
    @SysLog(value = "企业通信待办处理", logParams = false)
    public R<ImTaskCallbacks.Outcome> complete(@RequestBody ImTaskCallbacks.Request request) {
        return R.ok(callbacks.execute(request));
    }
}
