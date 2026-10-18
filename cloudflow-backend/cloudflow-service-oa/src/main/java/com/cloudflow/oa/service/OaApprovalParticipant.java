package com.cloudflow.oa.service;

import com.cloudflow.common.workflow.callback.handler.ApprovalResultHandler;
import com.cloudflow.oa.domain.dto.OaApprovalRequest;

public interface OaApprovalParticipant extends ApprovalResultHandler {
    String currentInstance(Long businessId);
    void bindInstance(OaApprovalRequest request, String instanceId);
}
