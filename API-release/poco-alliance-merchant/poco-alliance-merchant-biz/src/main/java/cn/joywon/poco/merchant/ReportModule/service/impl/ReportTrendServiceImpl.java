package cn.joywon.poco.merchant.ReportModule.service.impl;

import cn.hutool.core.collection.CollUtil;
import cn.hutool.json.JSONUtil;
import cn.joywon.poco.merchant.ReportModule.dto.ReportQueryDTO;
import cn.joywon.poco.merchant.ReportModule.mapper.ReportAggregationMapper;
import cn.joywon.poco.merchant.ReportModule.service.ReportCacheService;
import cn.joywon.poco.merchant.ReportModule.service.ReportTrendService;
import cn.joywon.poco.merchant.ReportModule.vo.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.util.Collections;
import java.util.List;

/**
 * 报表趋势对比服务实现
 * 提供周同比、月同比等趋势数据查询功能，使用中期缓存（10分钟）
 *
 * @author poco
 * @date 2025-01-06
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class ReportTrendServiceImpl implements ReportTrendService {

    private final ReportAggregationMapper reportAggregationMapper;
    private final ReportCacheService reportCacheService;

    /**
     * 趋势数据缓存时间：10分钟
     */
    private static final Duration TREND_CACHE_TTL = Duration.ofMinutes(10);

    /**
     * 缓存Key前缀
     */
    private static final String CACHE_PREFIX_TREND = "report:trend:";

    /**
     * 平台趋势默认查询天数
     */
    private static final int DEFAULT_TREND_DAYS = 30;

    @Override
    public List<StoreTrendVO> getStoreDailyTrend(ReportQueryDTO queryDTO) {
        // 参数校验
        if (queryDTO.getStartDate() == null || queryDTO.getEndDate() == null) {
            log.warn("门店趋势查询缺少日期范围参数");
            return Collections.emptyList();
        }

        // 构建缓存Key
        String cacheKey = buildStoreTrendCacheKey(queryDTO);
        
        // 尝试从缓存获取（使用正确的泛型处理方式）
        List<StoreTrendVO> cached = getListFromCache(cacheKey, StoreTrendVO.class);
        if (CollUtil.isNotEmpty(cached)) {
            log.debug("门店趋势缓存命中, storeId: {}, merchantId: {}", 
                    queryDTO.getStoreId(), queryDTO.getMerchantId());
            return cached;
        }

        // 从数据库查询
        List<StoreTrendVO> result = reportAggregationMapper.selectStoreTrend(
                queryDTO.getStartDate(),
                queryDTO.getEndDate(),
                queryDTO.getStoreId(),
                queryDTO.getMerchantId()
        );

        // 写入缓存
        if (CollUtil.isNotEmpty(result)) {
            reportCacheService.setToCache(cacheKey, result, TREND_CACHE_TTL);
        }
        
        log.debug("门店趋势查询完成, count: {}", result != null ? result.size() : 0);
        return result != null ? result : Collections.emptyList();
    }

    @Override
    public List<GoodsSalesTrendVO> getGoodsSalesTrend(ReportQueryDTO queryDTO) {
        // 参数校验
        if (queryDTO.getStartDate() == null || queryDTO.getEndDate() == null) {
            log.warn("商品趋势查询缺少日期范围参数");
            return Collections.emptyList();
        }

        // 构建缓存Key
        String cacheKey = buildGoodsTrendCacheKey(queryDTO);
        
        // 尝试从缓存获取
        List<GoodsSalesTrendVO> cached = getListFromCache(cacheKey, GoodsSalesTrendVO.class);
        if (CollUtil.isNotEmpty(cached)) {
            log.debug("商品趋势缓存命中, storeId: {}, merchantId: {}, categoryId: {}", 
                    queryDTO.getStoreId(), queryDTO.getMerchantId(), queryDTO.getCategoryId());
            return cached;
        }

        // 从数据库查询
        List<GoodsSalesTrendVO> result = reportAggregationMapper.selectGoodsSalesTrend(
                queryDTO.getStartDate(),
                queryDTO.getEndDate(),
                queryDTO.getStoreId(),
                queryDTO.getMerchantId(),
                queryDTO.getCategoryId()
        );

        // 写入缓存
        if (CollUtil.isNotEmpty(result)) {
            reportCacheService.setToCache(cacheKey, result, TREND_CACHE_TTL);
        }
        
        log.debug("商品趋势查询完成, count: {}", result != null ? result.size() : 0);
        return result != null ? result : Collections.emptyList();
    }

    @Override
    public List<UserConsumptionTrendVO> getUserConsumptionTrend(ReportQueryDTO queryDTO) {
        // 参数校验
        if (queryDTO.getStartDate() == null || queryDTO.getEndDate() == null) {
            log.warn("用户消费趋势查询缺少日期范围参数");
            return Collections.emptyList();
        }

        // 构建缓存Key
        String cacheKey = buildUserTrendCacheKey(queryDTO);
        
        // 尝试从缓存获取
        List<UserConsumptionTrendVO> cached = getListFromCache(cacheKey, UserConsumptionTrendVO.class);
        if (CollUtil.isNotEmpty(cached)) {
            log.debug("用户消费趋势缓存命中, storeId: {}, merchantId: {}", 
                    queryDTO.getStoreId(), queryDTO.getMerchantId());
            return cached;
        }

        // 从数据库查询
        List<UserConsumptionTrendVO> result = reportAggregationMapper.selectUserConsumptionTrend(
                queryDTO.getStartDate(),
                queryDTO.getEndDate(),
                queryDTO.getStoreId(),
                queryDTO.getMerchantId()
        );

        // 写入缓存
        if (CollUtil.isNotEmpty(result)) {
            reportCacheService.setToCache(cacheKey, result, TREND_CACHE_TTL);
        }
        
        log.debug("用户消费趋势查询完成, count: {}", result != null ? result.size() : 0);
        return result != null ? result : Collections.emptyList();
    }

    @Override
    public PlatformTrendVO getPlatformTrend() {
        // 构建缓存Key
        String cacheKey = CACHE_PREFIX_TREND + "platform:" + DEFAULT_TREND_DAYS;
        
        // 尝试从缓存获取
        PlatformTrendVO cached = reportCacheService.getFromCache(cacheKey, PlatformTrendVO.class);
        if (cached != null) {
            log.debug("平台趋势缓存命中");
            return cached;
        }

        // 查询各维度趋势数据
        List<DailyTrendPoint> gmvTrend = reportAggregationMapper.selectPlatformGmvTrend(DEFAULT_TREND_DAYS);
        List<DailyTrendPoint> ordersTrend = reportAggregationMapper.selectPlatformOrdersTrend(DEFAULT_TREND_DAYS);
        List<DailyTrendPoint> merchantsTrend = reportAggregationMapper.selectPlatformMerchantsTrend(DEFAULT_TREND_DAYS);
        List<DailyTrendPoint> usersTrend = reportAggregationMapper.selectPlatformUsersTrend(DEFAULT_TREND_DAYS);

        // 构建结果
        PlatformTrendVO result = new PlatformTrendVO();
        result.setGmvTrend(gmvTrend != null ? gmvTrend : Collections.emptyList());
        result.setOrdersTrend(ordersTrend != null ? ordersTrend : Collections.emptyList());
        result.setMerchantsTrend(merchantsTrend != null ? merchantsTrend : Collections.emptyList());
        result.setUsersTrend(usersTrend != null ? usersTrend : Collections.emptyList());

        // 计算周环比和月环比
        calculatePlatformGrowthRates(result, gmvTrend, ordersTrend);

        // 写入缓存
        reportCacheService.setToCache(cacheKey, result, TREND_CACHE_TTL);
        log.debug("平台趋势查询完成");
        
        return result;
    }

    // ==================== 私有方法 ====================

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
     * 计算平台周环比和月环比增长率
     */
    private void calculatePlatformGrowthRates(PlatformTrendVO result, 
                                              List<DailyTrendPoint> gmvTrend,
                                              List<DailyTrendPoint> ordersTrend) {
        if (gmvTrend == null || gmvTrend.size() < 14) {
            // 数据不足，无法计算
            return;
        }

        // 计算GMV周环比：最近7天 vs 前7天
        BigDecimal recentWeekGmv = sumTrendValues(gmvTrend, 0, 7);
        BigDecimal previousWeekGmv = sumTrendValues(gmvTrend, 7, 14);
        result.setWeekOverWeekGmv(calculateGrowthRate(recentWeekGmv, previousWeekGmv));

        // 计算GMV月环比：最近30天 vs 前30天（如果数据足够）
        if (gmvTrend.size() >= 30) {
            BigDecimal recentMonthGmv = sumTrendValues(gmvTrend, 0, 30);
            // 月环比需要更多历史数据，这里简化为与上周对比
            result.setMonthOverMonthGmv(calculateGrowthRate(recentMonthGmv, previousWeekGmv.multiply(BigDecimal.valueOf(4))));
        }

        // 计算订单数周环比
        if (ordersTrend != null && ordersTrend.size() >= 14) {
            BigDecimal recentWeekOrders = sumTrendValues(ordersTrend, 0, 7);
            BigDecimal previousWeekOrders = sumTrendValues(ordersTrend, 7, 14);
            result.setWeekOverWeekOrders(calculateGrowthRate(recentWeekOrders, previousWeekOrders));

            if (ordersTrend.size() >= 30) {
                BigDecimal recentMonthOrders = sumTrendValues(ordersTrend, 0, 30);
                result.setMonthOverMonthOrders(calculateGrowthRate(recentMonthOrders, previousWeekOrders.multiply(BigDecimal.valueOf(4))));
            }
        }
    }

    /**
     * 汇总趋势数据指定范围的值
     * 注意：趋势数据按日期升序排列，所以最近的数据在列表末尾
     */
    private BigDecimal sumTrendValues(List<DailyTrendPoint> trend, int startFromEnd, int endFromEnd) {
        if (trend == null || trend.isEmpty()) {
            return BigDecimal.ZERO;
        }
        
        int size = trend.size();
        int startIndex = Math.max(0, size - endFromEnd);
        int endIndex = Math.max(0, size - startFromEnd);
        
        BigDecimal sum = BigDecimal.ZERO;
        for (int i = startIndex; i < endIndex && i < size; i++) {
            DailyTrendPoint point = trend.get(i);
            if (point != null && point.getValue() != null) {
                sum = sum.add(point.getValue());
            }
        }
        return sum;
    }

    /**
     * 计算增长率
     * 公式：(当期值 - 对比期值) / 对比期值 * 100
     */
    private BigDecimal calculateGrowthRate(BigDecimal current, BigDecimal previous) {
        if (previous == null || previous.compareTo(BigDecimal.ZERO) == 0) {
            return null;
        }
        return current.subtract(previous)
                .divide(previous, 4, RoundingMode.HALF_UP)
                .multiply(BigDecimal.valueOf(100))
                .setScale(2, RoundingMode.HALF_UP);
    }

    /**
     * 构建门店趋势缓存Key
     */
    private String buildStoreTrendCacheKey(ReportQueryDTO queryDTO) {
        return CACHE_PREFIX_TREND + "store:" 
                + (queryDTO.getMerchantId() != null ? queryDTO.getMerchantId() : 0) + ":"
                + (queryDTO.getStoreId() != null ? queryDTO.getStoreId() : 0) + ":"
                + queryDTO.getStartDate() + "_" + queryDTO.getEndDate();
    }

    /**
     * 构建商品趋势缓存Key
     */
    private String buildGoodsTrendCacheKey(ReportQueryDTO queryDTO) {
        return CACHE_PREFIX_TREND + "goods:" 
                + (queryDTO.getMerchantId() != null ? queryDTO.getMerchantId() : 0) + ":"
                + (queryDTO.getStoreId() != null ? queryDTO.getStoreId() : 0) + ":"
                + (queryDTO.getCategoryId() != null ? queryDTO.getCategoryId() : 0) + ":"
                + queryDTO.getStartDate() + "_" + queryDTO.getEndDate();
    }

    /**
     * 构建用户消费趋势缓存Key
     */
    private String buildUserTrendCacheKey(ReportQueryDTO queryDTO) {
        return CACHE_PREFIX_TREND + "user:" 
                + (queryDTO.getMerchantId() != null ? queryDTO.getMerchantId() : 0) + ":"
                + (queryDTO.getStoreId() != null ? queryDTO.getStoreId() : 0) + ":"
                + queryDTO.getStartDate() + "_" + queryDTO.getEndDate();
    }
}
