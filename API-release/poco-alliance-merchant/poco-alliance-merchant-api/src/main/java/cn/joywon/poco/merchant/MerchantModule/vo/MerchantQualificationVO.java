package cn.joywon.poco.merchant.MerchantModule.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.util.List;

@Data
@Schema(description = "商家资质返回数据")
public class MerchantQualificationVO {

    @Schema(description = "商家ID")
    private Long id;

    @Schema(description = "商家名称")
    private String name;

    @Schema(description = "法人姓名")
    private String legalPerson;

    @Schema(description = "子商户号")
    private String subMchId;

    @Schema(description = "营业执照号")
    private String licenseNo;

    @Schema(description = "商家资质图片URL列表")
    private List<String> licenseImages;

    @Schema(description = "是否正在审核中")
    private Boolean auditing;

}