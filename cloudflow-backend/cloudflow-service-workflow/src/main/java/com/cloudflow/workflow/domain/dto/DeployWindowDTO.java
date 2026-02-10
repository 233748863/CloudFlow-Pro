package com.cloudflow.workflow.domain.dto;

import lombok.Data;
import java.time.LocalTime;

/**
 * 发布窗口配置DTO
 */
@Data
public class DeployWindowDTO {
    private Long id;
    private String windowName;
    private String windowType;
    private LocalTime startTime;
    private LocalTime endTime;
    private String weekDays;
    private String monthDays;
    private String customDates;
    private Boolean isEnabled;
    private String description;
}
