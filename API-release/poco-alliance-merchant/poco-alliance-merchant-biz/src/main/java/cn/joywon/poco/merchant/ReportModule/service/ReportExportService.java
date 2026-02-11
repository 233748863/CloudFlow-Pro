package cn.joywon.poco.merchant.ReportModule.service;

import cn.joywon.poco.merchant.ReportModule.dto.ReportExportDTO;

import jakarta.servlet.http.HttpServletResponse;

/**
 * 报表数据导出服务接口
 * 提供报表数据导出为Excel文件的功能
 *
 * @author poco
 * @date 2025-01-06
 */
public interface ReportExportService {

    /**
     * 导出门店经营日报
     * 包含订单数、GMV、实付金额、退款金额、客单价等核心指标
     *
     * @param exportDTO 导出请求参数（含日期范围、门店ID、商家ID等）
     * @param response HTTP响应（用于流式输出Excel文件）
     */
    void exportStoreDailyStats(ReportExportDTO exportDTO, HttpServletResponse response);

    /**
     * 导出商家结算日报
     * 包含营业额、退款、佣金、实结金额等结算明细
     *
     * @param exportDTO 导出请求参数
     * @param response HTTP响应
     */
    void exportMerchantSettlement(ReportExportDTO exportDTO, HttpServletResponse response);

    /**
     * 导出支付渠道对账报表
     * 按支付渠道分组，包含交易笔数、交易金额、退款笔数、退款金额、净交易额
     *
     * @param exportDTO 导出请求参数
     * @param response HTTP响应
     */
    void exportPayChannelReconcile(ReportExportDTO exportDTO, HttpServletResponse response);
}
