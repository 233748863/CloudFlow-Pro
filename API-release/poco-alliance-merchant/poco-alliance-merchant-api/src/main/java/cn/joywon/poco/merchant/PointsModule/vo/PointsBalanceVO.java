package cn.joywon.poco.merchant.PointsModule.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

@Data
@Schema(description = "积分余额返回数据")
public class PointsBalanceVO {

    @Schema(description = "用户/商家ID")
    private Long ownerId;

    @Schema(description = "当前可用积分数")
    private Integer totalPoints;

    @Schema(description = "累计获得积分数")
    private Integer totalEarnedPoints;

    @Schema(description = "本月即将到期积分数")
    private Integer nearMonthlyExpiryPoints;

    @Schema(description = "本月已过期积分数")
    private Integer monthlyExpiredPoints;

    @Schema(description = "本月所获积分数")
    private Integer monthlyPointsEarned;

    @Schema(description = "本月消耗积分数")
    private Integer monthlyPointsSpent;

}