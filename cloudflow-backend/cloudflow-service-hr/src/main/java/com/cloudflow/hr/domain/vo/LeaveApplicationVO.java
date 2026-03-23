package com.cloudflow.hr.domain.vo;

import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 请假申请VO
 */
@Data
public class LeaveApplicationVO {
    
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
     * 假期类型ID
     */
    private Long leaveTypeId;
    
    /**
     * 假期类型名称
     */
    private String leaveTypeName;
    
    /**
     * 开始时间
     */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime startTime;
    
    /**
     * 结束时间
     */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime endTime;
    
    /**
     * 请假时长
     */
    private BigDecimal duration;
    
    /**
     * 单位：DAY-天 HOUR-小时
     */
    private String unit;
    
    /**
     * 请假原因
     */
    private String reason;
    
    /**
     * 流程实例ID
     */
    private String processInstanceId;
    
    /**
     * 状态：DRAFT-草稿 APPROVING-审批中 APPROVED-已通过 REJECTED-已拒绝 CANCELLED-已撤销
     */
    private String status;
    
    /**
     * 创建时间
     */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;
    
    /**
     * 更新时间
     */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime updateTime;
}
