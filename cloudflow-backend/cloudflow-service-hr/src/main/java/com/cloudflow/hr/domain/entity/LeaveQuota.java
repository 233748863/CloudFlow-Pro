package com.cloudflow.hr.domain.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 假期额度实体类
 * 用于记录员工的假期额度信息
 */
@Data
@TableName("hr_leave_quota")
public class LeaveQuota {
    
    /**
     * 主键ID
     */
    @TableId(type = IdType.AUTO)
    private Long id;
    
    /**
     * 租户ID（多租户隔离）
     */
    private Long tenantId;
    
    /**
     * 员工ID
     */
    private Long employeeId;
    
    /**
     * 假期类型ID
     */
    private Long leaveTypeId;
    
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
     * 计算方式：总额度 - 已使用额度 - 冻结额度
     */
    private BigDecimal availableQuota;
    
    /**
     * 过期日期
     */
    private LocalDate expiryDate;
    
    /**
     * 创建时间
     */
    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;
    
    /**
     * 更新时间
     */
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;
    
    /**
     * 创建者
     */
    @TableField(fill = FieldFill.INSERT)
    private String createBy;
    
    /**
     * 更新者
     */
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private String updateBy;
    
    /**
     * 删除标志（0-未删除 1-已删除）
     */
    @TableLogic
    private Integer deleted;
}
