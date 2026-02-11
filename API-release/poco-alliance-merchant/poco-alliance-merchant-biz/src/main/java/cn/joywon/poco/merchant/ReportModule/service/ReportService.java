package cn.joywon.poco.merchant.ReportModule.service;

import cn.joywon.poco.merchant.ReportModule.dto.JointMarketingProfitRankDTO;
import cn.joywon.poco.merchant.ReportModule.dto.JointMarketingProfitReportDTO;
import cn.joywon.poco.merchant.ReportModule.dto.JointMarketingProfitTrendDTO;
import cn.joywon.poco.merchant.ReportModule.dto.ReportQueryDTO;
import cn.joywon.poco.merchant.ReportModule.vo.*;
import com.baomidou.mybatisplus.core.metadata.IPage;

import java.util.List;

/**
 * 报表服务接口
 * 聚焦销售、财务、营销和平台侧核心报表
 *
 * @author poco
 * @date 2025-12-25
 */
public interface ReportService {

    // ==================== 销售报表 ====================

    /**
     * 分页查询门店经营日报
     * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6
     */
    IPage<StoreDailyStatsVO> getStoreDailyStatsPage(ReportQueryDTO queryDTO);

    /**
     * 分页查询商品销售日报
     * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5
     */
    IPage<GoodsSalesDailyVO> getGoodsSalesDailyPage(ReportQueryDTO queryDTO);

    /**
     * 分页查询商品分类销售汇总
     * Requirements: 3.1, 3.2, 3.3, 3.4
     */
    IPage<CategorySalesSummaryVO> getCategorySalesSummaryPage(ReportQueryDTO queryDTO);

    /**
     * 分页查询退款分析报表
     * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
     */
    IPage<RefundAnalysisVO> getRefundAnalysisPage(ReportQueryDTO queryDTO);

    /**
     * 分页查询时段销售趋势报表
     * Requirements: 16.1, 16.2, 16.3, 16.4, 16.5
     */
    IPage<HourlySalesVO> getHourlySalesPage(ReportQueryDTO queryDTO);

    // ==================== 财务报表 ====================

    /**
     * 分页查询商家结算日报
     * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5
     */
    IPage<MerchantSettlementDailyVO> getMerchantSettlementDailyPage(ReportQueryDTO queryDTO);

    /**
     * 分页查询商家结算明细
     * Requirements: 6.1, 6.2, 6.3, 6.4
     */
    IPage<SettlementDetailVO> getSettlementDetailPage(ReportQueryDTO queryDTO);

    /**
     * 分页查询商家月度账单
     * Requirements: 7.1, 7.2, 7.3, 7.4
     */
    IPage<MerchantMonthlyBillVO> getMerchantMonthlyBillPage(ReportQueryDTO queryDTO);

    /**
     * 分页查询支付渠道对账报表
     * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5
     */
    IPage<PayChannelReconcileVO> getPayChannelReconcilePage(ReportQueryDTO queryDTO);

    /**
     * 分页查询应收账款报表
     * Requirements: 9.1, 9.2, 9.3, 9.4
     */
    IPage<ReceivableReportVO> getReceivableReportPage(ReportQueryDTO queryDTO);

    /**
     * 分页查询积分流水报表
     * Requirements: 11.1, 11.2, 11.3, 11.4, 11.5
     */
    IPage<PointsFlowVO> getPointsFlowPage(ReportQueryDTO queryDTO);

    // ==================== 营销报表 ====================

    /**
     * 分页查询优惠券使用分析报表
     * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5
     */
    IPage<CouponAnalysisVO> getCouponAnalysisPage(ReportQueryDTO queryDTO);

    /**
     * 分页查询用户消费分析报表
     * Requirements: 12.1, 12.2, 12.3, 12.4, 12.5
     */
    IPage<UserConsumptionVO> getUserConsumptionPage(ReportQueryDTO queryDTO);

    /**
     * 分页查询联合营销效果报表
     * Requirements: 13.1, 13.2, 13.3, 13.4, 13.5
     */
    IPage<JointMarketingVO> getJointMarketingPage(ReportQueryDTO queryDTO);

    /**
     * 联合营销分润报表
     */
    JointMarketingProfitReportVO getJointMarketingProfitReport(JointMarketingProfitReportDTO dto);

    /**
     * 联合营销分润趋势
     */
    List<JointMarketingProfitTrendVO> getJointMarketingProfitTrend(JointMarketingProfitTrendDTO dto);

    /**
     * 联合营销商家分润排名
     */
    List<JointMarketingMerchantProfitRankVO> getJointMarketingMerchantProfitRank(JointMarketingProfitRankDTO dto);

    // ==================== 平台报表（仅平台管理员可访问） ====================

    /**
     * 分页查询区域代理佣金报表
     * Requirements: 14.1, 14.2, 14.3, 14.4, 14.5
     * 注意：仅平台管理员可访问，商家角色应被拒绝
     */
    IPage<AgentCommissionVO> getAgentCommissionPage(ReportQueryDTO queryDTO);

    /**
     * 查询平台运营概览报表
     * Requirements: 15.1, 15.2, 15.3, 15.4, 15.5
     * 注意：仅平台管理员可访问，商家角色应被拒绝
     */
    PlatformOverviewVO getPlatformOverview(ReportQueryDTO queryDTO);

}