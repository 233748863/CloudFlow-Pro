package com.cloudflow.hr.domain.vo.dispute;

import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * HR 劳动争议调解记录 VO（剔除 deleted/tenantId）。
 */
@Data
@Schema(name = "HrDisputeMediationVO", description = "HR 劳动争议调解记录 VO")
public class HrDisputeMediationVO {
    @Schema(description = "调解记录 ID") private Long id;
    @Schema(description = "争议 ID") private Long disputeId;
    @Schema(description = "调解员 ID") private Long mediatorId;
    @Schema(description = "调解日期") private LocalDate mediationDate;
    @Schema(description = "调解地点") private String location;
    @Schema(description = "调解过程纪要") private String processSummary;
    @Schema(description = "调解结果") private String result;
    @Schema(description = "调解协议附件 URL") private String agreementUrl;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime signedAt;
    @Schema(description = "创建人") private String createBy;
    @Schema(description = "更新人") private String updateBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime createTime;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime updateTime;
}
