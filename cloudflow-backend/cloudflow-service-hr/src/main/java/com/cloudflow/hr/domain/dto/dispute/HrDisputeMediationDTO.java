package com.cloudflow.hr.domain.dto.dispute;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 争议调解记录入参。
 */
@Data
@Schema(name = "HrDisputeMediationDTO", description = "争议调解记录入参")
public class HrDisputeMediationDTO {

    @Schema(description = "调解员 ID")
    private Long mediatorId;

    @Schema(description = "调解日期")
    private LocalDate mediationDate;

    @Schema(description = "调解地点")
    @Size(max = 200)
    private String location;

    @Schema(description = "调解过程摘要")
    @Size(max = 2000)
    private String processSummary;

    @Schema(description = "调解结果 SUCCESS/FAILED/PARTIAL")
    @Size(max = 32)
    private String result;

    @Schema(description = "调解协议文件 URL")
    @Size(max = 500)
    private String agreementUrl;

    @Schema(description = "签署时间")
    private LocalDateTime signedAt;
}
