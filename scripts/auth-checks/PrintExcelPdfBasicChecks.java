package com.cloudflow.auth.checks;

import com.cloudflow.auth.domain.SysPrintTemplate;
import com.cloudflow.auth.printing.PrintExcelPdfRenderer;
import com.cloudflow.auth.printing.PrintExcelRenderer;
import com.cloudflow.auth.printing.PrintPdfRenderer;
import com.cloudflow.auth.printing.PrintTemplateRenderer;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.List;
import java.util.Map;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.poi.hssf.usermodel.HSSFWorkbook;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.util.CellRangeAddress;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;

public final class PrintExcelPdfBasicChecks {
    public static void main(String[] arguments) throws IOException {
        PrintExcelRenderer excel = new PrintExcelRenderer(new PrintTemplateRenderer());
        PrintExcelPdfRenderer pdf = new PrintExcelPdfRenderer(new PrintPdfRenderer());
        SysPrintTemplate paper = new SysPrintTemplate();
        paper.setPaperSize("A4");
        int checks = 0;
        for (boolean xlsx : List.of(false, true)) {
            byte[] source;
            try (Workbook workbook = xlsx ? new XSSFWorkbook() : new HSSFWorkbook();
                 ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                Sheet sheet = workbook.createSheet("采购");
                sheet.createRow(0).createCell(0).setCellValue("采购单：{{company}}");
                sheet.addMergedRegion(new CellRangeAddress(0, 0, 0, 2));
                Row row = sheet.createRow(1);
                row.createCell(0).setCellValue("{{#items}}{{name}}");
                row.createCell(1).setCellValue("{{price}}");
                row.createCell(2).setCellFormula("B2*2");
                sheet.createRow(2).createCell(1).setCellFormula("SUM(B2:B2)");
                workbook.createSheet("隐藏").createRow(0).createCell(0).setCellValue("隐藏信息");
                workbook.setSheetHidden(1, true);
                workbook.write(output);
                source = output.toByteArray();
            }
            byte[] filled = excel.render(source, Map.of("company", "研发<&>", "items", List.of(
                    Map.of("name", "办公椅", "price", 12), Map.of("name", "办公桌", "price", 9))));
            try (PDDocument document = PDDocument.load(pdf.render(filled, paper))) {
                String content = new PDFTextStripper().getText(document);
                if (!content.contains("采购单") || !content.contains("办公桌") || !content.contains("研发<&>")) {
                    throw new AssertionError("Excel 转 PDF 文字及中文");
                }
                checks++;
                if (!content.contains("24") || !content.contains("18") || !content.contains("21")) {
                    throw new AssertionError("PDF 复制公式和合计计算");
                }
                checks++;
                if (content.contains("隐藏信息")) throw new AssertionError("隐藏表不打印");
                checks++;
            }
        }
        System.out.println("PrintExcelPdfBasicChecks PASS checks=" + checks);
    }
}
