package com.cloudflow.auth.domain.vo;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 同步发送结果。
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class SendResultVO {
    private boolean success;
    private String message;
    private Long recordId;
}
