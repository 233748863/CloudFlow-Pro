package com.cloudflow.hr.domain.vo;

import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 假期额度VO
 */
@Data
public class LeaveQuotaVO {
    
    /**
     * 主键ID
     */
    private Long id;
    
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
     * 年度
     */
    private Integer year;
    
    /**
     * 总额度
     */
    private BigDecimal totalQuota;
    
    /**
     * 已使用额度
     */
    private BigDecimal usedQuota;
    
    /**
     * 冻结额度（审批中）
     */
    private BigDecimal frozenQuota;
    
    /**
     * 可用额度
     */
    private BigDecimal availableQuota;
    
    /**
     * 过期日期
     */
    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate expiryDate;
    
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
