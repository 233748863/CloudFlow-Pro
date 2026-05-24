package com.cloudflow.hr.domain.dto.dispute;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 劳动争议登记/修改入参。
 *
 * <p>{@code applicantExternalPhone} 落库时由 Entity 上的 @EncryptField 自动加密。
 */
@Data
@Schema(name = "HrLaborDisputeDTO", description = "劳动争议登记入参")
public class HrLaborDisputeDTO {

    @Schema(description = "争议编号")
    @Size(max = 64)
    private String disputeNo;

    @Schema(description = "申请人员工 ID（内部员工 二选一）")
    private Long applicantEmployeeId;

    @Schema(description = "外部申请人姓名（外部当事人 二选一）")
    @Size(max = 64)
    private String applicantExternalName;

    @Schema(description = "外部申请人电话（落库自动加密）")
    @Size(max = 32)
    private String applicantExternalPhone;

    @Schema(description = "争议类型 SALARY/CONTRACT/INJURY/DISMISSAL/OTHER")
    @NotBlank(message = "争议类型不能为空")
    @Size(max = 32)
    private String disputeType;

    @Schema(description = "诉求金额")
    private BigDecimal claimAmount;

    @Schema(description = "诉求描述")
    @Size(max = 2000)
    private String claimDescription;

    @Schema(description = "立案日期")
    private LocalDate openedAt;

    @Schema(description = "备注")
    @Size(max = 500)
    private String remark;
}
