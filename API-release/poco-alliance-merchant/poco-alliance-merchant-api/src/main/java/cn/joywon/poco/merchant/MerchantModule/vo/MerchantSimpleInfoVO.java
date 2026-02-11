package cn.joywon.poco.merchant.MerchantModule.vo;

import cn.joywon.poco.merchant.MerchantModule.definition.BusinessStatusEnum;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

@Data
@Schema(description = "商家简要信息返回数据")
public class MerchantSimpleInfoVO {

    @Schema(description = "商家Id")
    private Long merchantId;

    @Schema(description = "商家名称")
    private String merchantName;

    @Schema(description = "商家logoURL")
    private String merchantLogoUrl;

    @Schema(description = "商家简介")
    private String description;

    @Schema(description = "商家联系人")
    private String contactName;

    @Schema(description = "商家联系电话")
    private String contactPhone;

    @Schema(description = "商家地址")
    private String merchantAddress;

    @Schema(description = "PREPARING-准备中; OPERATING-经营中; SUSPENDED-停业中; TERMINATED-已结业")
    private BusinessStatusEnum merchantBusinessStatus;

    @Schema(description = "所属行业名称")
    private String industryName;

}