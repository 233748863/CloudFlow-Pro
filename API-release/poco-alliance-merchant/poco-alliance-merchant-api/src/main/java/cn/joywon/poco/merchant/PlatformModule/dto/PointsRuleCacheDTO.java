package cn.joywon.poco.merchant.PlatformModule.dto;

import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

@Data
// 积分规则缓存数据传输对象
public class PointsRuleCacheDTO {

    // 积分规则ID
    private Long id;

    // 积分规则名称
    private String ruleName;

    // 积分规则描述
    private String description;

    // 规则适用范围
    private String applyScope;

    // 积分变动类型
    private String changeType;

    // 积分规则类型
    private String ruleType;

    // 单次变动最大积分(0为不限)
    private Integer onceMaxPoint;

    // 固定变动积分值(简单规则, 为0表示复杂规则生效)
    private Integer fixedPoints;

    // 固定有效期天数(简单规则, 为0表示复杂规则生效, -1表示用不过期)
    private Integer fixedExpire;

    // 复杂规则
    private List<?> extraRules;

    // 规则生效时间
    private LocalDateTime activeTime;

    // 规则失效时间
    private LocalDateTime expireTime;

    // 排序权重(越小越靠前)
    private Integer sortWeight;

}