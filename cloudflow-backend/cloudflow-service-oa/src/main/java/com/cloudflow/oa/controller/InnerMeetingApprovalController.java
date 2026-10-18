package com.cloudflow.oa.controller;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.security.annotation.Inner;
import com.cloudflow.common.workflow.callback.domain.ApprovalResultDTO;
import com.cloudflow.common.workflow.callback.service.WorkflowCallbackService;
import com.cloudflow.oa.service.impl.OaMeetingBookingService;
import com.cloudflow.oa.service.impl.OaRecordSupport;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/inner/oa/meeting")
@RequiredArgsConstructor
public class InnerMeetingApprovalController {
    private final WorkflowCallbackService callbacks;

    @Inner(allowedServices = {"cloudflow-service-workflow"})
    @RepeatSubmit.Disabled
    @PostMapping("/approval-event")
    public R<Void> approvalEvent(@RequestBody ApprovalResultDTO result) {
        OaRecordSupport.same(OaMeetingBookingService.BUSINESS_TYPE, result.getBusinessType(), "会议审批业务类型不一致");
        callbacks.handleApprovalResult(result);
        return R.ok();
    }
}
