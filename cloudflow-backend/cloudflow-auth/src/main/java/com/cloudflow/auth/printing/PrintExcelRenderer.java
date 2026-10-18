package com.cloudflow.auth.printing;

import com.cloudflow.common.core.exception.ServiceException;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.apache.poi.hssf.usermodel.HSSFEvaluationWorkbook;
import org.apache.poi.hssf.usermodel.HSSFWorkbook;
import org.apache.poi.ss.formula.FormulaParser;
import org.apache.poi.ss.formula.FormulaParsingWorkbook;
import org.apache.poi.ss.formula.FormulaRenderer;
import org.apache.poi.ss.formula.FormulaRenderingWorkbook;
import org.apache.poi.ss.formula.FormulaShifter;
import org.apache.poi.ss.formula.FormulaType;
import org.apache.poi.ss.formula.ptg.Ptg;
import org.apache.poi.ss.formula.ptg.AreaPtg;
import org.apache.poi.ss.formula.ptg.AreaPtgBase;
import org.apache.poi.ss.formula.ptg.IntPtg;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellType;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.usermodel.WorkbookFactory;
import org.apache.poi.ss.util.CellRangeAddress;
import org.apache.poi.xssf.usermodel.XSSFEvaluationWorkbook;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Component;

/** G5 xls/xlsx 填充；{{#items}} 所在行按数组展开，标记可与该行字段位于同一单元格。 */
@Component
public final class PrintExcelRenderer {
    private static final Pattern LOOP = Pattern.compile("\\{\\{#([\\p{L}_][\\p{L}\\p{N}_]*(?:\\.[\\p{L}_][\\p{L}\\p{N}_]*)*)}}\\s*");
    private static final Pattern SINGLE = Pattern.compile("\\{\\{\\s*((?:@root\\.|this\\.)?[\\p{L}_][\\p{L}\\p{N}_]*(?:\\.[\\p{L}_][\\p{L}\\p{N}_]*)*|this|@index|@first|@last)\\s*}}");
    private static final int MAX_ROWS = 10000;
    private static final int MAX_CELLS = 200000;
    private final PrintTemplateRenderer textRenderer;

    public PrintExcelRenderer(PrintTemplateRenderer textRenderer) { this.textRenderer = textRenderer; }

    public byte[] render(byte[] source, Map<String, Object> supplied) {
        if (source == null || source.length == 0 || source.length > 10485760) {
            throw new ServiceException("Excel 模板不能为空且不能超过10485760字节", 400);
        }
        Map<String, Object> data = supplied == null ? Map.of() : supplied;
        // 即使模板没有变量也校验数据，禁止实体对象绕过受限输入边界。
        PrintTemplateRenderer.TextContext context = textRenderer.prepareText(data);
        try (Workbook workbook = WorkbookFactory.create(new ByteArrayInputStream(source));
             LimitedOutput output = new LimitedOutput()) {
            int cellCount = 0;
            for (Sheet sheet : workbook) {
                if (sheet.getLastRowNum() >= MAX_ROWS) throw invalid("Excel 模板不能超过10000行");
                for (Row row : sheet) { cellCount += row.getPhysicalNumberOfCells(); }
            }
            if (cellCount > MAX_CELLS) throw invalid("Excel 模板不能超过200000个单元格");
            FillBudget budget = new FillBudget();
            for (Sheet sheet : workbook) fill(sheet, data, context, budget);
            workbook.setForceFormulaRecalculation(true);
            workbook.write(output);
            return output.toByteArray();
        } catch (ServiceException failure) { throw failure; }
        catch (IOException | RuntimeException failure) {
            throw invalid("Excel 填充失败，请检查模板、字段类型及公式");
        }
    }

