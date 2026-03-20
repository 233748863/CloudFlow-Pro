package com.cloudflow.hr.domain.vo;

import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 编制信息VO
 * 
 * @author CloudFlow
 * @since 2026-03-20
 */
@Data
public class HeadcountVO {

    /**
     * 主键ID
     */
    private Long id;

    /**
     * 租户ID
     */
    private Long tenantId;

    /**
     * 目标类型：DEPT-部门 POST-岗位
     */
    private String targetType;

    /**
     * 目标ID（dept_id或post_id）
     */
    private Long targetId;

    /**
     * 目标名称（部门名称或岗位名称）
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
     * 生效日期
     */
    private LocalDate effectiveDate;

    /**
     * 失效日期
     */
    private LocalDate expiryDate;

    /**
     * 创建时间
     */
    private LocalDateTime createTime;

    /**
     * 更新时间
     */
    private LocalDateTime updateTime;
}
