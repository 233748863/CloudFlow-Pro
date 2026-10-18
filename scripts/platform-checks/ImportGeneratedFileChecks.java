package com.cloudflow.common.excel.importing;

import com.cloudflow.common.audit.mapper.SysAuditLogMapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.exception.StorageCapacityError;
import com.cloudflow.common.excel.importing.mapper.ImportTaskMapper;
import com.cloudflow.common.excel.importing.model.ImportErrorRecord;
import com.cloudflow.common.excel.importing.model.ImportPreview;
import com.cloudflow.common.excel.importing.model.ImportTask;
import com.cloudflow.common.job.model.JobResult;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.io.OutputStream;
import java.lang.reflect.Proxy;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.springframework.beans.BeanUtils;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.SimpleTransactionStatus;

/** Actual import engine, parser and error-file generation; persistence and delivery are fixtures. */
public final class ImportGeneratedFileChecks {
    private static int checks;
    private static final List<String> failures = new ArrayList<>();
    private record Scenario(String name, String phase, boolean oldReport, boolean readFailure, boolean capacityFailure, boolean invalidRow) { }

    public static void main(String[] arguments) throws Exception {
        Path directory = Path.of(arguments[0]).toAbsolutePath().normalize();
        Files.createDirectories(directory);
        List<Scenario> scenarios = List.of(
                new Scenario("read-failure-retains-report", "VALIDATING", true, true, false, false),
                new Scenario("first-report-capacity-failure", "VALIDATING", false, false, true, true),
                new Scenario("replacement-capacity-failure", "VALIDATING", true, false, true, true),
                new Scenario("replacement-success", "VALIDATING", true, false, false, true),
                new Scenario("successful-clean-validation", "VALIDATING", true, false, false, false),
                new Scenario("import-progress-retained", "IMPORTING", true, false, true, true),
                new Scenario("completed-import-cleans-original", "IMPORTING", false, false, false, false),
                new Scenario("partial-import-keeps-errors", "IMPORTING", false, false, false, true),
                new Scenario("cleanup-failure-keeps-success", "IMPORTING", false, false, false, false));
        UserContext.setTenantId(100000L); UserContext.setUserId(7L);
        UserContext.setPermissions(Set.of("system:import:execute", "system:check:import"));
        try {
            for (Scenario scenario : scenarios) run(directory, scenario);
            for (String failure : failures) System.out.println("IMPORT_GENERATED_ASSERTION_FAILED: " + failure);
            System.out.println("IMPORT_GENERATED_FILE_RESULT: scenarios=" + scenarios.size() + "; checks=" + checks
                    + "; failed=" + failures.size() + "; engine=real; parser=real; database=fixture; external_deliveries=0");
            if (!failures.isEmpty()) throw new AssertionError("Generated file preservation checks failed");
        } finally { UserContext.clear(); }
    }

