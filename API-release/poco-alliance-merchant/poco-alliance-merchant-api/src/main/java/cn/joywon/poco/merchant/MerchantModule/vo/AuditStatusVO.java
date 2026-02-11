package cn.joywon.poco.merchant.MerchantModule.vo;

import cn.joywon.poco.merchant.MerchantModule.definition.AuditStatusEnum;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@Schema(description = "商家审核状态返回数据")
public class AuditStatusVO {

    @Schema(description = "审核记录ID")
    private Long auditId;

    @Schema(description = "审核类型: CREATE-创建; REVISION-修改")
    private AuditStatusEnum auditType;

    @Schema(description = "审核状态: PENDING-待审核; APPROVED-通过; REJECTED-拒绝")
    private AuditStatusEnum auditStatus;

    @Schema(description = "审核提交时间")
    private LocalDateTime createdTime;

    @Schema(description = "审核时间")
    private LocalDateTime auditTime;

    @Schema(description = "审核备注")
    private String auditRemark;

    @Schema(description = "提交修改原因")
    private String modifyReason;

}