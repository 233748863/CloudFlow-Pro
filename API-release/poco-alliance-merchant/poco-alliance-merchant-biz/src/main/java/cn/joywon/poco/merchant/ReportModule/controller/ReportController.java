package cn.joywon.poco.merchant.ReportModule.controller;

import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.common.security.annotation.HasPermission;
import cn.joywon.poco.merchant.ReportModule.dto.JointMarketingProfitRankDTO;
import cn.joywon.poco.merchant.ReportModule.dto.JointMarketingProfitReportDTO;
import cn.joywon.poco.merchant.ReportModule.dto.JointMarketingProfitTrendDTO;
import cn.joywon.poco.merchant.ReportModule.dto.ReportQueryDTO;
import cn.joywon.poco.merchant.ReportModule.service.ReportRealtimeService;
import cn.joywon.poco.merchant.ReportModule.service.ReportService;
import cn.joywon.poco.merchant.ReportModule.service.ReportTrendService;
import cn.joywon.poco.merchant.ReportModule.vo.*;
import com.baomidou.mybatisplus.core.metadata.IPage;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.AllArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 报表管理控制器
 * 聚焦销售、财务、营销和平台侧核心报表
 *
 * @author poco
 * @date 2025-12-25
 */
@RestController
@AllArgsConstructor
@RequestMapping("/report")
@Tag(name = "报表管理", description = "销售、财务、营销与平台报表统计接口")
@Slf4j
public class ReportController {

    private final ReportService reportService;
    private final ReportRealtimeService reportRealtimeService;
    private final ReportTrendService reportTrendService;

    // ==================== 实时数据查询 ====================

    @GetMapping("/realtime/store/daily")
    @Operation(summary = "门店实时统计", description = "获取门店当日实时经营数据，直接从订单表聚合")
    @HasPermission("report_store_daily_view")
    public R<StoreDailyStatsVO> getRealtimeStoreDailyStats(
            @Parameter(description = "门店ID") @RequestParam(required = false) Long storeId,
            @Parameter(description = "商家ID") @RequestParam(required = false) Long merchantId) {
        return R.ok(reportRealtimeService.getRealtimeStoreDailyStats(storeId, merchantId));
    }

    @GetMapping("/realtime/goods/rank")
    @Operation(summary = "商品销售排行", description = "获取当日商品销售实时排行，按销售额降序")
    @HasPermission("report_goods_sales_view")
    public R<List<GoodsSalesRankVO>> getRealtimeGoodsSalesRank(
            @Parameter(description = "门店ID") @RequestParam(required = false) Long storeId,
            @Parameter(description = "商家ID") @RequestParam(required = false) Long merchantId,
            @Parameter(description = "返回前N条，默认10") @RequestParam(required = false, defaultValue = "10") Integer topN) {
        return R.ok(reportRealtimeService.getRealtimeGoodsSalesRank(storeId, merchantId, topN));
    }

    @GetMapping("/realtime/platform/overview")
    @Operation(summary = "平台实时概览", description = "获取平台当日实时运营数据，含与昨日同时段对比（仅平台管理员）")
    @HasPermission("report_platform_overview_view")
    public R<PlatformRealtimeOverviewVO> getRealtimePlatformOverview() {
        return R.ok(reportRealtimeService.getRealtimePlatformOverview());
    }

    // ==================== 趋势对比查询 ====================

    @GetMapping("/trend/store/daily")
    @Operation(summary = "门店经营趋势", description = "获取门店经营趋势数据，含周同比、月同比")
    @HasPermission("report_store_daily_view")
    public R<List<StoreTrendVO>> getStoreDailyTrend(ReportQueryDTO queryDTO) {
        return R.ok(reportTrendService.getStoreDailyTrend(queryDTO));
    }

    @GetMapping("/trend/goods/sales")
    @Operation(summary = "商品销售趋势", description = "获取商品销售趋势数据，含销量变化率")
    @HasPermission("report_goods_sales_view")
    public R<List<GoodsSalesTrendVO>> getGoodsSalesTrend(ReportQueryDTO queryDTO) {
        return R.ok(reportTrendService.getGoodsSalesTrend(queryDTO));
    }

