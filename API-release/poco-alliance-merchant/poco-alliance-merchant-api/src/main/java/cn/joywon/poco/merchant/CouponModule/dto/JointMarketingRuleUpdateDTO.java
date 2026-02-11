package cn.joywon.poco.merchant.CouponModule.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

import jakarta.validation.constraints.NotNull;

@Data
@EqualsAndHashCode(callSuper = true)
@Schema(description = "更新联合营销规则DTO")
public class JointMarketingRuleUpdateDTO extends JointMarketingRuleCreateDTO {

    @Schema(description = "规则ID")
    @NotNull(message = "规则ID不能为空")
    private Long id;
}
