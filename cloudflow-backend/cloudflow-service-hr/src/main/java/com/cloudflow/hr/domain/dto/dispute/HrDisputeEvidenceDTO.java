package com.cloudflow.hr.domain.dto.dispute;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * 争议证据上传入参。
 */
@Data
@Schema(name = "HrDisputeEvidenceDTO", description = "争议证据上传入参")
public class HrDisputeEvidenceDTO {

    @Schema(description = "证据类型 CONTRACT/PAYSLIP/CHAT/EMAIL/OTHER")
    @NotBlank(message = "证据类型不能为空")
    @Size(max = 30)
    private String evidenceType = "OTHER";

    @Schema(description = "备注")
    @Size(max = 500)
    private String remark;
}
