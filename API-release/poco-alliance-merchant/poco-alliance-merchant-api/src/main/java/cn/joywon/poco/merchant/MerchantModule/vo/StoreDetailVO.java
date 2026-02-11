package cn.joywon.poco.merchant.MerchantModule.vo;

import cn.joywon.poco.merchant.MerchantModule.definition.AuditStatusEnum;
import cn.joywon.poco.merchant.MerchantModule.definition.BusinessStatusEnum;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

@Data
@Schema(description = "门店详情返回数据")
public class StoreDetailVO {

    @Schema(description = "商家ID")
    private Long merchantId;

    @Schema(description = "商家名称")
    private String merchantName;

    @Schema(description = "商家logoURL")
    private String merchantLogoUrl;

    @Schema(description = "商家经营状态")
    private BusinessStatusEnum merchantBusinessStatus;

    @Schema(description = "商家联系电话")
    private String merchantContactPhone;

    @Schema(description = "门店ID")
    private Long storeId;

    @Schema(description = "门店名称")
    private String name;

    @Schema(description = "门店地区编码")
    private String regionCode;

    @Schema(description = "门店所在地区")
    private String location;

    @Schema(description = "门店详细地址")
    private String addressDetail;

    @Schema(description = "门店电话")
    private String phone;

    @Schema(description = "门店logoURL")
    private String logoUrl;

    @Schema(description = "门店图片URL列表")
    private List<String> images;

    @Schema(description = "营业时间")
    private String businessHours;

    @Schema(description = "行业分类ID")
    private Long industryId;

    @Schema(description = "门店营业执照编号")
    private String licenseNo;

    @Schema(description = "门店资质图片URL列表")
    private List<String> licenseImages;

    @Schema(description = "营业状态")
    private BusinessStatusEnum businessStatus;

    @Schema(description = "审核状态")
    private AuditStatusEnum auditStatus;

    @Schema(description = "审核类型")
    private AuditStatusEnum auditType;

    @Schema(description = "审核备注")
    private String auditRemark;

    @Schema(description = "审核时间")
    private LocalDateTime auditTime;

    @Schema(description = "审核人ID")
    private Long auditId;

    @Schema(description = "审核人名称")
    private String auditName;

    @Schema(description = "审核提交时间")
    private LocalDateTime createdTime;

    @Schema(description = "是否被平台启用: true-启用; false-禁用")
    private Boolean enable;

}