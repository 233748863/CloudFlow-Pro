package com.cloudflow.hr.domain.vo.dispute;

import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/**
 * HR 劳动争议仲裁记录 VO（剔除 deleted/tenantId）。
 */
@Data
@Schema(name = "HrDisputeArbitrationVO", description = "HR 劳动争议仲裁记录 VO")
public class HrDisputeArbitrationVO {
    @Schema(description = "仲裁记录 ID") private Long id;
    @Schema(description = "争议 ID") private Long disputeId;
    @Schema(description = "仲裁委员会") private String arbitrationCommittee;
    @Schema(description = "案件编号") private String caseNo;
    @Schema(description = "受理日期") private LocalDate acceptedAt;
    @Schema(description = "开庭日期列表") private List<String> hearingDates;
    @Schema(description = "裁决书编号") private String awardNo;
    @Schema(description = "裁决结果") private String awardResult;
    @Schema(description = "裁决金额") private BigDecimal awardAmount;
    @Schema(description = "生效日期") private LocalDate effectiveDate;
    @Schema(description = "裁决书附件 URL") private String awardDocUrl;
    @Schema(description = "创建人") private String createBy;
    @Schema(description = "更新人") private String updateBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime createTime;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime updateTime;
}
