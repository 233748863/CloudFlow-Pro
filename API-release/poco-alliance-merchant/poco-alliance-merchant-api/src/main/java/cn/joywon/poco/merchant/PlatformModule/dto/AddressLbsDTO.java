package cn.joywon.poco.merchant.PlatformModule.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "要解析的地址")
public class AddressLbsDTO {

    @NotBlank(message = "省份不能为空")
    @Schema(description = "省份")
    private String province;

    @NotBlank(message = "城市不能为空")
    @Schema(description = "城市")
    private String city;

    @NotBlank(message = "详细地址不能为空")
    @Pattern(regexp = "^.{1,50}$", message = "详细地址不能超过50字")
    @Schema(description = "详细地址(区-街道-单元)")
    private String addressDetail;

}