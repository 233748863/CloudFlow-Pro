package com.cloudflow.auth.domain.vo;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * CRON 校验结果。
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class CronValidateVO {
    private boolean valid;
    private String message;
    private List<String> nextFireTimes;
}
