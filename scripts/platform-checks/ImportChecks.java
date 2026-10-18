package com.cloudflow.common.excel.importing;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.excel.importing.model.ImportErrorRecord;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import lombok.Data;
import org.apache.poi.hssf.usermodel.HSSFWorkbook;
import org.apache.poi.ss.usermodel.IndexedColors;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.streaming.SXSSFRow;
import org.apache.poi.xssf.streaming.SXSSFSheet;
import org.apache.poi.xssf.streaming.SXSSFWorkbook;
import org.apache.poi.xssf.usermodel.XSSFSheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;

public class ImportChecks {
    private static final ImportSpreadsheets SHEETS = new ImportSpreadsheets();
    private static final ImportValidatorChain VALIDATOR = new ImportValidatorChain(new ObjectMapper().registerModule(new JavaTimeModule()));
    private static int checks;
    private static final List<String> labels = new ArrayList<>();

    public static void main(String[] arguments) throws Exception {
        Path directory = Path.of(arguments.length > 1 ? arguments[1] : "target/batch-g-import-checks").toAbsolutePath().normalize();
        Files.createDirectories(directory);
        if (arguments.length > 0 && "stream".equals(arguments[0])) {
            streaming(directory);
        } else {
            validation();
            registry();
            templates(directory);
            files(directory);
        }
        new ObjectMapper().writeValue(directory.resolve(arguments.length > 0 && "stream".equals(arguments[0]) ? "stream-results.json" : "results.json").toFile(), Map.of("checks", checks, "passed", labels));
        System.out.println("Batch G import checks passed: " + checks);
    }

    private static void validation() {
        Definition definition = new Definition(10000);
        ImportContext context = context();
        check(context.resolve("DEPARTMENT", "财务部").equals(3L), "reference name resolves real identifier from request cache");
        rejects(() -> context.resolve("DEPARTMENT", "研发部"), "ambiguous reference names require a code");
        check(context.resolve("DEPARTMENT", "D2").equals(2L), "reference code disambiguates duplicate names");
        context.addReferences("PRIORITY", List.of(new ImportReference("同名", "其他", 1L), new ImportReference("X", "同名", 2L)));
        check(context.resolve("PRIORITY", "同名").equals(1L), "reference code takes precedence over name");
        check(convert(definition, Map.of("name", "姓名")).errors().stream().anyMatch(error -> "REQUIRED".equals(error.errorType())), "required validation");
        check(has(definition, "email", "bad-email", "FORMAT"), "email format validation");
        check(has(definition, "phone", "123456", "FORMAT"), "mobile format validation");
        check(has(definition, "idCard", "110105194912310020", "FORMAT"), "identity checksum validation");
        check(has(definition, "date", "2026-02-30", "FORMAT"), "calendar date parsing rejects impossible date");
        check(has(definition, "amount", "-1", "RANGE"), "numeric minimum validation");
        check(has(definition, "amount", "101", "RANGE"), "numeric maximum validation");
        check(has(definition, "name", "字".repeat(21), "RANGE"), "character length validation");
        check(has(definition, "departmentId", "不存在", "REFERENCE"), "missing reference validation");
        check(has(definition, "departmentId", "研发部", "REFERENCE"), "ambiguous cell is a reference error");
        ImportRow<SampleRow> valid = convert(definition, valid("OK"));
        check(valid.errors().isEmpty() && valid.value().getDepartmentId() == 3L, "valid row converts dates numbers and reference ids");
        Map<String, String> injected = valid("INJECT");
        injected.put("tenantId", "100001");
        check(convert(definition, injected).value().getTenantId() == null, "undeclared tenant field cannot be assigned");
        List<ImportRow<SampleRow>> duplicates = List.of(convert(definition, valid("Repeated")), convert(definition, valid("repeated")), convert(definition, valid("DB_EXISTS")));
        definition.validateCalls = 0;
        VALIDATOR.validateBatch(definition, definition, duplicates, context());
        check(definition.validateCalls == 1, "database duplicate lookup is one call per batch");
        check(duplicates.get(1).errors().stream().anyMatch(error -> "DUPLICATE".equals(error.errorType())), "file duplicates follow case insensitive key semantics");
        check(duplicates.get(2).errors().stream().anyMatch(error -> "DUPLICATE".equals(error.errorType())), "database duplicate keys rejected");
        Map<String, String> restricted = valid("BUSINESS");
        restricted.put("amount", "95");
        ImportRow<SampleRow> business = convert(definition, restricted);
        VALIDATOR.validateBatch(definition, definition, List.of(business), context());
        check(business.errors().stream().anyMatch(error -> "BUSINESS".equals(error.errorType())), "business validation delegates to handler");
        Definition multi = new Definition(10000) {
            @Override public List<List<String>> uniqueKeys() { return List.of(List.of("code"), List.of("email")); }
        };
        List<ImportRow<SampleRow>> sameEmail = List.of(convert(multi, valid("FIRST")), convert(multi, valid("SECOND")));
        VALIDATOR.validateBatch(multi, multi, sameEmail, context());
        check(sameEmail.get(1).errors().stream().anyMatch(error -> "邮箱".equals(error.columnName()) && "DUPLICATE".equals(error.errorType())), "independent unique constraints checked separately");
        check(!ImportKeys.forFields(List.of("code"), "same").equals(ImportKeys.forFields(List.of("email"), "same")), "unique key namespaces do not collide");
        check(!ImportKeys.of("ab", "c").equals(ImportKeys.of("a", "bc")), "composite keys preserve value boundaries");
    }

