package com.cloudflow.workflow.controller;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.security.annotation.Inner;
import com.cloudflow.workflow.domain.dto.InternalProcessStartReq;
import com.cloudflow.workflow.service.IWfInstanceService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/inner/workflow/process")
@RequiredArgsConstructor
public class WorkflowInnerController {

    private static final String INTERNAL_START_CALLERS =
            "${cloudflow.security.inner.workflow.start-callers:cloudflow-service-oa,cloudflow-service-hr,cloudflow-service-crm}";

    private final IWfInstanceService wfInstanceService;

    @Inner(allowedServices = {INTERNAL_START_CALLERS})
    @PostMapping("/start")
    public R<?> startProcess(@RequestBody InternalProcessStartReq req) {
        return wfInstanceService.startProcessInternal(
                req.getProcessDefKey(),
                req.getBusinessKey(),
                req.getStartUserId(),
                req.getStartUserName(),
                req.getVariables());
    }
}
