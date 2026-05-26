package com.cloudflow.hr.domain.vo.dispute;

import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * HR 劳动争议证据 VO（剔除 deleted/tenantId）。
 */
@Data
@Schema(name = "HrDisputeEvidenceVO", description = "HR 劳动争议证据 VO")
public class HrDisputeEvidenceVO {
    @Schema(description = "证据 ID") private Long id;
    @Schema(description = "争议 ID") private Long disputeId;
    @Schema(description = "证据类型") private String evidenceType;
    @Schema(description = "附件文件 ID") private Long fileId;
    @Schema(description = "上传人 ID") private Long uploadedBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime uploadedAt;
    @Schema(description = "备注") private String remark;
    @Schema(description = "创建人") private String createBy;
    @Schema(description = "更新人") private String updateBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime createTime;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime updateTime;
}
