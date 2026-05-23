package com.cloudflow.auth.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.auth.domain.SysApiRatelimitRule;
import com.cloudflow.auth.mapper.SysApiRatelimitRuleMapper;
import com.cloudflow.auth.service.ISysApiRatelimitRuleService;
import com.cloudflow.common.core.context.UserContext;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.List;

/**
 * GOV-P1-1 API 动态限流规则服务实现。
 *
 * <p>规则编辑后将全量 ACTIVE 规则写入 Redis Hash {@code cloudflow:ratelimit:rules:active}，
 * 并在 pubsub 通道 {@code cloudflow:ratelimit:rules} 上发布 {@code RELOAD} 通知。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class SysApiRatelimitRuleServiceImpl implements ISysApiRatelimitRuleService {

    public static final String REDIS_HASH_KEY = "cloudflow:ratelimit:rules:active";
    public static final String REDIS_CHANNEL = "cloudflow:ratelimit:rules";
    public static final String RELOAD_MESSAGE = "RELOAD";

    private final SysApiRatelimitRuleMapper ruleMapper;
    private final StringRedisTemplate stringRedisTemplate;
    private final ObjectMapper objectMapper;

    @PostConstruct
    public void initOnStartup() {
        // 启动时把已有 ACTIVE 规则刷一遍到 Redis，避免规则表已存在但缓存为空
        try {
            publishAllToGateway();
        } catch (Exception e) {
            log.warn("启动期发布 API 限流规则到 Redis 失败，等待手动触发", e);
        }
    }

    @Override
    public Page<SysApiRatelimitRule> page(String keyword, String status, String dimension,
                                          Integer pageNum, Integer pageSize) {
        LambdaQueryWrapper<SysApiRatelimitRule> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(SysApiRatelimitRule::getDeleted, 0);
        if (StringUtils.hasText(keyword)) {
            wrapper.and(w -> w.like(SysApiRatelimitRule::getRuleName, keyword)
                    .or().like(SysApiRatelimitRule::getRuleCode, keyword)
                    .or().like(SysApiRatelimitRule::getPathPattern, keyword));
        }
        if (StringUtils.hasText(status)) {
            wrapper.eq(SysApiRatelimitRule::getStatus, status);
        }
        if (StringUtils.hasText(dimension)) {
            wrapper.eq(SysApiRatelimitRule::getDimension, dimension);
        }
        wrapper.orderByAsc(SysApiRatelimitRule::getPriority)
                .orderByDesc(SysApiRatelimitRule::getUpdateTime);
        return ruleMapper.selectPage(new Page<>(pageNum, pageSize), wrapper);
    }

    @Override
    public SysApiRatelimitRule getById(Long id) {
        return id == null ? null : ruleMapper.selectById(id);
    }

    @Override
    @Transactional
    public boolean save(SysApiRatelimitRule rule) {
        validate(rule);
        rule.setCreateBy(UserContext.getUserName());
        rule.setUpdateBy(UserContext.getUserName());
        int inserted = ruleMapper.insert(rule);
        if (inserted > 0) {
            publishAllToGateway();
        }
        return inserted > 0;
    }

    @Override
    @Transactional
    public boolean update(SysApiRatelimitRule rule) {
        if (rule == null || rule.getId() == null) {
            throw new IllegalArgumentException("ID 必填");
        }
        rule.setUpdateBy(UserContext.getUserName());
        rule.setUpdateTime(LocalDateTime.now());
        int updated = ruleMapper.updateById(rule);
        if (updated > 0) {
            publishAllToGateway();
        }
        return updated > 0;
    }

    @Override
    @Transactional
    public boolean remove(Long id) {
        if (id == null) {
            return false;
        }
        SysApiRatelimitRule exist = ruleMapper.selectById(id);
        if (exist == null) {
            return false;
        }
        exist.setDeleted(1);
        exist.setUpdateBy(UserContext.getUserName());
        exist.setUpdateTime(LocalDateTime.now());
        int updated = ruleMapper.updateById(exist);
        if (updated > 0) {
            publishAllToGateway();
        }
        return updated > 0;
    }

    @Override
    @Transactional
    public boolean toggleStatus(Long id, String status) {
        if (id == null || !StringUtils.hasText(status)) {
            return false;
        }
        SysApiRatelimitRule exist = ruleMapper.selectById(id);
        if (exist == null) {
            return false;
        }
        exist.setStatus(status);
        exist.setUpdateBy(UserContext.getUserName());
        exist.setUpdateTime(LocalDateTime.now());
        int updated = ruleMapper.updateById(exist);
        if (updated > 0) {
            publishAllToGateway();
        }
        return updated > 0;
    }

    @Override
    public List<SysApiRatelimitRule> listActive() {
        return ruleMapper.selectList(new LambdaQueryWrapper<SysApiRatelimitRule>()
                .eq(SysApiRatelimitRule::getDeleted, 0)
                .eq(SysApiRatelimitRule::getStatus, "ACTIVE")
                .orderByAsc(SysApiRatelimitRule::getPriority));
    }

    @Override
    public void publishAllToGateway() {
        try {
            List<SysApiRatelimitRule> active = listActive();
            // 先清掉旧 Hash 再批量写入，保证状态完全一致
            stringRedisTemplate.delete(REDIS_HASH_KEY);
            for (SysApiRatelimitRule rule : active) {
                String json = objectMapper.writeValueAsString(rule);
                stringRedisTemplate.opsForHash().put(REDIS_HASH_KEY, String.valueOf(rule.getId()), json);
            }
            stringRedisTemplate.convertAndSend(REDIS_CHANNEL, RELOAD_MESSAGE);
            log.info("API 限流规则已发布到 Redis (Hash {} + 通道 {}), 规则数={}", REDIS_HASH_KEY, REDIS_CHANNEL, active.size());
        } catch (Exception e) {
            log.error("发布 API 限流规则失败", e);
        }
    }

    private void validate(SysApiRatelimitRule rule) {
        if (rule == null) {
            throw new IllegalArgumentException("规则不能为空");
        }
        if (!StringUtils.hasText(rule.getRuleCode()) || !StringUtils.hasText(rule.getRuleName())) {
            throw new IllegalArgumentException("规则编码与名称必填");
        }
        if (!StringUtils.hasText(rule.getPathPattern())) {
            throw new IllegalArgumentException("路径模板必填");
        }
        if (rule.getRps() == null || rule.getRps() <= 0) {
            throw new IllegalArgumentException("RPS 必须 > 0");
        }
        if (rule.getTenantId() == null) {
            rule.setTenantId(100000L);
        }
        if (!StringUtils.hasText(rule.getDimension())) {
            rule.setDimension("IP");
        }
        if (!StringUtils.hasText(rule.getStatus())) {
            rule.setStatus("ACTIVE");
        }
        if (rule.getPriority() == null) {
            rule.setPriority(100);
        }
        if (!StringUtils.hasText(rule.getHttpMethod())) {
            rule.setHttpMethod("ALL");
        }
        if (!StringUtils.hasText(rule.getRejectStrategy())) {
            rule.setRejectStrategy("REJECT");
        }
    }
}
