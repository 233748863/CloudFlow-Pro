package com.cloudflow.auth.domain.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/**
 * 任务启停请求。
 */
@Data
public class JobToggleDTO {
    @NotBlank(message = "任务状态不能为空")
    private String status;
    private Boolean confirmCritical;
}
