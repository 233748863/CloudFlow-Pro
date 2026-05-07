package com.cloudflow.workflow.domain.dto;

import lombok.Data;

@Data
public class HotUpdateInstanceDetail {
    private String instanceId;
    private String processNo;
    private String currentNodeKey;
    private String currentNodeTitle;
    private String status; // MIGRATED / SKIPPED / FAILED / RESTARTED
    private String reason;
    private String newInstanceId;
}
