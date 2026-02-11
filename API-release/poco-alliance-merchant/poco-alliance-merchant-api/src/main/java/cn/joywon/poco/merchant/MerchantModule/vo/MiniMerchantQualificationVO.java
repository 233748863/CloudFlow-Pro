package cn.joywon.poco.merchant.MerchantModule.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.util.List;

@Data
@Schema(description = "小程序商家资质信息返回数据")
public class MiniMerchantQualificationVO {

    @Schema(description = "商家ID")
    private Long merchantId;

    @Schema(description = "商家营业执照编号")
    private String licenseNo;

    @Schema(description = "商家资质图片")
    private List<String> licenseImages;

    @Schema(description = "商家法人姓名")
    private String legalPerson;

}