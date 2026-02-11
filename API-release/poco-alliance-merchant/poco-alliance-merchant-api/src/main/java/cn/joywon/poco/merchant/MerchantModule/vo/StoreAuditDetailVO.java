package cn.joywon.poco.merchant.MerchantModule.vo;

import cn.joywon.poco.merchant.MerchantModule.definition.AuditStatusEnum;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

@Data
@Schema(description = "门店审核详情返回数据")
public class StoreAuditDetailVO {

    @Schema(description = "审核记录ID")
    private Long auditId;

    @Schema(description = "门店ID")
    private Long storeId;

    @Schema(description = "门店名称")
    private String storeName;

    @Schema(description = "商户名称")
    private String merchantName;

    @Schema(description = "商户ID")
    private Long merchantId;

    @Schema(description = "行业分类名称")
    private String industryName;

    @Schema(description = "门店简介")
    private String description;

    @Schema(description = "门店区域编码")
    private String regionCode;

    @Schema(description = "门店所在地区")
    private String location;

    @Schema(description = "门店详细地址")
    private String addressDetail;

    @Schema(description = "联系电话")
    private String phone;

    @Schema(description = "门店logo")
    private String logoUrl;

    @Schema(description = "门店图片URL列表")
    private List<String> images;

    @Schema(description = "营业时间")
    private String businessHours;

    @Schema(description = "门店营业执照号")
    private String licenseNo;

    @Schema(description = "门店资质图片URL列表")
    private List<String> licenseImages;

    @Schema(description = "审核状态")
    private AuditStatusEnum auditStatus;

    @Schema(description = "审核类型")
    private AuditStatusEnum auditType;

    @Schema(description = "审核人")
    private String auditBy;

    @Schema(description = "审核备注")
    private String auditRemark;

    @Schema(description = "审核时间")
    private LocalDateTime auditTime;

    @Schema(description = "修改原因")
    private String modifyReason;

    @Schema(description = "是否启用: true-启用; false-禁用")
    private Boolean enable;

    @Schema(description = "审核记录创建时间")
    private LocalDateTime createdTime;

}