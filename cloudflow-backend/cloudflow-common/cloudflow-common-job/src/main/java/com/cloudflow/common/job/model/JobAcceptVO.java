package com.cloudflow.common.job.model;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 异步接收结果。
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class JobAcceptVO {
    private boolean accepted;
    private String executeNo;
    private String reason;
}
