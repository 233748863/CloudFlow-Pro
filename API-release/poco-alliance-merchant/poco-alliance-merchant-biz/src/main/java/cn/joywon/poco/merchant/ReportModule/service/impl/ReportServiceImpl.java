package cn.joywon.poco.merchant.ReportModule.service.impl;

import cn.hutool.core.util.StrUtil;
import cn.joywon.poco.common.data.datascope.DataScope;
import cn.joywon.poco.common.data.datascope.DataScopeFuncEnum;
import cn.joywon.poco.merchant.CouponModule.bo.JointMarketingProfitBaseStat;
import cn.joywon.poco.merchant.CouponModule.entity.JointMarketingPlan;
import cn.joywon.poco.merchant.CouponModule.entity.JointMarketingRebateRecord;
import cn.joywon.poco.merchant.CouponModule.mapper.JointMarketingRebateRecordMapper;
import cn.joywon.poco.merchant.CouponModule.service.IJointMarketingPlanService;
import cn.joywon.poco.merchant.MerchantModule.entity.Merchant;
import cn.joywon.poco.merchant.MerchantModule.service.IMerchantService;
import cn.joywon.poco.merchant.ReportModule.dto.JointMarketingProfitRankDTO;
import cn.joywon.poco.merchant.ReportModule.dto.JointMarketingProfitReportDTO;
import cn.joywon.poco.merchant.ReportModule.dto.JointMarketingProfitTrendDTO;
import cn.joywon.poco.merchant.ReportModule.dto.ReportQueryDTO;
import cn.joywon.poco.merchant.ReportModule.entity.*;
import cn.joywon.poco.merchant.ReportModule.mapper.*;
import cn.joywon.poco.merchant.ReportModule.service.ReportCacheService;
import cn.joywon.poco.merchant.ReportModule.service.ReportService;
import cn.joywon.poco.merchant.ReportModule.vo.*;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.core.type.TypeReference;
import lombok.AllArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalTime;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * 报表服务实现类
 * 聚焦销售、财务、营销和平台侧核心报表
 * 集成Redis缓存，支持DataScope权限过滤
 *
 * @author poco
 * @date 2025-12-25
 */
@Service
@Slf4j
@AllArgsConstructor
public class ReportServiceImpl implements ReportService {

    // 缓存服务
    private final ReportCacheService reportCacheService;

    // 销售报表Mapper
    private final ReportStoreDailyStatsMapper storeDailyStatsMapper;
    private final ReportGoodsSalesDailyMapper goodsSalesDailyMapper;
    private final ReportCategorySalesSummaryMapper categorySalesSummaryMapper;
    private final ReportRefundAnalysisMapper refundAnalysisMapper;
    private final ReportHourlySalesMapper hourlySalesMapper;

    // 财务报表Mapper
    private final ReportMerchantSettlementDailyMapper merchantSettlementDailyMapper;
    private final ReportSettlementDetailMapper settlementDetailMapper;
    private final ReportMerchantMonthlyBillMapper merchantMonthlyBillMapper;
    private final ReportPayChannelReconcileMapper payChannelReconcileMapper;
    private final ReportReceivableMapper receivableMapper;
    private final ReportPointsFlowMapper pointsFlowMapper;

    // 营销报表Mapper
    private final ReportCouponAnalysisMapper couponAnalysisMapper;
    private final ReportUserConsumptionMapper userConsumptionMapper;
    private final ReportJointMarketingMapper jointMarketingMapper;

    // 平台报表Mapper
    private final ReportAgentCommissionMapper agentCommissionMapper;
    private final ReportPlatformOverviewMapper platformOverviewMapper;

    // 各具体业务组件
    private final IMerchantService merchantService;
    private final IJointMarketingPlanService jointMarketingPlanService;
    private final JointMarketingRebateRecordMapper jointMarketingRebateRecordMapper;

    // ==================== 销售报表 ====================

    /**
     * 分页查询门店经营日报（带缓存）
     * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6
     */
    @Override
    public IPage<StoreDailyStatsVO> getStoreDailyStatsPage(ReportQueryDTO queryDTO) {
        // 1. 尝试从缓存获取
        String cacheKey = reportCacheService.buildCacheKey(ReportCacheService.REPORT_STORE_DAILY, queryDTO);
        IPage<StoreDailyStatsVO> cached = reportCacheService.getFromCache(cacheKey, 
            new TypeReference<Page<StoreDailyStatsVO>>(){}.getType());
        if (cached != null) {
            return cached;
        }

        // 2. 缓存未命中，查询数据库
        IPage<ReportStoreDailyStats> page = new Page<>(queryDTO.getPageNo(), queryDTO.getPageSize());
        LambdaQueryWrapper<ReportStoreDailyStats> wrapper = Wrappers.lambdaQuery();
        
        // 构建查询条件 - 支持门店ID和商家ID过滤
        wrapper.eq(queryDTO.getStoreId() != null, ReportStoreDailyStats::getStoreId, queryDTO.getStoreId())
               .eq(queryDTO.getMerchantId() != null, ReportStoreDailyStats::getMerchantId, queryDTO.getMerchantId())
               .ge(queryDTO.getStartDate() != null, ReportStoreDailyStats::getStatDate, queryDTO.getStartDate())
               .le(queryDTO.getEndDate() != null, ReportStoreDailyStats::getStatDate, queryDTO.getEndDate())
               .orderByDesc(ReportStoreDailyStats::getStatDate);

        // 3. 构建DataScope权限过滤
        String deptColumn = (queryDTO.getStoreId() != null && queryDTO.getStoreId() > 0) ? "store_id" : "merchant_id";
        DataScope scope = buildDataScope(deptColumn, "created_by");

        // 4. 执行查询
        IPage<ReportStoreDailyStats> result = storeDailyStatsMapper.selectPageByScope(page, wrapper, scope);
        
        // 5. 转换为VO并写入缓存
        IPage<StoreDailyStatsVO> voPage = result.convert(entity -> {
            StoreDailyStatsVO vo = new StoreDailyStatsVO();
            BeanUtils.copyProperties(entity, vo);
            return vo;
        });
        
        reportCacheService.setToCache(cacheKey, voPage, ReportCacheService.REPORT_STORE_DAILY);
        return voPage;
    }