    private static void run(Path directory, Scenario scenario) throws Exception {
        String input = "编码,姓名,邮箱,日期,金额,部门,岗位,手机号,身份证\r\nFIRST,首行,,,,,,,\r\nSECOND,"
                + (scenario.invalidRow() ? "" : "次行") + ",,,,,,,\r\n";
        byte[] original = input.getBytes(StandardCharsets.UTF_8);
        byte[] previous = "previous-report-bytes".getBytes(StandardCharsets.UTF_8);
        Path source = Files.createTempFile(directory, "generated-report-", ".csv");
        Files.write(source, original);
        ImportTask stored = new ImportTask();
        stored.setTaskId(7L); stored.setTenantId(100000L); stored.setOperatorId(7L); stored.setOperatorName("generated-file-fixture");
        stored.setBizType("CHECK"); stored.setBizName("生成文件验证"); stored.setFileName("capacity.csv");
        stored.setFileSize((long) original.length); stored.setFileUrl("original-reference");
        stored.setTotalRows(2); stored.setValidRows(0); stored.setInvalidRows(0); stored.setSuccessRows(0); stored.setFailRows(0);
        stored.setStatus(scenario.phase()); stored.setJobLogId(9L);
        stored.setErrorFileUrl(scenario.oldReport() ? "previous-reference" : null);
        AtomicReference<byte[]> report = new AtomicReference<>(scenario.oldReport() ? previous.clone() : null);
        AtomicReference<Path> generated = new AtomicReference<>();
        AtomicInteger writes = new AtomicInteger(); AtomicInteger notices = new AtomicInteger(); AtomicInteger audits = new AtomicInteger();
        AtomicInteger cleanupCalls = new AtomicInteger();
        List<ImportErrorRecord> errors = new ArrayList<>();
        ImportTaskMapper mapper = (ImportTaskMapper) Proxy.newProxyInstance(ImportTaskMapper.class.getClassLoader(),
                new Class<?>[]{ImportTaskMapper.class}, (Object proxy, java.lang.reflect.Method method, Object[] values) -> {
                    switch (method.getName()) {
                        case "owned", "ownedForUpdate": {
                            ImportTask copy = new ImportTask(); BeanUtils.copyProperties(stored, copy); return copy;
                        }
                        case "jobStatus": return "RUNNING";
                        case "pageErrors": {
                            com.baomidou.mybatisplus.extension.plugins.pagination.Page<ImportErrorRecord> page =
                                    new com.baomidou.mybatisplus.extension.plugins.pagination.Page<>(1, 20);
                            page.setRecords(List.copyOf(errors)); page.setTotal(errors.size()); return page;
                        }
                        case "invalidRows": return List.of();
                        case "addErrors": {
                            for (Object value : (List<?>) values[2]) {
                                if (!(value instanceof ImportError error)) throw new AssertionError("Unexpected error row type");
                                ImportErrorRecord record = new ImportErrorRecord(); record.setRowNo(error.rowNo());
                                record.setColumnName(error.columnName()); record.setCellValue(error.cellValue());
                                record.setErrorType(error.errorType()); record.setErrorMessage(error.errorMessage()); errors.add(record);
                            }
                            return ((List<?>) values[2]).size();
                        }
                        case "addValidation": {
                            stored.setValidRows(stored.getValidRows() + (Integer) values[4]);
                            stored.setInvalidRows(stored.getInvalidRows() + (Integer) values[5]); return 1;
                        }
                        case "addProgress": {
                            check(scenario, stored.processedRows() == (Integer) values[3], "progress advances exactly once");
                            stored.setSuccessRows(stored.getSuccessRows() + (Integer) values[4]);
                            stored.setFailRows(stored.getFailRows() + (Integer) values[5]); return 1;
                        }
                        case "errorCounts": return errors.isEmpty() ? List.of() : List.of(Map.of("errorType", "REQUIRED", "errorCount", (long) errors.size()));
                        case "errorsInRange": return errors.stream().filter(error -> error.getRowNo() >= (Integer) values[3] && error.getRowNo() <= (Integer) values[4]).toList();
                        case "transition": {
                            check(scenario, stored.getStatus().equals(values[3]), "transition uses current phase");
                            stored.setStatus((String) values[4]); stored.setErrorMessage((String) values[5]); return 1;
                        }
                        default: throw new AssertionError("Unexpected task operation: " + method.getName());
                    }
                });
        ImportIdentity identity = new ImportIdentity(null) {
            @Override public Operator require() { return new Operator(100000, 7, "generated-file-fixture"); }
            @Override public Operator require(String permission) { return require(); }
        };
        ImportFileStore fileStore = new ImportFileStore() {
            @Override public void copy(long id, boolean errorFile, OutputStream output) throws IOException {
                if (errorFile) throw new AssertionError("Unexpected report read");
                if (scenario.readFailure()) throw new IOException("isolated-original-read-failure");
                Files.copy(source, output);
            }
            @Override public String save(long id, Path file, String name, boolean errorFile, Long job) {
                check(scenario, id == 7 && errorFile && Objects.equals(job, 9L), "generated save belongs to the running job");
                generated.set(file);
                if (scenario.capacityFailure()) throw StorageCapacityError.exception();
                try { report.set(Files.readAllBytes(file)); }
                catch (IOException exception) { throw new IllegalStateException(exception); }
                stored.setErrorFileUrl("replacement-reference"); return stored.getErrorFileUrl();
            }
            @Override public void clearCompletedOriginal(long id, Long job) {
                cleanupCalls.incrementAndGet();
                check(scenario, id == 7 && Objects.equals(job, 9L)
                        && Set.of("SUCCESS", "PARTIAL").contains(stored.getStatus()), "cleanup follows committed completion");
                if (scenario.name().equals("cleanup-failure-keeps-success")) throw new IllegalStateException("isolated-cleanup-failure");
                try { Files.delete(source); }
                catch (IOException exception) { throw new IllegalStateException(exception); }
                stored.setFileUrl(ImportFileStore.REMOVED_REFERENCE);
            }
            @Override public void clearError(long id, Long job) {
                check(scenario, id == 7 && Objects.equals(job, 9L), "clear owns the running task");
                report.set(null); stored.setErrorFileUrl(null);
            }
        };
        PlatformTransactionManager transactions = new PlatformTransactionManager() {
            @Override public TransactionStatus getTransaction(TransactionDefinition definition) { return new SimpleTransactionStatus(); }
            @Override public void commit(TransactionStatus status) { }
            @Override public void rollback(TransactionStatus status) { throw new AssertionError("Unexpected transaction rollback"); }
        };
        SysAuditLogMapper auditMapper = (SysAuditLogMapper) Proxy.newProxyInstance(SysAuditLogMapper.class.getClassLoader(),
                new Class<?>[]{SysAuditLogMapper.class}, (Object proxy, java.lang.reflect.Method method, Object[] values) -> {
                    if (!method.getName().equals("insert")) throw new AssertionError("Unexpected audit operation");
                    audits.incrementAndGet(); return 1;
                });
        ImportChecks.Definition definition = new ImportChecks.Definition(10) {
            @Override public void importRow(ImportChecks.SampleRow row, int rowNo, ImportContext context) { writes.incrementAndGet(); }
        };
        ObjectMapper json = new ObjectMapper();
        ImportEngine engine = new ImportEngine(mapper, new ImportRegistry(List.of(definition), List.of(definition)), identity,
                fileStore, new ImportSpreadsheets(), new ImportValidatorChain(json), transactions, null, null, auditMapper,
                request -> notices.incrementAndGet(), json);
        try {
            JobResult result = engine.runJob(json.writeValueAsString(new ImportEngine.Command(7, scenario.phase(), true, 9L)));
            boolean expectedFailure = scenario.readFailure() || scenario.capacityFailure();
            check(scenario, (expectedFailure ? "FAILED" : "SUCCESS").equals(result.getExecuteStatus()), "job outcome reflects storage failure");
            String expectedStatus = expectedFailure ? "FAILED" : scenario.phase().equals("VALIDATING") ? "VALIDATED"
                    : scenario.invalidRow() ? "PARTIAL" : "SUCCESS";
            check(scenario, expectedStatus.equals(stored.getStatus()), "task outcome persists");
            if (expectedFailure) {
                check(scenario, Objects.equals(stored.getErrorFileUrl(), scenario.oldReport() ? "previous-reference" : null), "failed processing preserves the previous report reference");
                check(scenario, scenario.oldReport() ? Arrays.equals(report.get(), previous) : report.get() == null, "failed processing preserves previous report bytes");
            } else if (scenario.invalidRow()) {
                check(scenario, "replacement-reference".equals(stored.getErrorFileUrl()) && report.get() != null
                        && !Arrays.equals(report.get(), previous), "successful generation replaces the old report");
            } else {
                check(scenario, stored.getErrorFileUrl() == null && report.get() == null, "successful clean validation removes an obsolete report");
            }
            if (scenario.capacityFailure()) check(scenario, StorageCapacityError.MESSAGE.equals(stored.getErrorMessage())
                    && StorageCapacityError.MESSAGE.equals(result.getResultMsg()), "capacity cause is explicit in task and job results");
            boolean completedImport = !expectedFailure && scenario.phase().equals("IMPORTING");
            check(scenario, cleanupCalls.get() == (completedImport ? 1 : 0), "only completed imports invoke the retention policy");
            if (completedImport && !scenario.name().equals("cleanup-failure-keeps-success")) {
                check(scenario, ImportFileStore.REMOVED_REFERENCE.equals(stored.getFileUrl()) && !Files.exists(source), "completed original is removed");
                ImportPreview preview = engine.preview(7, 1, 20);
                check(scenario, preview.rows().isEmpty() && preview.task().getFileUrl() == null
                        && preview.errors().getTotal() == errors.size(), "removed originals retain task and error preview");
                boolean denied = false;
                try { engine.download(7, false, OutputStream.nullOutputStream()); }
                catch (com.cloudflow.common.core.exception.ServiceException exception) { denied = Objects.equals(exception.getCode(), 404); }
                check(scenario, denied, "removed original download is rejected");
            } else {
                check(scenario, "original-reference".equals(stored.getFileUrl()) && Arrays.equals(Files.readAllBytes(source), original), "unfinished or failed cleanup preserves original");
            }
            check(scenario, generated.get() == null || !Files.exists(generated.get()), "temporary generated report is removed");
            check(scenario, scenario.phase().equals("IMPORTING") ? writes.get() == (scenario.invalidRow() ? 1 : 2) && stored.getSuccessRows() == writes.get() && stored.getFailRows() == (scenario.invalidRow() ? 1 : 0)
                    && audits.get() == 1 && notices.get() == 1 : writes.get() == 0 && audits.get() == 0 && notices.get() == 0,
                    "committed business progress survives generation failure without duplicate writes");
        } finally { Files.deleteIfExists(source); }
    }

    private static void check(Scenario scenario, boolean condition, String label) {
        checks++;
        if (!condition) failures.add(scenario.name() + ": " + label);
    }
}
