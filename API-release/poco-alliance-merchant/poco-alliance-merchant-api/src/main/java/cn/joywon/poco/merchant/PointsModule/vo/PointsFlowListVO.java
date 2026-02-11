package cn.joywon.poco.merchant.PointsModule.vo;

import cn.joywon.poco.merchant.PointsModule.definition.PointsEnum;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
@Schema(description = "积分流水记录列表返回数据")
public class PointsFlowListVO {

    @Schema(description = "流水记录ID")
    private String id;

    @Schema(description = "变动积分数量")
    private Integer changePoints;

    @Schema(description = "积分变动类型(ORDER_EARN-消费得; INVITE_USER-邀请用户; JOIN_ACTIVITY-活动; ORDER_SPEND-下单抵扣;" +
            " MALL_REDEEM-商城兑换; SIGN_IN_REWARD-签到; SYSTEM_ADJUST-系统调整; EXPIRED_DEDUCT-过期扣除; OTHERS-其他")
    private PointsEnum changeType;

    @Schema(description = "该积分获取时间")
    private LocalDate batchGainDate;

    @Schema(description = "积分变动时间")
    private LocalDateTime createdTime;

    @Schema(description = "积分变动备注")
    private String remark;

}