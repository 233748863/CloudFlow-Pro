package com.cloudflow.workflow.controller;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.workflow.domain.WfProcessDefinition;
import com.cloudflow.workflow.domain.dto.BatchExportRequest;
import com.cloudflow.workflow.domain.dto.ImportResultDTO;
import com.cloudflow.workflow.domain.dto.ValidationResultDTO;
import com.cloudflow.workflow.domain.dto.WorkflowExportFormat;
import com.cloudflow.workflow.exception.PermissionDeniedException;
import com.cloudflow.workflow.exception.WorkflowException;
import com.cloudflow.workflow.mapper.WfProcessDefinitionMapper;
import com.cloudflow.workflow.resolver.ConflictResolver;
import com.cloudflow.workflow.resolver.ConflictResolver.ConflictStrategy;
import com.cloudflow.workflow.service.IExportService;
import com.cloudflow.workflow.service.IImportService;
import com.cloudflow.workflow.service.WorkflowPermissionService;
import com.cloudflow.workflow.util.ExportFormatUtil;
import com.cloudflow.workflow.validator.ImportValidator;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import cn.dev33.satoken.annotation.SaCheckLogin;
import cn.dev33.satoken.annotation.SaCheckPermission;
import cn.dev33.satoken.annotation.SaCheckRole;
import cn.dev33.satoken.annotation.SaMode;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;

/**
 * Workflow import/export controller.
 */
@Slf4j
@RestController
@RequestMapping("/import-export")
public class ImportExportController {
    /**
     * 导入文件大小上限：10MB。
     * 示例：10.5MB 文件会被直接拒绝，避免一次性读入内存导致接口抖动。
     */
    private static final long MAX_IMPORT_FILE_SIZE = 10L * 1024 * 1024;

    /**
     * 批量导入文件数上限。
     * 示例：一次上传 200 个文件会被拒绝，防止瞬时放大导入压力。
     */
    private static final int MAX_BATCH_IMPORT_FILE_COUNT = 100;

    @Autowired
    private IExportService exportService;

    @Autowired
    private IImportService importService;

    @Autowired
    private ImportValidator importValidator;

    @Autowired
    private ConflictResolver conflictResolver;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private WfProcessDefinitionMapper definitionMapper;

    @Autowired
    private WorkflowPermissionService permissionService;

