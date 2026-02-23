package com.cloudflow.common.core.utils;

import com.cloudflow.common.core.context.UserContext;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.stereotype.Component;
import java.util.Collection;
import java.util.Set;
import java.util.concurrent.TimeUnit;

@Component
public class RedisCache {
    @Autowired
    public RedisTemplate redisTemplate;
    
    // 需要忽略租户隔离的 Key 前缀 (如验证码、登录Token等)
    private static final String[] GLOBAL_PREFIXES = {
        "CAPTCHA:", 
        "login_tokens:",          // 登录令牌缓存
        "user_tokens:",           // 用户令牌集合缓存
        "user_menus:",            // 用户菜单树缓存
        "sys:config:global:"      // 全局系统配置（不受租户隔离）
        // 注意：租户级配置使用 "sys:config:tenant:" 前缀，走租户隔离
    };

    /**
     * 获取带租户前缀的 Key
     */
    private String getTenantKey(String key) {
        // 1. 检查是否为全局 Key
        for (String prefix : GLOBAL_PREFIXES) {
            if (key.startsWith(prefix)) {
                return key;
            }
        }
        
        // 2. 检查租户上下文
        Long tenantId = UserContext.getTenantId();
        if (tenantId != null) {
            return tenantId + ":" + key;
        }
        
        // 3. 无租户上下文，默认使用全局 (或报错? 暂回退到 default)
        // 兼容登录前的操作或系统级操作
        return key;
    }

    /**
     * 缓存基本对象
     *
     * @param key   缓存的键值
     * @param value 缓存的值
     */
    public <T> void setCacheObject(final String key, final T value) {
        redisTemplate.opsForValue().set(getTenantKey(key), value);
    }

    /**
     * 缓存基本对象，Integer、String、Entity等
     *
     * @param key      缓存的键值
     * @param value    缓存的值
     * @param timeout  时间
     * @param timeUnit 时间颗粒度
     */
    public <T> void setCacheObject(final String key, final T value, final long timeout, final TimeUnit timeUnit) {
        redisTemplate.opsForValue().set(getTenantKey(key), value, timeout, timeUnit);
    }

    /**
     * 设置有效时间
     *
     * @param key     Redis键
     * @param timeout 超时时间（秒）
     * @return true=设置成功；false=设置失败
     */
    public boolean expire(final String key, final long timeout) {
        return redisTemplate.expire(getTenantKey(key), timeout, TimeUnit.SECONDS);
    }

    /**
     * 设置有效时间
     *
     * @param key     Redis键
     * @param timeout 超时时间
     * @param unit    时间单位
     * @return true=设置成功；false=设置失败
     */
    public boolean expire(final String key, final long timeout, final TimeUnit unit) {
        return redisTemplate.expire(getTenantKey(key), timeout, unit);
    }

    /**
     * 获得缓存的基本对象。
     *
     * @param key 缓存键值
     * @return 缓存键值对应的数据
     */
    public <T> T getCacheObject(final String key) {
        ValueOperations<String, T> operation = redisTemplate.opsForValue();
        return operation.get(getTenantKey(key));
    }

    /**
     * 删除单个对象
     *
     * @param key
     */
    public boolean deleteObject(final String key) {
        return redisTemplate.delete(getTenantKey(key));
    }

    /**
     * 缓存Set
     *
     * @param key   缓存键值
     * @param value 缓存的值
     * @return 缓存数据的对象
     */
    public <T> long setCacheSet(final String key, final T value) {
        Long count = redisTemplate.opsForSet().add(getTenantKey(key), value);
        return count == null ? 0 : count;
    }

    /**
     * 获取Set中的所有值
     *
     * @param key 缓存键值
     * @return Set集合
     */
    public Set<Object> getCacheSet(final String key) {
        return redisTemplate.opsForSet().members(getTenantKey(key));
    }

    /**
     * 移除Set中的值
     *
     * @param key   缓存键值
     * @param value 缓存的值
     * @return 移除的数量
     */
    public <T> long removeCacheSet(final String key, final T value) {
        Long count = redisTemplate.opsForSet().remove(getTenantKey(key), value);
        return count == null ? 0 : count;
    }

    /**
     * 递增
     *
     * @param key   缓存键值
     * @return 递增后的值
     */
    public long increment(final String key) {
        Long count = redisTemplate.opsForValue().increment(getTenantKey(key));
        return count == null ? 0 : count;
    }

    /**
     * 递增
     *
     * @param key   缓存键值
     * @param delta 递增因子
     * @return 递增后的值
     */
    public long increment(final String key, long delta) {
        Long count = redisTemplate.opsForValue().increment(getTenantKey(key), delta);
        return count == null ? 0 : count;
    }

    /**
     * ZSet Add
     */
    public boolean setCacheZSet(final String key, final Object value, final double score) {
        return redisTemplate.opsForZSet().add(getTenantKey(key), value, score);
    }

    /**
     * ZSet Range By Score
     */
    public java.util.Set<Object> getCacheZSetRangeByScore(final String key, final double min, final double max) {
        return redisTemplate.opsForZSet().rangeByScore(getTenantKey(key), min, max);
    }

    /**
     * ZSet Remove
     */
    public long removeCacheZSet(final String key, final Object... values) {
        return redisTemplate.opsForZSet().remove(getTenantKey(key), values);
    }

    /**
     * 缓存基本对象（仅当Key不存在时设置）
     *
     * @param key      缓存的键值
     * @param value    缓存的值
     * @param timeout  时间
     * @param timeUnit 时间颗粒度
     * @return true=设置成功（key不存在）；false=设置失败（key已存在）
     */
    public <T> boolean setCacheObjectIfAbsent(final String key, final T value, final long timeout, final TimeUnit timeUnit) {
        Boolean result = redisTemplate.opsForValue().setIfAbsent(getTenantKey(key), value, timeout, timeUnit);
        return result != null && result;
    }

    /**
     * 获取ZSet大小
     */
    public long getCacheZSetSize(final String key) {
        Long size = redisTemplate.opsForZSet().zCard(getTenantKey(key));
        return size == null ? 0 : size;
    }

    /**
     * 按分数范围移除ZSet元素
     */
    public long removeRangeByScore(final String key, final double min, final double max) {
        Long count = redisTemplate.opsForZSet().removeRangeByScore(getTenantKey(key), min, max);
        return count == null ? 0 : count;
    }

    /**
     * 按分数范围获取ZSet元素
     */
    public Set<Object> getCacheZSetByScoreRange(final String key, final double min, final double max) {
        return redisTemplate.opsForZSet().rangeByScore(getTenantKey(key), min, max);
    }

    /**
     * 按分数范围移除ZSet元素（别名）
     */
    public long removeCacheZSetByScoreRange(final String key, final double min, final double max) {
        return removeRangeByScore(key, min, max);
    }

    /**
     * 获取匹配模式的所有Key
     *
     * @param pattern 匹配模式
     * @return key集合
     */
    public Collection<String> keys(final String pattern) {
        return redisTemplate.keys(getTenantKey(pattern));
    }

    /**
     * 检查Key是否存在
     */
    public boolean hasKey(final String key) {
        Boolean result = redisTemplate.hasKey(getTenantKey(key));
        return result != null && result;
    }

    /**
     * 获取Key的过期时间
     */
    public long getExpire(final String key) {
        Long expire = redisTemplate.getExpire(getTenantKey(key));
        return expire == null ? -1 : expire;
    }
}
