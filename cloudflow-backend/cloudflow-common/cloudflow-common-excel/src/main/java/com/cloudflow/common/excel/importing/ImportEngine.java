package com.cloudflow.common.excel.importing;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.audit.domain.SysAuditLogEntity;
import com.cloudflow.common.audit.mapper.SysAuditLogMapper;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.core.exception.StorageCapacityError;
import com.cloudflow.common.core.utils.LogSanitizer;
import com.cloudflow.common.excel.importing.mapper.ImportTaskMapper;
import com.cloudflow.common.excel.importing.model.ImportErrorRecord;
import com.cloudflow.common.excel.importing.model.ImportPreview;
import com.cloudflow.common.excel.importing.model.ImportTask;
import com.cloudflow.common.job.annotation.JobHandler;
import com.cloudflow.common.job.client.JobReportClient;
import com.cloudflow.common.job.model.BusinessJobStartRequest;
import com.cloudflow.common.job.model.JobAcceptVO;
import com.cloudflow.common.job.model.JobExecuteDTO;
import com.cloudflow.common.job.model.JobResult;
import com.cloudflow.common.job.model.JobResultReportDTO;
import com.cloudflow.common.job.service.JobExecutionService;
import com.cloudflow.common.message.constant.MessageCategory;
import com.cloudflow.common.message.api.MessageReceiver;
import com.cloudflow.common.message.api.MessageSendRequest;
import com.cloudflow.common.message.api.MessageSender;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.FilterOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.function.Supplier;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.dao.TransientDataAccessException;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.TransactionException;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.multipart.MultipartFile;

@RequiredArgsConstructor
@Slf4j
public class ImportEngine {
    private static final Set<String> RUNNING = Set.of("VALIDATING", "IMPORTING");
    private static final Set<String> FINISHED_JOBS = Set.of("SUCCESS", "FAILED", "TIMEOUT", "SKIPPED", "DISPATCH_FAILED");
    private final ImportTaskMapper tasks;
    private final ImportRegistry registry;
    private final ImportIdentity identity;
    private final ImportFileStore files;
    private final ImportSpreadsheets sheets;
    private final ImportValidatorChain validators;
    private final PlatformTransactionManager transactionManager;
    private final JobReportClient reports;
    private final JobExecutionService execution;
    private final SysAuditLogMapper audits;
    private final MessageSender messages;
    private final ObjectMapper json;

    public record Column(String field, String name, boolean required) { }
    public record Business(String bizType, String bizName, int maxRows, long maxFileSize, List<Column> columns,
                           boolean supportsUpdates, boolean canDownloadUpdateTemplate, List<String> instructions) { }
    public record Command(long taskId, String phase, boolean skipInvalidRows, Long jobLogId) { }

    public List<Business> businesses() {
        identity.require("system:import:list");
        return registry.available().stream().map(definition -> new Business(definition.bizType(), definition.bizName(), definition.maxRows(),
                ImportSpreadsheets.MAX_FILE_SIZE, definition.columns().stream().map(column -> new Column(column.getField(), column.getName(), column.isRequired())).toList(),
                definition.updatePermission() != null,
                definition.updatePermission() != null && ImportRegistry.hasPermission(definition.updatePermission()),
                definition.instructions())).toList();
    }

    public void template(String bizType, OutputStream output) throws IOException {
        template(bizType, false, null, output);
    }

    public void template(String bizType, boolean updates, String keyword, OutputStream output) throws IOException {
        ImportIdentity.Operator operator = identity.require("system:import:execute");
        ImportDefinition<?> definition = registry.require(bizType);
        if (updates) {
            if (definition.updatePermission() == null) throw new ServiceException("该业务只支持新增导入", 400);
            identity.require(definition.updatePermission());
        }
        if (keyword != null && keyword.length() > 120) throw new ServiceException("模板筛选最多120字符", 400);
        ImportContext context = context(operator);
        ImportHandler<?> handler = registry.handler(bizType);
        handler.prepare(context);
        List<Map<String, String>> rows = updates ? handler.updateTemplateRows(context, keyword) : List.of();
        sheets.template(definition, context, rows, output);
    }

