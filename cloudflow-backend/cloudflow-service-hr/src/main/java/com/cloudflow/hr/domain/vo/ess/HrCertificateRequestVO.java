package com.cloudflow.hr.domain.vo.ess;

import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * HR 证明开具 VO（剔除 deleted/tenantId）。
 */
@Data
@Schema(name = "HrCertificateRequestVO", description = "HR 证明开具 VO")
public class HrCertificateRequestVO {
    @Schema(description = "证明请求 ID") private Long id;
    @Schema(description = "请求编号") private String requestNo;
    @Schema(description = "员工 ID") private Long employeeId;
    @Schema(description = "证明类型") private String certificateType;
    @Schema(description = "用途") private String purpose;
    @Schema(description = "语言") private String language;
    @Schema(description = "送达单位") private String recipientOrg;
    @Schema(description = "份数") private Integer copies;
    @Schema(description = "状态") private String status;
    @Schema(description = "审批流程实例 ID") private String processInstanceId;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime issuedAt;
    @Schema(description = "PDF 附件 ID") private Long pdfFileId;
    @Schema(description = "备注") private String remark;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime createTime;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime updateTime;
    @Schema(description = "创建人") private String createBy;
    @Schema(description = "更新人") private String updateBy;
}
