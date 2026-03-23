package com.cloudflow.hr.domain.vo;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 招聘需求VO
 *
 * @author CloudFlow
 * @since 2026-03-20
 */
@Data
public class RecruitmentRequestVO {

    /**
     * 主键ID
     */
    private Long id;

    /**
     * 租户ID
     */
    private Long tenantId;

    /**
     * 需求编号
     */
    private String requestNo;

    /**
     * 部门ID
     */
    private Long deptId;

    /**
     * 部门名称
     */
    private String deptName;

    /**
     * 职位ID
     */
    private Long positionId;

    /**
     * 职位名称
     */
    private String positionName;

    /**
     * 招聘人数
     */
    private Integer headcount;

    /**
     * 任职要求
     */
    private String jobRequirements;

    /**
     * 薪资范围-最低
     */
    private BigDecimal salaryMin;

    /**
     * 薪资范围-最高
     */
    private BigDecimal salaryMax;

    /**
     * 期望到岗日期
     */
    private LocalDate expectedDate;

    /**
     * 流程实例ID
     */
    private String processInstanceId;

    /**
     * 状态
     */
    private String status;

    /**
     * 状态描述
     */
    private String statusDesc;

    /**
     * 已招聘人数
     */
    private Integer hiredCount;

    /**
     * 创建时间
     */
    private LocalDateTime createTime;

    /**
     * 更新时间
     */
    private LocalDateTime updateTime;
}