    private static void registry() {
        Definition definition = new Definition(10000);
        ImportRegistry registry = new ImportRegistry(List.of(definition), List.of(definition));
        UserContext.setPermissions(Set.of());
        try {
            rejects(() -> registry.require("CHECK"), "business import permission required");
            UserContext.setPermissions(Set.of(definition.permission()));
            check(registry.require("CHECK") == definition && registry.available().size() == 1, "two interfaces register an additional business without framework changes");
            rejects(() -> registry.require("UNKNOWN"), "unregistered business is denied");
            rejects(() -> new ImportRegistry(List.of(definition, definition), List.of(definition)), "duplicate definitions fail registration");
            rejects(() -> new ImportRegistry(List.of(definition), List.of()), "unpaired definition fails registration");
        } finally { UserContext.clear(); }
    }

    private static void templates(Path directory) throws Exception {
        Definition definition = new Definition(10000);
        ImportContext context = context();
        List<ImportReference> departments = new ArrayList<>();
        List<ImportReference> offices = new ArrayList<>();
        for (int index = 0; index < 601; index++) {
            departments.add(new ImportReference("D" + index, "部门" + index, (long) index + 1));
            offices.add(new ImportReference("P" + index, "岗位" + index, (long) index + 1000));
        }
        context.addReferences("DEPARTMENT", departments);
        context.addReferences("OFFICE", offices);
        Path template = directory.resolve("template.xlsx");
        try (OutputStream output = Files.newOutputStream(template)) { SHEETS.template(definition, context, output); }
        try (XSSFWorkbook workbook = new XSSFWorkbook(template.toFile())) {
            check(workbook.getNumberOfSheets() == 4 && workbook.isSheetHidden(3), "template contains separate examples instructions and hidden choices");
            check("编码*".equals(workbook.getSheetAt(0).getRow(0).getCell(0).getStringCellValue()), "required Chinese template headers");
            check(workbook.getSheetAt(0).getRow(1) == null && workbook.getSheetAt(1).getRow(1) != null, "example row is not imported as business data");
            check("部门600".equals(workbook.getSheetAt(3).getRow(600).getCell(0).getStringCellValue())
                    && "岗位600".equals(workbook.getSheetAt(3).getRow(600).getCell(1).getStringCellValue()), "multiple reference columns over 200 rows remain stream writable");
            check(workbook.getSheetAt(0).getDataValidations().size() == 2, "reference choices are data validation lists");
            check("@".equals(workbook.getSheetAt(0).getColumnStyle(0).getDataFormatString()), "identifier columns use text formatting");
        }
        rejects(() -> SHEETS.prepare(new PathMultipartFile(template, "模板.xlsx"), definition), "unfilled template rejects empty data");
    }

