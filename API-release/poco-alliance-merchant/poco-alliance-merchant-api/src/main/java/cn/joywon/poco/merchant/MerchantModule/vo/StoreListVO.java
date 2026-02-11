package cn.joywon.poco.merchant.MerchantModule.vo;

import cn.joywon.poco.merchant.MerchantModule.definition.BusinessStatusEnum;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

@Data
@Schema(description = "门店信息返回数据")
public class StoreListVO {

    @Schema(description = "商家ID")
    private Long merchantId;

    @Schema(description = "商家名称")
    private String merchantName;

    @Schema(description = "商家logo")
    private String merchantLogo;

    @Schema(description = "门店ID")
    private Long id;

    @Schema(description = "门店名称")
    private String name;

    @Schema(description = "门店地址")
    private String addressDetail;

    @Schema(description = "门店电话")
    private String phone;

    @Schema(description = "门店logoURL")
    private String logoUrl;

    @Schema(description = "营业时间")
    private String businessHours;

    @Schema(description = "营业状态: OPEN(营业中), CLOSED(已关店), RESTING(休息中)")
    private BusinessStatusEnum businessStatus;

    @Schema(description = "是否被平台启用: true-启用; false-禁用")
    private Boolean enable;

}