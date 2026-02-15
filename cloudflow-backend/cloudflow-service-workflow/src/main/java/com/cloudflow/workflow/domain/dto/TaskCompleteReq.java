package com.cloudflow.workflow.domain.dto;

import lombok.Data;
import java.util.Map;

@Data
public class TaskCompleteReq {
    /** 任务ID */
    private String taskId;
    /** 操作类型: APPROVE-同意, REJECT-拒绝, DELEGATE-转办 */
    private String action;
    /** 审批意见 */
    private String comment;
    /** 流程变量（审批时可传入额外变量） */
    private Map<String, Object> variables;
    /** 转办目标用户ID（action=DELEGATE 时必填） */
    private String delegateUserId;
}
