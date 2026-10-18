package com.cloudflow.workflow.domain.vo;

import java.util.List;
import java.util.Map;

public record DraftLaunchContextVO(String definitionId, String processDefKey, String definitionName,
                                   String formId, Map<String, Object> formDefinition,
                                   List<FieldPermissionVO> fieldPermissions,
                                   List<StartAssigneeNodeVO> assigneeNodes, String contextHash) {
}
