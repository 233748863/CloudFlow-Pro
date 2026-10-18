package com.cloudflow.auth.domain.dto;

import lombok.Data;

import java.time.LocalDate;

/**
 * 任务日志清理请求。
 */
@Data
public class JobLogCleanDTO {
    private LocalDate beforeDate;
    private Integer keepDays;
}
