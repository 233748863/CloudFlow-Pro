package com.cloudflow.hr.domain.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 假期类型实体类
 * 用于定义各种假期类型及其规则
 */
@Data
@TableName("hr_leave_type")
public class LeaveType {
    
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
     * 假期编码（唯一标识）
     */
    private String leaveCode;
    
    /**
     * 假期名称（如：年假、病假、事假）
     */
    private String leaveName;
    
    /**
     * 是否需要额度：0-否 1-是
     * 年假、调休需要额度，病假、事假不需要额度
     */
    private Boolean needQuota;
    
    /**
     * 是否带薪：0-否 1-是
     */
    private Boolean isPaid;
    
    /**
     * 计算单位：DAY-天 HOUR-小时
     */
    private String unit;
    
    /**
     * 额度规则（JSON格式）
     * 例如：{"baseQuota": 5, "incrementPerYear": 1, "maxQuota": 15}
     */
    private String quotaRule;
    
    /**
     * 过期规则（JSON格式）
     * 例如：{"expiryType": "YEAR_END", "carryOver": false}
     */
    private String expiryRule;
    
    /**
     * 状态：0-禁用 1-启用
     */
    private Integer status;
    
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
