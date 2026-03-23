package com.cloudflow.hr.domain.dto;

import lombok.Data;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 创建招聘需求DTO
 *
 * @author CloudFlow
 * @since 2026-03-20
 */
@Data
public class RecruitmentRequestCreateDTO {

    /**
     * 部门ID
     */
    @NotNull(message = "部门ID不能为空")
    private Long deptId;

    /**
     * 职位ID
     */
    @NotNull(message = "职位ID不能为空")
    private Long positionId;

    /**
     * 招聘人数
     */
    @NotNull(message = "招聘人数不能为空")
    @Min(value = 1, message = "招聘人数至少为1")
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
}
