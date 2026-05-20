package com.cloudflow.workflow.domain.dto;

import lombok.Data;
import java.util.ArrayList;
import java.util.List;

@Data
public class HotUpdateResult {
    private boolean success;
    private int totalInstances;
    private int migratedCount;
    private int skippedCount;
    private int failedCount;
    private List<HotUpdateInstanceDetail> details = new ArrayList<>();
    private int fromVersion;
    private int toVersion;
    private String confirmToken;
    private Integer confirmExpireSeconds;
    private String message;
}