    public ImportTask upload(String bizType, MultipartFile file) throws IOException {
        ImportIdentity.Operator operator = identity.require("system:import:execute");
        ImportDefinition<?> definition = registry.require(bizType);
        try (ImportSpreadsheets.PreparedUpload upload = sheets.prepare(file, definition)) {
            ImportTask task = new ImportTask();
            task.setTenantId(operator.tenantId());
            task.setTaskNo("IMP" + UUID.randomUUID().toString().replace("-", ""));
            task.setBizType(definition.bizType());
            task.setBizName(definition.bizName());
            task.setFileName(upload.fileName());
            task.setFileUrl("PENDING");
            task.setFileSize(upload.size());
            task.setTotalRows(upload.rows());
            task.setValidRows(0);
            task.setInvalidRows(0);
            task.setSuccessRows(0);
            task.setFailRows(0);
            task.setStatus("UPLOADED");
            task.setOperatorId(operator.userId());
            task.setOperatorName(operator.name());
            task.setCreateBy(operator.name());
            task.setCreateTime(LocalDateTime.now());
            task.setUpdateBy(operator.name());
            transaction(() -> tasks.insert(task));
            try {
                files.save(task.getTaskId(), upload.path(), upload.fileName(), false, null);
            } catch (RuntimeException exception) {
                log.warn("导入原文件保存失败 taskId={} errorType={}", task.getTaskId(), exception.getClass().getName());
                transaction(() -> tasks.transition(task.getTenantId(), task.getOperatorId(), task.getTaskId(), "UPLOADED", "FAILED", "原文件保存失败，请重新上传"));
                if (exception instanceof ServiceException service
                        && Objects.equals(service.getCode(), StorageCapacityError.CODE)
                        && StorageCapacityError.MESSAGE.equals(service.getMessage())) {
                    throw StorageCapacityError.exception();
                }
                throw new ServiceException("导入文件保存失败，请检查存储配额或联系管理员");
            }
            return view(owned(task.getTaskId()));
        }
    }

    public PageResult<ImportTask> page(String bizType, String status, int pageNum, int pageSize) {
        ImportIdentity.Operator operator = identity.require("system:import:list");
        List<String> types = registry.available().stream().map(ImportDefinition::bizType).toList();
        int size = Math.max(1, Math.min(100, pageSize));
        int number = Math.max(1, pageNum);
        if (types.isEmpty()) return new PageResult<>(List.of(), 0, number, size);
        if (bizType != null && !bizType.isBlank()) registry.require(bizType);
        IPage<ImportTask> page = tasks.pageOwned(new Page<>(number, size), operator.tenantId(), operator.userId(), bizType, status, types);
        return new PageResult<>(page.getRecords().stream().map(this::view).toList(), page.getTotal(), number, size);
    }

    public ImportTask status(long taskId) {
        identity.require("system:import:list");
        return view(owned(taskId));
    }

    public ImportTask validate(long taskId) {
        identity.require("system:import:execute");
        return dispatch(owned(taskId), "VALIDATING", false);
    }

    public ImportTask execute(long taskId, boolean skipInvalidRows) {
        identity.require("system:import:execute");
        return dispatch(owned(taskId), "IMPORTING", skipInvalidRows);
    }

    @Audit(name = "取消导入任务", highRisk = true)
    public ImportTask cancel(long taskId) {
        identity.require("system:import:execute");
        ImportTask task = owned(taskId);
        transaction(() -> {
            ImportTask current = lock(task);
            if (!Set.of("UPLOADED", "VALIDATED", "FAILED").contains(current.getStatus())) throw new ServiceException("仅未开始或失败的任务可以取消；运行中的任务请等待结束");
            tasks.transition(task.getTenantId(), task.getOperatorId(), taskId, current.getStatus(), "CANCELLED", null);
            return null;
        });
        return view(owned(taskId));
    }

