package com.cloudflow.auth.domain;

import lombok.Data;

/** 同一渠道的当前自然日和自然分钟发送尝试数。 */
@Data
public class MessageAttemptCounts {
    private long dayCount;
    private long minuteCount;
}
