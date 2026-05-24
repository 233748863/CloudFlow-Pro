package com.cloudflow.hr.domain.dto.recruitment;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * 简历解析触发入参。
 *
 * <p>HR-P1-1 简历解析端点收敛 candidateId / resumeUrl / rawText 三参，
 * 替代 Controller 直接收 {@code Map<String,Object>} body 的弱类型用法。
 */
@Data
@Schema(name = "HrResumeParseDTO", description = "简历解析触发入参")
public class HrResumeParseDTO {

    @Schema(description = "候选人 ID")
    @NotNull(message = "候选人 ID 不能为空")
    private Long candidateId;

    @Schema(description = "简历 OSS URL")
    @Size(max = 500)
    private String resumeUrl;

    @Schema(description = "简历原始文本（用于 LLM/规则解析）")
    private String rawText;
}
