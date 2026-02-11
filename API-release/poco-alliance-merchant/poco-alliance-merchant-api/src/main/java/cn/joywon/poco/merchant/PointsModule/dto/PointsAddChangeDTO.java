package cn.joywon.poco.merchant.PointsModule.dto;

import cn.joywon.poco.merchant.PointsModule.definition.PointsEnum;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.*;
import lombok.Data;
import org.springframework.format.annotation.DateTimeFormat;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
@Schema(description = "积分增加变动参数")
public class PointsAddChangeDTO {

    @NotBlank(message = "当事人ID不能为空")
    @Schema(description = "当事人ID")
    private String principalId;

    @Schema(description = "应用的积分规则ID(不传值使用默认积分规则)")
    private String pointsRuleId;

    @Pattern(regexp = PointsEnum.POINTS_OWNER_TYPE_REGEX_PATTERN, message = "无效的变动账号类型")
    @Schema(description = "变动账号类型: USER-平台用户; MERCHANT-平台商家")
    private String ownerType;

    @NotNull(message = "积分变动数量不能为空")
    @Min(value = 1, message = "无效的积分变动数量")
    @Schema(description = "积分变动数量")
    private Integer changePoints;

    @NotBlank(message = "变动类型不能为空")
    @Pattern(regexp = PointsEnum.POINTS_CHANGE_ADD_TYPE_REGEX_PATTERN, message = "无效的积分增加类型")
    @Schema(description = "增加变动类型: ORDER_EARN-消费得; INVITE_USER-邀请用户; JOIN_ACTIVITY-活动; SIGN_IN_REWARD-签到; SYSTEM_ADJUST-系统调整; OTHERS-其他")
    private String changeType;

    @NotBlank(message = "业务ID不能为空")
    @Schema(description = "业务ID")
    private String bizId;

    @FutureOrPresent(message = "无效的积分过期日期")
    @DateTimeFormat(pattern = "yyyy-MM-dd")
    @Schema(description = "积分过期日期, 与validPeriod都为空则认为永不过期")
    private LocalDate validEndDate;

    @Schema(description = "积分有效天数(此属性指定的有效期优先级更高)")
    private Integer validPeriod;

    @Schema(description = "变动备注(非必须)")
    private String remark;

    @Schema(hidden = true)
    private LocalDateTime validEndTime;

}