    public ImportPreview preview(long taskId, int pageNum, int pageSize) throws IOException {
        identity.require("system:import:list");
        ImportTask task = owned(taskId);
        List<Map<String, Object>> rows = new ArrayList<>();
        if (!ImportFileStore.REMOVED_REFERENCE.equals(task.getFileUrl())) {
            Path source = materialize(task);
            try {
                sheets.scan(source, registry.require(task.getBizType()), ignored -> { }, row -> {
                    rows.add(Map.of("rowNo", row.rowNo(), "values", row.values()));
                    return rows.size() < 20;
                });
            } finally {
                Files.deleteIfExists(source);
            }
        }
        Map<String, Long> counts = new LinkedHashMap<>();
        tasks.errorCounts(task.getTenantId(), task.getOperatorId(), taskId).forEach(row -> counts.put(String.valueOf(row.get("errorType")), ((Number) row.get("errorCount")).longValue()));
        IPage<ImportErrorRecord> page = tasks.pageErrors(new Page<>(Math.max(1, pageNum), Math.max(1, Math.min(100, pageSize))), task.getTenantId(), task.getOperatorId(), taskId);
        return new ImportPreview(view(task), rows, counts, new PageResult<>(page.getRecords(), page.getTotal(), page.getCurrent(), page.getSize()));
    }

    public String download(long taskId, boolean errorFile, OutputStream output) throws IOException {
        identity.require("system:import:list");
        ImportTask task = owned(taskId);
        if (errorFile && (RUNNING.contains(task.getStatus()) || task.getErrorFileUrl() == null)) throw new ServiceException("任务尚无可下载的错误文件");
        if (!errorFile && ImportFileStore.REMOVED_REFERENCE.equals(task.getFileUrl())) throw new ServiceException("原文件已按业务保留策略删除", 404);
        files.copy(taskId, errorFile, output);
        return errorFile ? ImportSpreadsheets.safeName("错误_" + task.getFileName(), task.getFileName().endsWith(".xlsx") ? ".xlsx" : ".txt") : task.getFileName();
    }

    private ImportTask dispatch(ImportTask task, String phase, boolean skipInvalidRows) {
        Command command = new Command(task.getTaskId(), phase, skipInvalidRows, null);
        JobExecuteDTO registered = null;
        boolean claimed = false;
        try {
            BusinessJobStartRequest request = new BusinessJobStartRequest();
            request.setExecuteNo(UUID.randomUUID().toString());
            request.setHandlerName("batchImport");
            request.setOperatorName(task.getOperatorName());
            request.setHandlerParam(encode(command));
            registered = reports.registerBusinessJob(request);
            if (registered.getJobLogId() == null) throw new ServiceException("任务平台未返回执行日志编号");
            command = new Command(task.getTaskId(), phase, skipInvalidRows, registered.getJobLogId());
            begin(task, command);
            claimed = true;
            registered.setHandlerParam(encode(command));
            boolean synchronous = task.getTotalRows() <= 500 && task.getFileSize() <= 2L * 1024 * 1024;
            R<JobAcceptVO> accepted = synchronous ? execution.executeInline(registered) : execution.execute(registered);
            if (accepted == null || !accepted.isSuccess() || accepted.getData() == null || !accepted.getData().isAccepted()) throw new ServiceException("任务执行器暂不可用");
        } catch (RuntimeException exception) {
            log.warn("导入任务调度失败 taskId={} phase={} errorType={}", task.getTaskId(), phase, exception.getClass().getName());
            if (claimed) fail(task, command, "任务未能完成，请检查集中任务配置后重试");
            if (registered != null) {
                JobResultReportDTO report = new JobResultReportDTO();
                report.setExecuteNo(registered.getExecuteNo());
                report.setExecuteStatus("FAILED");
                report.setResultMsg("导入任务未被执行器接收");
                reports.reportResult(report);
            }
            if (!claimed) {
                if (exception instanceof ServiceException) throw exception;
                throw new ServiceException("任务未能登记执行，请检查集中任务配置后重试");
            }
        }
        return view(owned(task.getTaskId()));
    }

