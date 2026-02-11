package cn.joywon.poco.merchant.ReportModule.mapper;

import cn.joywon.poco.merchant.ReportModule.dto.*;
import cn.joywon.poco.merchant.ReportModule.vo.*;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDate;
import java.util.List;

/**
 * 报表数据聚合Mapper
 * 用于从各业务表聚合报表数据
 *
 * @author poco
 * @date 2025-01-06
 */
@Mapper
public interface ReportAggregationMapper {

    // ==================== 营销数据聚合 ====================

    /**
     * 聚合优惠券发放数据
     *
     * @param statDate 统计日期
     * @return 优惠券发放聚合结果列表
     */
    List<CouponAnalysisAggDTO> aggregateCouponIssued(@Param("statDate") LocalDate statDate);

    /**
     * 聚合优惠券核销数据
     *
     * @param statDate 统计日期
     * @return 优惠券核销聚合结果列表
     */
    List<CouponAnalysisAggDTO> aggregateCouponUsed(@Param("statDate") LocalDate statDate);

    /**
     * 聚合积分流水数据
     *
     * @param statDate 统计日期
     * @return 积分流水聚合结果列表
     */
    List<PointsFlowAggDTO> aggregatePointsFlow(@Param("statDate") LocalDate statDate);

    /**
     * 聚合联合营销效果数据
     *
     * @param statDate 统计日期
     * @return 联合营销效果聚合结果列表
     */
    List<JointMarketingAggDTO> aggregateJointMarketing(@Param("statDate") LocalDate statDate);

    // ==================== 平台数据聚合 ====================

    /**
     * 聚合代理佣金数据
     *
     * @param statDate 统计日期
     * @return 代理佣金聚合结果列表
     */
    List<AgentCommissionAggDTO> aggregateAgentCommission(@Param("statDate") LocalDate statDate);

    /**
     * 聚合平台运营概览数据
     *
     * @param statDate 统计日期
     * @return 平台运营概览聚合结果
     */
    PlatformOverviewAggDTO aggregatePlatformOverview(@Param("statDate") LocalDate statDate);

    // ==================== 实时数据查询 ====================

    /**
     * 获取门店当日实时经营数据
     * 直接从orders表聚合当日订单数据
     *
     * @param storeId 门店ID（可选）
     * @param merchantId 商家ID（可选）
     * @return 门店实时经营统计
     */
    StoreDailyStatsVO realtimeStoreDailyStats(@Param("storeId") Long storeId, @Param("merchantId") Long merchantId);

    /**
     * 获取当日商品销售实时排行
     * 从order_items表聚合当日SKU销售数据
     *
     * @param storeId 门店ID（可选）
     * @param merchantId 商家ID（可选）
     * @param topN 返回前N条记录
     * @return 商品销售排行列表
     */
    List<GoodsSalesRankVO> realtimeGoodsSalesRank(@Param("storeId") Long storeId, 
                                                   @Param("merchantId") Long merchantId, 
                                                   @Param("topN") Integer topN);

    /**
     * 获取平台当日实时运营概览
     * 从orders表聚合当日平台级数据（截止到当前时间）
     *
     * @return 平台实时概览数据
     */
    PlatformRealtimeOverviewVO realtimePlatformOverview();

    /**
     * 获取昨日同时段统计数据
     * 用于与当日实时数据进行对比
     *
     * @return 昨日同时段平台概览数据
     */
    PlatformRealtimeOverviewVO yesterdaySameTimeStats();

    // ==================== 趋势数据查询 ====================

    /**
     * 查询门店经营趋势数据
     * 包含当日数据、周同比（与上周同日对比）、月同比（与上月同日对比）
     *
     * @param startDate 开始日期
     * @param endDate 结束日期
     * @param storeId 门店ID（可选）
     * @param merchantId 商家ID（可选）
     * @return 门店经营趋势列表
     */
    List<StoreTrendVO> selectStoreTrend(@Param("startDate") LocalDate startDate,
                                        @Param("endDate") LocalDate endDate,
                                        @Param("storeId") Long storeId,
                                        @Param("merchantId") Long merchantId);

    /**
     * 查询商品销售趋势数据
     * 包含当期销量、上周销量、变化率
     *
     * @param startDate 开始日期
     * @param endDate 结束日期
     * @param storeId 门店ID（可选）
     * @param merchantId 商家ID（可选）
     * @param categoryId 分类ID（可选）
     * @return 商品销售趋势列表
     */
    List<GoodsSalesTrendVO> selectGoodsSalesTrend(@Param("startDate") LocalDate startDate,
                                                   @Param("endDate") LocalDate endDate,
                                                   @Param("storeId") Long storeId,
                                                   @Param("merchantId") Long merchantId,
                                                   @Param("categoryId") Long categoryId);

    /**
     * 查询用户消费趋势数据
     * 包含新用户、活跃用户、复购率的周同比和月同比
     *
     * @param startDate 开始日期
     * @param endDate 结束日期
     * @param storeId 门店ID（可选）
     * @param merchantId 商家ID（可选）
     * @return 用户消费趋势列表
     */
    List<UserConsumptionTrendVO> selectUserConsumptionTrend(@Param("startDate") LocalDate startDate,
                                                            @Param("endDate") LocalDate endDate,
                                                            @Param("storeId") Long storeId,
                                                            @Param("merchantId") Long merchantId);

    /**
     * 查询平台运营趋势数据（最近N天）
     * 返回每日GMV、订单数、活跃商家数、活跃用户数的时间序列
     *
     * @param days 查询天数（默认30天）
     * @return 每日趋势数据点列表
     */
    List<DailyTrendPoint> selectPlatformGmvTrend(@Param("days") Integer days);

    /**
     * 查询平台订单数趋势
     *
     * @param days 查询天数
     * @return 每日订单数趋势
     */
    List<DailyTrendPoint> selectPlatformOrdersTrend(@Param("days") Integer days);

    /**
     * 查询平台活跃商家趋势
     *
     * @param days 查询天数
     * @return 每日活跃商家趋势
     */
    List<DailyTrendPoint> selectPlatformMerchantsTrend(@Param("days") Integer days);

    /**
     * 查询平台活跃用户趋势
     *
     * @param days 查询天数
     * @return 每日活跃用户趋势
     */
    List<DailyTrendPoint> selectPlatformUsersTrend(@Param("days") Integer days);
}
