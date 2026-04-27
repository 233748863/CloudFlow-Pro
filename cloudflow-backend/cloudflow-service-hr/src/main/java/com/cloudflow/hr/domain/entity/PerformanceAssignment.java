package com.cloudflow.hr.domain.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 绩效分配节点。
 */
@Data
@TableName("hr_performance_assignment")
public class PerformanceAssignment {

    @TableId(value = "id", type = IdType.AUTO)
    private Long id;

    private Long tenantId;

    private Long objectiveId;

    private Long parentId;

    private String nodeKey;

    /**
     * DEPT / EMPLOYEE。
     */
    private String assigneeType;

    private Long assigneeId;

    private String assigneeName;

    /**
     * 考核对象类型编码。部门总节点为空，指标节点和员工叶子有值。
     */
    private String categoryCode;

    private String categoryName;

    private String metricCode;

    private String metricName;

    private String metricUnit;

    private String metricValueType;

    private Integer metricPrecision;

    private BigDecimal metricWeight;

    private BigDecimal targetAmount;

    private BigDecimal actualAmount;

    /**
     * MANAGER / DEPT_OWNER。
     */
    private String quotaSource;

    private Boolean locked;

    private Long ownerEmployeeId;

    private Integer sortOrder;

    private String status;

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
