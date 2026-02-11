package cn.joywon.poco.merchant.ReportModule.service;

import java.time.LocalDate;

/**
 * 报表数据生成服务接口
 * 负责从订单、支付等源数据聚合生成报表数据
 * 由定时任务调度执行
 *
 * @author poco
 * @date 2025-01-05
 */
public interface ReportGenerateService {

    // ==================== 销售报表生成 ====================

    /**
     * 生成门店经营日报
     * 从订单数据聚合计算门店每日的订单数、GMV、实付金额、退款金额、客单价等指标
     * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6
     *
     * @param statDate 统计日期
     */
    void generateStoreDailyStats(LocalDate statDate);

    /**
     * 生成商品销售日报
     * 从订单明细聚合计算SKU维度的销售数量和销售金额
     * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5
     *
     * @param statDate 统计日期
     */
    void generateGoodsSalesDaily(LocalDate statDate);

    /**
     * 生成商品分类销售汇总
     * 按商品分类聚合销售数据，计算销售占比
     * Requirements: 3.1, 3.2, 3.3, 3.4
     *
     * @param statDate 统计日期
     */
    void generateCategorySalesSummary(LocalDate statDate);

    /**
     * 生成退款分析报表
     * 统计退款订单数、退款金额、退款率，按退款原因分类
     * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
     *
     * @param statDate 统计日期
     */
    void generateRefundAnalysis(LocalDate statDate);

    /**
     * 生成时段销售趋势报表
     * 按小时统计销售数据，标识高峰和低谷时段
     * Requirements: 16.1, 16.2, 16.3, 16.4, 16.5
     *
     * @param statDate 统计日期
     */
    void generateHourlySales(LocalDate statDate);

    // ==================== 财务报表生成 ====================

    /**
     * 生成商家结算日报
     * 汇总每日营业额、各支付渠道收入、退款、佣金、实结金额
     * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5
     *
     * @param statDate 统计日期
     */
    void generateMerchantSettlementDaily(LocalDate statDate);

    /**
     * 生成支付渠道对账报表
     * 按支付渠道统计交易笔数、金额、退款、手续费
     * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5
     *
     * @param statDate 统计日期
     */
    void generatePayChannelReconcile(LocalDate statDate);

    /**
     * 生成应收账款报表
     * 统计待结算金额和账龄分布
     * Requirements: 9.1, 9.2, 9.3, 9.4
     *
     * @param statDate 统计日期
     */
    void generateReceivable(LocalDate statDate);

    /**
     * 生成商家月度账单
     * 汇总月度收入、支出、应结净额
     * Requirements: 7.1, 7.2, 7.3, 7.4
     *
     * @param statMonth 统计月份，格式：YYYY-MM
     */
    void generateMerchantMonthlyBill(String statMonth);

    /**
     * 生成积分流水报表
     * 统计积分发放、消耗、过期情况，计算等效成本
     * Requirements: 11.1, 11.2, 11.3, 11.4, 11.5
     *
     * @param statDate 统计日期
     */
    void generatePointsFlow(LocalDate statDate);

    // ==================== 营销报表生成 ====================

    /**
     * 生成优惠券使用分析报表
     * 统计优惠券发放、核销、ROI
     * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5
     *
     * @param statDate 统计日期
     */
    void generateCouponAnalysis(LocalDate statDate);

    /**
     * 生成用户消费分析报表
     * 统计新用户、活跃用户、复购率、消费金额分布
     * Requirements: 12.1, 12.2, 12.3, 12.4, 12.5
     *
     * @param statDate 统计日期
     */
    void generateUserConsumption(LocalDate statDate);

    /**
     * 生成联合营销效果报表
     * 统计联合营销活动的触发、发券、核销、分润
     * Requirements: 13.1, 13.2, 13.3, 13.4, 13.5
     *
     * @param statDate 统计日期
     */
    void generateJointMarketing(LocalDate statDate);

    // ==================== 平台报表生成 ====================

    /**
     * 生成区域代理佣金报表
     * 统计代理佣金、结算、提现情况，计算排名
     * Requirements: 14.1, 14.2, 14.3, 14.4, 14.5
     *
     * @param statDate 统计日期
     */
    void generateAgentCommission(LocalDate statDate);

    /**
     * 生成平台运营概览报表
     * 汇总平台级GMV、订单、商家、用户等核心指标，计算同比环比
     * Requirements: 15.1, 15.2, 15.3, 15.4, 15.5
     *
     * @param statDate 统计日期
     */
    void generatePlatformOverview(LocalDate statDate);
}