    /**
     * 分页查询商品销售日报（带缓存）
     * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5
     */
    @Override
    public IPage<GoodsSalesDailyVO> getGoodsSalesDailyPage(ReportQueryDTO queryDTO) {
        // 1. 尝试从缓存获取
        String cacheKey = reportCacheService.buildCacheKey(ReportCacheService.REPORT_GOODS_SALES, queryDTO);
        IPage<GoodsSalesDailyVO> cached = reportCacheService.getFromCache(cacheKey, 
            new TypeReference<Page<GoodsSalesDailyVO>>(){}.getType());
        if (cached != null) {
            return cached;
        }

        // 2. 缓存未命中，查询数据库
        IPage<ReportGoodsSalesDaily> page = new Page<>(queryDTO.getPageNo(), queryDTO.getPageSize());
        LambdaQueryWrapper<ReportGoodsSalesDaily> wrapper = Wrappers.lambdaQuery();
        
        wrapper.eq(queryDTO.getStoreId() != null, ReportGoodsSalesDaily::getStoreId, queryDTO.getStoreId())
               .eq(queryDTO.getMerchantId() != null, ReportGoodsSalesDaily::getMerchantId, queryDTO.getMerchantId())
               .ge(queryDTO.getStartDate() != null, ReportGoodsSalesDaily::getStatDate, queryDTO.getStartDate())
               .le(queryDTO.getEndDate() != null, ReportGoodsSalesDaily::getStatDate, queryDTO.getEndDate())
               .orderByDesc(ReportGoodsSalesDaily::getSalesAmount); // 按销售金额排序

        String deptColumn = (queryDTO.getStoreId() != null && queryDTO.getStoreId() > 0) ? "store_id" : "merchant_id";
        DataScope scope = buildDataScope(deptColumn, "created_by");

        IPage<ReportGoodsSalesDaily> result = goodsSalesDailyMapper.selectPageByScope(page, wrapper, scope);
        
        IPage<GoodsSalesDailyVO> voPage = result.convert(entity -> {
            GoodsSalesDailyVO vo = new GoodsSalesDailyVO();
            BeanUtils.copyProperties(entity, vo);
            return vo;
        });
        
        reportCacheService.setToCache(cacheKey, voPage, ReportCacheService.REPORT_GOODS_SALES);
        return voPage;
    }

    /**
     * 分页查询商品分类销售汇总（带缓存）
     * Requirements: 3.1, 3.2, 3.3, 3.4
     */
    @Override
    public IPage<CategorySalesSummaryVO> getCategorySalesSummaryPage(ReportQueryDTO queryDTO) {
        String cacheKey = reportCacheService.buildCacheKey(ReportCacheService.REPORT_CATEGORY_SALES, queryDTO);
        IPage<CategorySalesSummaryVO> cached = reportCacheService.getFromCache(cacheKey, 
            new TypeReference<Page<CategorySalesSummaryVO>>(){}.getType());
        if (cached != null) {
            return cached;
        }

        IPage<ReportCategorySalesSummary> page = new Page<>(queryDTO.getPageNo(), queryDTO.getPageSize());
        LambdaQueryWrapper<ReportCategorySalesSummary> wrapper = Wrappers.lambdaQuery();
        
        wrapper.eq(queryDTO.getStoreId() != null, ReportCategorySalesSummary::getStoreId, queryDTO.getStoreId())
               .eq(queryDTO.getMerchantId() != null, ReportCategorySalesSummary::getMerchantId, queryDTO.getMerchantId())
               .eq(queryDTO.getCategoryId() != null, ReportCategorySalesSummary::getCategoryId, queryDTO.getCategoryId())
               .ge(queryDTO.getStartDate() != null, ReportCategorySalesSummary::getStatDate, queryDTO.getStartDate())
               .le(queryDTO.getEndDate() != null, ReportCategorySalesSummary::getStatDate, queryDTO.getEndDate())
               .orderByDesc(ReportCategorySalesSummary::getSalesAmount); // 按销售金额降序

        String deptColumn = (queryDTO.getStoreId() != null && queryDTO.getStoreId() > 0) ? "store_id" : "merchant_id";
        DataScope scope = buildDataScope(deptColumn, "created_by");

        IPage<ReportCategorySalesSummary> result = categorySalesSummaryMapper.selectPageByScope(page, wrapper, scope);
        
        IPage<CategorySalesSummaryVO> voPage = result.convert(entity -> {
            CategorySalesSummaryVO vo = new CategorySalesSummaryVO();
            BeanUtils.copyProperties(entity, vo);
            return vo;
        });
        
        reportCacheService.setToCache(cacheKey, voPage, ReportCacheService.REPORT_CATEGORY_SALES);
        return voPage;
    }

    /**
     * 分页查询退款分析报表（带缓存）
     * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
     */
    @Override
    public IPage<RefundAnalysisVO> getRefundAnalysisPage(ReportQueryDTO queryDTO) {
        String cacheKey = reportCacheService.buildCacheKey(ReportCacheService.REPORT_REFUND_ANALYSIS, queryDTO);
        IPage<RefundAnalysisVO> cached = reportCacheService.getFromCache(cacheKey, 
            new TypeReference<Page<RefundAnalysisVO>>(){}.getType());
        if (cached != null) {
            return cached;
        }

        IPage<ReportRefundAnalysis> page = new Page<>(queryDTO.getPageNo(), queryDTO.getPageSize());
        LambdaQueryWrapper<ReportRefundAnalysis> wrapper = Wrappers.lambdaQuery();
        
        wrapper.eq(queryDTO.getStoreId() != null, ReportRefundAnalysis::getStoreId, queryDTO.getStoreId())
               .eq(queryDTO.getMerchantId() != null, ReportRefundAnalysis::getMerchantId, queryDTO.getMerchantId())
               .ge(queryDTO.getStartDate() != null, ReportRefundAnalysis::getStatDate, queryDTO.getStartDate())
               .le(queryDTO.getEndDate() != null, ReportRefundAnalysis::getStatDate, queryDTO.getEndDate())
               .orderByDesc(ReportRefundAnalysis::getStatDate);

        String deptColumn = (queryDTO.getStoreId() != null && queryDTO.getStoreId() > 0) ? "store_id" : "merchant_id";
        DataScope scope = buildDataScope(deptColumn, "created_by");

        IPage<ReportRefundAnalysis> result = refundAnalysisMapper.selectPageByScope(page, wrapper, scope);
        
        IPage<RefundAnalysisVO> voPage = result.convert(entity -> {
            RefundAnalysisVO vo = new RefundAnalysisVO();
            BeanUtils.copyProperties(entity, vo);
            return vo;
        });
        
        reportCacheService.setToCache(cacheKey, voPage, ReportCacheService.REPORT_REFUND_ANALYSIS);
        return voPage;
    }

