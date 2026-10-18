package com.cloudflow.auth.importing;

import com.cloudflow.auth.mapper.HolidayImportMapper;
import com.cloudflow.auth.service.HolidayManagementService;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.excel.importing.ImportColumn;
import com.cloudflow.common.excel.importing.ImportContext;
import com.cloudflow.common.excel.importing.ImportRow;
import com.cloudflow.common.excel.importing.ImportSpreadsheets;
import com.cloudflow.common.excel.importing.ImportValidatorChain;
import com.cloudflow.common.excel.importing.PathMultipartFile;
import com.cloudflow.common.excel.importing.model.ImportErrorRecord;
import com.cloudflow.common.holiday.domain.HolidayCalendar;
import com.cloudflow.common.holiday.domain.HolidayDate;
import com.cloudflow.common.holiday.mapper.HolidayCalendarMapper;
import com.cloudflow.common.holiday.mapper.HolidayDateMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.OutputStream;
import org.apache.poi.xssf.usermodel.XSSFRow;
import org.apache.poi.xssf.usermodel.XSSFSheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;

import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Proxy;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;

public final class HolidayImportChecks {
    private static int assertions;

    public static void main(String[] arguments) throws Exception {
        Path directory = Path.of(arguments.length == 0 ? ".cloudflow-runtime/holiday-import-checks" : arguments[0]);
        Files.createDirectories(directory);
        List<HolidayDate> written = new ArrayList<>();
        HolidayImport definition = definition(written);
        ImportContext context = new ImportContext(100001L, 21L, "HOLIDAY_IMPORT_CHECK");
        definition.prepare(context);
        ImportSpreadsheets sheets = new ImportSpreadsheets();
        ImportValidatorChain validator = new ImportValidatorChain(new ObjectMapper().findAndRegisterModules());
        Path template = directory.resolve("holiday-template.xlsx");
        try (OutputStream output = Files.newOutputStream(template)) { sheets.template(definition, context, output); }
        int flagIndex = definition.columns().stream().map(ImportColumn::getField).toList().indexOf("triplePayFlag");
        equal(true, flagIndex >= 0, "template declares triple-pay flag");
        try (XSSFWorkbook workbook = new XSSFWorkbook(template.toFile())) {
            equal("是否三倍工资日*", workbook.getSheetAt(0).getRow(0).getCell(flagIndex).getStringCellValue(), "template requires an explicit payroll flag");
            equal(true, workbook.getSheetAt(0).getDataValidations().stream().anyMatch(validation ->
                    validation.getRegions().getCellRangeAddresses()[0].getFirstColumn() == flagIndex), "payroll flag provides spreadsheet choices");
        }
        Path source = directory.resolve("holiday-2027.xlsx");
        write(source, definition);
        List<ImportRow<HolidayImport.Row>> rows = new ArrayList<>();
        try (ImportSpreadsheets.PreparedUpload upload = sheets.prepare(new PathMultipartFile(source, "holiday-2027.xlsx"), definition)) {
            equal(11, upload.rows(), "real workbook row count");
            sheets.scan(upload.path(), definition, unused -> { }, raw -> {
                rows.add(validator.convert(definition, raw.rowNo(), raw.ordinal(), raw.values(), context));
                return true;
            });
        }
        validator.validateBatch(definition, definition, rows, context);
        for (Map.Entry<Integer, String> expected : Map.of(4, "FORMAT", 5, "REFERENCE", 6, "DUPLICATE", 7, "REFERENCE",
                8, "REQUIRED", 9, "BUSINESS", 10, "REFERENCE", 12, "DUPLICATE").entrySet()) {
            ImportRow<HolidayImport.Row> row = rows.stream().filter(item -> item.rowNo() == expected.getKey()).findFirst().orElseThrow();
            equal(true, row.errors().stream().anyMatch(error -> error.errorType().equals(expected.getValue()) && error.rowNo() == row.rowNo()), "invalid workbook row retains source row " + row.rowNo());
        }
        UserContext.setTenantId(100001L);
        UserContext.setUserName("HOLIDAY_IMPORT_CHECK");
        try {
            for (ImportRow<HolidayImport.Row> row : rows) {
                if (row.errors().isEmpty()) definition.importRow(row.value(), row.rowNo(), context);
                else row.errors().forEach(error -> System.out.println("HOLIDAY_IMPORT_ERROR: row=" + error.rowNo()
                        + "; type=" + error.errorType() + "; column=" + error.columnName()));
            }
        } finally {
            UserContext.clear();
        }
        equal(3, written.size(), "only validated dates reach real management service");
        equal(List.of(0, 1, 0), written.stream().map(HolidayDate::getTriplePayFlag).toList(), "explicit no, yes and makeup flag survive conversion and persistence mapping");
        equal(List.of("HOLIDAY", "HOLIDAY", "WORKDAY"), written.stream().map(HolidayDate::getDateType).toList(), "date types survive full import handler");
        equal(true, written.stream().allMatch(row -> row.getYearNo() == 2027 && row.getTenantId() == 100001L && row.getCalendarId() == 77L), "calendar, year and tenant survive full import handler");
        List<ImportErrorRecord> errors = rows.stream().flatMap(row -> row.errors().stream()).map(error -> {
            ImportErrorRecord record = new ImportErrorRecord();
            record.setRowNo(error.rowNo()); record.setColumnName(error.columnName());
            record.setErrorType(error.errorType()); record.setErrorMessage(error.errorMessage());
            return record;
        }).toList();
        Path annotated = sheets.errors(source, definition, (first, last) -> errors.stream()
                .filter(error -> error.getRowNo() >= first && error.getRowNo() <= last).toList());
        try (XSSFWorkbook workbook = new XSSFWorkbook(annotated.toFile())) {
            int errorColumn = definition.columns().size();
            for (ImportErrorRecord error : errors) {
                equal(true, workbook.getSheetAt(0).getRow(error.getRowNo() - 1).getCell(errorColumn)
                        .getStringCellValue().contains(error.getErrorMessage()), "downloaded error workbook annotates original row " + error.getRowNo());
            }
            Files.copy(annotated, directory.resolve("holiday-errors.xlsx"), StandardCopyOption.REPLACE_EXISTING);
        } finally {
            Files.deleteIfExists(annotated);
        }
        System.out.println("HOLIDAY_IMPORT_CHECKS: assertions=" + assertions + "; failed=0; xlsx_rows=" + rows.size()
                + "; imported=" + written.size() + "; rejected=" + rows.stream().filter(row -> !row.errors().isEmpty()).count()
                + "; real_spreadsheet=true; real_validator=true; real_handler=true; real_management_service=true; database_fixture=true");
    }

