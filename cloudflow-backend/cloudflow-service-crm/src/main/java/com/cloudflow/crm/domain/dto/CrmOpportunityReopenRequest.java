package com.cloudflow.crm.domain.dto;

import com.fasterxml.jackson.annotation.JsonAnySetter;

public record CrmOpportunityReopenRequest(Integer version, String targetStage, String reason) {
    @JsonAnySetter
    public void rejectUnknown(String field, Object value) {
        throw new IllegalArgumentException("恢复请求包含未允许的字段");
    }
}