    /**
     * 分页查询时段销售趋势报表（带缓存）
     * Requirements: 16.1, 16.2, 16.3, 16.4, 16.5
     */
    @Override
    public IPage<HourlySalesVO> getHourlySalesPage(ReportQueryDTO queryDTO) {
        String cacheKey = reportCacheService.buildCacheKey(ReportCacheService.REPORT_HOURLY_SALES, queryDTO);
        IPage<HourlySalesVO> cached = reportCacheService.getFromCache(cacheKey, 
            new TypeReference<Page<HourlySalesVO>>(){}.getType());
        if (cached != null) {
            return cached;
        }

        IPage<ReportHourlySales> page = new Page<>(queryDTO.getPageNo(), queryDTO.getPageSize());
        LambdaQueryWrapper<ReportHourlySales> wrapper = Wrappers.lambdaQuery();
        
        wrapper.eq(queryDTO.getStoreId() != null, ReportHourlySales::getStoreId, queryDTO.getStoreId())
               .eq(queryDTO.getMerchantId() != null, ReportHourlySales::getMerchantId, queryDTO.getMerchantId())
               .ge(queryDTO.getStartDate() != null, ReportHourlySales::getStatDate, queryDTO.getStartDate())
               .le(queryDTO.getEndDate() != null, ReportHourlySales::getStatDate, queryDTO.getEndDate())
               .orderByAsc(ReportHourlySales::getStatDate)
               .orderByAsc(ReportHourlySales::getHourOfDay); // 按日期和小时排序

        String deptColumn = (queryDTO.getStoreId() != null && queryDTO.getStoreId() > 0) ? "store_id" : "merchant_id";
        DataScope scope = buildDataScope(deptColumn, "created_by");

        IPage<ReportHourlySales> result = hourlySalesMapper.selectPageByScope(page, wrapper, scope);
        
        IPage<HourlySalesVO> voPage = result.convert(entity -> {
            HourlySalesVO vo = new HourlySalesVO();
            BeanUtils.copyProperties(entity, vo);
            return vo;
        });
        
        reportCacheService.setToCache(cacheKey, voPage, ReportCacheService.REPORT_HOURLY_SALES);
        return voPage;
    }

    // ==================== 财务报表 ====================

    /**
     * 分页查询商家结算日报（带缓存）
     * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5
     */
    @Override
    public IPage<MerchantSettlementDailyVO> getMerchantSettlementDailyPage(ReportQueryDTO queryDTO) {
        String cacheKey = reportCacheService.buildCacheKey(ReportCacheService.REPORT_MERCHANT_SETTLEMENT, queryDTO);
        IPage<MerchantSettlementDailyVO> cached = reportCacheService.getFromCache(cacheKey, 
            new TypeReference<Page<MerchantSettlementDailyVO>>(){}.getType());
        if (cached != null) {
            return cached;
        }

        IPage<ReportMerchantSettlementDaily> page = new Page<>(queryDTO.getPageNo(), queryDTO.getPageSize());
        LambdaQueryWrapper<ReportMerchantSettlementDaily> wrapper = Wrappers.lambdaQuery();
        
        wrapper.eq(queryDTO.getMerchantId() != null, ReportMerchantSettlementDaily::getMerchantId, queryDTO.getMerchantId())
               .ge(queryDTO.getStartDate() != null, ReportMerchantSettlementDaily::getStatDate, queryDTO.getStartDate())
               .le(queryDTO.getEndDate() != null, ReportMerchantSettlementDaily::getStatDate, queryDTO.getEndDate())
               .orderByDesc(ReportMerchantSettlementDaily::getStatDate);

        DataScope scope = buildDataScope("merchant_id", "created_by");

        IPage<ReportMerchantSettlementDaily> result = merchantSettlementDailyMapper.selectPageByScope(page, wrapper, scope);
        
        IPage<MerchantSettlementDailyVO> voPage = result.convert(entity -> {
            MerchantSettlementDailyVO vo = new MerchantSettlementDailyVO();
            BeanUtils.copyProperties(entity, vo);
            return vo;
        });
        
        reportCacheService.setToCache(cacheKey, voPage, ReportCacheService.REPORT_MERCHANT_SETTLEMENT);
        return voPage;
    }

    /**
     * 分页查询商家结算明细（短期缓存）
     * Requirements: 6.1, 6.2, 6.3, 6.4
     */
    @Override
    public IPage<SettlementDetailVO> getSettlementDetailPage(ReportQueryDTO queryDTO) {
        String cacheKey = reportCacheService.buildCacheKey(ReportCacheService.REPORT_SETTLEMENT_DETAIL, queryDTO);
        IPage<SettlementDetailVO> cached = reportCacheService.getFromCache(cacheKey, 
            new TypeReference<Page<SettlementDetailVO>>(){}.getType());
        if (cached != null) {
            return cached;
        }

        IPage<ReportSettlementDetail> page = new Page<>(queryDTO.getPageNo(), queryDTO.getPageSize());
        LambdaQueryWrapper<ReportSettlementDetail> wrapper = Wrappers.lambdaQuery();
        
        wrapper.eq(queryDTO.getMerchantId() != null, ReportSettlementDetail::getMerchantId, queryDTO.getMerchantId())
               .ge(queryDTO.getStartDate() != null, ReportSettlementDetail::getStatDate, queryDTO.getStartDate())
               .le(queryDTO.getEndDate() != null, ReportSettlementDetail::getStatDate, queryDTO.getEndDate())
               .orderByDesc(ReportSettlementDetail::getStatDate);

        DataScope scope = buildDataScope("merchant_id", "created_by");

        IPage<ReportSettlementDetail> result = settlementDetailMapper.selectPageByScope(page, wrapper, scope);
        
        IPage<SettlementDetailVO> voPage = result.convert(entity -> {
            SettlementDetailVO vo = new SettlementDetailVO();
            BeanUtils.copyProperties(entity, vo);
            return vo;
        });
        
        // 短期缓存（10分钟）
        reportCacheService.setToCache(cacheKey, voPage, ReportCacheService.REPORT_SETTLEMENT_DETAIL);
        return voPage;
    }

