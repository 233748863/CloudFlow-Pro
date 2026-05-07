package com.cloudflow.workflow.domain.dto;

import lombok.Data;
import java.util.List;

@Data
public class HotUpdateRequest {
    private String processKey;
    private Integer targetVersion;
    private String migrationMode; // COMPATIBLE / FORCE / RESTART
    private List<String> instanceIds;
    private boolean dryRun;
}
