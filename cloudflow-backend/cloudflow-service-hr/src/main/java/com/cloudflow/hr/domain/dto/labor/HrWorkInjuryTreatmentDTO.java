package com.cloudflow.hr.domain.dto.labor;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/**
 * 工伤医疗记录新增/修改入参。
 *
 * <p>{@code diagnosis} 字段在 Entity 层会自动加密，本 DTO 不做特殊处理。
 */
@Data
@Schema(name = "HrWorkInjuryTreatmentDTO", description = "工伤医疗记录入参")
public class HrWorkInjuryTreatmentDTO {

    @Schema(description = "就诊医院")
    @NotBlank(message = "医院名称不能为空")
    @Size(max = 128)
    private String hospitalName;

    @Schema(description = "入院日期")
    @NotNull(message = "入院日期不能为空")
    private LocalDate admitDate;

    @Schema(description = "出院日期")
    private LocalDate dischargeDate;

    @Schema(description = "总费用")
    private BigDecimal totalCost;

    @Schema(description = "工伤保险报销金额")
    private BigDecimal insuranceCovered;

    @Schema(description = "自付金额")
    private BigDecimal selfPaid;

    @Schema(description = "诊断（敏感字段，落库自动加密）")
    @Size(max = 1024)
    private String diagnosis;

    @Schema(description = "治疗概要")
    @Size(max = 2048)
    private String treatmentSummary;

    @Schema(description = "票据附件 ID 列表")
    private List<Long> receipts;
}
