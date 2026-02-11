package cn.joywon.poco.merchant.MarketingModule.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@Schema(description = "积分商城商品上/下架参数")
public class PointsMallProductOnOffShelfDTO {

    @Schema(description = "商品ID")
    @NotBlank(message = "商品ID不能为空")
    private String id;

    @Schema(description = "商品是上/下架")
    @NotNull(message = "商品上/下架不能为空")
    private Boolean onShelf;

    @Schema(description = "商品上架时间(不传值默认即刻上/下架)")
    private LocalDateTime onOffShelfTime;

}