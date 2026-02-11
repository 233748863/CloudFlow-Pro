package cn.joywon.poco.merchant.ReportModule.service.impl;

import cn.joywon.poco.merchant.OrderModule.mapper.OrderMapper;
import cn.joywon.poco.merchant.OrderModule.mapper.OrderPayRecordMapper;
import cn.joywon.poco.merchant.OrderModule.mapper.OrderRefundApplyMapper;
import cn.joywon.poco.merchant.ReportModule.dto.*;
import cn.joywon.poco.merchant.ReportModule.entity.*;
import cn.joywon.poco.merchant.ReportModule.mapper.*;
import cn.joywon.poco.merchant.ReportModule.service.ReportGenerateService;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import lombok.AllArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 报表数据生成服务实现类
 * 负责从订单、支付等源数据聚合生成报表数据
 * 由定时任务调度执行
 *
 * @author poco
 * @date 2025-01-05
 */
@Service
@Slf4j
@AllArgsConstructor
public class ReportGenerateServiceImpl implements ReportGenerateService {

    // 业务数据Mapper
    private final OrderMapper orderMapper;
    private final OrderPayRecordMapper orderPayRecordMapper;
    private final OrderRefundApplyMapper orderRefundApplyMapper;
    private final ReportAggregationMapper reportAggregationMapper;

    // 销售报表Mapper
    private final ReportStoreDailyStatsMapper storeDailyStatsMapper;
    private final ReportGoodsSalesDailyMapper goodsSalesDailyMapper;
    private final ReportCategorySalesSummaryMapper categorySalesSummaryMapper;
    private final ReportRefundAnalysisMapper refundAnalysisMapper;
    private final ReportHourlySalesMapper hourlySalesMapper;

    // 财务报表Mapper
    private final ReportMerchantSettlementDailyMapper merchantSettlementDailyMapper;
    private final ReportPayChannelReconcileMapper payChannelReconcileMapper;
    private final ReportReceivableMapper receivableMapper;
    private final ReportMerchantMonthlyBillMapper merchantMonthlyBillMapper;
    private final ReportPointsFlowMapper pointsFlowMapper;

    // 营销报表Mapper
    private final ReportCouponAnalysisMapper couponAnalysisMapper;
    private final ReportUserConsumptionMapper userConsumptionMapper;
    private final ReportJointMarketingMapper jointMarketingMapper;

    // 平台报表Mapper
    private final ReportAgentCommissionMapper agentCommissionMapper;
    private final ReportPlatformOverviewMapper platformOverviewMapper;


