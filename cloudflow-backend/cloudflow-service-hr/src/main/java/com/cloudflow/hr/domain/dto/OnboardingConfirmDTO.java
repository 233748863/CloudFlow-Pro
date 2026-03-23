package com.cloudflow.hr.domain.dto;

import lombok.Data;

import jakarta.validation.constraints.NotNull;
import java.io.Serializable;
import java.time.LocalDate;

/**
 * 确认入职DTO
 *
 * @author CloudFlow
 * @since 2026-03-20
 */
@Data
public class OnboardingConfirmDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    /**
     * 入职申请ID
     */
    @NotNull(message = "入职申请ID不能为空")
    private Long applicationId;

    /**
     * 实际入职日期
     */
    @NotNull(message = "实际入职日期不能为空")
    private LocalDate actualDate;
}