    private void fill(Sheet sheet, Map<String, Object> data, PrintTemplateRenderer.TextContext context, FillBudget budget) {
        int rowIndex = 0;
        while (rowIndex <= sheet.getLastRowNum()) {
            Row row = sheet.getRow(rowIndex);
            if (row == null) { rowIndex++; continue; }
            String collection = null;
            for (Cell cell : row) {
                if (cell.getCellType() != CellType.STRING) continue;
                Matcher marker = LOOP.matcher(cell.getStringCellValue());
                while (marker.find()) {
                    if (collection != null && !collection.equals(marker.group(1))) throw invalid("同一模板行只能引用一个子表");
                    collection = marker.group(1);
                }
            }
            if (collection == null) { fillRow(row, data, context, null, null, -1, 0, budget); rowIndex++; continue; }
            Object selected = resolve(collection, data, null, -1, 0);
            List<?> items = selected == null ? List.of() : selected instanceof List<?> list ? list : null;
            if (items == null) throw invalid("Excel 子表变量须为数组");
            int count = items.size();
            if (count > MAX_ROWS || sheet.getLastRowNum() + count - 1 >= MAX_ROWS) throw invalid("Excel 展开后不能超过10000行");
            List<CellRangeAddress> merges = rowMerges(sheet, rowIndex);
            if (count == 0) {
                expandSummaryRanges(sheet, rowIndex, 0);
                for (int index = sheet.getNumMergedRegions() - 1; index >= 0; index--) {
                    if (sheet.getMergedRegion(index).getFirstRow() == rowIndex) sheet.removeMergedRegion(index);
                }
                int last = sheet.getLastRowNum();
                sheet.removeRow(row);
                if (rowIndex < last) {
                    sheet.shiftRows(rowIndex + 1, last, -1);
                    Row vacated = sheet.getRow(last);
                    if (vacated != null) sheet.removeRow(vacated);
                }
                continue;
            }
            if (count > 1 && rowIndex < sheet.getLastRowNum()) sheet.shiftRows(rowIndex + 1, sheet.getLastRowNum(), count - 1);
            // 先复制原模板再填值，公式通过 POI 平移相对引用，绝对引用保持。
            for (int offset = 1; offset < count; offset++) {
                Row copy = sheet.createRow(rowIndex + offset);
                copyRow(row, copy);
                for (CellRangeAddress merge : merges) sheet.addMergedRegion(new CellRangeAddress(
                        rowIndex + offset, rowIndex + offset, merge.getFirstColumn(), merge.getLastColumn()));
            }
            if (count > 1) expandSummaryRanges(sheet, rowIndex, count);
            for (int offset = 0; offset < count; offset++) {
                fillRow(sheet.getRow(rowIndex + offset), data, context, collection, items.get(offset), offset, count, budget);
            }
            rowIndex += count;
        }
    }

    private List<CellRangeAddress> rowMerges(Sheet sheet, int rowIndex) {
        List<CellRangeAddress> result = new ArrayList<>();
        for (CellRangeAddress merge : sheet.getMergedRegions()) {
            if (merge.getFirstRow() <= rowIndex && merge.getLastRow() >= rowIndex) {
                if (merge.getFirstRow() != merge.getLastRow()) throw invalid("子表模板行不能跨行合并，请仅合并同行单元格");
                result.add(merge.copy());
            }
        }
        return result;
    }

    private void copyRow(Row source, Row destination) {
        destination.setHeight(source.getHeight());
        destination.setZeroHeight(source.getZeroHeight());
        if (source.isFormatted()) destination.setRowStyle(source.getRowStyle());
        Sheet sheet = source.getSheet();
        Workbook workbook = sheet.getWorkbook();
        int sheetIndex = workbook.getSheetIndex(sheet);
        FormulaParsingWorkbook parsing;
        FormulaRenderingWorkbook rendering;
        if (workbook instanceof XSSFWorkbook xssf) {
            XSSFEvaluationWorkbook model = XSSFEvaluationWorkbook.create(xssf); parsing = model; rendering = model;
        } else {
            HSSFEvaluationWorkbook model = HSSFEvaluationWorkbook.create((HSSFWorkbook) workbook); parsing = model; rendering = model;
        }
        FormulaShifter shifter = FormulaShifter.createForRowCopy(sheetIndex, sheet.getSheetName(), source.getRowNum(),
                source.getRowNum(), destination.getRowNum() - source.getRowNum(), workbook.getSpreadsheetVersion());
        for (Cell cell : source) {
            Cell next = destination.createCell(cell.getColumnIndex(), cell.getCellType());
            next.setCellStyle(cell.getCellStyle());
            switch (cell.getCellType()) {
                case STRING -> next.setCellValue(cell.getRichStringCellValue());
                case NUMERIC -> next.setCellValue(cell.getNumericCellValue());
                case BOOLEAN -> next.setCellValue(cell.getBooleanCellValue());
                case ERROR -> next.setCellErrorValue(cell.getErrorCellValue());
                case FORMULA -> {
                    Ptg[] tokens = FormulaParser.parse(cell.getCellFormula(), parsing, FormulaType.CELL, sheetIndex, source.getRowNum());
                    shifter.adjustFormula(tokens, sheetIndex);
                    next.setCellFormula(FormulaRenderer.toFormulaString(rendering, tokens));
                }
                default -> next.setBlank();
            }
        }
    }