    // ==================== 销售报表生成 ====================

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void generateStoreDailyStats(LocalDate statDate) {
        log.info("开始生成门店经营日报，统计日期: {}", statDate);
        try {
            deleteExistingData(storeDailyStatsMapper, statDate);
            List<StoreDailyStatsAggDTO> aggList = orderMapper.aggregateStoreDailyStats(statDate);
            if (!aggList.isEmpty()) {
                List<ReportStoreDailyStats> statsList = aggList.stream().map(agg -> {
                    ReportStoreDailyStats stats = new ReportStoreDailyStats();
                    stats.setStatDate(statDate);
                    stats.setStoreId(agg.getStoreId());
                    stats.setMerchantId(agg.getMerchantId());
                    stats.setStoreName(agg.getStoreName());
                    stats.setTotalOrderCount(agg.getTotalOrderCount());
                    stats.setPaidOrderCount(agg.getPaidOrderCount());
                    stats.setTotalSalesAmount(agg.getTotalSalesAmount());
                    stats.setRealPayAmount(agg.getRealPayAmount());
                    stats.setRefundOrderCount(agg.getRefundOrderCount());
                    stats.setRefundAmount(agg.getRefundAmount());
                    // 计算客单价
                    if (agg.getPaidOrderCount() != null && agg.getPaidOrderCount() > 0 && agg.getRealPayAmount() != null) {
                        stats.setAvgOrderValue(agg.getRealPayAmount().divide(BigDecimal.valueOf(agg.getPaidOrderCount()), 2, RoundingMode.HALF_UP));
                    } else {
                        stats.setAvgOrderValue(BigDecimal.ZERO);
                    }
                    stats.setCreatedTime(LocalDateTime.now());
                    stats.setUpdatedTime(LocalDateTime.now());
                    return stats;
                }).collect(Collectors.toList());
                for (ReportStoreDailyStats stats : statsList) {
                    storeDailyStatsMapper.insert(stats);
                }
                log.info("门店经营日报生成完成，统计日期: {}，记录数: {}", statDate, statsList.size());
            } else {
                log.info("门店经营日报无数据，统计日期: {}", statDate);
            }
        } catch (Exception e) {
            log.error("生成门店经营日报失败，统计日期: {}", statDate, e);
            throw e;
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void generateGoodsSalesDaily(LocalDate statDate) {
        log.info("开始生成商品销售日报，统计日期: {}", statDate);
        try {
            deleteExistingData(goodsSalesDailyMapper, statDate);
            List<GoodsSalesAggDTO> aggList = orderMapper.aggregateGoodsSalesDaily(statDate);
            if (!aggList.isEmpty()) {
                for (GoodsSalesAggDTO agg : aggList) {
                    ReportGoodsSalesDaily sales = new ReportGoodsSalesDaily();
                    sales.setStatDate(statDate);
                    sales.setSkuId(agg.getProductSkuId());
                    sales.setProductName(agg.getProductName());
                    sales.setSkuSpec(agg.getSkuName());
                    sales.setStoreId(agg.getStoreId());
                    sales.setMerchantId(agg.getMerchantId());
                    sales.setSalesCount(agg.getSalesQuantity());
                    sales.setSalesAmount(agg.getSalesAmount());
                    sales.setCreatedTime(LocalDateTime.now());
                    sales.setUpdatedTime(LocalDateTime.now());
                    goodsSalesDailyMapper.insert(sales);
                }
                log.info("商品销售日报生成完成，统计日期: {}，记录数: {}", statDate, aggList.size());
            }
        } catch (Exception e) {
            log.error("生成商品销售日报失败，统计日期: {}", statDate, e);
            throw e;
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void generateCategorySalesSummary(LocalDate statDate) {
        log.info("开始生成分类销售汇总，统计日期: {}", statDate);
        try {
            deleteExistingData(categorySalesSummaryMapper, statDate);
            List<CategorySalesAggDTO> aggList = orderMapper.aggregateCategorySalesSummary(statDate);
            if (!aggList.isEmpty()) {
                // 计算总销售额用于计算占比
                BigDecimal totalSales = aggList.stream()
                    .map(CategorySalesAggDTO::getSalesAmount)
                    .filter(Objects::nonNull)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
                for (CategorySalesAggDTO agg : aggList) {
                    ReportCategorySalesSummary summary = new ReportCategorySalesSummary();
                    summary.setStatDate(statDate);
                    summary.setCategoryId(agg.getCategoryId());
                    summary.setCategoryName(agg.getCategoryName());
                    summary.setStoreId(agg.getStoreId());
                    summary.setMerchantId(agg.getMerchantId());
                    summary.setSalesCount(agg.getSalesQuantity());
                    summary.setSalesAmount(agg.getSalesAmount());
                    // 计算销售占比
                    if (totalSales.compareTo(BigDecimal.ZERO) > 0 && agg.getSalesAmount() != null) {
                        summary.setSalesRatio(agg.getSalesAmount().divide(totalSales, 4, RoundingMode.HALF_UP).multiply(BigDecimal.valueOf(100)));
                    } else {
                        summary.setSalesRatio(BigDecimal.ZERO);
                    }
                    summary.setCreatedTime(LocalDateTime.now());
                    summary.setUpdatedTime(LocalDateTime.now());
                    categorySalesSummaryMapper.insert(summary);
                }
                log.info("分类销售汇总生成完成，统计日期: {}，记录数: {}", statDate, aggList.size());
            }
        } catch (Exception e) {
            log.error("生成分类销售汇总失败，统计日期: {}", statDate, e);
            throw e;
        }
    }


    @Override
    @Transactional(rollbackFor = Exception.class)
    public void generateRefundAnalysis(LocalDate statDate) {
        log.info("开始生成退款分析报表，统计日期: {}", statDate);
        try {
            deleteExistingData(refundAnalysisMapper, statDate);
            List<RefundAnalysisAggDTO> aggList = orderRefundApplyMapper.aggregateRefundAnalysis(statDate);
            if (!aggList.isEmpty()) {
                for (RefundAnalysisAggDTO agg : aggList) {
                    ReportRefundAnalysis analysis = new ReportRefundAnalysis();
                    analysis.setStatDate(statDate);
                    analysis.setStoreId(agg.getStoreId());
                    analysis.setMerchantId(agg.getMerchantId());
                    analysis.setRefundOrderCount(agg.getRefundCount());
                    analysis.setRefundAmount(agg.getRefundAmount());
                    analysis.setAvgRefundHours(agg.getAvgProcessHours());
                    analysis.setCreatedTime(LocalDateTime.now());
                    analysis.setUpdatedTime(LocalDateTime.now());
                    refundAnalysisMapper.insert(analysis);
                }
                log.info("退款分析报表生成完成，统计日期: {}，记录数: {}", statDate, aggList.size());
            }
        } catch (Exception e) {
            log.error("生成退款分析报表失败，统计日期: {}", statDate, e);
            throw e;
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void generateHourlySales(LocalDate statDate) {
        log.info("开始生成时段销售趋势报表，统计日期: {}", statDate);
        try {
            deleteExistingData(hourlySalesMapper, statDate);
            List<HourlySalesAggDTO> aggList = orderMapper.aggregateHourlySales(statDate);
            if (!aggList.isEmpty()) {
                List<ReportHourlySales> salesList = aggList.stream().map(agg -> {
                    ReportHourlySales sales = new ReportHourlySales();
                    sales.setStatDate(statDate);
                    sales.setMerchantId(agg.getMerchantId());
                    sales.setStoreId(agg.getStoreId());
                    sales.setHourOfDay(agg.getHourOfDay());
                    sales.setOrderCount(agg.getOrderCount());
                    sales.setSalesAmount(agg.getSalesAmount());
                    sales.setAvgOrderValue(agg.getAvgOrderValue());
                    sales.setCreatedTime(LocalDateTime.now());
                    sales.setUpdatedTime(LocalDateTime.now());
                    return sales;
                }).collect(Collectors.toList());
                markPeakAndValleyHours(salesList);
                for (ReportHourlySales sales : salesList) {
                    hourlySalesMapper.insert(sales);
                }
                log.info("时段销售趋势报表生成完成，统计日期: {}，记录数: {}", statDate, salesList.size());
            }
        } catch (Exception e) {
            log.error("生成时段销售趋势报表失败，统计日期: {}", statDate, e);
            throw e;
        }
    }

    // ==================== 财务报表生成 ====================

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void generateMerchantSettlementDaily(LocalDate statDate) {
        log.info("开始生成商家结算日报，统计日期: {}", statDate);
        try {
            deleteExistingData(merchantSettlementDailyMapper, statDate);
            List<MerchantSettlementAggDTO> aggList = orderPayRecordMapper.aggregateMerchantSettlement(statDate);
            if (!aggList.isEmpty()) {
                // 按商家分组汇总
                Map<Long, List<MerchantSettlementAggDTO>> merchantGroups = aggList.stream()
                    .collect(Collectors.groupingBy(MerchantSettlementAggDTO::getMerchantId));
                for (Map.Entry<Long, List<MerchantSettlementAggDTO>> entry : merchantGroups.entrySet()) {
                    ReportMerchantSettlementDaily settlement = new ReportMerchantSettlementDaily();
                    settlement.setStatDate(statDate);
                    settlement.setMerchantId(entry.getKey());
                    BigDecimal totalRevenue = entry.getValue().stream()
                        .map(MerchantSettlementAggDTO::getTotalRevenue)
                        .filter(Objects::nonNull)
                        .reduce(BigDecimal.ZERO, BigDecimal::add);
                    settlement.setTotalTurnover(totalRevenue);
                    // 计算平台佣金（默认5%）
                    BigDecimal commission = totalRevenue.multiply(BigDecimal.valueOf(0.05));
                    settlement.setPlatformCommission(commission);
                    settlement.setRealSettleAmount(totalRevenue.subtract(commission));
                    settlement.setCreatedTime(LocalDateTime.now());
                    settlement.setUpdatedTime(LocalDateTime.now());
                    merchantSettlementDailyMapper.insert(settlement);
                }
                log.info("商家结算日报生成完成，统计日期: {}，记录数: {}", statDate, merchantGroups.size());
            }
        } catch (Exception e) {
            log.error("生成商家结算日报失败，统计日期: {}", statDate, e);
            throw e;
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void generatePayChannelReconcile(LocalDate statDate) {
        log.info("开始生成支付渠道对账报表，统计日期: {}", statDate);
        try {
            deleteExistingData(payChannelReconcileMapper, statDate);
            List<PayChannelReconcileAggDTO> aggList = orderPayRecordMapper.aggregatePayChannelReconcile(statDate);
            if (!aggList.isEmpty()) {
                for (PayChannelReconcileAggDTO agg : aggList) {
                    ReportPayChannelReconcile reconcile = new ReportPayChannelReconcile();
                    reconcile.setStatDate(statDate);
                    reconcile.setPayChannel(agg.getChannel());
                    reconcile.setMerchantId(agg.getMerchantId());
                    reconcile.setTransactionCount(agg.getTransactionCount());
                    reconcile.setTransactionAmount(agg.getTransactionAmount());
                    reconcile.setRefundCount(agg.getRefundCount());
                    reconcile.setRefundAmount(agg.getRefundAmount());
                    reconcile.setNetAmount(agg.getTransactionAmount().subtract(agg.getRefundAmount() != null ? agg.getRefundAmount() : BigDecimal.ZERO));
                    reconcile.setCreatedTime(LocalDateTime.now());
                    reconcile.setUpdatedTime(LocalDateTime.now());
                    payChannelReconcileMapper.insert(reconcile);
                }
                log.info("支付渠道对账报表生成完成，统计日期: {}，记录数: {}", statDate, aggList.size());
            }
        } catch (Exception e) {
            log.error("生成支付渠道对账报表失败，统计日期: {}", statDate, e);
            throw e;
        }
    }


    @Override
    @Transactional(rollbackFor = Exception.class)
    public void generateReceivable(LocalDate statDate) {
        log.info("开始生成应收账款报表，统计日期: {}", statDate);
        try {
            deleteExistingData(receivableMapper, statDate);
            List<ReceivableAggDTO> aggList = orderPayRecordMapper.aggregateReceivable(statDate);
            if (!aggList.isEmpty()) {
                for (ReceivableAggDTO agg : aggList) {
                    ReportReceivable receivable = new ReportReceivable();
                    receivable.setStatDate(statDate);
                    receivable.setMerchantId(agg.getMerchantId());
                    receivable.setTotalReceivable(agg.getTotalReceivable());
                    receivable.setPendingOrderCount(agg.getOrderCount());
                    receivable.setAging0To7(agg.getAging0To7());
                    receivable.setAging8To15(agg.getAging8To15());
                    receivable.setAging16To30(agg.getAging16To30());
                    receivable.setAgingOver30(agg.getAging30Plus());
                    receivable.setCreatedTime(LocalDateTime.now());
                    receivable.setUpdatedTime(LocalDateTime.now());
                    receivableMapper.insert(receivable);
                }
                log.info("应收账款报表生成完成，统计日期: {}，记录数: {}", statDate, aggList.size());
            }
        } catch (Exception e) {
            log.error("生成应收账款报表失败，统计日期: {}", statDate, e);
            throw e;
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void generateMerchantMonthlyBill(String statMonth) {
        log.info("开始生成商家月度账单，统计月份: {}", statMonth);
        try {
            LambdaQueryWrapper<ReportMerchantMonthlyBill> deleteWrapper = Wrappers.lambdaQuery();
            deleteWrapper.eq(ReportMerchantMonthlyBill::getStatMonth, statMonth);
            merchantMonthlyBillMapper.delete(deleteWrapper);
            // 从日结算表汇总月度数据
            LambdaQueryWrapper<ReportMerchantSettlementDaily> queryWrapper = Wrappers.lambdaQuery();
            queryWrapper.likeRight(ReportMerchantSettlementDaily::getStatDate, statMonth);
            List<ReportMerchantSettlementDaily> dailyList = merchantSettlementDailyMapper.selectList(queryWrapper);
            if (!dailyList.isEmpty()) {
                Map<Long, List<ReportMerchantSettlementDaily>> merchantGroups = dailyList.stream()
                    .collect(Collectors.groupingBy(ReportMerchantSettlementDaily::getMerchantId));
                for (Map.Entry<Long, List<ReportMerchantSettlementDaily>> entry : merchantGroups.entrySet()) {
                    ReportMerchantMonthlyBill bill = new ReportMerchantMonthlyBill();
                    bill.setStatMonth(statMonth);
                    bill.setMerchantId(entry.getKey());
                    BigDecimal totalIncome = entry.getValue().stream()
                        .map(ReportMerchantSettlementDaily::getTotalTurnover)
                        .filter(Objects::nonNull)
                        .reduce(BigDecimal.ZERO, BigDecimal::add);
                    BigDecimal totalCommission = entry.getValue().stream()
                        .map(ReportMerchantSettlementDaily::getPlatformCommission)
                        .filter(Objects::nonNull)
                        .reduce(BigDecimal.ZERO, BigDecimal::add);
                    bill.setTotalIncome(totalIncome);
                    bill.setTotalExpenditure(totalCommission);
                    bill.setFinalSettleAmount(totalIncome.subtract(totalCommission));
                    bill.setCreatedTime(LocalDateTime.now());
                    bill.setUpdatedTime(LocalDateTime.now());
                    merchantMonthlyBillMapper.insert(bill);
                }
                log.info("商家月度账单生成完成，统计月份: {}，记录数: {}", statMonth, merchantGroups.size());
            }
        } catch (Exception e) {
            log.error("生成商家月度账单失败，统计月份: {}", statMonth, e);
            throw e;
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void generatePointsFlow(LocalDate statDate) {
        log.info("开始生成积分流水报表，统计日期: {}", statDate);
        try {
            deleteExistingData(pointsFlowMapper, statDate);
            List<PointsFlowAggDTO> aggList = reportAggregationMapper.aggregatePointsFlow(statDate);
            if (!aggList.isEmpty()) {
                for (PointsFlowAggDTO agg : aggList) {
                    ReportPointsFlow flow = new ReportPointsFlow();
                    flow.setStatDate(statDate);
                    flow.setMerchantId(agg.getMerchantId());
                    flow.setSourceType(agg.getSourceType());
                    flow.setEarnedPoints(agg.getEarnedPoints());
                    flow.setConsumedPoints(agg.getConsumedPoints());
                    flow.setExpiredPoints(agg.getExpiredPoints());
                    flow.setNetPoints(agg.getEarnedPoints() - agg.getConsumedPoints() - agg.getExpiredPoints());
                    // 计算等效成本（假设100积分=1元）
                    flow.setEquivalentCost(BigDecimal.valueOf(agg.getConsumedPoints()).divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP));
                    flow.setCreatedTime(LocalDateTime.now());
                    flow.setUpdatedTime(LocalDateTime.now());
                    pointsFlowMapper.insert(flow);
                }
                log.info("积分流水报表生成完成，统计日期: {}，记录数: {}", statDate, aggList.size());
            }
        } catch (Exception e) {
            log.error("生成积分流水报表失败，统计日期: {}", statDate, e);
            throw e;
        }
    }


    // ==================== 营销报表生成 ====================

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void generateCouponAnalysis(LocalDate statDate) {
        log.info("开始生成优惠券分析报表，统计日期: {}", statDate);
        try {
            deleteExistingData(couponAnalysisMapper, statDate);
            List<CouponAnalysisAggDTO> issuedList = reportAggregationMapper.aggregateCouponIssued(statDate);
            List<CouponAnalysisAggDTO> usedList = reportAggregationMapper.aggregateCouponUsed(statDate);
            // 合并发放和核销数据
            Map<String, ReportCouponAnalysis> analysisMap = new HashMap<>();
            for (CouponAnalysisAggDTO agg : issuedList) {
                String key = agg.getMerchantId() + "_" + agg.getCouponType();
                ReportCouponAnalysis analysis = analysisMap.computeIfAbsent(key, k -> {
                    ReportCouponAnalysis a = new ReportCouponAnalysis();
                    a.setStatDate(statDate);
                    a.setMerchantId(agg.getMerchantId());
                    a.setCouponType(agg.getCouponType());
                    a.setCouponSource(agg.getCouponSource());
                    a.setIssuedCount(0);
                    a.setUsedCount(0);
                    a.setDiscountAmount(BigDecimal.ZERO);
                    a.setCreatedTime(LocalDateTime.now());
                    a.setUpdatedTime(LocalDateTime.now());
                    return a;
                });
                analysis.setIssuedCount(agg.getIssuedCount());
            }
            for (CouponAnalysisAggDTO agg : usedList) {
                String key = agg.getMerchantId() + "_" + agg.getCouponType();
                ReportCouponAnalysis analysis = analysisMap.computeIfAbsent(key, k -> {
                    ReportCouponAnalysis a = new ReportCouponAnalysis();
                    a.setStatDate(statDate);
                    a.setMerchantId(agg.getMerchantId());
                    a.setCouponType(agg.getCouponType());
                    a.setCouponSource(agg.getCouponSource());
                    a.setIssuedCount(0);
                    a.setUsedCount(0);
                    a.setDiscountAmount(BigDecimal.ZERO);
                    a.setCreatedTime(LocalDateTime.now());
                    a.setUpdatedTime(LocalDateTime.now());
                    return a;
                });
                analysis.setUsedCount(agg.getUsedCount());
                analysis.setDiscountAmount(agg.getDiscountAmount());
            }
            // 计算核销率
            for (ReportCouponAnalysis analysis : analysisMap.values()) {
                if (analysis.getIssuedCount() != null && analysis.getIssuedCount() > 0) {
                    analysis.setUseRate(BigDecimal.valueOf(analysis.getUsedCount())
                        .divide(BigDecimal.valueOf(analysis.getIssuedCount()), 4, RoundingMode.HALF_UP)
                        .multiply(BigDecimal.valueOf(100)));
                } else {
                    analysis.setUseRate(BigDecimal.ZERO);
                }
                couponAnalysisMapper.insert(analysis);
            }
            log.info("优惠券分析报表生成完成，统计日期: {}，记录数: {}", statDate, analysisMap.size());
        } catch (Exception e) {
            log.error("生成优惠券分析报表失败，统计日期: {}", statDate, e);
            throw e;
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void generateUserConsumption(LocalDate statDate) {
        log.info("开始生成用户消费分析报表，统计日期: {}", statDate);
        try {
            deleteExistingData(userConsumptionMapper, statDate);
            List<UserConsumptionAggDTO> aggList = orderMapper.aggregateUserConsumption(statDate);
            if (!aggList.isEmpty()) {
                for (UserConsumptionAggDTO agg : aggList) {
                    ReportUserConsumption consumption = new ReportUserConsumption();
                    consumption.setStatDate(statDate);
                    consumption.setMerchantId(agg.getMerchantId());
                    consumption.setStoreId(agg.getStoreId());
                    consumption.setNewUserCount(agg.getNewUserCount());
                    consumption.setActiveUserCount(agg.getActiveUserCount());
                    // 复购用户数 = 活跃用户数 - 新用户数
                    int repeatUserCount = (agg.getActiveUserCount() != null ? agg.getActiveUserCount() : 0) 
                        - (agg.getNewUserCount() != null ? agg.getNewUserCount() : 0);
                    consumption.setRepurchaseUserCount(Math.max(0, repeatUserCount));
                    // 计算复购率
                    if (agg.getActiveUserCount() != null && agg.getActiveUserCount() > 0) {
                        consumption.setRepurchaseRate(BigDecimal.valueOf(repeatUserCount)
                            .divide(BigDecimal.valueOf(agg.getActiveUserCount()), 4, RoundingMode.HALF_UP)
                            .multiply(BigDecimal.valueOf(100)));
                    } else {
                        consumption.setRepurchaseRate(BigDecimal.ZERO);
                    }
                    consumption.setAmount0To50(agg.getAmount0To50());
                    consumption.setAmount50To100(agg.getAmount50To100());
                    consumption.setAmount100To200(agg.getAmount100To200());
                    consumption.setAmount200Plus(agg.getAmount200Plus());
                    consumption.setCreatedTime(LocalDateTime.now());
                    consumption.setUpdatedTime(LocalDateTime.now());
                    userConsumptionMapper.insert(consumption);
                }
                log.info("用户消费分析报表生成完成，统计日期: {}，记录数: {}", statDate, aggList.size());
            }
        } catch (Exception e) {
            log.error("生成用户消费分析报表失败，统计日期: {}", statDate, e);
            throw e;
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void generateJointMarketing(LocalDate statDate) {
        log.info("开始生成联合营销效果报表，统计日期: {}", statDate);
        try {
            deleteExistingData(jointMarketingMapper, statDate);
            List<JointMarketingAggDTO> aggList = reportAggregationMapper.aggregateJointMarketing(statDate);
            if (!aggList.isEmpty()) {
                for (JointMarketingAggDTO agg : aggList) {
                    ReportJointMarketing marketing = new ReportJointMarketing();
                    marketing.setStatDate(statDate);
                    marketing.setMerchantId(agg.getMerchantId());
                    marketing.setRoleType(agg.getRoleType());
                    marketing.setTriggerCount(agg.getTriggerCount());
                    marketing.setCouponIssued(agg.getCouponIssued());
                    marketing.setShareAmount(agg.getShareAmount());
                    marketing.setCreatedTime(LocalDateTime.now());
                    marketing.setUpdatedTime(LocalDateTime.now());
                    jointMarketingMapper.insert(marketing);
                }
                log.info("联合营销效果报表生成完成，统计日期: {}，记录数: {}", statDate, aggList.size());
            }
        } catch (Exception e) {
            log.error("生成联合营销效果报表失败，统计日期: {}", statDate, e);
            throw e;
        }
    }


    // ==================== 平台报表生成 ====================

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void generateAgentCommission(LocalDate statDate) {
        log.info("开始生成代理佣金报表，统计日期: {}", statDate);
        try {
            deleteExistingData(agentCommissionMapper, statDate);
            List<AgentCommissionAggDTO> aggList = reportAggregationMapper.aggregateAgentCommission(statDate);
            if (!aggList.isEmpty()) {
                List<ReportAgentCommission> commissionList = aggList.stream().map(agg -> {
                    ReportAgentCommission commission = new ReportAgentCommission();
                    commission.setStatDate(statDate);
                    commission.setAgentId(agg.getAgentId());
                    commission.setAgentName(agg.getAgentName());
                    commission.setRegionCode(agg.getRegionCode());
                    commission.setTotalCommission(agg.getTotalCommission());
                    commission.setSettledAmount(agg.getSettledAmount());
                    commission.setPendingAmount(agg.getPendingAmount());
                    commission.setOrderCount(agg.getOrderCount());
                    commission.setMerchantCount(agg.getMerchantCount());
                    commission.setWithdrawnAmount(agg.getWithdrawnAmount());
                    commission.setCreatedTime(LocalDateTime.now());
                    commission.setUpdatedTime(LocalDateTime.now());
                    return commission;
                }).collect(Collectors.toList());
                calculateAgentRanking(commissionList);
                for (ReportAgentCommission commission : commissionList) {
                    agentCommissionMapper.insert(commission);
                }
                log.info("代理佣金报表生成完成，统计日期: {}，记录数: {}", statDate, commissionList.size());
            }
        } catch (Exception e) {
            log.error("生成代理佣金报表失败，统计日期: {}", statDate, e);
            throw e;
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void generatePlatformOverview(LocalDate statDate) {
        log.info("开始生成平台运营概览报表，统计日期: {}", statDate);
        try {
            LambdaQueryWrapper<ReportPlatformOverview> deleteWrapper = Wrappers.lambdaQuery();
            deleteWrapper.eq(ReportPlatformOverview::getStatDate, statDate);
            platformOverviewMapper.delete(deleteWrapper);
            PlatformOverviewAggDTO agg = reportAggregationMapper.aggregatePlatformOverview(statDate);
            if (agg != null) {
                ReportPlatformOverview overview = new ReportPlatformOverview();
                overview.setStatDate(statDate);
                overview.setTotalGmv(agg.getTotalGmv());
                overview.setTotalOrders(agg.getTotalOrders());
                overview.setActiveMerchants(agg.getActiveMerchants());
                overview.setActiveUsers(agg.getActiveUsers());
                overview.setCommissionIncome(agg.getCommissionIncome());
                overview.setShareExpenditure(BigDecimal.ZERO);
                overview.setNetIncome(agg.getCommissionIncome());
                overview.setCreatedTime(LocalDateTime.now());
                overview.setUpdatedTime(LocalDateTime.now());
                calculateYoyAndMom(overview, statDate);
                platformOverviewMapper.insert(overview);
                log.info("平台运营概览报表生成完成，统计日期: {}", statDate);
            }
        } catch (Exception e) {
            log.error("生成平台运营概览报表失败，统计日期: {}", statDate, e);
            throw e;
        }
    }

    // ==================== 私有辅助方法 ====================

    private <T> void deleteExistingData(Object mapper, LocalDate statDate) {
        if (mapper instanceof ReportStoreDailyStatsMapper m) {
            LambdaQueryWrapper<ReportStoreDailyStats> wrapper = Wrappers.lambdaQuery();
            wrapper.eq(ReportStoreDailyStats::getStatDate, statDate);
            m.delete(wrapper);
        } else if (mapper instanceof ReportGoodsSalesDailyMapper m) {
            LambdaQueryWrapper<ReportGoodsSalesDaily> wrapper = Wrappers.lambdaQuery();
            wrapper.eq(ReportGoodsSalesDaily::getStatDate, statDate);
            m.delete(wrapper);
        } else if (mapper instanceof ReportCategorySalesSummaryMapper m) {
            LambdaQueryWrapper<ReportCategorySalesSummary> wrapper = Wrappers.lambdaQuery();
            wrapper.eq(ReportCategorySalesSummary::getStatDate, statDate);
            m.delete(wrapper);
        } else if (mapper instanceof ReportRefundAnalysisMapper m) {
            LambdaQueryWrapper<ReportRefundAnalysis> wrapper = Wrappers.lambdaQuery();
            wrapper.eq(ReportRefundAnalysis::getStatDate, statDate);
            m.delete(wrapper);
        } else if (mapper instanceof ReportHourlySalesMapper m) {
            LambdaQueryWrapper<ReportHourlySales> wrapper = Wrappers.lambdaQuery();
            wrapper.eq(ReportHourlySales::getStatDate, statDate);
            m.delete(wrapper);
        } else if (mapper instanceof ReportMerchantSettlementDailyMapper m) {
            LambdaQueryWrapper<ReportMerchantSettlementDaily> wrapper = Wrappers.lambdaQuery();
            wrapper.eq(ReportMerchantSettlementDaily::getStatDate, statDate);
            m.delete(wrapper);
        } else if (mapper instanceof ReportPayChannelReconcileMapper m) {
            LambdaQueryWrapper<ReportPayChannelReconcile> wrapper = Wrappers.lambdaQuery();
            wrapper.eq(ReportPayChannelReconcile::getStatDate, statDate);
            m.delete(wrapper);
        } else if (mapper instanceof ReportReceivableMapper m) {
            LambdaQueryWrapper<ReportReceivable> wrapper = Wrappers.lambdaQuery();
            wrapper.eq(ReportReceivable::getStatDate, statDate);
            m.delete(wrapper);
        } else if (mapper instanceof ReportPointsFlowMapper m) {
            LambdaQueryWrapper<ReportPointsFlow> wrapper = Wrappers.lambdaQuery();
            wrapper.eq(ReportPointsFlow::getStatDate, statDate);
            m.delete(wrapper);
        } else if (mapper instanceof ReportCouponAnalysisMapper m) {
            LambdaQueryWrapper<ReportCouponAnalysis> wrapper = Wrappers.lambdaQuery();
            wrapper.eq(ReportCouponAnalysis::getStatDate, statDate);
            m.delete(wrapper);
        } else if (mapper instanceof ReportUserConsumptionMapper m) {
            LambdaQueryWrapper<ReportUserConsumption> wrapper = Wrappers.lambdaQuery();
            wrapper.eq(ReportUserConsumption::getStatDate, statDate);
            m.delete(wrapper);
        } else if (mapper instanceof ReportJointMarketingMapper m) {
            LambdaQueryWrapper<ReportJointMarketing> wrapper = Wrappers.lambdaQuery();
            wrapper.eq(ReportJointMarketing::getStatDate, statDate);
            m.delete(wrapper);
        } else if (mapper instanceof ReportAgentCommissionMapper m) {
            LambdaQueryWrapper<ReportAgentCommission> wrapper = Wrappers.lambdaQuery();
            wrapper.eq(ReportAgentCommission::getStatDate, statDate);
            m.delete(wrapper);
        }
    }


    private void markPeakAndValleyHours(List<ReportHourlySales> salesList) {
        if (salesList == null || salesList.isEmpty()) {
            return;
        }
        Map<Long, List<ReportHourlySales>> storeGroups = salesList.stream()
            .collect(Collectors.groupingBy(s -> s.getStoreId() != null ? s.getStoreId() : 0L));
        for (List<ReportHourlySales> storeSales : storeGroups.values()) {
            BigDecimal avgSales = storeSales.stream()
                .map(ReportHourlySales::getSalesAmount)
                .filter(Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add)
                .divide(BigDecimal.valueOf(storeSales.size()), 2, RoundingMode.HALF_UP);
            BigDecimal peakThreshold = avgSales.multiply(BigDecimal.valueOf(1.5));
            BigDecimal valleyThreshold = avgSales.multiply(BigDecimal.valueOf(0.5));
            for (ReportHourlySales sales : storeSales) {
                BigDecimal amount = sales.getSalesAmount() != null ? sales.getSalesAmount() : BigDecimal.ZERO;
                sales.setIsPeak(amount.compareTo(peakThreshold) >= 0);
                sales.setIsValley(amount.compareTo(valleyThreshold) <= 0 && amount.compareTo(BigDecimal.ZERO) > 0);
            }
        }
    }

    private void calculateAgentRanking(List<ReportAgentCommission> commissionList) {
        if (commissionList == null || commissionList.isEmpty()) {
            return;
        }
        List<ReportAgentCommission> sortedByCommission = new ArrayList<>(commissionList);
        sortedByCommission.sort((a, b) -> {
            BigDecimal aAmount = a.getTotalCommission() != null ? a.getTotalCommission() : BigDecimal.ZERO;
            BigDecimal bAmount = b.getTotalCommission() != null ? b.getTotalCommission() : BigDecimal.ZERO;
            return bAmount.compareTo(aAmount);
        });
        for (int i = 0; i < sortedByCommission.size(); i++) {
            sortedByCommission.get(i).setRankByCommission(i + 1);
        }
        List<ReportAgentCommission> sortedByOrders = new ArrayList<>(commissionList);
        sortedByOrders.sort((a, b) -> {
            int aCount = a.getOrderCount() != null ? a.getOrderCount() : 0;
            int bCount = b.getOrderCount() != null ? b.getOrderCount() : 0;
            return Integer.compare(bCount, aCount);
        });
        for (int i = 0; i < sortedByOrders.size(); i++) {
            sortedByOrders.get(i).setRankByOrders(i + 1);
        }
    }

    private void calculateYoyAndMom(ReportPlatformOverview overview, LocalDate statDate) {
        LocalDate lastYearDate = statDate.minusYears(1);
        LambdaQueryWrapper<ReportPlatformOverview> yoyWrapper = Wrappers.lambdaQuery();
        yoyWrapper.eq(ReportPlatformOverview::getStatDate, lastYearDate);
        ReportPlatformOverview lastYearData = platformOverviewMapper.selectOne(yoyWrapper);
        LocalDate lastPeriodDate = statDate.minusDays(1);
        LambdaQueryWrapper<ReportPlatformOverview> momWrapper = Wrappers.lambdaQuery();
        momWrapper.eq(ReportPlatformOverview::getStatDate, lastPeriodDate);
        ReportPlatformOverview lastPeriodData = platformOverviewMapper.selectOne(momWrapper);
        if (lastYearData != null && lastYearData.getTotalGmv() != null 
            && lastYearData.getTotalGmv().compareTo(BigDecimal.ZERO) > 0) {
            BigDecimal yoyRate = overview.getTotalGmv()
                .subtract(lastYearData.getTotalGmv())
                .divide(lastYearData.getTotalGmv(), 4, RoundingMode.HALF_UP)
                .multiply(BigDecimal.valueOf(100));
            overview.setGmvYoy(yoyRate);
        }
        if (lastPeriodData != null && lastPeriodData.getTotalGmv() != null 
            && lastPeriodData.getTotalGmv().compareTo(BigDecimal.ZERO) > 0) {
            BigDecimal momRate = overview.getTotalGmv()
                .subtract(lastPeriodData.getTotalGmv())
                .divide(lastPeriodData.getTotalGmv(), 4, RoundingMode.HALF_UP)
                .multiply(BigDecimal.valueOf(100));
            overview.setGmvMom(momRate);
        }
        if (lastYearData != null && lastYearData.getTotalOrders() != null 
            && lastYearData.getTotalOrders() > 0) {
            BigDecimal yoyRate = BigDecimal.valueOf(overview.getTotalOrders() - lastYearData.getTotalOrders())
                .divide(BigDecimal.valueOf(lastYearData.getTotalOrders()), 4, RoundingMode.HALF_UP)
                .multiply(BigDecimal.valueOf(100));
            overview.setOrdersYoy(yoyRate);
        }
        if (lastPeriodData != null && lastPeriodData.getTotalOrders() != null 
            && lastPeriodData.getTotalOrders() > 0) {
            BigDecimal momRate = BigDecimal.valueOf(overview.getTotalOrders() - lastPeriodData.getTotalOrders())
                .divide(BigDecimal.valueOf(lastPeriodData.getTotalOrders()), 4, RoundingMode.HALF_UP)
                .multiply(BigDecimal.valueOf(100));
            overview.setOrdersMom(momRate);
        }
    }
}
