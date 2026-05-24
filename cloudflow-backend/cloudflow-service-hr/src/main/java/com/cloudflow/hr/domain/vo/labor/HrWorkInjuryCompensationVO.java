package com.cloudflow.hr.domain.vo.labor;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 工伤赔偿明细 VO。
 *
 * <p>{@code bankAccountMasked} 仅展示掩码（****1234），原始密文不出现在 VO。
 */
@Data
@Schema(name = "HrWorkInjuryCompensationVO", description = "工伤赔偿明细")
public class HrWorkInjuryCompensationVO {

    private Long id;
    private Long injuryId;
    private String itemType;
    private BigDecimal amount;
    private String paymentStatus;
    private LocalDateTime paidAt;

    @Schema(description = "收款银行账号掩码（****1234）")
    private String bankAccountMasked;

    private String remark;
    private LocalDateTime createTime;
}
