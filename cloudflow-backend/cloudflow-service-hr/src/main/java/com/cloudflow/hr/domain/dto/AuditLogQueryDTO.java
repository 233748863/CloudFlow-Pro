package com.cloudflow.hr.domain.dto;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * 审计日志查询DTO
 * 
 * @author CloudFlow
 */
@Data
public class AuditLogQueryDTO {
    
    /**
     * 日志类型：OPERATION-操作日志 APPROVAL-审批日志
     */
    private String logType;
    
    /**
     * 操作类型：CREATE-创建 UPDATE-修改 DELETE-删除 APPROVE-审批 REJECT-拒绝
     */
    private String operationType;
    
    /**
     * 业务模块：EMPLOYEE-员工管理 ATTENDANCE-考勤管理 SALARY-薪酬管理 RECRUITMENT-招聘管理
     */
    private String businessModule;
    
    /**
     * 业务类型
     */
    private String businessType;
    
    /**
     * 业务ID
     */
    private Long businessId;
    
    /**
     * 业务编号
     */
    private String businessNo;
    
    /**
     * 操作人ID
     */
    private Long operatorId;
    
    /**
     * 操作人姓名（模糊查询）
     */
    private String operatorName;
    
    /**
     * 操作状态：SUCCESS-成功 FAILURE-失败
     */
    private String status;
    
    /**
     * 开始时间
     */
    private LocalDateTime startTime;
    
    /**
     * 结束时间
     */
    private LocalDateTime endTime;
    
    /**
     * 是否已归档：0-未归档 1-已归档
     */
    private Integer archived;
    
    /**
     * 页码
     */
    private Integer pageNum = 1;
    
    /**
     * 每页大小
     */
    private Integer pageSize = 10;
}
