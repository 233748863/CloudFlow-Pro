package cn.joywon.poco.merchant.ReportModule.service.impl;

import cn.joywon.poco.common.core.exception.CheckedException;
import cn.joywon.poco.merchant.ReportModule.dto.ExportConfig;
import cn.joywon.poco.merchant.ReportModule.dto.ReportExportDTO;
import cn.joywon.poco.merchant.ReportModule.dto.ReportQueryDTO;
import cn.joywon.poco.merchant.ReportModule.service.ReportExportService;
import cn.joywon.poco.merchant.ReportModule.service.ReportService;
import cn.joywon.poco.merchant.ReportModule.vo.MerchantSettlementDailyVO;
import cn.joywon.poco.merchant.ReportModule.vo.PayChannelReconcileVO;
import cn.joywon.poco.merchant.ReportModule.vo.StoreDailyStatsVO;
import com.alibaba.excel.EasyExcel;
import com.alibaba.excel.write.style.column.LongestMatchColumnWidthStyleStrategy;
import com.baomidou.mybatisplus.core.metadata.IPage;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * 报表数据导出服务实现
 * 使用EasyExcel进行流式导出，支持大数据量导出
 *
 * @author poco
 * @date 2025-01-06
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class ReportExportServiceImpl implements ReportExportService {

    private final ReportService reportService;

    /**
     * 最大导出行数限制
     */
    private static final int MAX_EXPORT_ROWS = 10000;

    /**
     * 分页查询大小（用于分批获取数据）
     */
    private static final int BATCH_SIZE = 1000;

    @Override
    public void exportStoreDailyStats(ReportExportDTO exportDTO, HttpServletResponse response) {
        log.info("开始导出门店经营日报, merchantId: {}, storeId: {}", 
                exportDTO.getMerchantId(), exportDTO.getStoreId());
        
        // 1. 检查数据量
        long totalCount = countStoreDailyStats(exportDTO);
        if (totalCount > MAX_EXPORT_ROWS) {
            throw new CheckedException("导出数据量超过限制（最大" + MAX_EXPORT_ROWS + "条），请缩小查询范围");
        }

        // 2. 查询所有数据
        List<StoreDailyStatsVO> dataList = queryAllStoreDailyStats(exportDTO);

        // 3. 构建导出配置
        ExportConfig config = buildStoreDailyExportConfig(exportDTO);

        // 4. 导出Excel
        try {
            setExportResponseHeaders(response, config);
            
            EasyExcel.write(response.getOutputStream(), StoreDailyStatsVO.class)
                    .registerWriteHandler(new LongestMatchColumnWidthStyleStrategy())
                    .sheet(config.getSheetName())
                    .doWrite(dataList);
            
            log.info("门店经营日报导出完成, 共{}条记录", dataList.size());
        } catch (IOException e) {
            log.error("导出门店经营日报失败", e);
            throw new CheckedException("导出失败，请稍后重试");
        }
    }

    @Override
    public void exportMerchantSettlement(ReportExportDTO exportDTO, HttpServletResponse response) {
        log.info("开始导出商家结算日报, merchantId: {}", exportDTO.getMerchantId());
        
        // 1. 检查数据量
        long totalCount = countMerchantSettlement(exportDTO);
        if (totalCount > MAX_EXPORT_ROWS) {
            throw new CheckedException("导出数据量超过限制（最大" + MAX_EXPORT_ROWS + "条），请缩小查询范围");
        }

        // 2. 查询所有数据
        List<MerchantSettlementDailyVO> dataList = queryAllMerchantSettlement(exportDTO);

        // 3. 构建导出配置
        ExportConfig config = buildMerchantSettlementExportConfig(exportDTO);

        // 4. 导出Excel
        try {
            setExportResponseHeaders(response, config);
            
            EasyExcel.write(response.getOutputStream(), MerchantSettlementDailyVO.class)
                    .registerWriteHandler(new LongestMatchColumnWidthStyleStrategy())
                    .sheet(config.getSheetName())
                    .doWrite(dataList);
            
            log.info("商家结算日报导出完成, 共{}条记录", dataList.size());
        } catch (IOException e) {
            log.error("导出商家结算日报失败", e);
            throw new CheckedException("导出失败，请稍后重试");
        }
    }

    @Override
    public void exportPayChannelReconcile(ReportExportDTO exportDTO, HttpServletResponse response) {
        log.info("开始导出支付渠道对账, merchantId: {}, payChannel: {}", 
                exportDTO.getMerchantId(), exportDTO.getPayChannel());
        
        // 1. 检查数据量
        long totalCount = countPayChannelReconcile(exportDTO);
        if (totalCount > MAX_EXPORT_ROWS) {
            throw new CheckedException("导出数据量超过限制（最大" + MAX_EXPORT_ROWS + "条），请缩小查询范围");
        }

        // 2. 查询所有数据
        List<PayChannelReconcileVO> dataList = queryAllPayChannelReconcile(exportDTO);

        // 3. 构建导出配置
        ExportConfig config = buildPayChannelReconcileExportConfig(exportDTO);

        // 4. 导出Excel
        try {
            setExportResponseHeaders(response, config);
            
            EasyExcel.write(response.getOutputStream(), PayChannelReconcileVO.class)
                    .registerWriteHandler(new LongestMatchColumnWidthStyleStrategy())
                    .sheet(config.getSheetName())
                    .doWrite(dataList);
            
            log.info("支付渠道对账导出完成, 共{}条记录", dataList.size());
        } catch (IOException e) {
            log.error("导出支付渠道对账失败", e);
            throw new CheckedException("导出失败，请稍后重试");
        }
    }

    // ==================== 私有方法 ====================

    /**
     * 统计门店经营日报数据量
     */
    private long countStoreDailyStats(ReportQueryDTO queryDTO) {
        ReportQueryDTO countQuery = copyQueryDTO(queryDTO);
        countQuery.setPageNo(1);
        countQuery.setPageSize(1);
        IPage<StoreDailyStatsVO> page = reportService.getStoreDailyStatsPage(countQuery);
        return page != null ? page.getTotal() : 0L;
    }

    /**
     * 查询所有门店经营日报数据
     */
    private List<StoreDailyStatsVO> queryAllStoreDailyStats(ReportQueryDTO queryDTO) {
        List<StoreDailyStatsVO> allData = new ArrayList<>();
        int pageNo = 1;
        
        while (true) {
            ReportQueryDTO pageQuery = copyQueryDTO(queryDTO);
            pageQuery.setPageNo(pageNo);
            pageQuery.setPageSize(BATCH_SIZE);
            
            IPage<StoreDailyStatsVO> page = reportService.getStoreDailyStatsPage(pageQuery);
            if (page == null) {
                break;
            }
            List<StoreDailyStatsVO> records = page.getRecords();
            
            if (records == null || records.isEmpty()) {
                break;
            }
            
            allData.addAll(records);
            
            if (records.size() < BATCH_SIZE) {
                break;
            }
            pageNo++;
        }
        
        return allData;
    }

    /**
     * 统计商家结算数据量
     */
    private long countMerchantSettlement(ReportQueryDTO queryDTO) {
        ReportQueryDTO countQuery = copyQueryDTO(queryDTO);
        countQuery.setPageNo(1);
        countQuery.setPageSize(1);
        IPage<MerchantSettlementDailyVO> page = reportService.getMerchantSettlementDailyPage(countQuery);
        return page != null ? page.getTotal() : 0L;
    }

    /**
     * 查询所有商家结算数据
     */
    private List<MerchantSettlementDailyVO> queryAllMerchantSettlement(ReportQueryDTO queryDTO) {
        List<MerchantSettlementDailyVO> allData = new ArrayList<>();
        int pageNo = 1;
        
        while (true) {
            ReportQueryDTO pageQuery = copyQueryDTO(queryDTO);
            pageQuery.setPageNo(pageNo);
            pageQuery.setPageSize(BATCH_SIZE);
            
            IPage<MerchantSettlementDailyVO> page = reportService.getMerchantSettlementDailyPage(pageQuery);
            if (page == null) {
                break;
            }
            List<MerchantSettlementDailyVO> records = page.getRecords();
            
            if (records == null || records.isEmpty()) {
                break;
            }
            
            allData.addAll(records);
            
            if (records.size() < BATCH_SIZE) {
                break;
            }
            pageNo++;
        }
        
        return allData;
    }

    /**
     * 统计支付渠道对账数据量
     */
    private long countPayChannelReconcile(ReportQueryDTO queryDTO) {
        ReportQueryDTO countQuery = copyQueryDTO(queryDTO);
        countQuery.setPageNo(1);
        countQuery.setPageSize(1);
        IPage<PayChannelReconcileVO> page = reportService.getPayChannelReconcilePage(countQuery);
        return page != null ? page.getTotal() : 0L;
    }

    /**
     * 查询所有支付渠道对账数据
     */
    private List<PayChannelReconcileVO> queryAllPayChannelReconcile(ReportQueryDTO queryDTO) {
        List<PayChannelReconcileVO> allData = new ArrayList<>();
        int pageNo = 1;
        
        while (true) {
            ReportQueryDTO pageQuery = copyQueryDTO(queryDTO);
            pageQuery.setPageNo(pageNo);
            pageQuery.setPageSize(BATCH_SIZE);
            
            IPage<PayChannelReconcileVO> page = reportService.getPayChannelReconcilePage(pageQuery);
            if (page == null) {
                break;
            }
            List<PayChannelReconcileVO> records = page.getRecords();
            
            if (records == null || records.isEmpty()) {
                break;
            }
            
            allData.addAll(records);
            
            if (records.size() < BATCH_SIZE) {
                break;
            }
            pageNo++;
        }
        
        return allData;
    }

    /**
     * 复制查询参数
     */
    private ReportQueryDTO copyQueryDTO(ReportQueryDTO source) {
        ReportQueryDTO target = new ReportQueryDTO();
        target.setStartDate(source.getStartDate());
        target.setEndDate(source.getEndDate());
        target.setMerchantId(source.getMerchantId());
        target.setStoreId(source.getStoreId());
        target.setStatMonth(source.getStatMonth());
        target.setPayChannel(source.getPayChannel());
        target.setCategoryId(source.getCategoryId());
        return target;
    }

    /**
     * 构建门店经营日报导出配置
     */
    private ExportConfig buildStoreDailyExportConfig(ReportExportDTO exportDTO) {
        exportDTO.setReportType(ReportExportDTO.ReportType.STORE_DAILY);
        return ExportConfig.builder()
                .fileName(exportDTO.getExportFileName())
                .sheetName("门店经营日报")
                .headers(Arrays.asList("统计日期", "门店ID", "门店名称", "总订单数", "已付款订单数", 
                        "总销售额", "实付金额", "退款订单数", "退款金额", "客单价"))
                .fields(Arrays.asList("statDate", "storeId", "storeName", "totalOrderCount", "paidOrderCount",
                        "totalSalesAmount", "realPayAmount", "refundOrderCount", "refundAmount", "avgOrderValue"))
                .includeSummary(true)
                .build();
    }

    /**
     * 构建商家结算导出配置
     */
    private ExportConfig buildMerchantSettlementExportConfig(ReportExportDTO exportDTO) {
        exportDTO.setReportType(ReportExportDTO.ReportType.MERCHANT_SETTLEMENT);
        return ExportConfig.builder()
                .fileName(exportDTO.getExportFileName())
                .sheetName("商家结算日报")
                .headers(Arrays.asList("统计日期", "商家ID", "商家名称", "营业额", "退款金额", 
                        "平台佣金", "实结金额"))
                .fields(Arrays.asList("statDate", "merchantId", "merchantName", "totalSalesAmount", 
                        "refundAmount", "platformCommission", "settlementAmount"))
                .includeSummary(true)
                .build();
    }

    /**
     * 构建支付渠道对账导出配置
     */
    private ExportConfig buildPayChannelReconcileExportConfig(ReportExportDTO exportDTO) {
        exportDTO.setReportType(ReportExportDTO.ReportType.PAY_RECONCILE);
        return ExportConfig.builder()
                .fileName(exportDTO.getExportFileName())
                .sheetName("支付渠道对账")
                .headers(Arrays.asList("统计日期", "支付渠道", "交易笔数", "交易金额", 
                        "退款笔数", "退款金额", "净交易额", "手续费"))
                .fields(Arrays.asList("statDate", "payChannel", "transactionCount", "transactionAmount",
                        "refundCount", "refundAmount", "netAmount", "feeAmount"))
                .includeSummary(true)
                .build();
    }

    /**
     * 设置导出响应头
     */
    private void setExportResponseHeaders(HttpServletResponse response, ExportConfig config) {
        response.setContentType(config.getContentType());
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        String encodedFileName = URLEncoder.encode(config.getFullFileName(), StandardCharsets.UTF_8)
                .replaceAll("\\+", "%20");
        response.setHeader("Content-Disposition", "attachment;filename*=UTF-8''" + encodedFileName);
    }
}
