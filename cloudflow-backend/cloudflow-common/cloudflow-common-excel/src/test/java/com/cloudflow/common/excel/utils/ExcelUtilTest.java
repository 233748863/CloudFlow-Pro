package com.cloudflow.common.excel.utils;

import cn.idev.excel.annotation.ExcelProperty;
import org.junit.jupiter.api.Test;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.usermodel.WorkbookFactory;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ExcelUtilTest {

    @Test
    void exportExcel_shouldGenerateValidXlsx_whenLongFieldContainsNullOrBigNumber() throws IOException {
        List<SampleExportRow> rows = List.of(
                new SampleExportRow(null, "空值行"),
                new SampleExportRow(9_007_199_254_740_992L, "大整数行")
        );

        ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
        ExcelUtil.exportExcel(rows, "测试导出", SampleExportRow.class, outputStream);

        byte[] bytes = outputStream.toByteArray();
        assertTrue(bytes.length > 0, "导出的 Excel 内容不能为空");
        try (Workbook workbook = WorkbookFactory.create(new ByteArrayInputStream(bytes))) {
            assertEquals(1, workbook.getNumberOfSheets(), "导出的工作簿应该只包含一个工作表");
            assertEquals("测试导出", workbook.getSheetAt(0).getSheetName(), "工作表名称应与导出名称一致");
        }
    }

    private record SampleExportRow(
            @ExcelProperty("编号") Long id,
            @ExcelProperty("名称") String name
    ) {
    }
}
