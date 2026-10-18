package com.cloudflow.workflow.domain.vo;

public record StartableDefinitionVO(String definitionId, String processKey, String processName,
                                   Integer version, String formId, String category, String tags,
                                   String description, boolean modelValid) {
}
