package com.cloudflow.auth.storage;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.extension.plugins.inner.TenantLineInnerInterceptor;
import com.cloudflow.auth.domain.SysFile;
import com.cloudflow.auth.controller.JobInnerReportController;
import com.cloudflow.auth.importing.HolidayImport;
import com.cloudflow.common.config.MybatisPlusConfig;
import com.cloudflow.common.core.utils.file.FileUploadUtils;
import com.cloudflow.common.core.utils.file.MimeTypeUtils;
import com.cloudflow.common.excel.importing.ImportContext;
import com.cloudflow.common.excel.importing.ImportReference;
import com.cloudflow.common.excel.importing.ImportValidatorChain;
import com.cloudflow.common.excel.importing.PathMultipartFile;
import com.cloudflow.common.job.model.BusinessJobStartRequest;
import com.cloudflow.common.security.annotation.Inner;
import com.cloudflow.common.tenant.TenantConfigProperties;
import com.cloudflow.common.tenant.TenantContext;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.apache.ibatis.builder.xml.XMLMapperBuilder;
import org.springframework.core.io.ClassPathResource;

public class ImportStorageBoundaryChecks {
    private static int checks;

    public static void main(String[] arguments) throws Exception {
        Path directory = Path.of(arguments[0]).resolve("storage-boundary");
        Files.createDirectories(directory);
        Path csv = directory.resolve("source.csv");
        Files.writeString(csv, "\uFEFF姓名,日期\r\n验收,2040-01-01\r\n", StandardCharsets.UTF_8);
        PathMultipartFile upload = new PathMultipartFile(csv, "source.csv");
        check(MimeTypeUtils.TEXT_CSV.equals(upload.getContentType()), "import CSV declares its actual MIME type");
        check("csv".equals(FileUploadUtils.validate(upload, 10485760, MimeTypeUtils.DEFAULT_ALLOWED_EXTENSION).extension()), "import CSV passes real shared storage validation");
        rejects(() -> FileUploadUtils.validate(upload, 10485760, new String[]{"xlsx"}), "explicit administrator extension restriction is respected");
        Path disguised = directory.resolve("disguised.csv");
        Files.writeString(disguised, "%PDF-1.4\nnot CSV", StandardCharsets.UTF_8);
        rejects(() -> FileUploadUtils.validate(new PathMultipartFile(disguised, "disguised.csv"), 10485760, MimeTypeUtils.DEFAULT_ALLOWED_EXTENSION), "binary signature cannot masquerade as CSV");
        Files.write(disguised, new byte[]{0, 1, 2, 3});
        rejects(() -> FileUploadUtils.validate(new PathMultipartFile(disguised, "disguised.csv"), 10485760, MimeTypeUtils.DEFAULT_ALLOWED_EXTENSION), "binary controls cannot masquerade as CSV");
        Path error = directory.resolve("errors.txt");
        Files.writeString(error, "第3行: 日期类型无效", StandardCharsets.UTF_8);
        check("txt".equals(FileUploadUtils.validate(new PathMultipartFile(error, "errors.txt"), 10485760, MimeTypeUtils.DEFAULT_ALLOWED_EXTENSION).extension()), "generated error text passes real shared storage validation");
        Path excel = directory.resolve("source.xlsx");
        try (XSSFWorkbook workbook = new XSSFWorkbook(); OutputStream output = Files.newOutputStream(excel)) {
            workbook.createSheet("导入").createRow(0).createCell(0).setCellValue("日期");
            workbook.write(output);
        }
        check("xlsx".equals(FileUploadUtils.validate(new PathMultipartFile(excel, "source.xlsx"), 10485760, MimeTypeUtils.DEFAULT_ALLOWED_EXTENSION).extension()), "Excel temporary wrapper preserves shared signature validation");
        HolidayImport definition = new HolidayImport(null, null, null);
        ImportContext context = new ImportContext(100000L, 990000701L, "integration");
        context.addReferences("CALENDAR", List.of(new ImportReference("G_CALENDAR", "验收日历", 1L)));
        ImportValidatorChain validator = new ImportValidatorChain(new ObjectMapper().registerModule(new JavaTimeModule()));
        Map<String, String> values = new LinkedHashMap<>(Map.of("calendarId", "G_CALENDAR", "holidayDate", "2040-01-01", "dateType", "HOLIDAY", "triplePayFlag", "1", "yearNo", "2040", "holidayName", "字".repeat(50), "remark", "字".repeat(200)));
        check(validator.convert(definition, 2, 1, values, context).errors().isEmpty(), "holiday fields accept exact database length limits");
        values.put("holidayName", "字".repeat(51));
        check(validator.convert(definition, 2, 1, values, context).errors().stream().anyMatch(failure -> "节假日名称".equals(failure.columnName()) && "RANGE".equals(failure.errorType())), "holiday name overflow is rejected before execution");
        values.put("remark", "字".repeat(201));
        check(validator.convert(definition, 2, 1, values, context).errors().stream().anyMatch(failure -> "备注".equals(failure.columnName()) && "RANGE".equals(failure.errorType())), "holiday remark overflow is rejected before execution");
        storageSql();
        Inner allowed = JobInnerReportController.class.getMethod("registerBusinessJob", BusinessJobStartRequest.class, String.class).getAnnotation(Inner.class);
        check(allowed != null && Set.copyOf(Arrays.asList(allowed.allowedServices())).equals(Set.of("cloudflow-auth", "cloudflow-service-hr", "cloudflow-service-oa", "cloudflow-service-crm")), "business job entry permits exactly the four real import services");
        System.out.println("Batch G import/storage boundary checks passed: " + checks);
    }

    private static void storageSql() throws Exception {
        MybatisConfiguration configuration = new MybatisConfiguration();
        String resource = "mapper/SysFileMapper.xml";
        try (InputStream input = new ClassPathResource(resource).getInputStream()) {
            new XMLMapperBuilder(input, configuration, resource, configuration.getSqlFragments()).parse();
        }
        TenantLineInnerInterceptor tenant = (TenantLineInnerInterceptor) new MybatisPlusConfig(new TenantConfigProperties()).mybatisPlusInterceptor().getInterceptors().get(0);
        SysFile file = new SysFile();
        file.setTenantId(100000L);
        file.setStorageType("LOCAL");
        file.setFilePath("/upload/CaseSensitive.xlsx");
        Map<String, Object> parameters = Map.of("tenantIds", List.of(100000L), "file", file, "count", 2,
                "tenantId", 100000L, "username", "integration", "reference", file.getFilePath(), "privateTypes", List.of("HR_GRIEVANCE"));
        TenantContext.setTenantId(100000L);
        try {
            for (String method : List.of("countPhysicalStorage", "countReferences", "updateReferenceCount", "selectOwnedUnboundReference")) {
                String sql = configuration.getMappedStatement("com.cloudflow.auth.mapper.SysFileMapper." + method).getBoundSql(parameters).getSql();
                check(tenant.parserSingle(sql, null).contains("tenant_id"), "real tenant interceptor parses storage statement " + method);
            }
        } finally { TenantContext.clear(); }
    }

    private static void check(boolean condition, String label) {
        if (!condition) throw new AssertionError(label);
        checks++;
    }

    private static void rejects(ThrowingRunnable action, String label) throws Exception {
        try { action.run(); }
        catch (Exception expected) { checks++; return; }
        throw new AssertionError(label);
    }

    private interface ThrowingRunnable { void run() throws Exception; }
}
