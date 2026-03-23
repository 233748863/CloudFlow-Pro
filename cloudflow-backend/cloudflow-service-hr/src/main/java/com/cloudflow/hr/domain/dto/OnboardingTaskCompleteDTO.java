package com.cloudflow.hr.domain.dto;

import lombok.Data;

import jakarta.validation.constraints.NotNull;
import java.io.Serializable;

/**
 * 完成入职任务DTO
 *
 * @author CloudFlow
 * @since 2026-03-20
 */
@Data
public class OnboardingTaskCompleteDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    /**
     * 任务ID
     */
    @NotNull(message = "任务ID不能为空")
    private Long taskId;

    /**
     * 备注
     */
    private String remark;
}
