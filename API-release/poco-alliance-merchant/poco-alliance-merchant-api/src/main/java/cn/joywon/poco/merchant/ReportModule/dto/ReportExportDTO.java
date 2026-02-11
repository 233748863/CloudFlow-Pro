package cn.joywon.poco.merchant.ReportModule.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.Getter;

/**
 * 报表导出请求参数
 * 扩展ReportQueryDTO，增加导出相关的配置参数
 *
 * @author poco
 * @date 2025-01-06
 */
@Data
@EqualsAndHashCode(callSuper = true)
@Schema(description = "报表导出请求参数")
public class ReportExportDTO extends ReportQueryDTO {

    private static final long serialVersionUID = 1L;

    @Schema(description = "导出文件名（不含扩展名），默认根据报表类型自动生成")
    private String fileName;

    @Schema(description = "导出文件类型: XLSX, XLS, CSV", defaultValue = "XLSX")
    private ExportConfig.ExportFileType fileType = ExportConfig.ExportFileType.XLSX;

    @Schema(description = "是否包含汇总行", defaultValue = "true")
    private Boolean includeSummary = true;

    @Schema(description = "导出的列（字段名列表），为空则导出全部列")
    private String[] exportColumns;

    @Schema(description = "报表类型: STORE_DAILY-门店经营日报; MERCHANT_SETTLEMENT-商家结算; PAY_RECONCILE-支付渠道对账")
    private ReportType reportType;

    /**
     * 报表类型枚举
     */
    @Getter
    public enum ReportType {
        /**
         * 门店经营日报
         */
        STORE_DAILY("门店经营日报", "store_daily_stats"),
        /**
         * 商家结算日报
         */
        MERCHANT_SETTLEMENT("商家结算日报", "merchant_settlement"),
        /**
         * 支付渠道对账
         */
        PAY_RECONCILE("支付渠道对账", "pay_channel_reconcile");

        private final String displayName;
        private final String filePrefix;

        ReportType(String displayName, String filePrefix) {
            this.displayName = displayName;
            this.filePrefix = filePrefix;
        }

    }

    /**
     * 获取导出文件名
     * 如果未指定文件名，则根据报表类型和日期范围自动生成
     *
     * @return 导出文件名
     */
    public String getExportFileName() {
        if (fileName != null && !fileName.isEmpty()) {
            return fileName;
        }
        // 自动生成文件名
        StringBuilder sb = new StringBuilder();
        if (reportType != null) {
            sb.append(reportType.getFilePrefix());
        } else {
            sb.append("report_export");
        }
        if (getStartDate() != null) {
            sb.append("_").append(getStartDate());
        }
        if (getEndDate() != null && !getEndDate().equals(getStartDate())) {
            sb.append("_").append(getEndDate());
        }
        return sb.toString();
    }

    /**
     * 构建导出配置
     *
     * @param headers 表头列表
     * @param fields  字段列表
     * @return 导出配置
     */
    public ExportConfig buildExportConfig(java.util.List<String> headers, java.util.List<String> fields) {
        return ExportConfig.builder()
                .fileName(getExportFileName())
                .sheetName(reportType != null ? reportType.getDisplayName() : "数据导出")
                .headers(headers)
                .fields(fields)
                .includeSummary(includeSummary != null ? includeSummary : true)
                .fileType(fileType != null ? fileType : ExportConfig.ExportFileType.XLSX)
                .maxRows(ExportConfig.DEFAULT_MAX_ROWS)
                .build();
    }
}