    private void begin(ImportTask task, Command command) {
        transaction(() -> {
            ImportTask current = lock(task);
            if ("VALIDATING".equals(command.phase())) {
                if (tasks.beginValidation(task.getTenantId(), task.getOperatorId(), task.getTaskId()) != 1) throw new ServiceException("当前任务不能重新校验；已处理的数据请勿重复导入");
                tasks.clearErrors(task.getTenantId(), task.getOperatorId(), task.getTaskId());
            } else {
                if (!command.skipInvalidRows() && current.getInvalidRows() > 0) throw new ServiceException("校验存在错误，未写入任何数据；请修正重传或选择跳过错误行");
                if (tasks.beginImport(task.getTenantId(), task.getOperatorId(), task.getTaskId()) != 1) throw new ServiceException("请先完成校验；运行中或已经完成的任务不能重复执行");
            }
            if (tasks.setJob(task.getTenantId(), task.getOperatorId(), task.getTaskId(), command.jobLogId()) != 1) throw new ServiceException("导入任务状态已改变");
            return null;
        });
    }

    @JobHandler(value = "batchImport", desc = "批量导入校验与逐行执行")
    public JobResult runJob(String parameter) {
        try {
            Command command = json.readValue(parameter, Command.class);
            if (command == null || command.jobLogId() == null) return JobResult.failed("请从导入页面使用当前登录身份重试");
            return run(command);
        } catch (JsonProcessingException | IllegalArgumentException exception) {
            return JobResult.failed("导入任务参数无效");
        }
    }

    private JobResult run(Command command) {
        ImportTask task = null;
        Path source = null;
        try {
            identity.require("system:import:execute");
            task = owned(command.taskId());
            requireRun(task, command);
            source = materialize(task);
            ImportDefinition<?> definition = registry.require(task.getBizType());
            if ("VALIDATING".equals(command.phase())) validateFile(task, command, source, definition);
            else if ("IMPORTING".equals(command.phase())) importFile(task, command, source, definition);
            else throw new ServiceException("导入任务阶段无效");
            if (!tasks.errorCounts(task.getTenantId(), task.getOperatorId(), task.getTaskId()).isEmpty()) {
                ImportTask active = task;
                Path errors = sheets.errors(source, definition, (first, last) -> tasks.errorsInRange(active.getTenantId(), active.getOperatorId(), active.getTaskId(), first, last));
                try {
                    String extension = errors.toString().endsWith(".xlsx") ? ".xlsx" : ".txt";
                    files.save(task.getTaskId(), errors, ImportSpreadsheets.safeName("错误_" + task.getFileName(), extension), true, command.jobLogId());
                } finally {
                    Files.deleteIfExists(errors);
                }
            } else {
                files.clearError(task.getTaskId(), command.jobLogId());
            }
            ImportTask result = finish(task, command);
            if ("IMPORTING".equals(command.phase()) && Set.of("SUCCESS", "PARTIAL").contains(result.getStatus())) {
                try { files.clearCompletedOriginal(task.getTaskId(), command.jobLogId()); }
                catch (RuntimeException exception) {
                    log.warn("导入已完成，原文件策略清理待重试 taskId={} errorType={}", task.getTaskId(), exception.getClass().getName());
                }
            }
            return JobResult.success("VALIDATING".equals(command.phase()) ? result.getValidRows() + result.getInvalidRows() : result.processedRows(), "导入任务处理完成");
        } catch (Exception exception) {
            log.warn("导入任务执行失败 taskId={} phase={} errorType={}", command.taskId(), command.phase(), exception.getClass().getName());
            boolean capacityFailure = exception instanceof ServiceException service
                    && Objects.equals(service.getCode(), StorageCapacityError.CODE)
                    && StorageCapacityError.MESSAGE.equals(service.getMessage());
            if (task != null) fail(task, command, capacityFailure ? StorageCapacityError.MESSAGE
                    : "任务处理未完成，已提交的数据保留；请检查文件存储、业务权限或服务连接后重试");
            return JobResult.failed(capacityFailure ? StorageCapacityError.MESSAGE
                    : "导入任务处理未完成，请在导入页面查看进度并重试");
        } finally {
            if (source != null) {
                try { Files.deleteIfExists(source); }
                catch (IOException ignored) { source.toFile().deleteOnExit(); }
            }
        }
    }

