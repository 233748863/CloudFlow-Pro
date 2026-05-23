package com.cloudflow.auth.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.auth.domain.SysIpAcl;
import com.cloudflow.auth.mapper.SysIpAclMapper;
import com.cloudflow.auth.service.ISysIpAclService;
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
 * GOV-P0-1 IP 黑白名单服务实现。
 *
 * <p>规则编辑后将全量 ACTIVE 规则写入 Redis Hash {@code cloudflow:acl:ip:active},
 * 并在 pubsub 通道 {@code cloudflow:acl:ip} 发布 {@code RELOAD} 通知。
 * 网关 BlacklistFilter 订阅后刷新本地缓存。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class SysIpAclServiceImpl implements ISysIpAclService {

    public static final String REDIS_HASH_KEY = "cloudflow:acl:ip:active";
    public static final String REDIS_CHANNEL = "cloudflow:acl:ip";
    public static final String RELOAD_MESSAGE = "RELOAD";

    private final SysIpAclMapper aclMapper;
    private final StringRedisTemplate stringRedisTemplate;
    private final ObjectMapper objectMapper;

    @PostConstruct
    public void initOnStartup() {
        try {
            publishAllToGateway();
        } catch (Exception e) {
            log.warn("启动期发布 IP 黑白名单到 Redis 失败,等待手动触发", e);
        }
    }

    @Override
    public Page<SysIpAcl> page(String keyword, String mode, String status,
                               Integer pageNum, Integer pageSize) {
        LambdaQueryWrapper<SysIpAcl> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(SysIpAcl::getDeleted, 0);
        if (StringUtils.hasText(keyword)) {
            wrapper.and(w -> w.like(SysIpAcl::getRuleName, keyword)
                    .or().like(SysIpAcl::getRuleCode, keyword)
                    .or().like(SysIpAcl::getIpPattern, keyword));
        }
        if (StringUtils.hasText(mode)) {
            wrapper.eq(SysIpAcl::getMode, mode);
        }
        if (StringUtils.hasText(status)) {
            wrapper.eq(SysIpAcl::getStatus, status);
        }
        wrapper.orderByAsc(SysIpAcl::getPriority)
                .orderByDesc(SysIpAcl::getUpdateTime);
        return aclMapper.selectPage(new Page<>(pageNum, pageSize), wrapper);
    }

    @Override
    public SysIpAcl getById(Long id) {
        return id == null ? null : aclMapper.selectById(id);
    }

    @Override
    @Transactional
    public boolean save(SysIpAcl rule) {
        validate(rule);
        rule.setCreateBy(UserContext.getUserName());
        rule.setUpdateBy(UserContext.getUserName());
        int inserted = aclMapper.insert(rule);
        if (inserted > 0) {
            publishAllToGateway();
        }
        return inserted > 0;
    }

    @Override
    @Transactional
    public boolean update(SysIpAcl rule) {
        if (rule == null || rule.getId() == null) {
            throw new IllegalArgumentException("ID 必填");
        }
        validate(rule);
        rule.setUpdateBy(UserContext.getUserName());
        rule.setUpdateTime(LocalDateTime.now());
        int updated = aclMapper.updateById(rule);
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
        SysIpAcl exist = aclMapper.selectById(id);
        if (exist == null) {
            return false;
        }
        exist.setDeleted(1);
        exist.setUpdateBy(UserContext.getUserName());
        exist.setUpdateTime(LocalDateTime.now());
        int updated = aclMapper.updateById(exist);
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
        SysIpAcl exist = aclMapper.selectById(id);
        if (exist == null) {
            return false;
        }
        exist.setStatus(status);
        exist.setUpdateBy(UserContext.getUserName());
        exist.setUpdateTime(LocalDateTime.now());
        int updated = aclMapper.updateById(exist);
        if (updated > 0) {
            publishAllToGateway();
        }
        return updated > 0;
    }

    @Override
    public List<SysIpAcl> listActive() {
        LocalDateTime now = LocalDateTime.now();
        return aclMapper.selectList(new LambdaQueryWrapper<SysIpAcl>()
                        .eq(SysIpAcl::getDeleted, 0)
                        .eq(SysIpAcl::getStatus, "ACTIVE")
                        .and(w -> w.isNull(SysIpAcl::getExpireAt).or().gt(SysIpAcl::getExpireAt, now))
                        .orderByAsc(SysIpAcl::getPriority));
    }

    @Override
    public void publishAllToGateway() {
        try {
            List<SysIpAcl> active = listActive();
            stringRedisTemplate.delete(REDIS_HASH_KEY);
            for (SysIpAcl rule : active) {
                String json = objectMapper.writeValueAsString(rule);
                stringRedisTemplate.opsForHash().put(REDIS_HASH_KEY, String.valueOf(rule.getId()), json);
            }
            stringRedisTemplate.convertAndSend(REDIS_CHANNEL, RELOAD_MESSAGE);
            log.info("IP 黑白名单已发布到 Redis (Hash {} + 通道 {}), 规则数={}", REDIS_HASH_KEY, REDIS_CHANNEL, active.size());
        } catch (Exception e) {
            log.error("发布 IP 黑白名单失败", e);
        }
    }

    private void validate(SysIpAcl rule) {
        if (rule == null) {
            throw new IllegalArgumentException("规则不能为空");
        }
        if (!StringUtils.hasText(rule.getRuleCode()) || !StringUtils.hasText(rule.getRuleName())) {
            throw new IllegalArgumentException("规则编码与名称必填");
        }
        if (!StringUtils.hasText(rule.getIpPattern())) {
            throw new IllegalArgumentException("IP 表达式必填");
        }
        if (!StringUtils.hasText(rule.getMode())
                || (!"BLACK".equalsIgnoreCase(rule.getMode()) && !"WHITE".equalsIgnoreCase(rule.getMode()))) {
            throw new IllegalArgumentException("名单类型必须为 BLACK 或 WHITE");
        }
        if (!StringUtils.hasText(rule.getRuleType())) {
            rule.setRuleType("EXACT");
        }
        if (!StringUtils.hasText(rule.getStatus())) {
            rule.setStatus("ACTIVE");
        }
        if (rule.getPriority() == null) {
            rule.setPriority(100);
        }
        if (rule.getTenantId() == null) {
            rule.setTenantId(100000L);
        }
    }
}
