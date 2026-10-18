package com.cloudflow.auth.domain.vo;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 手动触发结果。
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class JobTriggerResultVO {
    private String executeNo;
    private boolean accepted;
    private String reason;
}