    @SuppressWarnings("unchecked")
    private <RowType> void validateFile(ImportTask task, Command command, Path source, ImportDefinition<RowType> definition) throws IOException {
        ImportContext context = new ImportContext(task.getTenantId(), task.getOperatorId(), task.getOperatorName());
        ImportHandler<RowType> handler = (ImportHandler<RowType>) registry.handler(task.getBizType());
        handler.prepare(context);
        List<ImportRow<RowType>> batch = new ArrayList<>(ImportSpreadsheets.BATCH_SIZE);
        int rows = sheets.scan(source, definition, ignored -> { }, raw -> {
            batch.add(validators.convert(definition, raw.rowNo(), raw.ordinal(), raw.values(), context));
            if (batch.size() == ImportSpreadsheets.BATCH_SIZE) {
                validationBatch(task, command, definition, handler, context, batch);
                batch.clear();
            }
            return true;
        });
        if (!batch.isEmpty()) validationBatch(task, command, definition, handler, context, batch);
        if (rows != task.getTotalRows()) throw new ServiceException("原文件行数已改变，请重新上传");
    }

    private <RowType> void validationBatch(ImportTask task, Command command, ImportDefinition<RowType> definition,
                                          ImportHandler<RowType> handler, ImportContext context, List<ImportRow<RowType>> batch) {
        identity.require("system:import:execute");
        registry.require(task.getBizType());
        validators.validateBatch(definition, handler, batch, context);
        int invalid = (int) batch.stream().filter(row -> !row.errors().isEmpty()).count();
        transaction(() -> {
            requireRun(lock(task), command);
            addErrors(task, batch.stream().flatMap(row -> row.errors().stream()).toList());
            if (tasks.addValidation(task.getTenantId(), task.getOperatorId(), task.getTaskId(), batch.get(0).ordinal() - 1, batch.size() - invalid, invalid) != 1) throw new ServiceException("校验进度已改变");
            return null;
        });
    }

    @SuppressWarnings("unchecked")
    private <RowType> void importFile(ImportTask task, Command command, Path source, ImportDefinition<RowType> definition) throws IOException {
        ImportContext context = new ImportContext(task.getTenantId(), task.getOperatorId(), task.getOperatorName());
        ImportHandler<RowType> handler = (ImportHandler<RowType>) registry.handler(task.getBizType());
        handler.prepare(context);
        Set<Integer> invalid = new HashSet<>(tasks.invalidRows(task.getTenantId(), task.getOperatorId(), task.getTaskId()));
        List<ImportRow<RowType>> batch = new ArrayList<>(ImportSpreadsheets.BATCH_SIZE);
        int rows = sheets.scan(source, definition, ignored -> { }, raw -> {
            if (raw.ordinal() <= task.processedRows()) return true;
            ImportRow<RowType> row = invalid.contains(raw.rowNo())
                    ? new ImportRow<>(raw.rowNo(), raw.ordinal(), raw.values(), null, new ArrayList<>())
                    : validators.convert(definition, raw.rowNo(), raw.ordinal(), raw.values(), context);
            batch.add(row);
            if (batch.size() == ImportSpreadsheets.BATCH_SIZE) {
                importBatch(task, command, definition, handler, context, invalid, batch);
                batch.clear();
            }
            return true;
        });
        if (!batch.isEmpty()) importBatch(task, command, definition, handler, context, invalid, batch);
        if (rows != task.getTotalRows()) throw new ServiceException("原文件行数已改变，请重新上传");
    }

    private <RowType> void importBatch(ImportTask task, Command command, ImportDefinition<RowType> definition,
                                      ImportHandler<RowType> handler, ImportContext context, Set<Integer> invalid,
                                      List<ImportRow<RowType>> batch) {
        identity.require("system:import:execute");
        registry.require(task.getBizType());
        validators.validateBatch(definition, handler, batch.stream().filter(row -> !invalid.contains(row.rowNo())).toList(), context);
        for (ImportRow<RowType> row : batch) {
            if (invalid.contains(row.rowNo()) || !row.errors().isEmpty()) {
                rowFailure(task, command, row, invalid.contains(row.rowNo()) ? List.of() : row.errors());
                continue;
            }
            try {
                transaction(() -> {
                    ImportTask current = lock(task);
                    requireRun(current, command);
                    if (current.processedRows() >= row.ordinal()) return null;
                    if (current.processedRows() != row.ordinal() - 1) throw new ServiceException("导入进度不连续");
                    handler.importRow(row.value(), row.rowNo(), context);
                    advance(task, row.ordinal(), true);
                    return null;
                });
            } catch (DataAccessResourceFailureException | TransientDataAccessException | TransactionException exception) {
                throw exception;
            } catch (RuntimeException exception) {
                log.warn("导入行保存失败 taskId={} rowNo={} errorType={}", task.getTaskId(), row.rowNo(), exception.getClass().getName());
                rowFailure(task, command, row, List.of(handler.importFailure(row.value(), row.rowNo(), exception)));
            }
        }
    }

