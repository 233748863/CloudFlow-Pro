package cn.joywon.poco.merchant.MerchantModule.vo;

import cn.joywon.poco.merchant.MerchantModule.definition.BusinessStatusEnum;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

@Data
@Schema(description = "门店简要信息返回数据")
public class StoreSimpleInfoVO {

    @Schema(description = "门店ID")
    private Long storeId;

    @Schema(description = "门店名称")
    private String storeName;

    @Schema(description = "门店logoURL")
    private String storeLogoUrl;

    @Schema(description = "门店地址")
    private String storeAddress;

    @Schema(description = "门店营业状态: OPEN-营业中; CLOSED-已关店; RESTING-休息中; DELETED-已删除")
    private BusinessStatusEnum storeBusinessStatus;

}