package com.cloudflow.workflow.domain.dto;

import java.util.List;
import java.util.Map;

public record DraftSaveRequest(String draftId, String definitionId, Integer expectedVersion,
                               String loadedContextHash, String title, Map<String, Object> formData,
                               Map<String, List<Long>> nodeAssignees) {
}
