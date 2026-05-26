package com.cloudflow.hr.domain.vo.recruitment;

import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * HR 招聘渠道效果统计 VO（用于 GET /recruitment/channels/stats）。
 */
@Data
@Schema(name = "HrChannelStatVO", description = "HR 招聘渠道效果统计 VO")
public class HrChannelStatVO {
    @Schema(description = "渠道 ID") private Long id;
    @Schema(description = "渠道编码") private String channelCode;
    @Schema(description = "渠道名称") private String channelName;
    @Schema(description = "渠道类型") private String channelType;
    @Schema(description = "状态") private String status;
    @Schema(description = "合同起始") private LocalDate contractStart;
    @Schema(description = "合同结束") private LocalDate contractEnd;
    @Schema(description = "成本金额") private BigDecimal costAmount;
    @Schema(description = "成本币种") private String costCurrency;
    @Schema(description = "候选人总数") private Long totalCandidates;
    @Schema(description = "录用人数") private Long hiredCount;
    @Schema(description = "录用率（0-1）") private BigDecimal hireRate;
    @Schema(description = "单次录用成本") private BigDecimal costPerHire;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private java.time.LocalDateTime refreshedAt;
}