    private static void files(Path directory) throws Exception {
        Definition definition = new Definition(10000);
        Path original = directory.resolve("original.xlsx");
        write(original, definition, 1, true);
        try (ImportSpreadsheets.PreparedUpload upload = SHEETS.prepare(new PathMultipartFile(original, "../../数据.exe"), definition)) {
            check(upload.rows() == 1 && upload.fileName().endsWith(".xlsx") && !upload.fileName().contains("/"), "file type comes from content and original filename is sanitized");
            List<ImportSpreadsheets.RawRow> rows = new ArrayList<>();
            SHEETS.scan(upload.path(), definition, ignored -> { }, row -> { rows.add(row); return true; });
            check(rows.get(0).rowNo() == 4 && rows.get(0).ordinal() == 1, "original spreadsheet row number survives empty rows");
            try {
                SHEETS.scan(upload.path(), definition, ignored -> { }, row -> { throw new IllegalStateException("CALLBACK_FAILURE"); });
                throw new AssertionError("callback exception was swallowed");
            } catch (IllegalStateException exception) {
                check("CALLBACK_FAILURE".equals(exception.getMessage()), "business callback failure is not misreported as corrupt spreadsheet");
            }
        }
        ImportErrorRecord error = new ImportErrorRecord();
        error.setRowNo(4); error.setColumnName("姓名"); error.setErrorType("BUSINESS"); error.setErrorMessage("请修正姓名");
        Path annotated = SHEETS.errors(original, definition, (first, last) -> first <= 4 && last >= 4 ? List.of(error) : List.of());
        try {
            Path corrected = directory.resolve("corrected.xlsx");
            try (XSSFWorkbook workbook = new XSSFWorkbook(annotated.toFile())) {
                XSSFSheet sheet = workbook.getSheetAt(0);
                check(sheet.getRow(3).getCell(1).getCellStyle().getFillForegroundColor() == IndexedColors.ROSE.getIndex(), "erroneous cell is highlighted red");
                check("错误说明".equals(sheet.getRow(0).getCell(definition.columns().size()).getStringCellValue())
                        && "请修正姓名".equals(sheet.getRow(3).getCell(definition.columns().size()).getStringCellValue()), "annotated file includes error explanation at original row");
                sheet.getRow(3).getCell(1).setBlank();
                sheet.getRow(3).getCell(1).setCellValue("修正姓名");
                try (OutputStream output = Files.newOutputStream(corrected)) { workbook.write(output); }
            }
            try (ImportSpreadsheets.PreparedUpload upload = SHEETS.prepare(new PathMultipartFile(corrected, "修正.xlsx"), definition)) {
                SHEETS.scan(upload.path(), definition, ignored -> { }, row -> {
                    check(!row.values().containsKey("错误说明") && "修正姓名".equals(row.values().get("name")), "corrected annotated file can be uploaded directly");
                    return true;
                });
            }
        } finally { Files.deleteIfExists(annotated); }
        Path csv = directory.resolve("rows.csv");
        Files.writeString(csv, "编码*,姓名*\nCSV001,\"含逗号,姓名\"\n", StandardCharsets.UTF_8);
        try (ImportSpreadsheets.PreparedUpload upload = SHEETS.prepare(new PathMultipartFile(csv, "数据.csv"), definition)) { check(upload.rows() == 1, "UTF-8 CSV quoted values read correctly"); }
        Path text = SHEETS.errors(csv, definition, (first, last) -> List.of(error));
        try { check(text.toString().endsWith(".txt") && Files.readString(text).contains("错误说明"), "CSV errors produce text checklist"); }
        finally { Files.deleteIfExists(text); }
        Path legacy = directory.resolve("legacy.xls");
        try (Workbook workbook = new HSSFWorkbook()) {
            Sheet sheet = workbook.createSheet("导入数据");
            sheet.createRow(0).createCell(0).setCellValue("编码*");
            sheet.getRow(0).createCell(1).setCellValue("姓名*");
            sheet.createRow(1).createCell(0).setCellValue("XLS001");
            sheet.getRow(1).createCell(1).setCellValue("旧格式");
            try (OutputStream output = Files.newOutputStream(legacy)) { workbook.write(output); }
        }
        try (ImportSpreadsheets.PreparedUpload upload = SHEETS.prepare(new PathMultipartFile(legacy, "旧格式.xls"), definition)) { check(upload.rows() == 1, "binary xls format is supported"); }
        Path executable = directory.resolve("spoof.xlsx");
        Files.write(executable, new byte[]{'M', 'Z', 0, 1, 2, 3});
        rejects(() -> SHEETS.prepare(new PathMultipartFile(executable, "伪装.xlsx"), definition), "executable renamed xlsx is rejected by content");
        Path tooMany = directory.resolve("10001.xlsx");
        write(tooMany, definition, 10001, false);
        rejects(() -> SHEETS.prepare(new PathMultipartFile(tooMany, "超行数.xlsx"), definition), "default 10001st data row is rejected");
        Path oversized = directory.resolve("oversized.csv");
        try (OutputStream output = Files.newOutputStream(oversized)) {
            byte[] buffer = new byte[8192];
            for (int index = 0; index < 1281; index++) output.write(buffer);
        }
        rejects(() -> SHEETS.prepare(new PathMultipartFile(oversized, "大文件.csv"), definition), "declared file size over 10 MiB is rejected");
        rejects(() -> SHEETS.prepare(new PathMultipartFile(oversized, "伪报大小.csv") { @Override public long getSize() { return 1; } }, definition), "streamed bytes enforce limit even when declared size is false");
    }