    private void rowFailure(ImportTask task, Command command, ImportRow<?> row, List<ImportError> errors) {
        transaction(() -> {
            ImportTask current = lock(task);
            requireRun(current, command);
            if (current.processedRows() >= row.ordinal()) return null;
            addErrors(task, errors);
            advance(task, row.ordinal(), false);
            return null;
        });
    }

    private void advance(ImportTask task, int ordinal, boolean success) {
        if (tasks.addProgress(task.getTenantId(), task.getOperatorId(), task.getTaskId(), ordinal - 1, success ? 1 : 0, success ? 0 : 1) != 1) throw new ServiceException("导入进度已改变");
    }

    private void addErrors(ImportTask task, List<ImportError> errors) {
        for (int offset = 0; offset < errors.size(); offset += 100) {
            tasks.addErrors(task.getTenantId(), task.getTaskId(), errors.subList(offset, Math.min(errors.size(), offset + 100)));
        }
    }

    private ImportTask finish(ImportTask task, Command command) {
        return transaction(() -> {
            ImportTask current = lock(task);
            requireRun(current, command);
            boolean validation = "VALIDATING".equals(command.phase());
            int processed = validation ? current.getValidRows() + current.getInvalidRows() : current.processedRows();
            if (processed != current.getTotalRows()) throw new ServiceException("导入进度与文件行数不一致");
            String status = validation ? "VALIDATED" : current.getFailRows() == 0 ? "SUCCESS" : current.getSuccessRows() == 0 ? "FAILED" : "PARTIAL";
            tasks.transition(task.getTenantId(), task.getOperatorId(), task.getTaskId(), command.phase(), status, null);
            current.setStatus(status);
            if (!validation) summarize(current);
            return current;
        });
    }

    private void fail(ImportTask task, Command command, String message) {
        transaction(() -> {
            ImportTask current = lock(task);
            if (!Objects.equals(current.getStatus(), command.phase()) || !Objects.equals(current.getJobLogId(), command.jobLogId())) return null;
            tasks.transition(task.getTenantId(), task.getOperatorId(), task.getTaskId(), command.phase(), "FAILED", message);
            current.setStatus("FAILED");
            if ("IMPORTING".equals(command.phase())) summarize(current);
            return null;
        });
    }

    private void summarize(ImportTask task) {
        Map<String, Object> result = Map.of("taskId", task.getTaskId(), "bizType", task.getBizType(),
                "fileName", LogSanitizer.text(task.getFileName()), "totalRows", task.getTotalRows(),
                "successRows", task.getSuccessRows(), "failRows", task.getFailRows(), "status", task.getStatus());
        SysAuditLogEntity audit = new SysAuditLogEntity();
        audit.setTenantId(task.getTenantId());
        audit.setBizModule("system");
        audit.setAuditName("批量导入：" + task.getBizName());
        audit.setAuditField("importResult");
        audit.setAfterVal(task.getStatus());
        audit.setAfterJson(encode(result));
        audit.setHighRisk(0);
        audit.setRiskLevel("LOW");
        audit.setCreateBy(task.getOperatorName());
        audit.setCreateTime(LocalDateTime.now());
        audits.insert(audit);
        String content = task.getBizName() + "导入：成功" + task.getSuccessRows() + "行，失败或跳过" + task.getFailRows() + "行，共" + task.getTotalRows() + "行。";
        messages.send(MessageSendRequest.builder().templateCode("IMPORT_COMPLETED")
                .receivers(List.of(MessageReceiver.ofUser(task.getOperatorId()))).category(MessageCategory.BIZ_REMINDER)
                .bizType("IMPORT_TASK").bizId(String.valueOf(task.getTaskId())).linkUrl("/system/import?bizType=" + task.getBizType() + "&taskId=" + task.getTaskId())
                .deduplicationKey("import:" + task.getTaskId() + ":" + task.getStatus() + ":" + task.processedRows())
                .params(Map.of("bizName", task.getBizName(), "successRows", task.getSuccessRows(), "failRows", task.getFailRows(), "totalRows", task.getTotalRows()))
                .title("批量导入结果").content(content).build());
    }

