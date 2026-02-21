package com.cloudflow.workflow.domain.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.io.Serializable;

/**
 * 流程统计信息VO
 *
 * @author CloudFlow Team
 * @since 2026-02-22
 */
@Data
@Schema(description = "流程统计信息")
public class ProcessStatisticsVO implements Serializable {

    private static final long serialVersionUID = 1L;

    @Schema(description = "总数")
    private Long totalCount;

    @Schema(description = "已完成数")
    private Long completedCount;

    @Schema(description = "运行中数")
    private Long runningCount;

    @Schema(description = "失败数")
    private Long failedCount;

    @Schema(description = "平均时长(毫秒)")
    private Long avgDuration;

    @Schema(description = "最大时长(毫秒)")
    private Long maxDuration;

    @Schema(description = "最小时长(毫秒)")
    private Long minDuration;

    @Schema(description = "成功率(%)")
    private Double successRate;
}