    /**
     * 分页查询商家月度账单（带缓存）
     * Requirements: 7.1, 7.2, 7.3, 7.4
     */
    @Override
    public IPage<MerchantMonthlyBillVO> getMerchantMonthlyBillPage(ReportQueryDTO queryDTO) {
        String cacheKey = reportCacheService.buildCacheKey(ReportCacheService.REPORT_MONTHLY_BILL, queryDTO);
        IPage<MerchantMonthlyBillVO> cached = reportCacheService.getFromCache(cacheKey, 
            new TypeReference<Page<MerchantMonthlyBillVO>>(){}.getType());
        if (cached != null) {
            return cached;
        }

        IPage<ReportMerchantMonthlyBill> page = new Page<>(queryDTO.getPageNo(), queryDTO.getPageSize());
        LambdaQueryWrapper<ReportMerchantMonthlyBill> wrapper = Wrappers.lambdaQuery();
        
        wrapper.eq(queryDTO.getMerchantId() != null, ReportMerchantMonthlyBill::getMerchantId, queryDTO.getMerchantId())
               .eq(StrUtil.isNotBlank(queryDTO.getStatMonth()), ReportMerchantMonthlyBill::getStatMonth, queryDTO.getStatMonth())
               .orderByDesc(ReportMerchantMonthlyBill::getStatMonth);

        DataScope scope = buildDataScope("merchant_id", "created_by");

        IPage<ReportMerchantMonthlyBill> result = merchantMonthlyBillMapper.selectPageByScope(page, wrapper, scope);
        
        IPage<MerchantMonthlyBillVO> voPage = result.convert(entity -> {
            MerchantMonthlyBillVO vo = new MerchantMonthlyBillVO();
            BeanUtils.copyProperties(entity, vo);
            return vo;
        });
        
        reportCacheService.setToCache(cacheKey, voPage, ReportCacheService.REPORT_MONTHLY_BILL);
        return voPage;
    }

    /**
     * 分页查询支付渠道对账报表（带缓存）
     * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5
     */
    @Override
    public IPage<PayChannelReconcileVO> getPayChannelReconcilePage(ReportQueryDTO queryDTO) {
        String cacheKey = reportCacheService.buildCacheKey(ReportCacheService.REPORT_PAY_RECONCILE, queryDTO);
        IPage<PayChannelReconcileVO> cached = reportCacheService.getFromCache(cacheKey, 
            new TypeReference<Page<PayChannelReconcileVO>>(){}.getType());
        if (cached != null) {
            return cached;
        }

        IPage<ReportPayChannelReconcile> page = new Page<>(queryDTO.getPageNo(), queryDTO.getPageSize());
        LambdaQueryWrapper<ReportPayChannelReconcile> wrapper = Wrappers.lambdaQuery();
        
        wrapper.eq(queryDTO.getMerchantId() != null, ReportPayChannelReconcile::getMerchantId, queryDTO.getMerchantId())
               .eq(StrUtil.isNotBlank(queryDTO.getPayChannel()), ReportPayChannelReconcile::getPayChannel, queryDTO.getPayChannel())
               .ge(queryDTO.getStartDate() != null, ReportPayChannelReconcile::getStatDate, queryDTO.getStartDate())
               .le(queryDTO.getEndDate() != null, ReportPayChannelReconcile::getStatDate, queryDTO.getEndDate())
               .orderByDesc(ReportPayChannelReconcile::getStatDate);

        DataScope scope = buildDataScope("merchant_id", "created_by");

        IPage<ReportPayChannelReconcile> result = payChannelReconcileMapper.selectPageByScope(page, wrapper, scope);
        
        IPage<PayChannelReconcileVO> voPage = result.convert(entity -> {
            PayChannelReconcileVO vo = new PayChannelReconcileVO();
            BeanUtils.copyProperties(entity, vo);
            // 转换支付渠道名称
            vo.setPayChannelName(getPayChannelName(entity.getPayChannel()));
            return vo;
        });
        
        reportCacheService.setToCache(cacheKey, voPage, ReportCacheService.REPORT_PAY_RECONCILE);
        return voPage;
    }

    /**
     * 分页查询应收账款报表（带缓存）
     * Requirements: 9.1, 9.2, 9.3, 9.4
     */
    @Override
    public IPage<ReceivableReportVO> getReceivableReportPage(ReportQueryDTO queryDTO) {
        String cacheKey = reportCacheService.buildCacheKey(ReportCacheService.REPORT_RECEIVABLE, queryDTO);
        IPage<ReceivableReportVO> cached = reportCacheService.getFromCache(cacheKey, 
            new TypeReference<Page<ReceivableReportVO>>(){}.getType());
        if (cached != null) {
            return cached;
        }

        IPage<ReportReceivable> page = new Page<>(queryDTO.getPageNo(), queryDTO.getPageSize());
        LambdaQueryWrapper<ReportReceivable> wrapper = Wrappers.lambdaQuery();
        
        wrapper.eq(queryDTO.getMerchantId() != null, ReportReceivable::getMerchantId, queryDTO.getMerchantId())
               .ge(queryDTO.getStartDate() != null, ReportReceivable::getStatDate, queryDTO.getStartDate())
               .le(queryDTO.getEndDate() != null, ReportReceivable::getStatDate, queryDTO.getEndDate())
               .orderByDesc(ReportReceivable::getStatDate);

        DataScope scope = buildDataScope("merchant_id", "created_by");

        IPage<ReportReceivable> result = receivableMapper.selectPageByScope(page, wrapper, scope);
        
        IPage<ReceivableReportVO> voPage = result.convert(entity -> {
            ReceivableReportVO vo = new ReceivableReportVO();
            BeanUtils.copyProperties(entity, vo);
            return vo;
        });
        
        reportCacheService.setToCache(cacheKey, voPage, ReportCacheService.REPORT_RECEIVABLE);
        return voPage;
    }

