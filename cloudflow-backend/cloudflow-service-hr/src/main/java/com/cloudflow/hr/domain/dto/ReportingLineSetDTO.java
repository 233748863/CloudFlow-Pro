package com.cloudflow.hr.domain.dto;

import lombok.Data;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.time.LocalDate;

/**
 * 设置汇报关系DTO
 * 
 * @author CloudFlow
 * @since 2026-03-20
 */
@Data
public class ReportingLineSetDTO {

    /**
     * 员工ID
     */
    @NotNull(message = "员工ID不能为空")
    private Long employeeId;

    /**
     * 汇报对象ID
     */
    @NotNull(message = "汇报对象ID不能为空")
    private Long reportToId;

    /**
     * 汇报类型：DIRECT-直接汇报 DOTTED-虚线汇报
     */
    @NotBlank(message = "汇报类型不能为空")
    private String reportType;

    /**
     * 生效日期
     */
    private LocalDate effectiveDate;

    /**
     * 失效日期
     */
    private LocalDate expiryDate;
}
