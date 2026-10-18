package com.cloudflow.oa.domain.dto;

public record OaMeetingWorkflowClosed(Long tenantId, String businessType, Long businessId,
                                     String processInstanceId, String oaRequestToken, String status) { }
