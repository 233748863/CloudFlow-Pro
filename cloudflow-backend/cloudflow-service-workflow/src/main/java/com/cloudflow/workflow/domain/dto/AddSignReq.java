package com.cloudflow.workflow.domain.dto;

import lombok.Data;
import java.util.List;

/**
 * P1-4: 加签请求 DTO
 * 支持三种加签模式：前加签、后加签、并行加签
 */
@Data
public class AddSignReq {

    /** 当前任务ID */
    private String taskId;

    /**
     * 加签类型
     * BEFORE - 前加签：先由加签人审批，完成后回到原审批人
     * AFTER  - 后加签：原审批人先审批，完成后由加签人继续审批
     * PARALLEL - 并行加签：加签人与原审批人同时审批
     */
    private String signType;

    /** 加签目标用户ID列表 */
    private List<Long> userIds;

    /** 加签目标用户名称列表（与userIds一一对应） */
    private List<String> userNames;

    /** 加签原因 */
    private String reason;
}
