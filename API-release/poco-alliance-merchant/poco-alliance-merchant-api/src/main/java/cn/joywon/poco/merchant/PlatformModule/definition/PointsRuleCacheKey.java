package cn.joywon.poco.merchant.PlatformModule.definition;

public interface PointsRuleCacheKey {


    /**
     * 积分规则缓存键前缀
     */
    String KEY_PREFIX_POINTS_RULE = "points:rule:";


    /**
     * 积分规则缓存键前缀-默认积分规则
     */
    String KEY_PREFIX_POINTS_RULE_PRIMARY = "points:rule:primary:";


    /**
     * 积分规则缓存键前缀-待激活缓存
     */
    String KEY_PREFIX_PENDING_ACTIVATE = "points:rule:activate:";


}