package cn.joywon.poco.admin.api.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
@Schema(description = "商家绑定微信身份参数")
public class MerchantBindWxDTO {

    @NotBlank(message = "用户ID不能为空")
    @Schema(description = "用户ID")
    private String userId;

    @NotBlank(message = "小程序用户jsCode不能为空")
    @Schema(description = "小程序用户jsCode")
    private String jsCode;

}