package com.cloudflow.workflow.domain;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.LocalDateTime;
import java.time.LocalTime;

/**
 * 流程发布窗口配置实体
 */
@Data
@TableName("wf_deploy_window")
public class WfDeployWindow {
    
    /**
     * 主键ID
     */
    @TableId(type = IdType.AUTO)
    private Long id;
    
    /**
     * 租户ID
     */
    private Long tenantId;
    
    /**
     * 窗口名称
     */
    private String windowName;
    
    /**
     * 窗口类型: DAILY-每日, WEEKLY-每周, MONTHLY-每月, CUSTOM-自定义
     */
    private String windowType;
    
    /**
     * 开始时间
     */
    private LocalTime startTime;
    
    /**
     * 结束时间
     */
    private LocalTime endTime;
    
    /**
     * 星期几(1-7,逗号分隔)
     */
    private String weekDays;
    
    /**
     * 每月几号(1-31,逗号分隔)
     */
    private String monthDays;
    
    /**
     * 自定义日期(JSON数组)
     */
    private String customDates;
    
    /**
     * 是否启用: 0-禁用, 1-启用
     */
    private Boolean isEnabled;
    
    /**
     * 窗口描述
     */
    private String description;
    
    /**
     * 创建人ID
     */
    @TableField(fill = FieldFill.INSERT)
    private Long createdBy;
    
    /**
     * 创建时间
     */
    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdTime;
    
    /**
     * 更新人ID
     */
    @TableField(fill = FieldFill.UPDATE)
    private Long updatedBy;
    
    /**
     * 更新时间
     */
    @TableField(fill = FieldFill.UPDATE)
    private LocalDateTime updatedTime;
}
