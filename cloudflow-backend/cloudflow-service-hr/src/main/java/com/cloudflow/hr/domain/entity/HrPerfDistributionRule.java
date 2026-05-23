package com.cloudflow.hr.domain.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.extension.handlers.JacksonTypeHandler;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * HR-P0-2 绩效强制分布规则实体。
 */
@Data
@TableName(value = "hr_perf_distribution_rule", autoResultMap = true)
public class HrPerfDistributionRule {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private Long objectiveId;
    private String ruleName;

    @TableField(typeHandler = JacksonTypeHandler.class)
    private List<Map<String, Object>> distribution;

    private Integer totalPopulation;
    private String enforceMode;
    private String status;
    private String remark;
    private String createBy;
    private String updateBy;
    private Integer deleted;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}