    @GetMapping("/trend/user/consumption")
    @Operation(summary = "用户消费趋势", description = "获取用户消费趋势数据，含新用户、活跃用户、复购率变化")
    @HasPermission("report_user_consumption_view")
    public R<List<UserConsumptionTrendVO>> getUserConsumptionTrend(ReportQueryDTO queryDTO) {
        return R.ok(reportTrendService.getUserConsumptionTrend(queryDTO));
    }

    @GetMapping("/trend/platform")
    @Operation(summary = "平台运营趋势", description = "获取平台最近30天运营趋势，含周环比、月环比（仅平台管理员）")
    @HasPermission("report_platform_overview_view")
    public R<PlatformTrendVO> getPlatformTrend() {
        return R.ok(reportTrendService.getPlatformTrend());
    }

    // ==================== 销售报表 ====================

    @GetMapping("/store/daily")
    @Operation(summary = "门店经营日报", description = "订单数、GMV、实付、退款、客单价等核心经营指标")
    @HasPermission("report_store_daily_view")
    public R<IPage<StoreDailyStatsVO>> getStoreDailyStatsPage(ReportQueryDTO queryDTO) {
        return R.ok(reportService.getStoreDailyStatsPage(queryDTO));
    }

    @GetMapping("/goods/sales")
    @Operation(summary = "商品销售日报", description = "SKU维度销量、销售额统计")
    @HasPermission("report_goods_sales_view")
    public R<IPage<GoodsSalesDailyVO>> getGoodsSalesDailyPage(ReportQueryDTO queryDTO) {
        return R.ok(reportService.getGoodsSalesDailyPage(queryDTO));
    }

    @GetMapping("/category/sales")
    @Operation(summary = "商品分类销售汇总", description = "按商品分类统计销量、销售额、占比")
    @HasPermission("report_category_sales_view")
    public R<IPage<CategorySalesSummaryVO>> getCategorySalesSummaryPage(ReportQueryDTO queryDTO) {
        return R.ok(reportService.getCategorySalesSummaryPage(queryDTO));
    }

    @GetMapping("/refund/analysis")
    @Operation(summary = "退款分析报表", description = "退款原因分布、退款率、退款金额趋势")
    @HasPermission("report_refund_analysis_view")
    public R<IPage<RefundAnalysisVO>> getRefundAnalysisPage(ReportQueryDTO queryDTO) {
        return R.ok(reportService.getRefundAnalysisPage(queryDTO));
    }

    @GetMapping("/hourly/sales")
    @Operation(summary = "时段销售趋势报表", description = "按小时分组的销售数据，标识高峰和低谷时段")
    @HasPermission("report_hourly_sales_view")
    public R<IPage<HourlySalesVO>> getHourlySalesPage(ReportQueryDTO queryDTO) {
        return R.ok(reportService.getHourlySalesPage(queryDTO));
    }

    // ==================== 财务报表 ====================

    @GetMapping("/merchant/settlement")
    @Operation(summary = "商家结算日报", description = "营业额、支付渠道、分润、退款、平台抽成、实结金额")
    @HasPermission("report_merchant_settlement_view")
    public R<IPage<MerchantSettlementDailyVO>> getMerchantSettlementDailyPage(ReportQueryDTO queryDTO) {
        return R.ok(reportService.getMerchantSettlementDailyPage(queryDTO));
    }

    @GetMapping("/settlement/detail")
    @Operation(summary = "商家结算明细", description = "逐笔资金流水：订单收款、退款、分润收支")
    @HasPermission("report_settlement_detail_view")
    public R<IPage<SettlementDetailVO>> getSettlementDetailPage(ReportQueryDTO queryDTO) {
        return R.ok(reportService.getSettlementDetailPage(queryDTO));
    }

    @GetMapping("/merchant/bill")
    @Operation(summary = "商家月度账单", description = "月度收支汇总、净结算额")
    @HasPermission("report_merchant_bill_view")
    public R<IPage<MerchantMonthlyBillVO>> getMerchantMonthlyBillPage(ReportQueryDTO queryDTO) {
        return R.ok(reportService.getMerchantMonthlyBillPage(queryDTO));
    }

