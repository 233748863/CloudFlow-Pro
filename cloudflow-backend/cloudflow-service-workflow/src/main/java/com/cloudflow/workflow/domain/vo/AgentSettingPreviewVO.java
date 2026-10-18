package com.cloudflow.workflow.domain.vo;

import com.fasterxml.jackson.annotation.JsonFormat;

import java.time.LocalDateTime;
import java.util.List;

public record AgentSettingPreviewVO(
        @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime evaluatedAt,
        String effectiveStatus, List<Task> rows, long total, long pageNum, long pageSize) {
    public record Task(String taskId, String nodeName, boolean allowed, String reason) {
    }
}
