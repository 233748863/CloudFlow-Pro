package com.cloudflow.hr.domain.vo;

import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 调岗申请VO
 * 
 * @author CloudFlow
 */
@Data
public class TransferApplicationVO {
    
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
     * 原部门ID
     */
    private Long fromDeptId;
    
    /**
     * 原部门名称
     */
    private String fromDeptName;
    
    /**
     * 原岗位ID
     */
    private Long fromPostId;
    
    /**
     * 原岗位名称
     */
    private String fromPostName;
    
    /**
     * 原职位ID
     */
    private Long fromPositionId;
    
    /**
     * 原职位名称
     */
    private String fromPositionName;
    
    /**
     * 目标部门ID
     */
    private Long toDeptId;
    
    /**
     * 目标部门名称
     */
    private String toDeptName;
    
    /**
     * 目标岗位ID
     */
    private Long toPostId;
    
    /**
     * 目标岗位名称
     */
    private String toPostName;
    
    /**
     * 目标职位ID
     */
    private Long toPositionId;
    
    /**
     * 目标职位名称
     */
    private String toPositionName;
    
    /**
     * 调岗类型：DEPT-部门调动 POST-岗位调整 PROMOTION-晋升 DEMOTION-降级
     */
    private String transferType;
    
    /**
     * 调岗类型描述
     */
    private String transferTypeDesc;
    
    /**
     * 调岗原因
     */
    private String reason;
    
    /**
     * 生效日期
     */
    private LocalDate effectiveDate;
    
    /**
     * 是否涉及薪资变更
     */
    private Boolean salaryChange;
    
    /**
     * 流程实例ID
     */
    private String processInstanceId;
    
    /**
     * 状态：DRAFT-草稿 APPROVING-审批中 APPROVED-已通过 REJECTED-已拒绝 EFFECTIVE-已生效
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
