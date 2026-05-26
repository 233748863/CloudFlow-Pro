package com.cloudflow.hr.domain.vo.training;

import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * HR 培训证书 VO（剔除 deleted/tenantId）。
 */
@Data
@Schema(name = "HrTrainingCertificateVO", description = "HR 培训证书 VO")
public class HrTrainingCertificateVO {
    @Schema(description = "证书 ID") private Long id;
    @Schema(description = "证书编号") private String certNo;
    @Schema(description = "员工 ID") private Long employeeId;
    @Schema(description = "课程 ID") private Long courseId;
    @Schema(description = "班次 ID") private Long sessionId;
    @Schema(description = "证书模板 ID") private Long templateId;
    @Schema(description = "颁发日期") private LocalDate issueDate;
    @Schema(description = "失效日期") private LocalDate expireDate;
    @Schema(description = "PDF 附件 ID") private Long pdfFileId;
    @Schema(description = "状态") private String status;
    @Schema(description = "撤销原因") private String revokedReason;
    @Schema(description = "创建人") private String createBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime createTime;
    @Schema(description = "更新人") private String updateBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime updateTime;
}