    private void expandSummaryRanges(Sheet sheet, int first, int count) {
        Workbook workbook = sheet.getWorkbook();
        FormulaParsingWorkbook parsing;
        FormulaRenderingWorkbook rendering;
        if (workbook instanceof XSSFWorkbook xssf) {
            XSSFEvaluationWorkbook model = XSSFEvaluationWorkbook.create(xssf); parsing = model; rendering = model;
        } else {
            HSSFEvaluationWorkbook model = HSSFEvaluationWorkbook.create((HSSFWorkbook) workbook); parsing = model; rendering = model;
        }
        int sheetIndex = workbook.getSheetIndex(sheet);
        for (Row row : sheet) {
            if (row.getRowNum() >= first && row.getRowNum() < first + count) continue;
            for (Cell cell : row) {
                if (cell.getCellType() != CellType.FORMULA) continue;
                Ptg[] tokens = FormulaParser.parse(cell.getCellFormula(), parsing, FormulaType.CELL, sheetIndex, row.getRowNum());
                boolean changed = false;
                for (int tokenIndex = 0; tokenIndex < tokens.length; tokenIndex++) {
                    Ptg token = tokens[tokenIndex];
                    // 未指定工作表的汇总区域以模板行为末行时，随明细展开扩展到最后一行。
                    if (token instanceof AreaPtg && token instanceof AreaPtgBase area
                            && area.getFirstRow() <= first && area.getLastRow() == first) {
                        if (count == 0 && area.getFirstRow() == first) tokens[tokenIndex] = new IntPtg(0);
                        else area.setLastRow(first + count - 1);
                        changed = true;
                    }
                }
                if (changed) cell.setCellFormula(FormulaRenderer.toFormulaString(rendering, tokens));
            }
        }
    }

    private void fillRow(Row row, Map<String, Object> root, PrintTemplateRenderer.TextContext context,
                         String collection, Object item, int index, int count, FillBudget budget) {
        for (Cell cell : row) {
            if (++budget.cells > MAX_CELLS) throw invalid("Excel 填充不能超过200000个单元格");
            if (cell.getCellType() != CellType.STRING) continue;
            String content = LOOP.matcher(cell.getStringCellValue()).replaceAll("");
            if (!content.contains("{{")) { if (!content.equals(cell.getStringCellValue())) setValue(cell, content); continue; }
            Matcher single = SINGLE.matcher(content);
            if (single.matches()) {
                String expression = single.group(1);
                // 由正式语法解析器校验字段名称，再保留单值的数字/日期/布尔类型。
                PrintTemplateSyntax.compileRow("{{" + expression + "}}", index, count);
                setValue(cell, resolve(expression, root, item, index, count));
            } else {
                String value = context.render(content, collection, index, count);
                if (value.length() > 32767) throw invalid("Excel 单元格内容不能超过32767个字符");
                setValue(cell, value);
            }
        }
    }

    private static Object resolve(String expression, Map<String, Object> root, Object item, int index, int count) {
        if (expression.equals("@index")) { if (index < 0) throw invalid("循环序号只能用于子表行"); return index; }
        if (expression.equals("@first")) { if (index < 0) throw invalid("循环标记只能用于子表行"); return index == 0; }
        if (expression.equals("@last")) { if (index < 0) throw invalid("循环标记只能用于子表行"); return index == count - 1; }
        boolean fromRoot = expression.startsWith("@root.");
        String path = fromRoot ? expression.substring(6) : expression.startsWith("this.") ? expression.substring(5) : expression;
        Object current = fromRoot || index < 0 ? root : item;
        if (path.equals("this")) return current;
        for (String key : path.split("\\.")) {
            if (key.equals("class") || key.equals("getClass") || key.equals("classLoader")) throw invalid("不支持对象类型字段");
            if (!(current instanceof Map<?, ?> fields)) return null;
            current = fields.get(key);
        }
        return current;
    }

    private static void setValue(Cell cell, Object value) {
        // 上传的 xlsx 可能使用 inlineStr；先清空旧字符串结构，避免新值与旧占位符并存。
        // setBlank 保留样式，后续赋值按业务值重新确定单元格类型。
        cell.setBlank();
        if (value == null) return;
        if (value instanceof Number number) {
            BigDecimal decimal = new BigDecimal(number.toString());
            // Excel 数字保留15位有效数字，超过时按原精度文本写入。
            if (decimal.precision() <= 15) cell.setCellValue(decimal.doubleValue());
            else cell.setCellValue(decimal.toPlainString());
        } else if (value instanceof Boolean flag) cell.setCellValue(flag);
        else if (value instanceof Date date) cell.setCellValue(date);
        else if (value instanceof LocalDate date) cell.setCellValue(date);
        else if (value instanceof LocalDateTime date) cell.setCellValue(date);
        else if (value instanceof String || value instanceof Character) {
            String text = value.toString();
            if (text.length() > 32767) throw invalid("Excel 单元格内容不能超过32767个字符");
            cell.setCellValue(text);
        } else throw invalid("Excel 单元格仅支持基础值和日期");
    }

    private static ServiceException invalid(String message) { return new ServiceException(message, 400); }
    private static final class FillBudget { private int cells; }

    private static final class LimitedOutput extends ByteArrayOutputStream {
        @Override public synchronized void write(int value) {
            check(1);
            super.write(value);
        }
        @Override public synchronized void write(byte[] value, int offset, int length) {
            check(length);
            super.write(value, offset, length);
        }
        private void check(int length) {
            if (length > 33554432 - count) throw invalid("Excel 输出超过33554432字节");
        }
    }
}
