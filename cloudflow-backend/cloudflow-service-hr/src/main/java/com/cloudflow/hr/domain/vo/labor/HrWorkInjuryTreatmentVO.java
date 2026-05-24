package com.cloudflow.hr.domain.vo.labor;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 工伤医疗记录 VO。{@code diagnosis} 字段需要 hr:injury:treatment 权限方解密回填。
 */
@Data
@Schema(name = "HrWorkInjuryTreatmentVO", description = "工伤医疗记录")
public class HrWorkInjuryTreatmentVO {

    private Long id;
    private Long injuryId;
    private String hospitalName;
    private LocalDate admitDate;
    private LocalDate dischargeDate;
    private BigDecimal totalCost;
    private BigDecimal insuranceCovered;
    private BigDecimal selfPaid;
    private String diagnosis;
    private String treatmentSummary;
    private List<Long> receipts;
    private LocalDateTime createTime;
}
