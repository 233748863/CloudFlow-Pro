package com.cloudflow.hr.domain.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 创建加班申请DTO
 * 
 * @author CloudFlow
 * @since 2026-03-20
 */
@Data
public class OvertimeApplicationCreateDTO {

    /**
     * 员工ID
     */
    @NotNull(message = "员工ID不能为空")
    private Long employeeId;

    /**
     * 开始时间
     */
    @NotNull(message = "开始时间不能为空")
    private LocalDateTime startTime;

    /**
     * 结束时间
     */
    @NotNull(message = "结束时间不能为空")
    private LocalDateTime endTime;

    /**
     * 加班类型：WORKDAY-工作日 WEEKEND-周末 HOLIDAY-节假日
     */
    @NotBlank(message = "加班类型不能为空")
    private String overtimeType;

    /**
     * 加班原因
     */
    private String reason;

    /**
     * 补偿类型：TIME_OFF-调休 PAYMENT-加班费
     */
    @NotBlank(message = "补偿类型不能为空")
    private String compensationType;
}
