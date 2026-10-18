package com.cloudflow.auth.checks;

import com.cloudflow.auth.printing.PrintExcelRenderer;
import com.cloudflow.auth.printing.PrintTemplateRenderer;
import com.cloudflow.common.core.exception.ServiceException;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import org.apache.poi.hssf.usermodel.HSSFWorkbook;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.CellType;
import org.apache.poi.ss.usermodel.FormulaEvaluator;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.usermodel.WorkbookFactory;
import org.apache.poi.ss.util.CellRangeAddress;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;

/** 只执行 Excel 填充基本流程和共享 HTML 入口的代表检查；文件仅在内存中生成。 */
public final class PrintExcelRendererBasicChecks {
    private static int checks;

    public static void main(String[] arguments) throws IOException {
        PrintTemplateRenderer text = new PrintTemplateRenderer();
        PrintExcelRenderer renderer = new PrintExcelRenderer(text);
        for (boolean xlsx : List.of(false, true)) {
            byte[] source = template(xlsx);
            Map<String, Object> data = Map.of("company", "研发<&>", "day", LocalDate.of(2026, 10, 17),
                    "code", "=1+1", "longId", new BigDecimal("12345678901234567"), "active", true,
                    "items", List.of(Map.of("name", "甲", "price", new BigDecimal("12.5"), "qty", 2),
                            Map.of("name", "乙", "price", new BigDecimal("7"), "qty", 3)));
            try (Workbook workbook = WorkbookFactory.create(new ByteArrayInputStream(renderer.render(source, data)))) {
                Sheet sheet = workbook.getSheetAt(0);
                Row first = sheet.getRow(2);
                Row second = sheet.getRow(3);
                expect("研发<&>".equals(sheet.getRow(0).getCell(0).getStringCellValue()), "文本保留原字符");
                expect(sheet.getRow(1).getCell(0).getCellType() == CellType.NUMERIC, "日期保持日期数值");
                expect(sheet.getRow(1).getCell(1).getBooleanCellValue(), "布尔类型");
                expect(sheet.getRow(1).getCell(2).getCellType() == CellType.STRING
                        && "=1+1".equals(sheet.getRow(1).getCell(2).getStringCellValue()), "业务文本不变成公式");
                expect("12345678901234567".equals(sheet.getRow(1).getCell(3).getStringCellValue()), "长数字精度保留");
                expect(first.getCell(0).getNumericCellValue() == 0 && second.getCell(0).getNumericCellValue() == 1,
                        "单值循环序号");
                expect("行1:乙 7.00 false/true 研发<&>".equals(second.getCell(1).getStringCellValue()),
                        "混合文本字段格式化和真实循环位置");
                expect("D4*C4+$J$1".equals(second.getCell(4).getCellFormula()), "复制公式相对和绝对引用");
                expect(first.getHeight() == second.getHeight() && second.getHeight() == 600
                        && first.getCell(3).getCellStyle().getIndex() == second.getCell(3).getCellStyle().getIndex(),
                        "行高和单元格样式");
                expect(sheet.getNumMergedRegions() == 2, "同行合并随明细复制");
                expect("SUM(D3:D4)".equals(sheet.getRow(4).getCell(3).getCellFormula()), "合计区域随展开扩展");
                FormulaEvaluator evaluator = workbook.getCreationHelper().createFormulaEvaluator();
                expect(evaluator.evaluate(sheet.getRow(4).getCell(3)).getNumberValue() == 19.5, "展开后合计数值");
            }
            try (Workbook empty = WorkbookFactory.create(new ByteArrayInputStream(renderer.render(source, Map.of("items", List.of()))))) {
                expect(empty.getSheetAt(0).getLastRowNum() == 2, "空明细删除模板行");
                expect("SUM(0)".equals(empty.getSheetAt(0).getRow(2).getCell(3).getCellFormula()), "空明细合计不循环引用");
            }
        }
        rejected(() -> renderer.render(null, Map.of()), "空模板");
        byte[] source = template(true);
        rejected(() -> renderer.render(source, Map.of("items", "错误类型")), "子表类型");
        rejected(() -> renderer.render(source, Map.of("items", List.of(), "entity", new Object())), "非受控业务对象");
        expect("&lt;&amp;&gt;".equals(text.render("{{value}}", Map.of("value", "<&>"))), "共享修改后 HTML 仍自动转义");
        rejected(() -> text.render("{{value.class}}", Map.of("value", "text")), "共享修改后类字段仍被拒绝");
        System.out.println("PrintExcelRendererBasicChecks PASS checks=" + checks);
    }

    private static byte[] template(boolean xlsx) throws IOException {
        try (Workbook workbook = xlsx ? new XSSFWorkbook() : new HSSFWorkbook();
             ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            Sheet sheet = workbook.createSheet("打印");
            Row title = sheet.createRow(0);
            title.createCell(0).setCellValue("{{company}}");
            title.createCell(9).setCellValue(1);
            Row typed = sheet.createRow(1);
            typed.createCell(0).setCellValue("{{day}}");
            typed.createCell(1).setCellValue("{{active}}");
            typed.createCell(2).setCellValue("{{code}}");
            typed.createCell(3).setCellValue("{{longId}}");
            Row detail = sheet.createRow(2);
            detail.setHeight((short) 600);
            detail.createCell(0).setCellValue("{{#items}}{{@index}}");
            detail.createCell(1).setCellValue("行{{@index}}:{{name}} {{formatAmount price}} {{@first}}/{{@last}} {{@root.company}}");
            detail.createCell(2).setCellValue("{{qty}}");
            detail.createCell(3).setCellValue("{{price}}");
            CellStyle style = workbook.createCellStyle();
            style.setDataFormat(workbook.createDataFormat().getFormat("#,##0.00"));
            detail.getCell(3).setCellStyle(style);
            detail.createCell(4).setCellFormula("D3*C3+$J$1");
            detail.createCell(5).setCellValue("保留合并");
            sheet.addMergedRegion(new CellRangeAddress(2, 2, 5, 6));
            sheet.createRow(3).createCell(3).setCellFormula("SUM(D3:D3)");
            workbook.write(output);
            return output.toByteArray();
        }
    }

    private static void expect(boolean passed, String description) {
        if (!passed) throw new AssertionError(description);
        checks++;
    }

    private static void rejected(Runnable action, String description) {
        try { action.run(); } catch (ServiceException expected) { checks++; return; }
        throw new AssertionError(description);
    }
}
