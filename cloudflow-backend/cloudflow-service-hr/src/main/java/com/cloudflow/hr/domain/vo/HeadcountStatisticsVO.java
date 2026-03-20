package com.cloudflow.hr.domain.vo;

import lombok.Data;

import java.math.BigDecimal;

/**
 * 编制统计VO
 * 
 * @author CloudFlow
 * @since 2026-03-20
 */
@Data
public class HeadcountStatisticsVO {

    /**
     * 目标类型：DEPT-部门 POST-岗位
     */
    private String targetType;

    /**
     * 目标ID
     */
    private Long targetId;

    /**
     * 目标名称
     */
    private String targetName;

    /**
     * 核定编制数
     */
    private Integer approvedCount;

    /**
     * 实际在职人数
     */
    private Integer actualCount;

    /**
     * 空缺人数
     */
    private Integer vacancyCount;

    /**
     * 编制使用率（实际人数/核定编制数）
     */
    private BigDecimal utilizationRate;

    /**
     * 是否超编
     */
    private Boolean isOverstaffed;
}
