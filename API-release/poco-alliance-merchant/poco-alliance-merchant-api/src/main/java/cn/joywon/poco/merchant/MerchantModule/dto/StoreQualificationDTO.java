package cn.joywon.poco.merchant.MerchantModule.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.util.List;

@Data
@Schema(description = "门店资质信息修改参数")
public class StoreQualificationDTO {

    @NotNull(message = "门店ID不能为空")
    @Schema(description = "门店ID")
    private String storeId;

    @Schema(description = "营业执照号")
    private String licenseNo;

    @Schema(description = "商家资质图片URL列表")
    private List<String> licenseImages;

    @NotBlank(message = "提交修改原因不能为空")
    @Schema(description = "提交修改原因")
    private String modifyReason;

}