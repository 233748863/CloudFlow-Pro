package com.cloudflow.hr.domain.dto.dispute;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/**
 * 争议仲裁记录入参。
 */
@Data
@Schema(name = "HrDisputeArbitrationDTO", description = "争议仲裁记录入参")
public class HrDisputeArbitrationDTO {

    @Schema(description = "仲裁委员会")
    @Size(max = 200)
    private String arbitrationCommittee;

    @Schema(description = "案号")
    @Size(max = 64)
    private String caseNo;

    @Schema(description = "受理日期")
    private LocalDate acceptedAt;

    @Schema(description = "庭审日期列表")
    private List<String> hearingDates;

    @Schema(description = "裁决书编号")
    @Size(max = 64)
    private String awardNo;

    @Schema(description = "裁决结果 SUPPORTED/REJECTED/PARTIAL")
    @Size(max = 32)
    private String awardResult;

    @Schema(description = "裁决金额")
    private BigDecimal awardAmount;

    @Schema(description = "生效日期")
    private LocalDate effectiveDate;

    @Schema(description = "裁决书 URL")
    @Size(max = 500)
    private String awardDocUrl;
}
