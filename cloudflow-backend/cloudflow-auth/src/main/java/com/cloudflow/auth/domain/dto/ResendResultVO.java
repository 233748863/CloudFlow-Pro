package com.cloudflow.auth.domain.dto;

import lombok.Builder;
import lombok.Data;

/**
 * 重发结果。
 */
@Data
@Builder
public class ResendResultVO {
    private int requested;
    private int accepted;
}
