package cn.joywon.poco.merchant.MerchantModule.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.io.Serial;
import java.io.Serializable;
import java.math.BigDecimal;

@Data
@Schema(description = "门店缓存数据模型")
public class StoreCacheDTO implements Serializable {

    @Serial
    private static final long serialVersionUID = 7754746806634510988L;

    @Schema(description = "门店ID")
    private String id;

    @Schema(description = "门店名称")
    private String name;

    @Schema(description = "门店电话")
    private String phone;

    @Schema(description = "门店描述")
    private String description;

    @Schema(description = "门店地址")
    private String addressDetail;

    @Schema(description = "门店logoURL")
    private String logoUrl;

    @Schema(description = "营业时间")
    private String businessHours;

    @Schema(description = "营业状态")
    private String businessStatus;

    @Schema(description = "门店评分")
    private BigDecimal storeScore;

    @Schema(description = "位置经度")
    private Double latitude;

    @Schema(description = "位置纬度")
    private Double longitude;

    @Schema(description = "所属商家ID")
    private String merchantId;

    @Schema(description = "所属商家名称")
    private String merchantName;

    @Schema(description = "所属商家logoURL")
    private String merchantLogo;

    @Schema(description = "所属行业分类ID")
    private String industryId;

    @Schema(description = "所属行业分类名称")
    private String industryName;

}