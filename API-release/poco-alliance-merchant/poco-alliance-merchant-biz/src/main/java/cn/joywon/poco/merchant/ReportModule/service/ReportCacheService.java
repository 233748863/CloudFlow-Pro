package cn.joywon.poco.merchant.ReportModule.service;

import cn.hutool.core.util.StrUtil;
import cn.hutool.json.JSONUtil;
import cn.joywon.poco.merchant.ReportModule.dto.ReportQueryDTO;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.lang.reflect.Type;
import java.time.Duration;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 报表缓存服务
 * 提供报表数据的Redis缓存功能，支持不同报表类型的差异化缓存策略
 *
 * @author poco
 * @date 2025-12-25
 */
@Service
@Slf4j
public class ReportCacheService {

    private final StringRedisTemplate redisTemplate;

    /**
     * 缓存Key前缀
     */
    private static final String CACHE_PREFIX = "report:";

    /**
     * 报表类型常量
     */
    public static final String REPORT_STORE_DAILY = "store_daily";
    public static final String REPORT_GOODS_SALES = "goods_sales";
    public static final String REPORT_CATEGORY_SALES = "category_sales";
    public static final String REPORT_REFUND_ANALYSIS = "refund_analysis";
    public static final String REPORT_MERCHANT_SETTLEMENT = "merchant_settlement";
    public static final String REPORT_SETTLEMENT_DETAIL = "settlement_detail";
    public static final String REPORT_MONTHLY_BILL = "monthly_bill";
    public static final String REPORT_PAY_RECONCILE = "pay_reconcile";
    public static final String REPORT_RECEIVABLE = "receivable";
    public static final String REPORT_COUPON_ANALYSIS = "coupon_analysis";
    public static final String REPORT_POINTS_FLOW = "points_flow";
    public static final String REPORT_USER_CONSUMPTION = "user_consumption";
    public static final String REPORT_JOINT_MARKETING = "joint_marketing";
    public static final String REPORT_AGENT_COMMISSION = "agent_commission";
    public static final String REPORT_PLATFORM_OVERVIEW = "platform_overview";
    public static final String REPORT_HOURLY_SALES = "hourly_sales";

    /**
     * 缓存时间配置（根据设计文档）
     * - 实时性要求高的报表：短期缓存（10分钟）
     * - 日报类报表：中期缓存（1小时）
     * - 汇总类报表：长期缓存（24小时）
     */
    private static final Map<String, Duration> CACHE_TTL = new ConcurrentHashMap<>();

    static {
        // 中期缓存 - 1小时（日报类、实时性要求中等）
        CACHE_TTL.put(REPORT_STORE_DAILY, Duration.ofHours(1));
        CACHE_TTL.put(REPORT_GOODS_SALES, Duration.ofHours(1));
        CACHE_TTL.put(REPORT_POINTS_FLOW, Duration.ofHours(1));
        CACHE_TTL.put(REPORT_PLATFORM_OVERVIEW, Duration.ofHours(1));
        CACHE_TTL.put(REPORT_HOURLY_SALES, Duration.ofHours(1));

        // 长期缓存 - 24小时（汇总类、预计算类）
        CACHE_TTL.put(REPORT_CATEGORY_SALES, Duration.ofHours(24));
        CACHE_TTL.put(REPORT_REFUND_ANALYSIS, Duration.ofHours(24));
        CACHE_TTL.put(REPORT_MERCHANT_SETTLEMENT, Duration.ofHours(24));
        CACHE_TTL.put(REPORT_MONTHLY_BILL, Duration.ofHours(24));
        CACHE_TTL.put(REPORT_PAY_RECONCILE, Duration.ofHours(24));
        CACHE_TTL.put(REPORT_RECEIVABLE, Duration.ofHours(24));
        CACHE_TTL.put(REPORT_COUPON_ANALYSIS, Duration.ofHours(24));
        CACHE_TTL.put(REPORT_USER_CONSUMPTION, Duration.ofHours(24));
        CACHE_TTL.put(REPORT_JOINT_MARKETING, Duration.ofHours(24));
        CACHE_TTL.put(REPORT_AGENT_COMMISSION, Duration.ofHours(24));

        // 短期缓存 - 10分钟（实时性要求高）
        CACHE_TTL.put(REPORT_SETTLEMENT_DETAIL, Duration.ofMinutes(10));
    }

