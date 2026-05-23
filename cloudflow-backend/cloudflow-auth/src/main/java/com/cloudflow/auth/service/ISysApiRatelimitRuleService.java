package com.cloudflow.auth.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.auth.domain.SysApiRatelimitRule;

import java.util.List;

/**
 * GOV-P1-1 API 动态限流规则服务。
 */
public interface ISysApiRatelimitRuleService {

    Page<SysApiRatelimitRule> page(String keyword, String status, String dimension,
                                   Integer pageNum, Integer pageSize);

    SysApiRatelimitRule getById(Long id);

    boolean save(SysApiRatelimitRule rule);

    boolean update(SysApiRatelimitRule rule);

    boolean remove(Long id);

    boolean toggleStatus(Long id, String status);

    /** 列出所有 ACTIVE 规则（按 priority 升序），供网关冷启动加载。 */
    List<SysApiRatelimitRule> listActive();

    /**
     * 把当前所有 ACTIVE 规则全量写入 Redis Hash + 发布 RELOAD 通知，
     * 网关 DynamicRateLimitFilter 订阅后即时刷新本地缓存。
     */
    void publishAllToGateway();
}