    private ImportTask owned(long taskId) {
        ImportIdentity.Operator operator = identity.require();
        ImportTask task = tasks.owned(operator.tenantId(), operator.userId(), taskId);
        if (task == null) throw new ServiceException("导入任务不存在或无权访问", 403);
        registry.require(task.getBizType());
        if (RUNNING.contains(task.getStatus()) && task.getJobLogId() != null) {
            String jobStatus = tasks.jobStatus(task.getTenantId(), task.getJobLogId());
            if (jobStatus != null && FINISHED_JOBS.contains(jobStatus)) {
                fail(task, new Command(taskId, task.getStatus(), true, task.getJobLogId()), "任务执行已结束，未完成的数据可从导入页面重试");
                task = tasks.owned(operator.tenantId(), operator.userId(), taskId);
            }
        }
        return task;
    }

    private ImportTask lock(ImportTask task) {
        ImportTask current = tasks.ownedForUpdate(task.getTenantId(), task.getOperatorId(), task.getTaskId());
        if (current == null) throw new ServiceException("导入任务不存在或无权访问", 403);
        return current;
    }

    private void requireRun(ImportTask task, Command command) {
        if (Thread.currentThread().isInterrupted() || !RUNNING.contains(command.phase())
                || !command.phase().equals(task.getStatus()) || !Objects.equals(task.getJobLogId(), command.jobLogId())) {
            throw new ServiceException("导入任务已结束或由新的执行接管");
        }
    }

    private ImportContext context(ImportIdentity.Operator operator) {
        return new ImportContext(operator.tenantId(), operator.userId(), operator.name());
    }

    private Path materialize(ImportTask task) throws IOException {
        Path source = Files.createTempFile("cloudflow-import-read-", ".input");
        boolean ready = false;
        try (OutputStream output = Files.newOutputStream(source); OutputStream limited = new FilterOutputStream(output) {
            private long size;
            private void limit(int count) throws IOException {
                size += count;
                if (size > ImportSpreadsheets.MAX_FILE_SIZE) throw new IOException("原文件超出导入大小限制");
            }
            @Override public void write(int value) throws IOException { limit(1); out.write(value); }
            @Override public void write(byte[] bytes, int offset, int count) throws IOException { limit(count); out.write(bytes, offset, count); }
        }) {
            files.copy(task.getTaskId(), false, limited);
            if (Files.size(source) != task.getFileSize()) throw new ServiceException("原文件大小已改变，请重新上传");
            ready = true;
            return source;
        } finally {
            if (!ready) Files.deleteIfExists(source);
        }
    }

    private ImportTask view(ImportTask task) {
        ImportTask result = new ImportTask();
        BeanUtils.copyProperties(task, result);
        result.setFileUrl(task.getFileUrl() == null || Set.of("PENDING", ImportFileStore.REMOVED_REFERENCE).contains(task.getFileUrl())
                ? null : "/system/import/" + task.getTaskId() + "/file");
        result.setErrorFileUrl(task.getErrorFileUrl() == null || RUNNING.contains(task.getStatus()) ? null : "/system/import/" + task.getTaskId() + "/errors/file");
        return result;
    }

    private String encode(Object value) {
        try { return json.writeValueAsString(value); }
        catch (JsonProcessingException exception) { throw new ServiceException("导入任务信息无法序列化"); }
    }

    private <Result> Result transaction(Supplier<Result> work) {
        TransactionTemplate template = new TransactionTemplate(transactionManager);
        template.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        return template.execute(status -> work.get());
    }
}
