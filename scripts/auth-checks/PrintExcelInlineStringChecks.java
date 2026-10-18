package com.cloudflow.auth.checks;

import com.cloudflow.auth.printing.PrintExcelRenderer;
import com.cloudflow.auth.printing.PrintTemplateRenderer;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.List;
import java.util.Map;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.CellType;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.util.CellRangeAddress;
import org.apache.poi.xssf.usermodel.XSSFCell;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.openxmlformats.schemas.spreadsheetml.x2006.main.CTCell;
import org.openxmlformats.schemas.spreadsheetml.x2006.main.STCellType;

/** 仅复测上传模板的 inlineStr 替换缺陷及直接关联的类型、样式和公式。 */
public final class PrintExcelInlineStringChecks {
    private static int checks;

    public static void main(String[] arguments) throws IOException {
        byte[] source = template();
        try (XSSFWorkbook original = new XSSFWorkbook(new ByteArrayInputStream(source))) {
            expect(original.getSheetAt(0).getRow(0).getCell(0).getCTCell().getT() == STCellType.INLINE_STR,
                    "输入确实使用 inlineStr");
        }
        PrintExcelRenderer renderer = new PrintExcelRenderer(new PrintTemplateRenderer());
        byte[] result = renderer.render(source, Map.of("code", "CG202610180001", "items", List.of(
                Map.of("name", "纸张", "qty", 2, "price", 12.5, "active", true),
                Map.of("name", "墨盒", "qty", 3, "price", 24, "active", false))));
        try (XSSFWorkbook output = new XSSFWorkbook(new ByteArrayInputStream(result))) {
            Sheet sheet = output.getSheetAt(0);
            expect("CG202610180001".equals(sheet.getRow(0).getCell(0).getStringCellValue()), "首行单值文字替换");
            expect("单号:CG202610180001".equals(sheet.getRow(0).getCell(1).getStringCellValue()), "混合文字替换");
            for (int index = 0; index < 2; index++) {
                Row row = sheet.getRow(index + 1);
                expect((index == 0 ? "纸张" : "墨盒").equals(row.getCell(0).getStringCellValue()), "原行与复制行文字");
                expect(row.getCell(1).getCellType() == CellType.NUMERIC
                        && row.getCell(1).getNumericCellValue() == index + 2, "原行与复制行数字");
                expect(row.getCell(4).getCellType() == CellType.BOOLEAN
                        && row.getCell(4).getBooleanCellValue() == (index == 0), "原行与复制行布尔值");
                expect("备注".equals(row.getCell(5).getStringCellValue()), "纯循环标记移除");
                expect(row.getHeight() == 640 && "0.00".equals(row.getCell(2).getCellStyle().getDataFormatString()),
                        "行高与金额样式保留");
                expect(("B" + (index + 2) + "*C" + (index + 2) + "+$H$1").equals(row.getCell(3).getCellFormula()),
                        "相对引用平移、绝对引用保留");
                for (int column : List.of(0, 1, 2, 4, 5)) {
                    expect(!((XSSFCell) row.getCell(column)).getCTCell().isSetIs(), "替换后清除旧 inlineStr 原文");
                }
            }
            expect("SUM(D2:D3)".equals(sheet.getRow(3).getCell(3).getCellFormula()), "汇总范围随展开扩展");
            expect(sheet.getNumMergedRegions() == 2, "明细同行合并保留并复制");
        }
        System.out.println("PrintExcelInlineStringChecks PASS checks=" + checks);
    }

    private static byte[] template() throws IOException {
        try (XSSFWorkbook workbook = new XSSFWorkbook(); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            Sheet sheet = workbook.createSheet("采购");
            Row title = sheet.createRow(0);
            inline(title, 0, "{{code}}");
            inline(title, 1, "单号:{{code}}");
            title.createCell(7).setCellValue(1.1);
            Row detail = sheet.createRow(1);
            detail.setHeight((short) 640);
            inline(detail, 0, "{{#items}}{{name}}");
            inline(detail, 1, "{{qty}}");
            inline(detail, 2, "{{price}}");
            CellStyle money = workbook.createCellStyle();
            money.setDataFormat(workbook.createDataFormat().getFormat("0.00"));
            detail.getCell(2).setCellStyle(money);
            detail.createCell(3).setCellFormula("B2*C2+$H$1");
            inline(detail, 4, "{{active}}");
            inline(detail, 5, "{{#items}}备注");
            sheet.addMergedRegion(new CellRangeAddress(1, 1, 5, 6));
            sheet.createRow(2).createCell(3).setCellFormula("SUM(D2:D2)");
            workbook.write(output);
            return output.toByteArray();
        }
    }

    private static void inline(Row row, int column, String value) {
        XSSFCell cell = (XSSFCell) row.createCell(column);
        CTCell xml = cell.getCTCell();
        xml.setT(STCellType.INLINE_STR);
        xml.addNewIs().setT(value);
    }

    private static void expect(boolean passed, String description) {
        if (!passed) throw new AssertionError(description);
        checks++;
    }
}
