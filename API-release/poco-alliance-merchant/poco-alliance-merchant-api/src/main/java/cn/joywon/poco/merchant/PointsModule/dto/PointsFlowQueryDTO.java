package cn.joywon.poco.merchant.PointsModule.dto;

import cn.joywon.poco.merchant.Common.page.PageQueryDTO;
import cn.joywon.poco.merchant.PointsModule.definition.PointsEnum;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Pattern;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

@Data
@EqualsAndHashCode(callSuper = true)
@Schema(description = "积分变动记录查询参数")
public class PointsFlowQueryDTO extends PageQueryDTO {

    @Schema(description = "是否积分查询增加记录")
    private Boolean positiveValue;

    @Schema(description = "查询开始时间")
    private LocalDate startDate;

    @Schema(description = "查询结束时间")
    private LocalDate endDate;

    @Schema(description = "变动类型列表(ORDER_EARN-消费得; INVITE_USER-邀请用户; JOIN_ACTIVITY-活动; ORDER_SPEND-下单抵扣; " +
            "MALL_REDEEM-商城兑换; SIGN_IN_REWARD-签到; SYSTEM_ADJUST-系统调整; EXPIRED_DEDUCT-过期扣除; OTHERS-其他)")
    private List<@Pattern(regexp = PointsEnum.POINTS_CHANGE_TYPE_REGEX_PATTERN, message = "无效的变动类型") String> changeTypes;

    @Schema(description = "是否按时间升序排序")
    private Boolean sortByTime;

    @Schema(hidden = true)
    private LocalDateTime startTime;

    @Schema(hidden = true)
    private LocalDateTime endTime;

}