    public ReportCacheService(StringRedisTemplate redisTemplate) {
        this.redisTemplate = redisTemplate;
    }

    /**
     * 生成缓存Key
     * 格式: report:{reportType}:{merchantId}:{storeId}:{dateRange}:{pageNo}:{pageSize}
     *
     * @param reportType 报表类型
     * @param query      查询参数
     * @return 缓存Key
     */
    public String buildCacheKey(String reportType, ReportQueryDTO query) {
        StringBuilder keyBuilder = new StringBuilder(CACHE_PREFIX);
        keyBuilder.append(reportType).append(":");
        keyBuilder.append(query.getMerchantId() != null ? query.getMerchantId() : 0).append(":");
        keyBuilder.append(query.getStoreId() != null ? query.getStoreId() : 0).append(":");

        // 日期范围
        String startDate = query.getStartDate() != null ? query.getStartDate().toString() : "null";
        String endDate = query.getEndDate() != null ? query.getEndDate().toString() : "null";
        keyBuilder.append(startDate).append("_").append(endDate).append(":");

        // 分页信息
        keyBuilder.append(query.getPageNo()).append(":").append(query.getPageSize());

        // 额外参数（如支付渠道、统计月份等）
        if (StrUtil.isNotBlank(query.getPayChannel())) {
            keyBuilder.append(":").append(query.getPayChannel());
        }
        if (StrUtil.isNotBlank(query.getStatMonth())) {
            keyBuilder.append(":").append(query.getStatMonth());
        }
        if (query.getCategoryId() != null) {
            keyBuilder.append(":cat_").append(query.getCategoryId());
        }

        return keyBuilder.toString();
    }

    /**
     * 从缓存获取数据
     *
     * @param key   缓存Key
     * @param clazz 目标类型
     * @param <T>   泛型类型
     * @return 缓存数据，不存在返回null
     */
    public <T> T getFromCache(String key, Class<T> clazz) {
        try {
            String json = redisTemplate.opsForValue().get(key);
            if (StrUtil.isBlank(json)) {
                log.debug("缓存未命中: {}", key);
                return null;
            }
            log.debug("缓存命中: {}", key);
            return JSONUtil.toBean(json, clazz);
        } catch (Exception e) {
            log.warn("读取缓存失败, key: {}, error: {}", key, e.getMessage());
            return null;
        }
    }

    /**
     * 从缓存获取数据（支持泛型类型）
     *
     * @param key  缓存Key
     * @param type 类型（用于复杂泛型类型，如 new TypeReference<IPage<StoreDailyStatsVO>>(){}.getType()）
     * @param <T>  泛型类型
     * @return 缓存数据，不存在返回null
     */
    public <T> T getFromCache(String key, Type type) {
        try {
            String json = redisTemplate.opsForValue().get(key);
            if (StrUtil.isBlank(json)) {
                log.debug("缓存未命中: {}", key);
                return null;
            }
            log.debug("缓存命中: {}", key);
            return JSONUtil.toBean(json, type, true);
        } catch (Exception e) {
            log.warn("读取缓存失败, key: {}, error: {}", key, e.getMessage());
            return null;
        }
    }

