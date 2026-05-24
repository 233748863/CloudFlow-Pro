package com.cloudflow.hr.domain.dto.training;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * 培训证书撤销入参。
 */
@Data
@Schema(name = "HrTrainingCertificateRevokeDTO", description = "培训证书撤销入参")
public class HrTrainingCertificateRevokeDTO {

    @Schema(description = "撤销原因")
    @Size(max = 500)
    private String reason;
}