    @GetMapping("/export/{workflowId}")
    @SaCheckLogin
    public ResponseEntity<Resource> exportWorkflow(
            @PathVariable String workflowId,
            @RequestParam(defaultValue = "false") Boolean includeSensitive) {

        log.info("Export workflow, workflowId={}, includeSensitive={}", workflowId, includeSensitive);
        ensureWorkflowOwnerOrAdmin(workflowId);

        try {
            WorkflowExportFormat exportFormat = exportService.exportWorkflow(workflowId, includeSensitive);
            String json = ExportFormatUtil.serializeWithChecksum(exportFormat);
            byte[] bytes = json.getBytes(StandardCharsets.UTF_8);

            String fileName = exportService.generateExportFileName(
                exportFormat.getWorkflow().getName(),
                exportFormat.getWorkflow().getVersion()
            );

            ByteArrayResource resource = new ByteArrayResource(bytes);
            return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + fileName + "\"")
                .contentType(MediaType.APPLICATION_JSON)
                .contentLength(bytes.length)
                .body(resource);
        } catch (Exception e) {
            log.error("Export workflow failed, workflowId={}", workflowId, e);
            throw new RuntimeException("导出流程失败: " + e.getMessage());
        }
    }

    @PostMapping("/export/batch")
    @SaCheckRole("admin")
    public ResponseEntity<Resource> exportWorkflows(@RequestBody BatchExportRequest request) {
        if (request == null || request.getWorkflowIds() == null || request.getWorkflowIds().isEmpty()) {
            throw WorkflowException.validationError("workflowIds 不能为空");
        }

        log.info("Batch export workflows, count={}, includeSensitive={}",
            request.getWorkflowIds().size(), request.getIncludeSensitive());

        try {
            List<WorkflowExportFormat> exportFormats = exportService.exportWorkflows(
                request.getWorkflowIds(),
                request.getIncludeSensitive()
            );

            String json = objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(exportFormats);
            byte[] bytes = json.getBytes(StandardCharsets.UTF_8);

            String fileName = exportService.generateBatchExportFileName();
            ByteArrayResource resource = new ByteArrayResource(bytes);

            return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + fileName + "\"")
                .contentType(MediaType.APPLICATION_JSON)
                .contentLength(bytes.length)
                .body(resource);
        } catch (Exception e) {
            log.error("Batch export workflows failed", e);
            throw new RuntimeException("批量导出流程失败: " + e.getMessage());
        }
    }

    @PostMapping("/import/validate")
    @SaCheckRole("admin")
    public R<ValidationResultDTO> validateImportFile(@RequestParam("file") MultipartFile file) {
        log.info("Validate import file, fileName={}, size={}", file.getOriginalFilename(), file.getSize());

        try {
            validateImportUploadFile(file);
            String json = new String(file.getBytes(), StandardCharsets.UTF_8);
            if (isBatchPayload(json)) {
                List<WorkflowExportFormat> batchFormats = parseBatchPayload(json);
                if (batchFormats.isEmpty()) {
                    return R.ok(buildInvalidValidation("导入文件中不包含任何流程定义"));
                }
                if (batchFormats.size() > 1 && !permissionService.isAdmin(UserContext.getUserId())) {
                    return R.ok(buildInvalidValidation("当前账号无批量导入权限，请联系管理员"));
                }

                List<ValidationResultDTO> results = new ArrayList<>();
                for (WorkflowExportFormat format : batchFormats) {
                    results.add(importValidator.validate(format));
                }
                return R.ok(mergeBatchValidation(results));
            }

            WorkflowExportFormat exportFormat = ExportFormatUtil.deserialize(json);
            return R.ok(importValidator.validate(exportFormat));
        } catch (WorkflowException e) {
            return R.ok(buildInvalidValidation(e.getMessage()));
        } catch (Exception e) {
            log.error("Validate import file failed", e);
            return R.fail("校验失败: " + e.getMessage());
        }
    }

    @PostMapping("/import")
    @SaCheckRole("admin")
    public R<ImportResultDTO> importWorkflow(
            @RequestParam("file") MultipartFile file,
            @RequestParam(required = false, defaultValue = "skip") String conflictStrategy) {
        if (file == null || file.isEmpty()) {
            return R.ok(ImportResultDTO.failure("unknown", "导入失败：上传文件不能为空"));
        }

        log.info("Import workflow, fileName={}, conflictStrategy={}", file.getOriginalFilename(), conflictStrategy);

        try {
            validateImportUploadFile(file);
            String json = new String(file.getBytes(), StandardCharsets.UTF_8);
            ConflictStrategy strategy = conflictResolver.parseStrategy(conflictStrategy);

            if (isBatchPayload(json)) {
                List<WorkflowExportFormat> batchFormats = parseBatchPayload(json);
                if (batchFormats.isEmpty()) {
                    return R.ok(ImportResultDTO.failure(
                        file.getOriginalFilename() != null ? file.getOriginalFilename() : "unknown",
                        "导入失败：批量文件中不包含流程定义"));
                }

                if (batchFormats.size() == 1) {
                    return R.ok(importService.importWorkflow(batchFormats.get(0), strategy));
                }

                if (!permissionService.isAdmin(UserContext.getUserId())) {
                    return R.ok(ImportResultDTO.failure(
                        file.getOriginalFilename() != null ? file.getOriginalFilename() : "unknown",
                        "导入失败：当前账号无批量导入权限"));
                }

                List<ImportResultDTO> batchResults = importService.importWorkflows(batchFormats, strategy);
                return R.ok(summarizeBatchImportResult(file.getOriginalFilename(), batchResults));
            }

            WorkflowExportFormat exportFormat = ExportFormatUtil.deserializeAndVerify(json);
            ImportResultDTO result = importService.importWorkflow(exportFormat, strategy);
            return R.ok(result);
        } catch (WorkflowException e) {
            String fileName = file != null && file.getOriginalFilename() != null ? file.getOriginalFilename() : "unknown";
            ImportResultDTO failedResult = ImportResultDTO.failure(fileName, "导入失败：" + e.getMessage());
            return R.ok(failedResult);
        } catch (Exception e) {
            log.error("Import workflow failed", e);
            String fileName = file.getOriginalFilename() != null ? file.getOriginalFilename() : "unknown";
            ImportResultDTO failedResult = ImportResultDTO.failure(fileName, "导入失败：" + e.getMessage());
            return R.ok(failedResult);
        }
    }

    @PostMapping("/import/batch")
    @SaCheckRole("admin")
    public R<List<ImportResultDTO>> importWorkflows(
            @RequestParam("files") List<MultipartFile> files,
            @RequestParam(required = false, defaultValue = "skip") String conflictStrategy) {
        if (files == null || files.isEmpty()) {
            return R.fail("导入文件不能为空");
        }
        if (files.size() > MAX_BATCH_IMPORT_FILE_COUNT) {
            return R.fail("单次批量导入文件数量不能超过 " + MAX_BATCH_IMPORT_FILE_COUNT + " 个");
        }

        log.info("Batch import workflows, count={}, conflictStrategy={}", files.size(), conflictStrategy);

        try {
            List<ImportResultDTO> invalidResults = new ArrayList<>();
            List<WorkflowExportFormat> exportFormats = new ArrayList<>();
            for (MultipartFile file : files) {
                String fileName = file != null && file.getOriginalFilename() != null ? file.getOriginalFilename() : "unknown";
                try {
                    validateImportUploadFile(file);
                    String json = new String(file.getBytes(), StandardCharsets.UTF_8);
                    if (isBatchPayload(json)) {
                        exportFormats.addAll(parseBatchPayload(json));
                    } else {
                        exportFormats.add(ExportFormatUtil.deserializeAndVerify(json));
                    }
                } catch (WorkflowException e) {
                    invalidResults.add(ImportResultDTO.failure(fileName, "导入失败: " + e.getMessage()));
                } catch (Exception e) {
                    log.error("Parse import file failed, fileName={}", fileName, e);
                    invalidResults.add(ImportResultDTO.failure(fileName, "导入失败: " + e.getMessage()));
                }
            }

            if (exportFormats.isEmpty()) {
                return R.ok(invalidResults);
            }

            ConflictStrategy strategy = conflictResolver.parseStrategy(conflictStrategy);
            List<ImportResultDTO> results = importService.importWorkflows(exportFormats, strategy);
            if (!invalidResults.isEmpty()) {
                results.addAll(invalidResults);
            }

            long successCount = results.stream().filter(r -> Boolean.TRUE.equals(r.getSuccess())).count();
            long failedCount = results.stream().filter(r -> !Boolean.TRUE.equals(r.getSuccess())).count();
            log.info("Batch import completed, success={}, failed={}", successCount, failedCount);

            return R.ok(results);
        } catch (Exception e) {
            log.error("Batch import workflows failed", e);
            return R.fail("批量导入失败: " + e.getMessage());
        }
    }

    private void ensureWorkflowOwnerOrAdmin(String workflowId) {
        Long currentUserId = UserContext.getUserId();
        Long currentTenantId = UserContext.getTenantId();
        if (currentUserId == null) {
            throw new PermissionDeniedException("User not logged in");
        }

        WfProcessDefinition definition = definitionMapper.selectById(workflowId);
        if (definition == null) {
            throw WorkflowException.processNotFound(workflowId);
        }
        if (currentTenantId != null && !Objects.equals(currentTenantId, definition.getTenantId())) {
            throw new PermissionDeniedException("无权导出其他租户流程");
        }

        boolean isCreator = currentUserId.toString().equals(definition.getCreateBy());
        boolean isAdmin = permissionService.isAdmin(currentUserId);
        if (!isCreator && !isAdmin) {
            throw new PermissionDeniedException("Only workflow owner or admin can export this workflow");
        }
    }

    private boolean isBatchPayload(String json) {
        return json != null && json.trim().startsWith("[");
    }

    private List<WorkflowExportFormat> parseBatchPayload(String json) throws Exception {
        List<WorkflowExportFormat> exportFormats = objectMapper.readValue(
            json,
            new TypeReference<List<WorkflowExportFormat>>() {}
        );
        if (exportFormats == null) {
            return new ArrayList<>();
        }
        for (WorkflowExportFormat format : exportFormats) {
            if (!ExportFormatUtil.verifyChecksum(format)) {
                throw WorkflowException.validationError("批量文件中存在 checksum 校验失败的流程定义");
            }
        }
        return exportFormats;
    }

    private ValidationResultDTO buildInvalidValidation(String errorMessage) {
        List<String> errors = new ArrayList<>();
        errors.add(errorMessage);
        return ValidationResultDTO.builder()
            .valid(false)
            .errors(errors)
            .warnings(new ArrayList<>())
            .details(errorMessage)
            .build();
    }

    private ValidationResultDTO mergeBatchValidation(List<ValidationResultDTO> validationResults) {
        List<String> errors = new ArrayList<>();
        List<String> warnings = new ArrayList<>();
        Set<String> unsupportedNodeTypes = new LinkedHashSet<>();
        Set<String> unsupportedIntegrations = new LinkedHashSet<>();

        boolean valid = true;
        boolean checksumValid = true;
        boolean hasNameConflict = false;
        int failedCount = 0;

        for (int i = 0; i < validationResults.size(); i++) {
            ValidationResultDTO result = validationResults.get(i);
            String name = result != null ? result.getWorkflowName() : null;
            String prefix = "第" + (i + 1) + "个流程" + (name != null ? "（" + name + "）" : "");

            if (result == null || !Boolean.TRUE.equals(result.getValid())) {
                valid = false;
                failedCount++;
            }
            if (result == null || !Boolean.TRUE.equals(result.getChecksumValid())) {
                checksumValid = false;
            }
            if (result != null && Boolean.TRUE.equals(result.getHasNameConflict())) {
                hasNameConflict = true;
            }

            if (result != null && result.getErrors() != null) {
                for (String error : result.getErrors()) {
                    errors.add(prefix + ": " + error);
                }
            }
            if (result != null && result.getWarnings() != null) {
                for (String warning : result.getWarnings()) {
                    warnings.add(prefix + ": " + warning);
                }
            }
            if (result != null && result.getUnsupportedNodeTypes() != null) {
                unsupportedNodeTypes.addAll(result.getUnsupportedNodeTypes());
            }
            if (result != null && result.getUnsupportedIntegrations() != null) {
                unsupportedIntegrations.addAll(result.getUnsupportedIntegrations());
            }
        }

        String details = String.format(
            "批量校验完成：共 %d 个流程，失败 %d 个",
            validationResults.size(),
            failedCount
        );

        return ValidationResultDTO.builder()
            .valid(valid)
            .workflowName("批量导入文件")
            .errors(errors)
            .warnings(warnings)
            .unsupportedNodeTypes(new ArrayList<>(unsupportedNodeTypes))
            .unsupportedIntegrations(new ArrayList<>(unsupportedIntegrations))
            .hasNameConflict(hasNameConflict)
            .checksumValid(checksumValid)
            .details(details)
            .build();
    }

    private ImportResultDTO summarizeBatchImportResult(String fileName, List<ImportResultDTO> batchResults) {
        int total = batchResults == null ? 0 : batchResults.size();
        int successCount = 0;
        int failedCount = 0;
        int skippedCount = 0;
        List<String> errors = new ArrayList<>();
        List<String> warnings = new ArrayList<>();

        if (batchResults != null) {
            for (ImportResultDTO result : batchResults) {
                if (result == null) {
                    failedCount++;
                    continue;
                }

                if (Boolean.TRUE.equals(result.getSuccess()) && !"failed".equals(result.getAction())) {
                    if ("skipped".equals(result.getAction())) {
                        skippedCount++;
                    } else {
                        successCount++;
                    }
                } else {
                    failedCount++;
                }

                if (result.getErrors() != null && !result.getErrors().isEmpty()) {
                    errors.addAll(result.getErrors());
                }
                if (result.getWarnings() != null && !result.getWarnings().isEmpty()) {
                    warnings.addAll(result.getWarnings());
                }
            }
        }

        boolean allSucceeded = failedCount == 0;
        ImportResultDTO summary = ImportResultDTO.builder()
            .success(allSucceeded)
            .workflowName(fileName != null ? fileName : "batch")
            .action(allSucceeded ? "created" : "failed")
            .message(String.format(
                "批量导入完成：共 %d 个流程，成功 %d，失败 %d，跳过 %d",
                total,
                successCount,
                failedCount,
                skippedCount
            ))
            .build();
        summary.setErrors(errors);
        summary.setWarnings(warnings);
        return summary;
    }

    private void validateImportUploadFile(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw WorkflowException.validationError("上传文件不能为空");
        }
        if (file.getSize() > MAX_IMPORT_FILE_SIZE) {
            throw WorkflowException.validationError("上传文件不能超过 10MB");
        }
        // 示例：workflow-demo.json 合法；workflow-demo.zip 会被拒绝
        String originalFilename = file.getOriginalFilename();
        if (originalFilename != null && !originalFilename.toLowerCase().endsWith(".json")) {
            throw WorkflowException.validationError("仅支持 json 文件导入");
        }
    }
}

