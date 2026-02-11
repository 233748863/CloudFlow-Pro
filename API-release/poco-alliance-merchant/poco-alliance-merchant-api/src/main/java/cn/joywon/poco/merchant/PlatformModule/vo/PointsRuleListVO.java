package cn.joywon.poco.merchant.PlatformModule.vo;

import cn.joywon.poco.merchant.PlatformModule.definition.PointsRuleEnum;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@Schema(description = "积分规则列表返回数据")
public class PointsRuleListVO {

    @Schema(description = "积分规则ID")
    private Long id;

    @Schema(description = "积分规则名称")
    private String ruleName;

    @Schema(description = "积分规则应用范围")
    private PointsRuleEnum applyScope;

    @Schema(description = "积分变动类型")
    private PointsRuleEnum changeType;

    @Schema(description = "积分规则类型")
    private PointsRuleEnum ruleType;

    @Schema(description = "积分规则生效时间")
    private LocalDateTime activeTime;

    @Schema(description = "积分规则失效时间")
    private LocalDateTime expireTime;

    @Schema(description = "积分规则排序权重")
    private Integer sortWeight;

    @Schema(description = "是否默认积分规则")
    private Boolean primary;

    @Schema(description = "积分规则是否启用")
    private Boolean enable;

    @Schema(description = "积分规则创建时间")
    private LocalDateTime createdTime;

}