package cn.joywon.poco.merchant.MerchantModule.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDate;

@Data
@Schema(description = "小程序商家详细信息返回数据")
public class MiniMerchantInfoVO {

    @Schema(description = "商家ID")
    private Long merchantId;

    @Schema(description = "商家名称")
    private String merchantName;

    @Schema(description = "商家logo")
    private String merchantLogo;

    @Schema(description = "详细地址")
    private String merchantAddress;

    @Schema(description = "商家简介")
    private String description;

    @Schema(description = "行业分类ID")
    private Long industryId;

    @Schema(description = "行业分类名称")
    private String industryName;

    @Schema(description = "入驻时间")
    private LocalDate createdTime;

}