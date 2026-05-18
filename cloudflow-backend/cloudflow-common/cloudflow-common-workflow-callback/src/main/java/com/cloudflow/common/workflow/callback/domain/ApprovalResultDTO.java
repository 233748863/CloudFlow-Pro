package com.cloudflow.common.workflow.callback.domain;

import lombok.Data;

import java.io.Serializable;
import java.util.Map;

/**
 * 工作流审批结果跨服务回写 DTO。
 *
 * <p>由 workflow 服务在审批完成后发布到 Redis Stream，业务服务消费时反序列化使用。
 */
@Data
public class ApprovalResultDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    /** 租户 ID。 */
    private Long tenantId;

    /** 流程实例 ID。 */
    private String processInstanceId;

    /** 业务类型，由业务服务自定义；用于路由到 {@code ApprovalResultHandler}。 */
    private String businessType;

    /** 业务主键 ID。 */
    private Long businessId;

    /** 业务单据编号。 */
    private String businessNo;

    /** 审批结果，仅支持 APPROVED / REJECTED。 */
    private String approvalResult;

    /** 审批意见。 */
    private String approvalComment;

    /** 审批人 ID。 */
    private Long approverId;

    /** 审批人姓名。 */
    private String approverName;

    /** 审批完成时间戳。 */
    private Long approvalTime;

    /** 流程变量（可选，部分业务侧需要回读）。 */
    private Map<String, Object> variables;
}
