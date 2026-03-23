package com.cloudflow.hr.domain.vo;

import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 离职申请VO
 * 
 * @author CloudFlow
 */
@Data
public class ResignationApplicationVO {
    
    /**
     * 主键ID
     */
    private Long id;
    
    /**
     * 申请编号
     */
    private String applicationNo;
    
    /**
     * 员工ID
     */
    private Long employeeId;
    
    /**
     * 员工姓名
     */
    private String employeeName;
    
    /**
     * 员工工号
     */
    private String employeeNo;
    
    /**
     * 离职类型：VOLUNTARY-主动离职 INVOLUNTARY-被动离职 CONTRACT_EXPIRY-合同到期
     */
    private String resignationType;
    
    /**
     * 离职类型描述
     */
    private String resignationTypeDesc;
    
    /**
     * 离职原因
     */
    private String resignationReason;
    
    /**
     * 预计离职日期
     */
    private LocalDate expectedDate;
    
    /**
     * 实际离职日期
     */
    private LocalDate actualDate;
    
    /**
     * 离职面谈内容
     */
    private String interviewContent;
    
    /**
     * 流程实例ID
     */
    private String processInstanceId;
    
    /**
     * 状态：DRAFT-草稿 APPROVING-审批中 APPROVED-已通过 REJECTED-已拒绝 COMPLETED-已完成
     */
    private String status;
    
    /**
     * 状态描述
     */
    private String statusDesc;
    
    /**
     * 创建时间
     */
    private LocalDateTime createTime;
}