    /**
     * 分页查询积分流水报表（带缓存）
     * Requirements: 11.1, 11.2, 11.3, 11.4, 11.5
     */
    @Override
    public IPage<PointsFlowVO> getPointsFlowPage(ReportQueryDTO queryDTO) {
        String cacheKey = reportCacheService.buildCacheKey(ReportCacheService.REPORT_POINTS_FLOW, queryDTO);
        IPage<PointsFlowVO> cached = reportCacheService.getFromCache(cacheKey, 
            new TypeReference<Page<PointsFlowVO>>(){}.getType());
        if (cached != null) {
            return cached;
        }

        IPage<ReportPointsFlow> page = new Page<>(queryDTO.getPageNo(), queryDTO.getPageSize());
        LambdaQueryWrapper<ReportPointsFlow> wrapper = Wrappers.lambdaQuery();
        
        wrapper.eq(queryDTO.getStoreId() != null, ReportPointsFlow::getStoreId, queryDTO.getStoreId())
               .eq(queryDTO.getMerchantId() != null, ReportPointsFlow::getMerchantId, queryDTO.getMerchantId())
               .ge(queryDTO.getStartDate() != null, ReportPointsFlow::getStatDate, queryDTO.getStartDate())
               .le(queryDTO.getEndDate() != null, ReportPointsFlow::getStatDate, queryDTO.getEndDate())
               .orderByDesc(ReportPointsFlow::getStatDate);

        String deptColumn = (queryDTO.getStoreId() != null && queryDTO.getStoreId() > 0) ? "store_id" : "merchant_id";
        DataScope scope = buildDataScope(deptColumn, "created_by");

        IPage<ReportPointsFlow> result = pointsFlowMapper.selectPageByScope(page, wrapper, scope);
        
        IPage<PointsFlowVO> voPage = result.convert(entity -> {
            PointsFlowVO vo = new PointsFlowVO();
            BeanUtils.copyProperties(entity, vo);
            return vo;
        });
        
        reportCacheService.setToCache(cacheKey, voPage, ReportCacheService.REPORT_POINTS_FLOW);
        return voPage;
    }

    // ==================== 营销报表 ====================

    /**
     * 分页查询优惠券使用分析报表（带缓存）
     * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5
     */
    @Override
    public IPage<CouponAnalysisVO> getCouponAnalysisPage(ReportQueryDTO queryDTO) {
        String cacheKey = reportCacheService.buildCacheKey(ReportCacheService.REPORT_COUPON_ANALYSIS, queryDTO);
        IPage<CouponAnalysisVO> cached = reportCacheService.getFromCache(cacheKey, 
            new TypeReference<Page<CouponAnalysisVO>>(){}.getType());
        if (cached != null) {
            return cached;
        }

        IPage<ReportCouponAnalysis> page = new Page<>(queryDTO.getPageNo(), queryDTO.getPageSize());
        LambdaQueryWrapper<ReportCouponAnalysis> wrapper = Wrappers.lambdaQuery();
        
        wrapper.eq(queryDTO.getStoreId() != null, ReportCouponAnalysis::getStoreId, queryDTO.getStoreId())
               .eq(queryDTO.getMerchantId() != null, ReportCouponAnalysis::getMerchantId, queryDTO.getMerchantId())
               .ge(queryDTO.getStartDate() != null, ReportCouponAnalysis::getStatDate, queryDTO.getStartDate())
               .le(queryDTO.getEndDate() != null, ReportCouponAnalysis::getStatDate, queryDTO.getEndDate())
               .orderByDesc(ReportCouponAnalysis::getStatDate);

        String deptColumn = (queryDTO.getStoreId() != null && queryDTO.getStoreId() > 0) ? "store_id" : "merchant_id";
        DataScope scope = buildDataScope(deptColumn, "created_by");

        IPage<ReportCouponAnalysis> result = couponAnalysisMapper.selectPageByScope(page, wrapper, scope);
        
        IPage<CouponAnalysisVO> voPage = result.convert(entity -> {
            CouponAnalysisVO vo = new CouponAnalysisVO();
            BeanUtils.copyProperties(entity, vo);
            return vo;
        });
        
        reportCacheService.setToCache(cacheKey, voPage, ReportCacheService.REPORT_COUPON_ANALYSIS);
        return voPage;
    }

    /**
     * 分页查询用户消费分析报表（带缓存）
     * Requirements: 12.1, 12.2, 12.3, 12.4, 12.5
     */
    @Override
    public IPage<UserConsumptionVO> getUserConsumptionPage(ReportQueryDTO queryDTO) {
        String cacheKey = reportCacheService.buildCacheKey(ReportCacheService.REPORT_USER_CONSUMPTION, queryDTO);
        IPage<UserConsumptionVO> cached = reportCacheService.getFromCache(cacheKey, 
            new TypeReference<Page<UserConsumptionVO>>(){}.getType());
        if (cached != null) {
            return cached;
        }

        IPage<ReportUserConsumption> page = new Page<>(queryDTO.getPageNo(), queryDTO.getPageSize());
        LambdaQueryWrapper<ReportUserConsumption> wrapper = Wrappers.lambdaQuery();
        
        wrapper.eq(queryDTO.getStoreId() != null, ReportUserConsumption::getStoreId, queryDTO.getStoreId())
               .eq(queryDTO.getMerchantId() != null, ReportUserConsumption::getMerchantId, queryDTO.getMerchantId())
               .ge(queryDTO.getStartDate() != null, ReportUserConsumption::getStatDate, queryDTO.getStartDate())
               .le(queryDTO.getEndDate() != null, ReportUserConsumption::getStatDate, queryDTO.getEndDate())
               .orderByDesc(ReportUserConsumption::getStatDate);

        String deptColumn = (queryDTO.getStoreId() != null && queryDTO.getStoreId() > 0) ? "store_id" : "merchant_id";
        DataScope scope = buildDataScope(deptColumn, "created_by");

        IPage<ReportUserConsumption> result = userConsumptionMapper.selectPageByScope(page, wrapper, scope);
        
        IPage<UserConsumptionVO> voPage = result.convert(entity -> {
            UserConsumptionVO vo = new UserConsumptionVO();
            BeanUtils.copyProperties(entity, vo);
            return vo;
        });
        
        reportCacheService.setToCache(cacheKey, voPage, ReportCacheService.REPORT_USER_CONSUMPTION);
        return voPage;
    }

