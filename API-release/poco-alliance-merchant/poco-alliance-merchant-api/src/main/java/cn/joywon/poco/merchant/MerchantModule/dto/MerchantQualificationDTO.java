package cn.joywon.poco.merchant.MerchantModule.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

import java.util.List;

@Data
@Schema(description = "商家资质信息参数")
public class MerchantQualificationDTO {

    @Schema(description = "法人姓名")
    private String legalPerson;

    @Schema(description = "子商户号(微信支付服务商模式)")
    private String subMchId;

    @Schema(description = "营业执照号")
    private String licenseNo;

    @Schema(description = "商家资质图片URL列表")
    private List<String> licenseImages;

    @NotBlank(message = "提交修改原因不能为空")
    @Schema(description = "提交修改原因")
    private String modifyReason;

}