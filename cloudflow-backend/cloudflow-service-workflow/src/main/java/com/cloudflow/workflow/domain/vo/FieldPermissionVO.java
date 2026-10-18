package com.cloudflow.workflow.domain.vo;

public record FieldPermissionVO(String nodeKey, String fieldId, Boolean visibleFlag,
                                Boolean editableFlag, Boolean requiredFlag) {
}
