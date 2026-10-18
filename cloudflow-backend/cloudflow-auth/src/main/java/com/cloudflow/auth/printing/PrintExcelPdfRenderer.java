package com.cloudflow.auth.printing;

import com.cloudflow.auth.domain.SysPrintTemplate;
import com.cloudflow.common.core.exception.ServiceException;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import org.apache.poi.hssf.usermodel.HSSFWorkbook;
import org.apache.poi.ss.usermodel.BorderStyle;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.Color;
import org.apache.poi.ss.usermodel.DataFormatter;
import org.apache.poi.ss.usermodel.FillPatternType;
import org.apache.poi.ss.usermodel.Font;
import org.apache.poi.ss.usermodel.FormulaEvaluator;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.usermodel.WorkbookFactory;
import org.apache.poi.ss.util.CellRangeAddress;
import org.apache.poi.xssf.usermodel.XSSFColor;
import org.apache.poi.xssf.usermodel.XSSFFont;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.springframework.stereotype.Component;

/** 已填充 Excel 的表格版式转 PDF；使用同一资源隔离和中文字体管线。 */
@Component
public final class PrintExcelPdfRenderer {
    private final PrintPdfRenderer pdf;
    public PrintExcelPdfRenderer(PrintPdfRenderer pdf) { this.pdf = pdf; }

    public byte[] render(byte[] filled, SysPrintTemplate template) {
        if (filled == null || filled.length == 0 || filled.length > 33554432) throw invalid();
        try (Workbook workbook = WorkbookFactory.create(new ByteArrayInputStream(filled))) {
            Document html = Document.createShell("");
            html.head().appendElement("style").text("table{border-collapse:collapse;table-layout:fixed;}"
                    + "td{white-space:pre-wrap;overflow-wrap:break-word;} .sheet{page-break-before:always;}");
            DataFormatter formatter = new DataFormatter(Locale.CHINA);
            FormulaEvaluator evaluator = workbook.getCreationHelper().createFormulaEvaluator();
            int cells = 0;
            int characters = 0;
            for (Sheet sheet : workbook) {
                if (workbook.isSheetHidden(workbook.getSheetIndex(sheet)) || workbook.isSheetVeryHidden(workbook.getSheetIndex(sheet))) continue;
                int columns = 0;
                for (Row row : sheet) columns = Math.max(columns, row.getLastCellNum());
                if (columns == 0) continue;
                if (sheet.getLastRowNum() >= 10000 || columns > 1000) throw invalid();
                Element section = html.body().appendElement("div");
                if (html.body().childrenSize() > 1) section.addClass("sheet");
                Element table = section.appendElement("table");
                Element columnGroup = table.appendElement("colgroup");
                for (int column = 0; column < columns; column++) {
                    if (!sheet.isColumnHidden(column)) columnGroup.appendElement("col")
                            .attr("style", "width:" + sheet.getColumnWidthInPixels(column) * 0.75 + "pt;");
                }
                Map<Long, CellRangeAddress> merged = new HashMap<>();
                for (CellRangeAddress area : sheet.getMergedRegions()) {
                    for (int row = area.getFirstRow(); row <= area.getLastRow(); row++) {
                        for (int column = area.getFirstColumn(); column <= area.getLastColumn(); column++) {
                            if (merged.size() >= 200000) throw invalid();
                            merged.put(key(row, column), area);
                        }
                    }
                }
                for (int rowIndex = sheet.getFirstRowNum(); rowIndex <= sheet.getLastRowNum(); rowIndex++) {
                    Row row = sheet.getRow(rowIndex);
                    if (row != null && row.getZeroHeight()) continue;
                    Element line = table.appendElement("tr").attr("style", "height:"
                            + (row == null ? sheet.getDefaultRowHeightInPoints() : row.getHeightInPoints()) + "pt;");
                    for (int column = 0; column < columns; column++) {
                        if (++cells > 200000) throw invalid();
                        if (sheet.isColumnHidden(column)) continue;
                        CellRangeAddress area = merged.get(key(rowIndex, column));
                        if (area != null && (area.getFirstRow() != rowIndex || area.getFirstColumn() != column)) continue;
                        Element target = line.appendElement("td");
                        if (area != null) target.attr("rowspan", Integer.toString(area.getLastRow() - rowIndex + 1))
                                .attr("colspan", Integer.toString(area.getLastColumn() - column + 1));
                        Cell cell = row == null ? null : row.getCell(column);
                        if (cell != null) {
                            String value = formatter.formatCellValue(cell, evaluator);
                            String style = style(workbook, cell.getCellStyle());
                            characters += value.length() + style.length() + 128;
                            if (characters > 4194304) throw invalid();
                            target.text(value).attr("style", style);
                        }
                    }
                }
            }
            return pdf.render(html.outerHtml(), template);
        } catch (ServiceException failure) { throw failure; }
        catch (IOException | RuntimeException failure) { throw invalid(); }
    }

    private static String style(Workbook workbook, CellStyle style) {
        Font font = workbook.getFontAt(style.getFontIndexAsInt());
        StringBuilder css = new StringBuilder("font-size:").append(font.getFontHeightInPoints()).append("pt;");
        if (font.getBold()) css.append("font-weight:bold;");
        if (font.getItalic()) css.append("font-style:italic;");
        css.append("text-align:").append(switch (style.getAlignment()) {
            case CENTER, CENTER_SELECTION -> "center";
            case RIGHT -> "right";
            case JUSTIFY, DISTRIBUTED -> "justify";
            default -> "left";
        }).append(';');
        css.append("vertical-align:").append(switch (style.getVerticalAlignment()) {
            case TOP -> "top";
            case BOTTOM -> "bottom";
            default -> "middle";
        }).append(';');
        if (style.getFillPattern() == FillPatternType.SOLID_FOREGROUND) {
            String color = color(style.getFillForegroundColorColor());
            if (color != null) css.append("background-color:").append(color).append(';');
        }
        Color fontColor = font instanceof XSSFFont xssf ? xssf.getXSSFColor()
                : ((HSSFWorkbook) workbook).getCustomPalette().getColor(font.getColor());
        String textColor = color(fontColor);
        if (textColor != null) css.append("color:").append(textColor).append(';');
        border(css, "top", style.getBorderTop()); border(css, "bottom", style.getBorderBottom());
        border(css, "left", style.getBorderLeft()); border(css, "right", style.getBorderRight());
        return css.toString();
    }

    private static void border(StringBuilder css, String side, BorderStyle style) {
        if (style != BorderStyle.NONE) css.append("border-").append(side).append(":1px ")
                .append(style == BorderStyle.DOUBLE ? "double" : style == BorderStyle.DASHED ? "dashed" : "solid").append(" #222;");
    }

    private static String color(Color value) {
        byte[] rgb = value instanceof XSSFColor xssf ? xssf.getRGB() : null;
        if (rgb != null && rgb.length >= 3) return String.format(Locale.ROOT, "#%02x%02x%02x", rgb[0] & 255, rgb[1] & 255, rgb[2] & 255);
        if (value instanceof org.apache.poi.hssf.util.HSSFColor hssf) {
            short[] triplet = hssf.getTriplet();
            return String.format(Locale.ROOT, "#%02x%02x%02x", triplet[0], triplet[1], triplet[2]);
        }
        return null;
    }

    private static long key(int row, int column) { return ((long) row << 32) | column; }
    private static ServiceException invalid() { return new ServiceException("Excel 转 PDF 失败，请检查表格大小、公式及版式", 400); }
}
