package com.cloudflow.oa.domain.dto;

import lombok.Data;

/**
 * 协作任务状态更新入参。
 */
@Data
public class WorkTaskStatusDTO {

    private Long taskId;

    private String status;
}
