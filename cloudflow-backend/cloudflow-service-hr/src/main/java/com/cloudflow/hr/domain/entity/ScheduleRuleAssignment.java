package com.cloudflow.hr.domain.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 排班规则分配实体。
 */
@Data
@TableName("hr_schedule_rule_assignment")
public class ScheduleRuleAssignment {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;

    private Long ruleId;

    /**
     * DEPT / POST / EMPLOYEE。
     */
    private String targetType;

    private Long targetId;

    private LocalDate effectiveStart;

    private LocalDate effectiveEnd;

    private Integer status;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;

    @TableField(fill = FieldFill.INSERT)
    private String createBy;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private String updateBy;

    @TableLogic
    private Integer deleted;
}
