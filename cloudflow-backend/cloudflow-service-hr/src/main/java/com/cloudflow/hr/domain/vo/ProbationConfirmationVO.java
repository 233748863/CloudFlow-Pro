package com.cloudflow.hr.domain.vo;

import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 转正申请VO
 * 
 * @author CloudFlow
 */
@Data
public class ProbationConfirmationVO {
    
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
     * 试用期开始日期
     */
    private LocalDate probationStartDate;
    
    /**
     * 试用期结束日期
     */
    private LocalDate probationEndDate;
    
    /**
     * 预计转正日期
     */
    private LocalDate expectedRegularDate;
    
    /**
     * 自我评价
     */
    private String selfEvaluation;
    
    /**
     * 主管评价
     */
    private String managerEvaluation;
    
    /**
     * 流程实例ID
     */
    private String processInstanceId;
    
    /**
     * 状态：DRAFT-草稿 APPROVING-审批中 APPROVED-已通过 REJECTED-已拒绝 EXTENDED-延长试用期
     */
    private String status;
    
    /**
     * 状态描述
     */
    private String statusDesc;
    
    /**
     * 拒绝原因
     */
    private String rejectReason;
    
    /**
     * 延长天数
     */
    private Integer extensionDays;
    
    /**
     * 创建时间
     */
    private LocalDateTime createTime;
}
