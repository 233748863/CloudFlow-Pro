package cn.joywon.poco.merchant.PlatformModule.repository;

import cn.joywon.poco.merchant.PlatformModule.dto.PointsRuleCacheDTO;

import java.io.Serializable;
import java.util.List;
import java.util.Map;

public interface IPointsRuleRepository {


    /**
     * 添加积分规则缓存
     *
     * @param dto 积分规则缓存
     */
    void upsertPointsRule(PointsRuleCacheDTO dto);


    /**
     * 批量添加积分规则缓存
     *
     * @param dtoList 积分规则缓存列表
     */
    void upsertPointsRuleBatch(List<PointsRuleCacheDTO> dtoList);


    /**
     * 添加默认积分规则缓存(永不过期)
     *
     * @param dto 积分规则缓存
     */
    void upsertPrimaryPointsRule(PointsRuleCacheDTO dto);


    /**
     * 积分规则缓存激活延迟处理
     * 激活时间=key过期时间, 后续由监听过期key监听器处理激活
     *
     * @param id            积分规则ID
     * @param activeSeconds 延迟时间
     */
    void pendingActivation(Serializable id, long activeSeconds);


    /**
     * 批量积分规则缓存激活延迟处理
     * 激活时间=key过期时间, 后续由监听过期key监听器处理激活
     *
     * @param activeMap 待生效积分规则映射(键: 积分规则ID, 值: 延迟时间)
     */
    void pendingActivationMany(Map<Long, Long> activeMap);


    /**
     * 删除积分规则缓存
     *
     * @param id 积分规则ID
     */
    void dropPointsRule(Serializable id, String addOrDed, String ruleType);


    /**
     * 删除所有积分规则缓存
     */
    void dropAllPointsRule();


    /**
     * 删除积分规则缓存激活键
     *
     * @param id 积分规则ID
     */
    void dropActivateKey(Serializable id);


    /**
     * 获取默认积分规则缓存
     *
     * @param addOrDed 积分变动类型
     * @param ruleType 积分规则类型
     * @return 积分规则缓存
     */
    PointsRuleCacheDTO getPrimaryPointsRuleCache(String addOrDed, String ruleType);


    /**
     * 根据积分规则ID获取积分规则缓存
     *
     * @param id 积分规则ID
     * @return 积分规则缓存
     */
    PointsRuleCacheDTO getPointsRule(Serializable id);


    /**
     * 根据积分变动类型规则类型查询积分规则缓存列表
     *
     * @param addOrDed 积分变动类型
     * @param ruleType 积分规则类型
     * @return 积分规则缓存列表
     */
    List<PointsRuleCacheDTO> queryPointRuleCacheList(String addOrDed, String ruleType);


}