package cn.joywon.poco.merchant.PointsModule.dto;

import cn.joywon.poco.merchant.PointsModule.definition.PointsEnum;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import lombok.Data;

@Data
@Schema(description = "积分减少变动参数")
public class PointsDedChangeDTO {

    @NotBlank(message = "当事人ID不能为空")
    @Schema(description = "当事人ID")
    private String principalId;

    @Pattern(regexp = PointsEnum.POINTS_OWNER_TYPE_REGEX_PATTERN, message = "无效的变动账号类型")
    @Schema(description = "变动账号类型: USER-平台用户; MERCHANT-平台商家")
    private String ownerType;

    @NotNull(message = "积分变动数量不能为空")
    @Max(value = -1, message = "无效的积分变动数量")
    @Schema(description = "积分变动数量")
    private Integer changePoints;

    @NotBlank(message = "变动类型不能为空")
    @Pattern(regexp = PointsEnum.POINTS_CHANGE_DED_TYPE_REGEX_PATTERN, message = "无效的积分减少类型")
    @Schema(description = "减少变动类型: ORDER_SPEND-下单抵扣; MALL_REDEEM-商城兑换; JOIN_ACTIVITY-参与活动; SYSTEM_ADJUST-系统调整; OTHERS-其他")
    private String changeType;

    @NotBlank(message = "业务ID不能为空")
    @Schema(description = "业务ID")
    private String bizId;

}