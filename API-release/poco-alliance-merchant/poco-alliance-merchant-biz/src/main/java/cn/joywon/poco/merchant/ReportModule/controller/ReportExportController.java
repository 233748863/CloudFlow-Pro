package cn.joywon.poco.merchant.ReportModule.controller;

import cn.joywon.poco.common.security.annotation.HasPermission;
import cn.joywon.poco.merchant.ReportModule.dto.ReportExportDTO;
import cn.joywon.poco.merchant.ReportModule.service.ReportExportService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.AllArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import jakarta.servlet.http.HttpServletResponse;

/**
 * 报表导出控制器
 * 提供报表数据导出为Excel文件的接口
 *
 * @author poco
 * @date 2025-01-06
 */
@RestController
@AllArgsConstructor
@RequestMapping("/report/export")
@Tag(name = "报表导出", description = "报表数据导出为Excel文件")
@Slf4j
public class ReportExportController {

    private final ReportExportService reportExportService;

    @GetMapping("/store/daily")
    @Operation(summary = "导出门店经营日报", description = "导出门店经营日报为Excel文件，包含订单数、GMV、实付金额等")
    @HasPermission("report_store_daily_export")
    public void exportStoreDailyStats(ReportExportDTO exportDTO, HttpServletResponse response) {
        log.info("请求导出门店经营日报, merchantId: {}, storeId: {}, dateRange: {} ~ {}", 
                exportDTO.getMerchantId(), exportDTO.getStoreId(), 
                exportDTO.getStartDate(), exportDTO.getEndDate());
        reportExportService.exportStoreDailyStats(exportDTO, response);
    }

    @GetMapping("/merchant/settlement")
    @Operation(summary = "导出商家结算日报", description = "导出商家结算日报为Excel文件，包含营业额、退款、佣金、实结金额等")
    @HasPermission("report_merchant_settlement_export")
    public void exportMerchantSettlement(ReportExportDTO exportDTO, HttpServletResponse response) {
        log.info("请求导出商家结算日报, merchantId: {}, dateRange: {} ~ {}", 
                exportDTO.getMerchantId(), exportDTO.getStartDate(), exportDTO.getEndDate());
        reportExportService.exportMerchantSettlement(exportDTO, response);
    }

    @GetMapping("/pay/reconcile")
    @Operation(summary = "导出支付渠道对账", description = "导出支付渠道对账报表为Excel文件，按渠道分组统计")
    @HasPermission("report_pay_reconcile_export")
    public void exportPayChannelReconcile(ReportExportDTO exportDTO, HttpServletResponse response) {
        log.info("请求导出支付渠道对账, merchantId: {}, payChannel: {}, dateRange: {} ~ {}", 
                exportDTO.getMerchantId(), exportDTO.getPayChannel(),
                exportDTO.getStartDate(), exportDTO.getEndDate());
        reportExportService.exportPayChannelReconcile(exportDTO, response);
    }
}
