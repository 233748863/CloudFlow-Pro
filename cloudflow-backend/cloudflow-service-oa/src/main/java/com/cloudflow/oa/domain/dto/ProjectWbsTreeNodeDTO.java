package com.cloudflow.oa.domain.dto;

import lombok.Data;

@Data
public class ProjectWbsTreeNodeDTO {
    private Long taskId;
    private Long parentId;
    private Integer sortOrder;
}
