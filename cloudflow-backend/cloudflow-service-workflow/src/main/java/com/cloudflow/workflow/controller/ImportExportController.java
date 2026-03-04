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
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
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
import java.util.List;

/**
 * Workflow import/export controller.
 */
@Slf4j
@RestController
@RequestMapping("/import-export")
public class ImportExportController {

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
    @PreAuthorize("hasAnyRole('admin', 'ADMIN')")
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
    public R<ValidationResultDTO> validateImportFile(@RequestParam("file") MultipartFile file) {
        log.info("Validate import file, fileName={}, size={}", file.getOriginalFilename(), file.getSize());

        try {
            String json = new String(file.getBytes(), StandardCharsets.UTF_8);
            WorkflowExportFormat exportFormat = ExportFormatUtil.deserialize(json);
            ValidationResultDTO result = importValidator.validate(exportFormat);
            return R.ok(result);
        } catch (Exception e) {
            log.error("Validate import file failed", e);
            return R.fail("校验失败: " + e.getMessage());
        }
    }

    @PostMapping("/import")
    public R<ImportResultDTO> importWorkflow(
            @RequestParam("file") MultipartFile file,
            @RequestParam(required = false, defaultValue = "skip") String conflictStrategy) {
        if (file == null || file.isEmpty()) {
            return R.ok(ImportResultDTO.failure("unknown", "导入失败：上传文件不能为空"));
        }

        log.info("Import workflow, fileName={}, conflictStrategy={}", file.getOriginalFilename(), conflictStrategy);

        try {
            String json = new String(file.getBytes(), StandardCharsets.UTF_8);
            WorkflowExportFormat exportFormat = ExportFormatUtil.deserializeAndVerify(json);
            ConflictStrategy strategy = conflictResolver.parseStrategy(conflictStrategy);
            ImportResultDTO result = importService.importWorkflow(exportFormat, strategy);
            // 保持结构化返回，前端可根据 success/action 精确展示失败原因与冲突处理结果
            return R.ok(result);
        } catch (Exception e) {
            log.error("Import workflow failed", e);
            String fileName = file.getOriginalFilename() != null ? file.getOriginalFilename() : "unknown";
            ImportResultDTO failedResult = ImportResultDTO.failure(fileName, "导入失败：" + e.getMessage());
            // 统一返回 200 + 业务失败体，避免前端丢失冲突/校验结果上下文
            return R.ok(failedResult);
        }
    }

    @PostMapping("/import/batch")
    @PreAuthorize("hasAnyRole('admin', 'ADMIN')")
    public R<List<ImportResultDTO>> importWorkflows(
            @RequestParam("files") List<MultipartFile> files,
            @RequestParam(required = false, defaultValue = "skip") String conflictStrategy) {
        if (files == null || files.isEmpty()) {
            return R.fail("导入文件不能为空");
        }

        log.info("Batch import workflows, count={}, conflictStrategy={}", files.size(), conflictStrategy);

        try {
            List<WorkflowExportFormat> exportFormats = new ArrayList<>();
            for (MultipartFile file : files) {
                try {
                    String json = new String(file.getBytes(), StandardCharsets.UTF_8);
                    WorkflowExportFormat exportFormat = ExportFormatUtil.deserializeAndVerify(json);
                    exportFormats.add(exportFormat);
                } catch (Exception e) {
                    log.error("Parse import file failed, fileName={}", file.getOriginalFilename(), e);
                }
            }

            ConflictStrategy strategy = conflictResolver.parseStrategy(conflictStrategy);
            List<ImportResultDTO> results = importService.importWorkflows(exportFormats, strategy);

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
        if (currentUserId == null) {
            throw new PermissionDeniedException("User not logged in");
        }

        WfProcessDefinition definition = definitionMapper.selectById(workflowId);
        if (definition == null) {
            throw WorkflowException.processNotFound(workflowId);
        }

        boolean isCreator = currentUserId.toString().equals(definition.getCreateBy());
        boolean isAdmin = permissionService.isAdmin(currentUserId);
        if (!isCreator && !isAdmin) {
            throw new PermissionDeniedException("Only workflow owner or admin can export this workflow");
        }
    }
}
