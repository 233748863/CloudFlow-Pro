package com.cloudflow.workflow.domain.monitor;

import lombok.Data;

/**
 * 流程趋势数据
 * 
 * @author CloudFlow Team
 * @since 2026-02-22
 */
@Data
public class ProcessTrend {
    private String date;
    private Integer started;
    private Integer completed;
    private Integer timeout;
    private Integer anomaly;
}