    /**
     * 分页查询联合营销效果报表（带缓存）
     * Requirements: 13.1, 13.2, 13.3, 13.4, 13.5
     */
    @Override
    public IPage<JointMarketingVO> getJointMarketingPage(ReportQueryDTO queryDTO) {
        String cacheKey = reportCacheService.buildCacheKey(ReportCacheService.REPORT_JOINT_MARKETING, queryDTO);
        IPage<JointMarketingVO> cached = reportCacheService.getFromCache(cacheKey, 
            new TypeReference<Page<JointMarketingVO>>(){}.getType());
        if (cached != null) {
            return cached;
        }

        IPage<ReportJointMarketing> page = new Page<>(queryDTO.getPageNo(), queryDTO.getPageSize());
        LambdaQueryWrapper<ReportJointMarketing> wrapper = Wrappers.lambdaQuery();
        
        wrapper.eq(queryDTO.getMerchantId() != null, ReportJointMarketing::getMerchantId, queryDTO.getMerchantId())
               .ge(queryDTO.getStartDate() != null, ReportJointMarketing::getStatDate, queryDTO.getStartDate())
               .le(queryDTO.getEndDate() != null, ReportJointMarketing::getStatDate, queryDTO.getEndDate())
               .orderByDesc(ReportJointMarketing::getStatDate);

        DataScope scope = buildDataScope("merchant_id", "created_by");

        IPage<ReportJointMarketing> result = jointMarketingMapper.selectPageByScope(page, wrapper, scope);
        
        IPage<JointMarketingVO> voPage = result.convert(entity -> {
            JointMarketingVO vo = new JointMarketingVO();
            BeanUtils.copyProperties(entity, vo);
            return vo;
        });
        
        reportCacheService.setToCache(cacheKey, voPage, ReportCacheService.REPORT_JOINT_MARKETING);
        return voPage;
    }

    @Override
    public JointMarketingProfitReportVO getJointMarketingProfitReport(JointMarketingProfitReportDTO dto) {
        try {
            Long planId = Long.valueOf(dto.getPlanId());
            // 1. 构建查询条件
            JointMarketingProfitReportVO report = new JointMarketingProfitReportVO();
            report.setPlanId(planId);
            report.setPeriod(dto.getStartDate() + " 至 " + dto.getEndDate());

            // 2. 获取基础统计数据
            JointMarketingProfitBaseStat baseStat = getProfitBaseStat(dto);
            report.setTotalRebateAmount(baseStat.getTotalAmount());
            report.setTotalSettledAmount(baseStat.getSuccessAmount());
            report.setTotalFailureAmount(baseStat.getFailedAmount());
            report.setTotalRecords(baseStat.getTotalRecords());
            report.setSuccessRecords(baseStat.getSuccessRecords());
            report.setFailureRecords(baseStat.getFailureRecords());

            if (baseStat.getTotalRecords() > 0) {
                BigDecimal successRate = BigDecimal.valueOf(baseStat.getSuccessRecords())
                        .divide(BigDecimal.valueOf(baseStat.getTotalRecords()), 4, RoundingMode.HALF_UP)
                        .multiply(BigDecimal.valueOf(100));
                report.setSuccessRate(successRate);
            } else {
                report.setSuccessRate(BigDecimal.ZERO);
            }

            // 3. 获取商家分润明细
            List<JointMarketingProfitReportVO.MerchantProfitDetail> merchantDetails =
                    jointMarketingRebateRecordMapper.getMerchantProfitDetails(dto);
            report.setMerchantDetails(merchantDetails);

            // 4. 获取时间维度统计
            List<JointMarketingProfitReportVO.TimeDimensionStat> timeStats = getTimeDimensionStats(dto);
            report.setTimeStats(timeStats);

            // 5. 获取计划名称
            report.setPlanName(getPlanName(planId));

            return report;

        } catch (Exception e) {
            log.error("获取分润统计报表失败", e);
            throw new RuntimeException("获取分润统计报表失败: " + e.getMessage());
        }
    }

    @Override
    public List<JointMarketingProfitTrendVO> getJointMarketingProfitTrend(JointMarketingProfitTrendDTO dto) {
        try {
            // 1. 获取趋势数据
            List<JointMarketingProfitTrendVO> trendData = jointMarketingRebateRecordMapper.getProfitTrendData(dto);

            // 2. 计算增长率和累计值
            calculateTrendMetrics(trendData, dto.getTrendType());

            return trendData;

        } catch (Exception e) {
            log.error("获取分润趋势分析失败", e);
            throw new RuntimeException("获取分润趋势分析失败: " + e.getMessage());
        }
    }

    @Override
    public List<JointMarketingMerchantProfitRankVO> getJointMarketingMerchantProfitRank(JointMarketingProfitRankDTO dto) {
        try {
            // 1. 获取排名数据
            List<JointMarketingMerchantProfitRankVO> rankList = jointMarketingRebateRecordMapper.getMerchantProfitRanking(dto);

            // 设置排名序号
            for (int i = 0; i < rankList.size(); i++) {
                rankList.get(i).setRank(i + 1);
            }

            // 2. 计算排名变化和增长率
            rankList = calculateJointMarketingRankChanges(rankList, dto);

            // 3. 补充商家详细信息
            rankList = rankList.stream().peek(rank -> {
                        try {
                            Merchant merchant = merchantService.getById(rank.getMerchantId());
                            if (merchant != null) {
                                rank.setMerchantName(merchant.getName());
                                rank.setMerchantLogo(merchant.getLogoUrl());
                            }
                        } catch (Exception e) {
                            log.warn("获取商家信息失败, merchantId: {}", rank.getMerchantId(), e);
                        }
                    }).toList();

            log.info("商家分润排名查询成功, 返回 {} 条记录", rankList.size());
            return rankList;

        } catch (Exception e) {
            log.error("商家分润排名查询失败", e);
            throw new RuntimeException("商家分润排名查询失败: " + e.getMessage());
        }
    }

    // ==================== 平台报表（仅平台管理员可访问） ====================

