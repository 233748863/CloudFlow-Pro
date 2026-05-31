package com.cloudflow.oa.event;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 合同提交审批事件
 */
@Data
public class ContractSubmittedEvent {

    /** 合同ID */
    private Long contractId;

    /** 合同编号 */
    private String contractNo;

    /** 合同名称 */
    private String contractName;

    /** 合同类型 */
    private String contractType;

    /** 合同金额 */
    private BigDecimal amount;

    /** 负责人ID */
    private Long ownerId;

    /** 负责人姓名 */
    private String ownerName;

    /** 部门名称 */
    private String deptName;

    /** 提交时间 */
    private LocalDateTime submittedAt;
}
