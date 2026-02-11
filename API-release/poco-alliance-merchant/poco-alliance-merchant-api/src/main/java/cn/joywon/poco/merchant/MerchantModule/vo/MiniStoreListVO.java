package cn.joywon.poco.merchant.MerchantModule.vo;

import cn.joywon.poco.merchant.Common.convert.DistanceSerializer;
import cn.joywon.poco.merchant.MerchantModule.definition.BusinessStatusEnum;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.math.BigDecimal;

@Data
@Schema(description = "小程序门店列表返回数据")
public class MiniStoreListVO {

    @JsonSerialize(using = DistanceSerializer.class)
    @Schema(description = "与坐标点距离")
    private Double distance;

    @Schema(description = "门店ID")
    private Long storeId;

    @Schema(description = "门店名称")
    private String storeName;

    @Schema(description = "门店logo")
    private String storeLogo;

    @Schema(description = "门店地址")
    private String storeAddress;

    @Schema(description = "门店联系电话")
    private String contactPhone;

    @Schema(description = "门店营业时间")
    private String businessHours;

    @Schema(description = "门店营业状态")
    private BusinessStatusEnum businessStatus;

    @Schema(description = "门店评分")
    private BigDecimal storeScore;

    @Schema(description = "门店纬度")
    private Double latitude;

    @Schema(description = "门店经度")
    private Double longitude;

}