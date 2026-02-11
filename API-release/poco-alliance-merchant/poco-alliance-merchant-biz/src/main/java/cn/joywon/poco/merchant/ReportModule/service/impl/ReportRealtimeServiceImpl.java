package cn.joywon.poco.merchant.ReportModule.service.impl;

import cn.hutool.core.collection.CollUtil;
import cn.joywon.poco.merchant.ReportModule.mapper.ReportAggregationMapper;
import cn.joywon.poco.merchant.ReportModule.service.ReportCacheService;
import cn.joywon.poco.merchant.ReportModule.service.ReportRealtimeService;
import cn.joywon.poco.merchant.ReportModule.vo.GoodsSalesRankVO;
import cn.joywon.poco.merchant.ReportModule.vo.PlatformRealtimeOverviewVO;
import cn.joywon.poco.merchant.ReportModule.vo.StoreDailyStatsVO;
import cn.hutool.json.JSONUtil;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.LocalDate;
import java.util.Collections;
import java.util.List;

/**
 * 报表实时查询服务实现
 * 提供当日实时数据查询功能，使用短期缓存（1分钟）
 *
 * @author poco
 * @date 2025-01-06
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class ReportRealtimeServiceImpl implements ReportRealtimeService {

    private final ReportAggregationMapper reportAggregationMapper;
    private final ReportCacheService reportCacheService;

    /**
     * 实时数据缓存时间：1分钟
     */
    private static final Duration REALTIME_CACHE_TTL = Duration.ofMinutes(1);

    /**
     * 缓存Key前缀
     */
    private static final String CACHE_PREFIX_REALTIME = "report:realtime:";

    /**
     * 默认排行榜数量
     */
    private static final int DEFAULT_TOP_N = 10;

    @Override
    public StoreDailyStatsVO getRealtimeStoreDailyStats(Long storeId, Long merchantId) {
        // 构建缓存Key
        String cacheKey = buildStoreDailyCacheKey(storeId, merchantId);
        
        // 尝试从缓存获取
        StoreDailyStatsVO cached = reportCacheService.getFromCache(cacheKey, StoreDailyStatsVO.class);
        if (cached != null) {
            log.debug("实时门店统计缓存命中, storeId: {}, merchantId: {}", storeId, merchantId);
            return cached;
        }

        // 从数据库查询
        StoreDailyStatsVO result = reportAggregationMapper.realtimeStoreDailyStats(storeId, merchantId);
        
        if (result == null) {
            // 返回空数据对象
            result = new StoreDailyStatsVO();
            result.setStatDate(LocalDate.now());
            result.setStoreId(storeId);
            result.setTotalOrderCount(0);
            result.setPaidOrderCount(0);
            result.setTotalSalesAmount(BigDecimal.ZERO);
            result.setRealPayAmount(BigDecimal.ZERO);
            result.setRefundOrderCount(0);
            result.setRefundAmount(BigDecimal.ZERO);
            result.setAvgOrderValue(BigDecimal.ZERO);
        }

        // 写入缓存
        reportCacheService.setToCache(cacheKey, result, REALTIME_CACHE_TTL);
        log.debug("实时门店统计查询完成, storeId: {}, merchantId: {}", storeId, merchantId);
        
        return result;
    }

    @Override
    public List<GoodsSalesRankVO> getRealtimeGoodsSalesRank(Long storeId, Long merchantId, Integer topN) {
        // 参数处理
        int limit = (topN != null && topN > 0) ? topN : DEFAULT_TOP_N;
        
        // 构建缓存Key
        String cacheKey = buildGoodsRankCacheKey(storeId, merchantId, limit);
        
        // 尝试从缓存获取（使用String获取后手动转换，避免泛型类型擦除问题）
        List<GoodsSalesRankVO> cached = getListFromCache(cacheKey, GoodsSalesRankVO.class);
        if (CollUtil.isNotEmpty(cached)) {
            log.debug("实时商品排行缓存命中, storeId: {}, merchantId: {}, topN: {}", storeId, merchantId, limit);
            return cached;
        }

        // 从数据库查询
        List<GoodsSalesRankVO> result = reportAggregationMapper.realtimeGoodsSalesRank(storeId, merchantId, limit);
        
        // 写入缓存
        if (CollUtil.isNotEmpty(result)) {
            reportCacheService.setToCache(cacheKey, result, REALTIME_CACHE_TTL);
        }
        log.debug("实时商品排行查询完成, storeId: {}, merchantId: {}, count: {}", 
                storeId, merchantId, result != null ? result.size() : 0);
        
        return result != null ? result : Collections.emptyList();
    }

    @Override
    public PlatformRealtimeOverviewVO getRealtimePlatformOverview() {
        // 构建缓存Key
        String cacheKey = CACHE_PREFIX_REALTIME + "platform:overview";
        
        // 尝试从缓存获取
        PlatformRealtimeOverviewVO cached = reportCacheService.getFromCache(cacheKey, PlatformRealtimeOverviewVO.class);
        if (cached != null) {
            log.debug("平台实时概览缓存命中");
            return cached;
        }

        // 查询当日实时数据
        PlatformRealtimeOverviewVO todayData = reportAggregationMapper.realtimePlatformOverview();
        
        // 查询昨日同时段数据
        PlatformRealtimeOverviewVO yesterdayData = reportAggregationMapper.yesterdaySameTimeStats();
        
        // 计算对比数据
        PlatformRealtimeOverviewVO result = calculateComparison(todayData, yesterdayData);
        
        // 写入缓存
        reportCacheService.setToCache(cacheKey, result, REALTIME_CACHE_TTL);
        log.debug("平台实时概览查询完成");
        
        return result;
    }

    /**
     * 从缓存获取List类型数据（解决泛型类型擦除问题）
     */
    private <T> List<T> getListFromCache(String cacheKey, Class<T> elementType) {
        try {
            String json = reportCacheService.getFromCache(cacheKey, String.class);
            if (json == null || json.isEmpty()) {
                return null;
            }
            return JSONUtil.toList(json, elementType);
        } catch (Exception e) {
            log.warn("从缓存获取List数据失败, key: {}, error: {}", cacheKey, e.getMessage());
            return null;
        }
    }

    /**
     * 计算今日与昨日同时段的对比数据
     */
    private PlatformRealtimeOverviewVO calculateComparison(PlatformRealtimeOverviewVO today, 
                                                           PlatformRealtimeOverviewVO yesterday) {
        if (today == null) {
            today = new PlatformRealtimeOverviewVO();
            today.setStatDate(LocalDate.now());
            today.setTodayGmv(BigDecimal.ZERO);
            today.setTodayOrders(0);
            today.setTodayActiveMerchants(0);
            today.setTodayActiveUsers(0);
        }

        // 计算GMV变化率
        if (yesterday != null && yesterday.getTodayGmv() != null 
                && yesterday.getTodayGmv().compareTo(BigDecimal.ZERO) > 0) {
            BigDecimal gmvChange = today.getTodayGmv().subtract(yesterday.getTodayGmv())
                    .divide(yesterday.getTodayGmv(), 4, RoundingMode.HALF_UP)
                    .multiply(BigDecimal.valueOf(100));
            today.setGmvChangeRate(gmvChange.setScale(2, RoundingMode.HALF_UP));
            today.setGmvTrend(determineTrend(gmvChange));
        } else {
            today.setGmvChangeRate(null);
            today.setGmvTrend("FLAT");
        }

        // 计算订单数变化率
        if (yesterday != null && yesterday.getTodayOrders() != null && yesterday.getTodayOrders() > 0) {
            BigDecimal ordersChange = BigDecimal.valueOf(today.getTodayOrders() - yesterday.getTodayOrders())
                    .divide(BigDecimal.valueOf(yesterday.getTodayOrders()), 4, RoundingMode.HALF_UP)
                    .multiply(BigDecimal.valueOf(100));
            today.setOrdersChangeRate(ordersChange.setScale(2, RoundingMode.HALF_UP));
            today.setOrdersTrend(determineTrend(ordersChange));
        } else {
            today.setOrdersChangeRate(null);
            today.setOrdersTrend("FLAT");
        }

        // 计算活跃商家变化率
        if (yesterday != null && yesterday.getTodayActiveMerchants() != null 
                && yesterday.getTodayActiveMerchants() > 0) {
            BigDecimal merchantsChange = BigDecimal.valueOf(
                    today.getTodayActiveMerchants() - yesterday.getTodayActiveMerchants())
                    .divide(BigDecimal.valueOf(yesterday.getTodayActiveMerchants()), 4, RoundingMode.HALF_UP)
                    .multiply(BigDecimal.valueOf(100));
            today.setMerchantsChangeRate(merchantsChange.setScale(2, RoundingMode.HALF_UP));
            today.setMerchantsTrend(determineTrend(merchantsChange));
        } else {
            today.setMerchantsChangeRate(null);
            today.setMerchantsTrend("FLAT");
        }

        // 计算活跃用户变化率
        if (yesterday != null && yesterday.getTodayActiveUsers() != null 
                && yesterday.getTodayActiveUsers() > 0) {
            BigDecimal usersChange = BigDecimal.valueOf(
                    today.getTodayActiveUsers() - yesterday.getTodayActiveUsers())
                    .divide(BigDecimal.valueOf(yesterday.getTodayActiveUsers()), 4, RoundingMode.HALF_UP)
                    .multiply(BigDecimal.valueOf(100));
            today.setUsersChangeRate(usersChange.setScale(2, RoundingMode.HALF_UP));
            today.setUsersTrend(determineTrend(usersChange));
        } else {
            today.setUsersChangeRate(null);
            today.setUsersTrend("FLAT");
        }

        return today;
    }

    /**
     * 根据变化率确定趋势标识
     */
    private String determineTrend(BigDecimal changeRate) {
        if (changeRate == null) {
            return "FLAT";
        }
        int comparison = changeRate.compareTo(BigDecimal.ZERO);
        if (comparison > 0) {
            return "UP";
        } else if (comparison < 0) {
            return "DOWN";
        } else {
            return "FLAT";
        }
    }

    /**
     * 构建门店实时统计缓存Key
     */
    private String buildStoreDailyCacheKey(Long storeId, Long merchantId) {
        return CACHE_PREFIX_REALTIME + "store:daily:" 
                + (merchantId != null ? merchantId : 0) + ":" 
                + (storeId != null ? storeId : 0);
    }

    /**
     * 构建商品排行缓存Key
     */
    private String buildGoodsRankCacheKey(Long storeId, Long merchantId, int topN) {
        return CACHE_PREFIX_REALTIME + "goods:rank:" 
                + (merchantId != null ? merchantId : 0) + ":" 
                + (storeId != null ? storeId : 0) + ":" + topN;
    }
}