    /**
     * 分页查询区域代理佣金报表（带缓存）
     * Requirements: 14.1, 14.2, 14.3, 14.4, 14.5
     * 注意：仅平台管理员可访问，权限控制由Controller层@HasPermission注解处理
     */
    @Override
    public IPage<AgentCommissionVO> getAgentCommissionPage(ReportQueryDTO queryDTO) {
        String cacheKey = reportCacheService.buildCacheKey(ReportCacheService.REPORT_AGENT_COMMISSION, queryDTO);
        IPage<AgentCommissionVO> cached = reportCacheService.getFromCache(cacheKey, 
            new TypeReference<Page<AgentCommissionVO>>(){}.getType());
        if (cached != null) {
            return cached;
        }

        IPage<ReportAgentCommission> page = new Page<>(queryDTO.getPageNo(), queryDTO.getPageSize());
        LambdaQueryWrapper<ReportAgentCommission> wrapper = Wrappers.lambdaQuery();
        
        wrapper.ge(queryDTO.getStartDate() != null, ReportAgentCommission::getStatDate, queryDTO.getStartDate())
               .le(queryDTO.getEndDate() != null, ReportAgentCommission::getStatDate, queryDTO.getEndDate())
               .orderByDesc(ReportAgentCommission::getStatDate)
               .orderByAsc(ReportAgentCommission::getRankByCommission); // 按佣金排名排序

        // 平台报表不需要DataScope过滤，直接查询
        IPage<ReportAgentCommission> result = agentCommissionMapper.selectPage(page, wrapper);
        
        IPage<AgentCommissionVO> voPage = result.convert(entity -> {
            AgentCommissionVO vo = new AgentCommissionVO();
            BeanUtils.copyProperties(entity, vo);
            return vo;
        });
        
        reportCacheService.setToCache(cacheKey, voPage, ReportCacheService.REPORT_AGENT_COMMISSION);
        return voPage;
    }

    /**
     * 查询平台运营概览报表（带缓存）
     * Requirements: 15.1, 15.2, 15.3, 15.4, 15.5
     * 注意：仅平台管理员可访问，权限控制由Controller层@HasPermission注解处理
     */
    @Override
    public PlatformOverviewVO getPlatformOverview(ReportQueryDTO queryDTO) {
        String cacheKey = reportCacheService.buildCacheKey(ReportCacheService.REPORT_PLATFORM_OVERVIEW, queryDTO);
        PlatformOverviewVO cached = reportCacheService.getFromCache(cacheKey, PlatformOverviewVO.class);
        if (cached != null) {
            return cached;
        }

        LambdaQueryWrapper<ReportPlatformOverview> wrapper = Wrappers.lambdaQuery();
        
        // 如果指定了日期范围，取最新一条；否则取最新日期的数据
        if (queryDTO.getStartDate() != null || queryDTO.getEndDate() != null) {
            wrapper.ge(queryDTO.getStartDate() != null, ReportPlatformOverview::getStatDate, queryDTO.getStartDate())
                   .le(queryDTO.getEndDate() != null, ReportPlatformOverview::getStatDate, queryDTO.getEndDate());
        }
        wrapper.orderByDesc(ReportPlatformOverview::getStatDate)
               .last("LIMIT 1");

        // 平台报表不需要DataScope过滤
        ReportPlatformOverview entity = platformOverviewMapper.selectOne(wrapper);
        
        if (entity == null) {
            // 返回空对象而非null
            return new PlatformOverviewVO();
        }
        
        PlatformOverviewVO vo = new PlatformOverviewVO();
        BeanUtils.copyProperties(entity, vo);
        
        reportCacheService.setToCache(cacheKey, vo, ReportCacheService.REPORT_PLATFORM_OVERVIEW);
        return vo;
    }

    // ==================== 私有方法 ====================

    /**
     * 构建DataScope数据权限范围
     * 
     * @param deptColumn 部门列名（merchant_id或store_id）
     * @param userColumn 用户列名
     * @return DataScope对象
     */
    private DataScope buildDataScope(String deptColumn, String userColumn) {
        DataScope scope = new DataScope();
        scope.setFunc(DataScopeFuncEnum.ALL);
        scope.setScopeDeptName(deptColumn);
        scope.setScopeUserName(userColumn);
        return scope;
    }

    /**
     * 获取支付渠道中文名称
     * 
     * @param payChannel 支付渠道编码
     * @return 支付渠道中文名称
     */
    private String getPayChannelName(String payChannel) {
        if (payChannel == null) return "";
        return switch (payChannel) {
            case "WECHAT_MINI" -> "微信小程序";
            case "WECHAT_MP" -> "微信公众号";
            case "BALANCE" -> "余额支付";
            case "WECHAT_PAY" -> "微信支付";
            case "ALIPAY" -> "支付宝";
            default -> payChannel;
        };
    }

    /**
     * 获取联合营销分润统计报表基础数据
     *
     * @param dto 查询参数
     * @return 分润统计报表基础数据
     */
    private JointMarketingProfitBaseStat getProfitBaseStat(JointMarketingProfitReportDTO dto) {
        LambdaQueryWrapper<JointMarketingRebateRecord> wrapper = buildProfitQueryWrapper(dto);

        List<JointMarketingRebateRecord> records = jointMarketingRebateRecordMapper.selectList(wrapper);

        JointMarketingProfitBaseStat stat = new JointMarketingProfitBaseStat();
        stat.setTotalRecords(records.size());

        BigDecimal totalRebateAmount = BigDecimal.ZERO;
        BigDecimal totalSettledAmount = BigDecimal.ZERO;
        int successCount = 0;

        for (JointMarketingRebateRecord record : records) {
            totalRebateAmount = totalRebateAmount.add(record.getAmount());

            if ("SETTLED".equals(record.getStatus())) {
                totalSettledAmount = totalSettledAmount.add(record.getAmount());
                successCount++;
            }
        }

        stat.setTotalAmount(totalRebateAmount);
        stat.setSuccessAmount(totalSettledAmount);
        stat.setFailedAmount(totalRebateAmount.subtract(totalSettledAmount));
        stat.setSuccessRecords(successCount);
        stat.setFailureRecords(records.size() - successCount);

        return stat;
    }

    /**
     * 构建联合营销分润统计报表查询条件
     *
     * @param dto 查询参数
     * @return 查询条件
     */
    private LambdaQueryWrapper<JointMarketingRebateRecord> buildProfitQueryWrapper(JointMarketingProfitReportDTO dto) {
        LambdaQueryWrapper<JointMarketingRebateRecord> wrapper = new LambdaQueryWrapper<>();

        wrapper.eq(JointMarketingRebateRecord::getPlanId, dto.getPlanId())
                .ge(JointMarketingRebateRecord::getCreatedTime, dto.getStartDate().atStartOfDay())
                .le(JointMarketingRebateRecord::getCreatedTime, dto.getEndDate().atTime(LocalTime.MAX));

        if (dto.getMerchantId() != null) {
            wrapper.and(w -> w.eq(JointMarketingRebateRecord::getPayerMerchantId, dto.getMerchantId())
                    .or()
                    .eq(JointMarketingRebateRecord::getPayeeMerchantId, dto.getMerchantId()));
        }

        return wrapper;
    }

