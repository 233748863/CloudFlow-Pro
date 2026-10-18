package com.cloudflow.workflow.domain.vo;

import com.fasterxml.jackson.annotation.JsonFormat;
import java.time.LocalDateTime;

public record DraftSaveResult(String draftId, String definitionId, Integer lockVersion,
                              @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime lastSaveTime,
                              @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime expireTime,
                              boolean changed) {
}
