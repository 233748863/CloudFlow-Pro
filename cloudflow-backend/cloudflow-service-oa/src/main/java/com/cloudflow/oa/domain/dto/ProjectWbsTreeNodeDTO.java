package com.cloudflow.oa.domain.dto;

import com.fasterxml.jackson.annotation.JsonAlias;
import lombok.Data;

@Data
public class ProjectWbsTreeNodeDTO {
    private Long taskId;
    @JsonAlias("parentTaskId")
    private Long parentId;
    @JsonAlias("sortNo")
    private Integer sortOrder;
    private Integer version;
}
