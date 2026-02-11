package cn.joywon.poco.merchant.PlatformModule.dto;

import cn.joywon.poco.merchant.MerchantModule.dto.MerchantCreateDTO;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
public class MerchantCreateByPlatformDTO extends MerchantCreateDTO {

    @Schema(description = "商家的平台账号用户名(5-20个小写英文/数字组成)")
    @Pattern(regexp = "^[a-z0-9]{5,20}$", message = "商家的平台账号用户名由5-20个小写英文/数字组成")
    @NotBlank(message = "商家的平台账号用户名不能为空")
    private String userName;

    @Schema(description = "商家的排序序号")
    @Min(value = 0, message = "商家排序序号不能小于0")
    @Max(value = 9999, message = "商家排序序号不能大于9999")
    private Long orderSort;

    @Schema(hidden = true)
    private Long merchantId;

}