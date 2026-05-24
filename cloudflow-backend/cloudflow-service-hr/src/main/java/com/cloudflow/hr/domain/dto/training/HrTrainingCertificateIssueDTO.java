package com.cloudflow.hr.domain.dto.training;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

/**
 * 培训证书颁发入参。
 */
@Data
@Schema(name = "HrTrainingCertificateIssueDTO", description = "培训证书颁发入参")
public class HrTrainingCertificateIssueDTO {

    @Schema(description = "员工 ID")
    @NotNull(message = "员工 ID 不能为空")
    private Long employeeId;

    @Schema(description = "课程 ID")
    @NotNull(message = "课程 ID 不能为空")
    private Long courseId;

    @Schema(description = "培训排期 ID")
    private Long sessionId;

    @Schema(description = "证书模板 ID")
    @NotNull(message = "证书模板 ID 不能为空")
    private Long templateId;
}