    private static void streaming(Path directory) throws Exception {
        Definition definition = new Definition(100000);
        Path source = directory.resolve("100000.xlsx");
        write(source, definition, 100000, false);
        check(new Definition(10000).maxRows() == 10000, "production default stays 10000 rows");
        try (ImportSpreadsheets.PreparedUpload upload = SHEETS.prepare(new PathMultipartFile(source, "十万行.xlsx"), definition)) {
            check(upload.rows() == 100000, "100000 rows read using bounded streaming listener");
        }
        check(Runtime.getRuntime().maxMemory() <= 64L * 1024 * 1024, "streaming process heap is limited to 64 MiB");
    }

    private static void write(Path target, Definition definition, int count, boolean blanks) throws IOException {
        SXSSFWorkbook workbook = new SXSSFWorkbook(100);
        workbook.setCompressTempFiles(true);
        try {
            SXSSFSheet sheet = workbook.createSheet("导入数据");
            SXSSFRow header = sheet.createRow(0);
            for (int column = 0; column < definition.columns().size(); column++) header.createCell(column).setCellValue(definition.columns().get(column).header());
            for (int index = 0; index < count; index++) {
                SXSSFRow row = sheet.createRow(index + (blanks ? 3 : 1));
                row.createCell(0).setCellValue("ROW" + index);
                row.createCell(1).setCellValue("示例姓名");
            }
            try (OutputStream output = Files.newOutputStream(target)) { workbook.write(output); }
        } finally { workbook.close(); workbook.dispose(); }
    }

    private static Map<String, String> valid(String code) {
        Map<String, String> values = new LinkedHashMap<>();
        values.put("code", code); values.put("name", "姓名"); values.put("email", "test@example.com");
        values.put("date", "2026-09-01"); values.put("amount", "42.50"); values.put("departmentId", "财务部");
        values.put("phone", "13800138000"); values.put("idCard", "11010519491231002X");
        return values;
    }

