package com.cloudflow.workflow.domain.vo;

import com.fasterxml.jackson.annotation.JsonFormat;
import java.time.LocalDateTime;

public record DraftSummaryVO(String draftId, String definitionId, String definitionName, String title,
                             @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime lastSaveTime,
                             @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime expireTime,
                             Integer lockVersion, String availability, String unavailableReason) {
}
