package com.cloudflow.workflow.domain.vo;

import com.fasterxml.jackson.annotation.JsonFormat;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

public record DraftDetailVO(String draftId, String definitionId, String definitionName, String title,
                            @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime lastSaveTime,
                            @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") LocalDateTime expireTime,
                            Integer lockVersion, String availability, String unavailableReason,
                            String formId, Map<String, Object> formData,
                            Map<String, List<String>> nodeAssignees, String contextHash) {
}
