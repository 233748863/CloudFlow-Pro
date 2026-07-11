package com.cloudflow.workflow.controller;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.security.annotation.Inner;
import com.cloudflow.common.tenant.TenantBroker;
import com.cloudflow.workflow.domain.dto.BusinessProcessInvalidateReq;
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
            "${cloudflow.security.inner.workflow.start-callers:cloudflow-service-oa,cloudflow-service-hr,cloudflow-service-crm,cloudflow-auth}";
    private static final String INTERNAL_BUSINESS_INVALIDATE_CALLERS =
            "${cloudflow.security.inner.workflow.business-invalidate-callers:cloudflow-service-hr}";

    private final IWfInstanceService wfInstanceService;

    @Inner(allowedServices = {INTERNAL_START_CALLERS})
    @RepeatSubmit
    @PostMapping("/start")
    public R<?> startProcess(@RequestBody InternalProcessStartReq req) {
        if (req == null || req.getTenantId() == null) {
            return R.fail("tenantId不能为空");
        }
        return TenantBroker.applyAs(req.getTenantId(), tenantId -> wfInstanceService.startProcessInternal(
                tenantId,
                req.getProcessDefKey(),
                req.getBusinessKey(),
                req.getStartUserId(),
                req.getStartUserName(),
                req.getVariables()));
    }

    @Inner(allowedServices = {INTERNAL_BUSINESS_INVALIDATE_CALLERS})
    @RepeatSubmit
    @PostMapping("/invalidate-by-business")
    public R<?> invalidateByBusiness(@RequestBody BusinessProcessInvalidateReq req) {
        if (req == null || req.getTenantId() == null) {
            return R.fail("tenantId不能为空");
        }
        return TenantBroker.applyAs(req.getTenantId(), tenantId -> wfInstanceService.invalidateProcessByBusiness(
                tenantId,
                req.getProcessInstanceId(),
                req.getBusinessType(),
                req.getBusinessId(),
                req.getReason()));
    }
}
