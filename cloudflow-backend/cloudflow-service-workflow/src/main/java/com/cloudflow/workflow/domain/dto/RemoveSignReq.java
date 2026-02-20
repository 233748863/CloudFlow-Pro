package com.cloudflow.workflow.domain.dto;

import lombok.Data;
import java.util.List;

/**
 * P1-4: 减签请求 DTO
 * 动态减少加签审批人
 */
@Data
public class RemoveSignReq {

    /** 原任务ID（加签发起的任务） */
    private String taskId;

    /** 要移除的用户ID列表 */
    private List<Long> userIds;

    /** 减签原因 */
    private String reason;
}