    private static ImportContext context() {
        ImportContext context = new ImportContext(100000L, 1L, "check");
        context.addReferences("DEPARTMENT", List.of(new ImportReference("D1", "研发部", 1L), new ImportReference("D2", "研发部", 2L), new ImportReference("D3", "财务部", 3L)));
        return context;
    }

    private static ImportRow<SampleRow> convert(Definition definition, Map<String, String> values) { return VALIDATOR.convert(definition, 2, 1, values, context()); }
    private static boolean has(Definition definition, String field, String value, String type) {
        Map<String, String> values = valid("CHECK"); values.put(field, value);
        return convert(definition, values).errors().stream().anyMatch(error -> type.equals(error.errorType()));
    }
    private static void check(boolean condition, String label) {
        if (!condition) throw new AssertionError(label);
        checks++; labels.add(label);
    }
    private static void rejects(Operation operation, String label) {
        try { operation.run(); }
        catch (Exception exception) { check(true, label); return; }
        throw new AssertionError(label);
    }
    private interface Operation { void run() throws Exception; }

    @Data
    public static class SampleRow {
        private String code;
        private String name;
        private String email;
        private LocalDate date;
        private BigDecimal amount;
        private Long departmentId;
        private Long officeId;
        private String phone;
        private String idCard;
        private Long tenantId;
    }

    public static class Definition implements ImportDefinition<SampleRow>, ImportHandler<SampleRow> {
        private final int maximum;
        int validateCalls;
        Definition(int maximum) { this.maximum = maximum; }
        @Override public String bizType() { return "CHECK"; }
        @Override public String bizName() { return "框架检查"; }
        @Override public String permission() { return "system:check:import"; }
        @Override public Class<SampleRow> rowClass() { return SampleRow.class; }
        @Override public int maxRows() { return maximum; }
        @Override public List<List<String>> uniqueKeys() { return List.of(List.of("code")); }
        @Override public List<ImportColumn> columns() {
            return List.of(ImportColumn.builder().field("code").name("编码").required(true).example("CODE001").build(),
                    ImportColumn.builder().field("name").name("姓名").required(true).maxLength(20).example("姓名").build(),
                    ImportColumn.builder().field("email").name("邮箱").type(ImportColumn.Type.EMAIL).build(),
                    ImportColumn.builder().field("date").name("日期").type(ImportColumn.Type.DATE).build(),
                    ImportColumn.builder().field("amount").name("金额").type(ImportColumn.Type.DECIMAL).minimum(BigDecimal.ZERO).maximum(BigDecimal.valueOf(100)).build(),
                    ImportColumn.builder().field("departmentId").name("部门").type(ImportColumn.Type.REFERENCE).reference("DEPARTMENT").build(),
                    ImportColumn.builder().field("officeId").name("岗位").type(ImportColumn.Type.REFERENCE).reference("OFFICE").build(),
                    ImportColumn.builder().field("phone").name("手机号").type(ImportColumn.Type.PHONE).build(),
                    ImportColumn.builder().field("idCard").name("身份证").type(ImportColumn.Type.ID_CARD).build());
        }
        @Override public Set<String> findExistingKeys(List<SampleRow> rows, ImportContext context) { validateCalls++; return Set.of(ImportKeys.forFields(List.of("code"), "DB_EXISTS")); }
        @Override public List<ImportError> validateRow(SampleRow row, int rowNo, ImportContext context) {
            return row.getAmount() != null && row.getAmount().compareTo(BigDecimal.valueOf(90)) > 0 ? List.of(new ImportError(rowNo, "金额", row.getAmount().toPlainString(), "BUSINESS", "业务上限为90")) : List.of();
        }
        @Override public void importRow(SampleRow row, int rowNo, ImportContext context) { throw new AssertionError("validation must not write business data"); }
    }
}