    private static HolidayImport definition(List<HolidayDate> written) {
        HolidayCalendar calendar = new HolidayCalendar();
        calendar.setCalendarId(77L); calendar.setCalendarCode("CHECK_CALENDAR"); calendar.setCalendarName("验证日历");
        calendar.setTenantId(100001L); calendar.setStatus("ENABLED");
        HolidayCalendarMapper calendars = proxy(HolidayCalendarMapper.class, (instance, method, arguments) -> switch (method.getName()) {
            case "selectList" -> List.of(calendar);
            case "selectOne" -> calendar;
            default -> throw new UnsupportedOperationException(method.getName());
        });
        HolidayDate existing = new HolidayDate(); existing.setCalendarId(77L); existing.setHolidayDate(LocalDate.of(2027, 12, 31));
        HolidayImportMapper imports = proxy(HolidayImportMapper.class, (instance, method, arguments) -> List.of(existing));
        HolidayDateMapper dates = proxy(HolidayDateMapper.class, (instance, method, arguments) -> {
            if (!method.getName().equals("insert")) throw new UnsupportedOperationException(method.getName());
            written.add((HolidayDate) arguments[0]);
            return 1;
        });
        HolidayManagementService management = new HolidayManagementService(calendars, dates, null, null, null);
        return new HolidayImport(calendars, imports, management);
    }

    private static void write(Path path, HolidayImport definition) throws Exception {
        List<List<String>> values = List.of(
                List.of("CHECK_CALENDAR", "2027-01-01", "HOLIDAY", "显式非三倍", "0", "2027", "验证样本"),
                List.of("CHECK_CALENDAR", "2027-01-02", "HOLIDAY", "显式三倍", "是", "2027", "验证样本"),
                List.of("CHECK_CALENDAR", "2027-02-30", "HOLIDAY", "错误日期", "1", "2027", ""),
                List.of("CHECK_CALENDAR", "2027-02-01", "BAD_TYPE", "错误类型", "0", "2027", ""),
                List.of("CHECK_CALENDAR", "2027-01-01", "REST", "文件重复", "0", "2027", ""),
                List.of("CHECK_CALENDAR", "2027-02-02", "HOLIDAY", "错误标记", "2", "2027", ""),
                List.of("CHECK_CALENDAR", "2027-02-03", "HOLIDAY", "缺少标记", "", "2027", ""),
                List.of("CHECK_CALENDAR", "2027-02-04", "HOLIDAY", "错误年份", "1", "2028", ""),
                List.of("ANOTHER_TENANT", "2027-02-05", "HOLIDAY", "不可见日历", "1", "2027", ""),
                List.of("CHECK_CALENDAR", "2027-01-03", "WORKDAY", "调休上班", "否", "2027", ""),
                List.of("CHECK_CALENDAR", "2027-12-31", "REST", "库内重复", "0", "2027", ""));
        try (XSSFWorkbook workbook = new XSSFWorkbook(); OutputStream output = Files.newOutputStream(path)) {
            XSSFSheet sheet = workbook.createSheet("导入数据");
            XSSFRow header = sheet.createRow(0);
            for (int column = 0; column < definition.columns().size(); column++) header.createCell(column).setCellValue(definition.columns().get(column).header());
            for (int index = 0; index < values.size(); index++) {
                XSSFRow row = sheet.createRow(index + 1);
                for (int column = 0; column < values.get(index).size(); column++) row.createCell(column).setCellValue(values.get(index).get(column));
            }
            workbook.write(output);
        }
    }

    private static void equal(Object expected, Object actual, String message) {
        assertions++;
        if (!Objects.equals(expected, actual)) throw new AssertionError(message + "; expected=" + expected + "; actual=" + actual);
    }

    @SuppressWarnings("unchecked")
    private static <Type> Type proxy(Class<Type> type, InvocationHandler handler) {
        return (Type) Proxy.newProxyInstance(type.getClassLoader(), new Class<?>[]{type}, handler);
    }
}