    /**
     * 写入缓存
     *
     * @param key        缓存Key
     * @param data       缓存数据
     * @param reportType 报表类型（用于确定缓存时间）
     */
    public void setToCache(String key, Object data, String reportType) {
        try {
            Duration ttl = CACHE_TTL.getOrDefault(reportType, Duration.ofHours(1));
            String json = JSONUtil.toJsonStr(data);
            redisTemplate.opsForValue().set(key, json, ttl);
            log.debug("写入缓存成功, key: {}, ttl: {}分钟", key, ttl.toMinutes());
        } catch (Exception e) {
            log.warn("写入缓存失败, key: {}, error: {}", key, e.getMessage());
        }
    }

    /**
     * 写入缓存（自定义过期时间）
     *
     * @param key  缓存Key
     * @param data 缓存数据
     * @param ttl  过期时间
     */
    public void setToCache(String key, Object data, Duration ttl) {
        try {
            String json = JSONUtil.toJsonStr(data);
            redisTemplate.opsForValue().set(key, json, ttl);
            log.debug("写入缓存成功, key: {}, ttl: {}分钟", key, ttl.toMinutes());
        } catch (Exception e) {
            log.warn("写入缓存失败, key: {}, error: {}", key, e.getMessage());
        }
    }

    /**
     * 清除指定报表类型的所有缓存
     *
     * @param reportType 报表类型，传入"*"清除所有报表缓存
     */
    public void evictCache(String reportType) {
        try {
            String pattern = CACHE_PREFIX + reportType + ":*";
            Set<String> keys = redisTemplate.keys(pattern);
            if (keys != null && !keys.isEmpty()) {
                redisTemplate.delete(keys);
                log.info("清除缓存成功, pattern: {}, count: {}", pattern, keys.size());
            }
        } catch (Exception e) {
            log.warn("清除缓存失败, reportType: {}, error: {}", reportType, e.getMessage());
        }
    }

    /**
     * 清除指定Key的缓存
     *
     * @param key 缓存Key
     */
    public void evictCacheByKey(String key) {
        try {
            Boolean deleted = redisTemplate.delete(key);
            if (Boolean.TRUE.equals(deleted)) {
                log.debug("删除缓存成功, key: {}", key);
            }
        } catch (Exception e) {
            log.warn("删除缓存失败, key: {}, error: {}", key, e.getMessage());
        }
    }

    /**
     * 清除指定商家的所有报表缓存
     *
     * @param merchantId 商家ID
     */
    public void evictCacheByMerchant(Long merchantId) {
        try {
            String pattern = CACHE_PREFIX + "*:" + merchantId + ":*";
            Set<String> keys = redisTemplate.keys(pattern);
            if (keys != null && !keys.isEmpty()) {
                redisTemplate.delete(keys);
                log.info("清除商家缓存成功, merchantId: {}, count: {}", merchantId, keys.size());
            }
        } catch (Exception e) {
            log.warn("清除商家缓存失败, merchantId: {}, error: {}", merchantId, e.getMessage());
        }
    }

    /**
     * 检查缓存是否存在
     *
     * @param key 缓存Key
     * @return 是否存在
     */
    public boolean hasCache(String key) {
        try {
            return Boolean.TRUE.equals(redisTemplate.hasKey(key));
        } catch (Exception e) {
            log.warn("检查缓存失败, key: {}, error: {}", key, e.getMessage());
            return false;
        }
    }

    /**
     * 获取缓存剩余过期时间（秒）
     *
     * @param key 缓存Key
     * @return 剩余秒数，-1表示永不过期，-2表示Key不存在
     */
    public Long getCacheTTL(String key) {
        try {
            return redisTemplate.getExpire(key);
        } catch (Exception e) {
            log.warn("获取缓存TTL失败, key: {}, error: {}", key, e.getMessage());
            return -2L;
        }
    }

    /**
     * 获取指定报表类型的默认缓存时间
     *
     * @param reportType 报表类型
     * @return 缓存时间
     */
    public Duration getCacheDuration(String reportType) {
        return CACHE_TTL.getOrDefault(reportType, Duration.ofHours(1));
    }
}
