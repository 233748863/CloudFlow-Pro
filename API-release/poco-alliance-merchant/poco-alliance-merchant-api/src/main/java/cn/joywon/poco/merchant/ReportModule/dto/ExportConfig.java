package cn.joywon.poco.merchant.ReportModule.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serializable;
import java.util.List;

/**
 * 报表导出配置
 * 用于定义Excel导出的文件名、表头、字段映射等配置信息
 *
 * @author poco
 * @date 2025-01-06
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "报表导出配置")
public class ExportConfig implements Serializable {

    private static final long serialVersionUID = 1L;

    /**
     * 默认最大导出行数
     */
    public static final int DEFAULT_MAX_ROWS = 10000;

    @Schema(description = "导出文件名（不含扩展名）")
    private String fileName;

    @Schema(description = "Excel Sheet名称")
    private String sheetName;

    @Schema(description = "表头列表")
    private List<String> headers;

    @Schema(description = "字段映射列表（与表头一一对应）")
    private List<String> fields;

    @Schema(description = "是否包含汇总行")
    @Builder.Default
    private boolean includeSummary = true;

    @Schema(description = "最大导出行数限制")
    @Builder.Default
    private int maxRows = DEFAULT_MAX_ROWS;

    @Schema(description = "导出文件类型: XLSX, XLS, CSV")
    @Builder.Default
    private ExportFileType fileType = ExportFileType.XLSX;

    /**
     * 导出文件类型枚举
     */
    public enum ExportFileType {
        /**
         * Excel 2007+ 格式
         */
        XLSX("xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
        /**
         * Excel 97-2003 格式
         */
        XLS("xls", "application/vnd.ms-excel"),
        /**
         * CSV 格式
         */
        CSV("csv", "text/csv");

        private final String extension;
        private final String contentType;

        ExportFileType(String extension, String contentType) {
            this.extension = extension;
            this.contentType = contentType;
        }

        public String getExtension() {
            return extension;
        }

        public String getContentType() {
            return contentType;
        }
    }

    /**
     * 获取完整文件名（含扩展名）
     *
     * @return 完整文件名
     */
    public String getFullFileName() {
        return fileName + "." + fileType.getExtension();
    }

    /**
     * 获取Content-Type
     *
     * @return Content-Type
     */
    public String getContentType() {
        return fileType.getContentType();
    }
}
