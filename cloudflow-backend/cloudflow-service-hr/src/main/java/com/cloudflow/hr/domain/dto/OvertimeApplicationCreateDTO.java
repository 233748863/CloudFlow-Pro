package com.cloudflow.hr.domain.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 创建加班申请 DTO
 *
 * 说明：
 * 前端当前会以 yyyy-MM-dd HH:mm:ss 形式提交时间，这里显式声明格式，
 * 避免 Jackson 默认按 ISO-8601 解析导致真实联调请求体 400。
 */
@Data
public class OvertimeApplicationCreateDTO {

    /**
     * 员工 ID
     */
    @NotNull(message = "员工ID不能为空")
    private Long employeeId;

    /**
     * 开始时间
     */
    @NotNull(message = "开始时间不能为空")
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime startTime;

    /**
     * 结束时间
     */
    @NotNull(message = "结束时间不能为空")
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime endTime;

    /**
     * 加班类型：WORKDAY/WEEKEND/HOLIDAY
     */
    @NotBlank(message = "加班类型不能为空")
    private String overtimeType;

    /**
     * 加班原因
     */
    private String reason;

    /**
     * 补偿类型：TIME_OFF/PAYMENT
     */
    @NotBlank(message = "补偿类型不能为空")
    private String compensationType;
}
