package cn.joywon.poco.merchant.PlatformModule.dto;

import cn.joywon.poco.merchant.Common.page.PageQueryDTO;
import cn.joywon.poco.merchant.PlatformModule.definition.PointsRuleEnum;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Pattern;
import lombok.Data;
import lombok.EqualsAndHashCode;
import org.springframework.format.annotation.DateTimeFormat;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

@Data
@EqualsAndHashCode(callSuper = true)
@Schema(description = "积分规则查询参数")
public class PointsRuleQueryDTO extends PageQueryDTO {

    @Schema(description = "规则名称")
    private String ruleName;

    @Schema(description = "应用范围")
    private List<@Pattern(regexp = PointsRuleEnum.POINTS_RULE_APPLY_SCOPE_REGEX_PATTERN,
            message = "无效的积分规则应用范围") String> applyScopes;

    @Schema(description = "积分变动类型")
    private List<@Pattern(regexp = PointsRuleEnum.POINTS_RULE_CHANGE_TYPE_REGEX_PATTERN,
            message = "无效的积分变动类型") String> changeTypes;

    @Schema(description = "积分规则类型")
    private List<@Pattern(regexp = PointsRuleEnum.POINTS_RULE_TYPE_REGEX_PATTERN,
            message = "无效的积分规则类型") String> ruleTypes;

    @DateTimeFormat(pattern = "yyyy-MM-dd")
    @Schema(description = "规则生效日期(yyyy-MM-dd)")
    private LocalDate activeDate;

    @DateTimeFormat(pattern = "yyyy-MM-dd")
    @Schema(description = "规则失效日期(yyyy-MM-dd)")
    private LocalDate expireDate;

    @Schema(description = "是否仅查询默认规则")
    private Boolean primary;

    @Schema(description = "是否仅查询启用规则")
    private Boolean enable;

    @Schema(description = "是否按权重升序排序")
    private Boolean sortByWeight;

    @Schema(description = "是否按创建时间升序排序")
    private Boolean sortByCreateTime;

    @Schema(hidden = true)
    private LocalDateTime activeTime;

    @Schema(hidden = true)
    private LocalDateTime expireTime;

}