    @GetMapping("/pay/reconcile")
    @Operation(summary = "支付渠道对账", description = "按支付渠道统计交易笔数、金额、手续费")
    @HasPermission("report_pay_reconcile_view")
    public R<IPage<PayChannelReconcileVO>> getPayChannelReconcilePage(ReportQueryDTO queryDTO) {
        return R.ok(reportService.getPayChannelReconcilePage(queryDTO));
    }

    @GetMapping("/receivable")
    @Operation(summary = "应收账款报表", description = "待结算金额、账龄分析")
    @HasPermission("report_receivable_view")
    public R<IPage<ReceivableReportVO>> getReceivableReportPage(ReportQueryDTO queryDTO) {
        return R.ok(reportService.getReceivableReportPage(queryDTO));
    }

    @GetMapping("/points/flow")
    @Operation(summary = "积分流水报表", description = "积分发放、消耗、过期统计，按来源类型分组")
    @HasPermission("report_points_flow_view")
    public R<IPage<PointsFlowVO>> getPointsFlowPage(ReportQueryDTO queryDTO) {
        return R.ok(reportService.getPointsFlowPage(queryDTO));
    }

    // ==================== 营销报表 ====================

    @GetMapping("/coupon/analysis")
    @Operation(summary = "优惠券使用分析报表", description = "优惠券发放、核销统计，ROI分析")
    @HasPermission("report_coupon_analysis_view")
    public R<IPage<CouponAnalysisVO>> getCouponAnalysisPage(ReportQueryDTO queryDTO) {
        return R.ok(reportService.getCouponAnalysisPage(queryDTO));
    }

    @GetMapping("/user/consumption")
    @Operation(summary = "用户消费分析报表", description = "新用户、活跃用户、复购率、消费金额分布")
    @HasPermission("report_user_consumption_view")
    public R<IPage<UserConsumptionVO>> getUserConsumptionPage(ReportQueryDTO queryDTO) {
        return R.ok(reportService.getUserConsumptionPage(queryDTO));
    }

    @GetMapping("/joint/marketing")
    @Operation(summary = "联合营销效果报表", description = "跨商家合作活动效果，发券、核销、分润统计")
    @HasPermission("report_joint_marketing_view")
    public R<IPage<JointMarketingVO>> getJointMarketingPage(ReportQueryDTO queryDTO) {
        return R.ok(reportService.getJointMarketingPage(queryDTO));
    }

    @PostMapping("/joint/marketing/profit")
    @Operation(summary = "联合营销分润统计报表")
    public R<JointMarketingProfitReportVO> getJointMarketingProfitReport(@RequestBody @Valid JointMarketingProfitReportDTO dto) {
        return R.ok(reportService.getJointMarketingProfitReport(dto));
    }

    @PostMapping("/joint/marketing/profit/trend")
    @Operation(summary = "联合营销分润趋势分析")
    public R<List<JointMarketingProfitTrendVO>> getJointMarketingProfitTrend(@RequestBody @Valid JointMarketingProfitTrendDTO dto) {
        return R.ok(reportService.getJointMarketingProfitTrend(dto));
    }

    @PostMapping("/joint/marketing/profit/rank")
    @Operation(summary = "联合营销商家分润排名")
    public R<List<JointMarketingMerchantProfitRankVO>> getJointMarketingMerchantProfitRank(@RequestBody @Valid JointMarketingProfitRankDTO dto) {
        return R.ok(reportService.getJointMarketingMerchantProfitRank(dto));
    }

    // ==================== 平台报表（仅平台管理员可访问） ====================

    @GetMapping("/agent/commission")
    @Operation(summary = "区域代理佣金报表", description = "代理佣金统计、结算状态、绩效排名（仅平台管理员）")
    @HasPermission("report_agent_commission_view")
    public R<IPage<AgentCommissionVO>> getAgentCommissionPage(ReportQueryDTO queryDTO) {
        return R.ok(reportService.getAgentCommissionPage(queryDTO));
    }

    @GetMapping("/platform/overview")
    @Operation(summary = "平台运营概览报表", description = "平台级GMV、订单、商家、用户、收入汇总（仅平台管理员）")
    @HasPermission("report_platform_overview_view")
    public R<PlatformOverviewVO> getPlatformOverview(ReportQueryDTO queryDTO) {
        return R.ok(reportService.getPlatformOverview(queryDTO));
    }
}
