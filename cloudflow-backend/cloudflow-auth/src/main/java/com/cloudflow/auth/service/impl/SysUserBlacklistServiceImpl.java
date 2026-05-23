package com.cloudflow.auth.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.auth.domain.SysUserBlacklist;
import com.cloudflow.auth.mapper.SysUserBlacklistMapper;
import com.cloudflow.auth.service.ISysUserBlacklistService;
import com.cloudflow.common.core.context.UserContext;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.Duration;
import java.time.LocalDateTime;
import java.time.ZoneId;

/**
 * GOV-P0-1 用户黑名单服务实现。
 *
 * <p>拉黑后写 Redis KEY {@code acl:user:black:{userId}} 带 expire_at TTL;
 * LoginServiceImpl 登录时优先查 Redis,未命中回退查表。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class SysUserBlacklistServiceImpl implements ISysUserBlacklistService {

    public static final String REDIS_KEY_PREFIX = "acl:user:black:";
    private static final Duration DEFAULT_TTL = Duration.ofDays(365);

    private final SysUserBlacklistMapper blacklistMapper;
    private final StringRedisTemplate stringRedisTemplate;

    @Override
    public Page<SysUserBlacklist> page(String keyword, String status, Integer pageNum, Integer pageSize) {
        LambdaQueryWrapper<SysUserBlacklist> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(SysUserBlacklist::getDeleted, 0);
        if (StringUtils.hasText(keyword)) {
            wrapper.and(w -> w.like(SysUserBlacklist::getUserName, keyword)
                    .or().like(SysUserBlacklist::getReason, keyword));
        }
        if (StringUtils.hasText(status)) {
            wrapper.eq(SysUserBlacklist::getStatus, status);
        }
        wrapper.orderByDesc(SysUserBlacklist::getUpdateTime);
        return blacklistMapper.selectPage(new Page<>(pageNum, pageSize), wrapper);
    }

    @Override
    public SysUserBlacklist getById(Long id) {
        return id == null ? null : blacklistMapper.selectById(id);
    }

    @Override
    @Transactional
    public boolean ban(SysUserBlacklist rule) {
        validate(rule);
        rule.setStatus("ACTIVE");
        if (UserContext.getUserId() != null) {
            rule.setOpUserId(UserContext.getUserId());
        }
        rule.setOpUserName(UserContext.getUserName());
        rule.setCreateBy(UserContext.getUserName());
        rule.setUpdateBy(UserContext.getUserName());
        int inserted = blacklistMapper.insert(rule);
        if (inserted > 0) {
            writeToRedis(rule);
        }
        return inserted > 0;
    }

    @Override
    @Transactional
    public boolean update(SysUserBlacklist rule) {
        if (rule == null || rule.getId() == null) {
            throw new IllegalArgumentException("ID 必填");
        }
        rule.setUpdateBy(UserContext.getUserName());
        rule.setUpdateTime(LocalDateTime.now());
        int updated = blacklistMapper.updateById(rule);
        if (updated > 0) {
            SysUserBlacklist latest = blacklistMapper.selectById(rule.getId());
            if (latest != null && "ACTIVE".equalsIgnoreCase(latest.getStatus())) {
                writeToRedis(latest);
            } else if (latest != null) {
                stringRedisTemplate.delete(REDIS_KEY_PREFIX + latest.getUserId());
            }
        }
        return updated > 0;
    }

    @Override
    @Transactional
    public boolean remove(Long id) {
        if (id == null) {
            return false;
        }
        SysUserBlacklist exist = blacklistMapper.selectById(id);
        if (exist == null) {
            return false;
        }
        exist.setDeleted(1);
        exist.setUpdateBy(UserContext.getUserName());
        exist.setUpdateTime(LocalDateTime.now());
        int updated = blacklistMapper.updateById(exist);
        if (updated > 0) {
            stringRedisTemplate.delete(REDIS_KEY_PREFIX + exist.getUserId());
        }
        return updated > 0;
    }

    @Override
    @Transactional
    public boolean unban(Long id) {
        if (id == null) {
            return false;
        }
        SysUserBlacklist exist = blacklistMapper.selectById(id);
        if (exist == null) {
            return false;
        }
        exist.setStatus("INACTIVE");
        exist.setUpdateBy(UserContext.getUserName());
        exist.setUpdateTime(LocalDateTime.now());
        int updated = blacklistMapper.updateById(exist);
        if (updated > 0) {
            stringRedisTemplate.delete(REDIS_KEY_PREFIX + exist.getUserId());
        }
        return updated > 0;
    }

    @Override
    public boolean isBanned(Long userId) {
        if (userId == null) {
            return false;
        }
        Boolean hit = stringRedisTemplate.hasKey(REDIS_KEY_PREFIX + userId);
        if (Boolean.TRUE.equals(hit)) {
            return true;
        }
        Long count = blacklistMapper.selectCount(new LambdaQueryWrapper<SysUserBlacklist>()
                .eq(SysUserBlacklist::getUserId, userId)
                .eq(SysUserBlacklist::getDeleted, 0)
                .eq(SysUserBlacklist::getStatus, "ACTIVE")
                .and(w -> w.isNull(SysUserBlacklist::getExpireAt).or().gt(SysUserBlacklist::getExpireAt, LocalDateTime.now())));
        return count != null && count > 0;
    }

    private void writeToRedis(SysUserBlacklist rule) {
        if (rule == null || rule.getUserId() == null) {
            return;
        }
        Duration ttl = DEFAULT_TTL;
        if (rule.getExpireAt() != null) {
            long seconds = rule.getExpireAt().atZone(ZoneId.systemDefault()).toEpochSecond()
                    - LocalDateTime.now().atZone(ZoneId.systemDefault()).toEpochSecond();
            if (seconds <= 0) {
                stringRedisTemplate.delete(REDIS_KEY_PREFIX + rule.getUserId());
                return;
            }
            ttl = Duration.ofSeconds(seconds);
        }
        stringRedisTemplate.opsForValue().set(REDIS_KEY_PREFIX + rule.getUserId(),
                rule.getReason() == null ? "" : rule.getReason(), ttl);
    }

    private void validate(SysUserBlacklist rule) {
        if (rule == null || rule.getUserId() == null) {
            throw new IllegalArgumentException("被拉黑用户 ID 必填");
        }
        if (rule.getTenantId() == null) {
            rule.setTenantId(100000L);
        }
    }
}
