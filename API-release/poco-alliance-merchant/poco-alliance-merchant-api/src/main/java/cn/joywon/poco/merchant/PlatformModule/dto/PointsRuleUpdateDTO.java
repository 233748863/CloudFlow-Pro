package cn.joywon.poco.merchant.PlatformModule.dto;

import cn.joywon.poco.merchant.PlatformModule.definition.PointsRuleEnum;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.Data;
import org.springframework.format.annotation.DateTimeFormat;

import java.time.LocalDateTime;
import java.util.List;

@Data
public class PointsRuleUpdateDTO {

    @NotBlank(message = "积分规则ID不能为空")
    @Schema(description = "积分规则ID")
    private String id;

    @Schema(description = "积分规则名称")
    private String ruleName;

    @Schema(description = "积分规则描述")
    private String description;

    @Pattern(regexp = PointsRuleEnum.POINTS_RULE_APPLY_SCOPE_REGEX_PATTERN, message = "无效的积分规则应用范围")
    @Schema(description = "积分规则应用范围: GLOBAL-全平台; MERCHANT-商家; PRODUCT-商品")
    private String applyScope;

    @Schema(description = "单次变动最大积分(0为不限)")
    private Integer onceMaxPoint;

    @Schema(description = "固定有效期天数(简单规则, 为0表示复杂规则生效, -1表示用不过期)")
    private Integer fixedExpire;

    @Schema(description = "固定变动积分(简单规则, 为0表示复杂规则生效)")
    private Integer fixedPoints;

    @Schema(description = "复杂规则")
    private List<String> extraRules;

    @DateTimeFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    @Schema(description = "规则生效开始时间, 不传值默认立即生效(yyyy-MM-dd HH:mm:ss)")
    private LocalDateTime activeTime;

    @DateTimeFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    @Schema(description = "规则生效结束时间, 不传值默认永不失效(yyyy-MM-dd HH:mm:ss)")
    private LocalDateTime expireTime;

    @Schema(description = "规则是否默认规则")
    private Boolean primary;

    @Schema(description = "规则是否启用")
    private Boolean enable;

}