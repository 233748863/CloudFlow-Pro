package cn.joywon.poco.merchant.ReportModule.service;

import cn.joywon.poco.merchant.ReportModule.vo.GoodsSalesRankVO;
import cn.joywon.poco.merchant.ReportModule.vo.PlatformRealtimeOverviewVO;
import cn.joywon.poco.merchant.ReportModule.vo.StoreDailyStatsVO;

import java.util.List;

/**
 * 报表实时查询服务接口
 * 提供当日实时数据查询功能，直接从源数据表聚合
 *
 * @author poco
 * @date 2025-01-06
 */
public interface ReportRealtimeService {

    /**
     * 获取门店当日实时经营数据
     * 直接从orders表聚合当日订单数据
     *
     * @param storeId 门店ID（可选）
     * @param merchantId 商家ID（可选）
     * @return 门店实时经营统计
     */
    StoreDailyStatsVO getRealtimeStoreDailyStats(Long storeId, Long merchantId);

    /**
     * 获取当日商品销售实时排行
     * 从order_items表聚合当日SKU销售数据，按销售额降序排列
     *
     * @param storeId 门店ID（可选）
     * @param merchantId 商家ID（可选）
     * @param topN 返回前N条记录，默认10
     * @return 商品销售排行列表
     */
    List<GoodsSalesRankVO> getRealtimeGoodsSalesRank(Long storeId, Long merchantId, Integer topN);

    /**
     * 获取平台当日实时运营概览
     * 从orders表聚合当日平台级数据，包含与昨日同时段的对比
     * 仅平台管理员可访问
     *
     * @return 平台实时概览（含与昨日同时段对比）
     */
    PlatformRealtimeOverviewVO getRealtimePlatformOverview();
}