    /**
     * 获取联合营销分润时间维度统计数据
     */
    private List<JointMarketingProfitReportVO.TimeDimensionStat> getTimeDimensionStats(JointMarketingProfitReportDTO dto) {
        try {
            // 调用 Mapper 获取时间维度统计数据
            List<JointMarketingProfitReportVO.TimeDimensionStat> timeStats =
                    jointMarketingRebateRecordMapper.getTimeDimensionStats(dto);

            // 数据处理和格式化
            return timeStats.stream()
                    .peek(stat -> {
                        // 确保金额格式正确
                        if (stat.getRebateAmount() == null) {
                            stat.setRebateAmount(BigDecimal.ZERO);
                        }
                        if (stat.getSettledAmount() == null) {
                            stat.setSettledAmount(BigDecimal.ZERO);
                        }
                        if (stat.getRecordCount() == null) {
                            stat.setRecordCount(0);
                        }
                    }).toList();

        } catch (Exception e) {
            log.error("获取时间维度统计数据失败", e);
            // 返回空列表而不是抛出异常，保证报表主体能正常返回
            return List.of();
        }
    }

    /**
     * 计算联合营销分润趋势指标
     */
    private void calculateTrendMetrics(List<JointMarketingProfitTrendVO> trendData, String trendType) {
        if (trendData == null || trendData.size() < 2) {
            return;
        }

        // 计算环比增长率
        for (int i = 1; i < trendData.size(); i++) {
            JointMarketingProfitTrendVO current = trendData.get(i);
            JointMarketingProfitTrendVO previous = trendData.get(i - 1);

            BigDecimal currentValue = "AMOUNT".equals(trendType) ?
                    current.getRebateAmount() : BigDecimal.valueOf(current.getRecordCount());
            BigDecimal previousValue = "AMOUNT".equals(trendType) ?
                    previous.getRebateAmount() : BigDecimal.valueOf(previous.getRecordCount());

            if (previousValue.compareTo(BigDecimal.ZERO) > 0) {
                BigDecimal growthRate = currentValue.subtract(previousValue)
                        .divide(previousValue, 4, RoundingMode.HALF_UP)
                        .multiply(BigDecimal.valueOf(100));
                current.setGrowthRate(growthRate);
            } else {
                current.setGrowthRate(BigDecimal.ZERO);
            }
        }

        // 计算累计值
        BigDecimal cumulativeAmount = BigDecimal.ZERO;
        for (JointMarketingProfitTrendVO item : trendData) {
            cumulativeAmount = cumulativeAmount.add(item.getRebateAmount());
            item.setCumulativeAmount(cumulativeAmount);
        }
    }

    private String getPlanName(Long planId) {
        try {
            if (planId == null) {
                return "未知计划";
            }

            // 查询计划信息
            JointMarketingPlan plan = jointMarketingPlanService.getById(planId);
            if (plan == null) {
                log.warn("未找到对应的联合营销计划, planId: {}", planId);
                return "计划ID: " + planId;
            }

            return plan.getName() != null ? plan.getName() : "未命名计划";

        } catch (Exception e) {
            log.error("获取计划名称失败, planId: {}", planId, e);
            return "计划ID: " + planId;
        }
    }

    /**
     * 计算排名变化和增长率
     */
    private List<JointMarketingMerchantProfitRankVO> calculateJointMarketingRankChanges(
            List<JointMarketingMerchantProfitRankVO> currentRank, JointMarketingProfitRankDTO dto) {
        // 获取上期排名数据用于对比
        JointMarketingProfitRankDTO lastPeriodDto = new JointMarketingProfitRankDTO();
        BeanUtils.copyProperties(dto, lastPeriodDto);
        // 根据排名类型计算上期时间范围
        switch (dto.getRankType()) {
            case "MONTHLY":
                lastPeriodDto.setStartDate(dto.getStartDate().minusMonths(1));
                lastPeriodDto.setEndDate(dto.getEndDate().minusMonths(1));
                break;
            case "WEEKLY":
                lastPeriodDto.setStartDate(dto.getStartDate().minusWeeks(1));
                lastPeriodDto.setEndDate(dto.getEndDate().minusWeeks(1));
                break;
            default: // TOTAL
                // 对于总排名，上期就是截止到上个月末
                lastPeriodDto.setEndDate(dto.getStartDate().minusDays(1));
                lastPeriodDto.setStartDate(dto.getStartDate().minusMonths(6)); // 取最近6个月
                break;
        }
        List<JointMarketingMerchantProfitRankVO> lastRank = jointMarketingRebateRecordMapper.getMerchantProfitRanking(lastPeriodDto);

        Map<Long, JointMarketingMerchantProfitRankVO> lastRankMap = lastRank.stream()
                .collect(Collectors.toMap(JointMarketingMerchantProfitRankVO::getMerchantId, Function.identity()));

        return currentRank.stream().peek(rank -> {
                    JointMarketingMerchantProfitRankVO lastRankInfo = lastRankMap.get(rank.getMerchantId());
                    if (lastRankInfo == null) {
                        // 新上榜商家
                        rank.setRankChange("NEW");
                        rank.setProfitGrowthRate(BigDecimal.valueOf(100)); // 新商家增长率设为100%
                    } else {
                        rank.setLastMonthRank(lastRankInfo.getRank());
                        rank.setLastMonthProfit(lastRankInfo.getTotalProfit());
                        // 计算排名变化
                        if (rank.getRank() < lastRankInfo.getRank()) {
                            rank.setRankChange("UP");
                        } else if (rank.getRank() > lastRankInfo.getRank()) {
                            rank.setRankChange("DOWN");
                        } else {
                            rank.setRankChange("STABLE");
                        }
                        // 计算收益增长率
                        if (lastRankInfo.getTotalProfit() != null &&
                                lastRankInfo.getTotalProfit().compareTo(BigDecimal.ZERO) > 0) {
                            BigDecimal growthRate = rank.getTotalProfit()
                                    .subtract(lastRankInfo.getTotalProfit())
                                    .divide(lastRankInfo.getTotalProfit(), 4, RoundingMode.HALF_UP)
                                    .multiply(BigDecimal.valueOf(100));
                            rank.setProfitGrowthRate(growthRate);
                        }
                    }
                }).toList();
    }

}