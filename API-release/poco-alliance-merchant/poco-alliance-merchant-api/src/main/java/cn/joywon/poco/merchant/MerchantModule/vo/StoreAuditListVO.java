package cn.joywon.poco.merchant.MerchantModule.vo;

import cn.joywon.poco.merchant.MerchantModule.definition.AuditStatusEnum;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@Schema(description = "门店待审核列表返回数据")
public class StoreAuditListVO {

    @Schema(description = "审核记录ID")
    private Long auditId;

    @Schema(description = "门店名称")
    private String storeName;

    @Schema(description = "商户名称")
    private String merchantName;

    @Schema(description = "行业名称")
    private String industryName;

    @Schema(description = "门店地址")
    private String addressDetail;

    @Schema(description = "门店Logo URL")
    private String logoUrl;

    @Schema(description = "审核状态")
    private AuditStatusEnum auditStatus;

    @Schema(description = "审核类型")
    private AuditStatusEnum auditType;

    @Schema(description = "提交审核时间")
    private LocalDateTime createdTime;

}