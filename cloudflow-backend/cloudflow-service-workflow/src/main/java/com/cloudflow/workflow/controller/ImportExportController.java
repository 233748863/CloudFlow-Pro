package com.cloudflow.workflow.controller;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.workflow.domain.dto.*;
import com.cloudflow.workflow.resolver.ConflictResolver;
import com.cloudflow.workflow.resolver.ConflictResolver.ConflictStrategy;
import com.cloudflow.workflow.service.IExportService;
import com.cloudflow.workflow.service.IImportService;
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
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/**
 * 流程导入导出控制器
 * 
 * @author CloudFlow
 */
@Slf4j
@RestController
@RequestMapping("/api/workflow/import-export")
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

    /**
     * 导出单个流程
     * 
     * @param workflowId 流程 ID
     * @param includeSensitive 是否包含敏感信息
     * @return 导出文件
     */
    @GetMapping("/export/{workflowId}")
    public ResponseEntity<Resource> exportWorkflow(
            @PathVariable String workflowId,
            @RequestParam(defaultValue = "false") Boolean includeSensitive) {
        
        log.info("导出流程, workflowId={}, includeSensitive={}", workflowId, includeSensitive);

        try {
            // 导出流程
            WorkflowExportFormat exportFormat = exportService.exportWorkflow(workflowId, includeSensitive);
            
            // 序列化为 JSON
            String json = ExportFormatUtil.serializeWithChecksum(exportFormat);
            byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
            
            // 生成文件名
            String fileName = exportService.generateExportFileName(
                exportFormat.getWorkflow().getName(),
                exportFormat.getWorkflow().getVersion()
            );
            
            // 创建资源
            ByteArrayResource resource = new ByteArrayResource(bytes);
            
            // 返回文件下载响应
            return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + fileName + "\"")
                .contentType(MediaType.APPLICATION_JSON)
                .contentLength(bytes.length)
                .body(resource);
                
        } catch (Exception e) {
            log.error("导出流程失败, workflowId={}", workflowId, e);
            throw new RuntimeException("导出流程失败: " + e.getMessage());
        }
    }

    /**
     * 批量导出流程（管理员权限）
     * 
     * @param request 批量导出请求
     * @return 导出文件
     */
    @PostMapping("/export/batch")
    @PreAuthorize("hasAnyRole('admin', 'ADMIN')")
    public ResponseEntity<Resource> exportWorkflows(@RequestBody BatchExportRequest request) {
        log.info("批量导出流程, count={}, includeSensitive={}", 
            request.getWorkflowIds().size(), request.getIncludeSensitive());

        try {
            // 批量导出流程
            List<WorkflowExportFormat> exportFormats = exportService.exportWorkflows(
                request.getWorkflowIds(),
                request.getIncludeSensitive()
            );
            
            // 序列化为 JSON 数组
            String json = objectMapper.writerWithDefaultPrettyPrinter()
                .writeValueAsString(exportFormats);
            byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
            
            // 生成文件名
            String fileName = exportService.generateBatchExportFileName();
            
            // 创建资源
            ByteArrayResource resource = new ByteArrayResource(bytes);
            
            // 返回文件下载响应
            return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + fileName + "\"")
                .contentType(MediaType.APPLICATION_JSON)
                .contentLength(bytes.length)
                .body(resource);
                
        } catch (Exception e) {
            log.error("批量导出流程失败", e);
            throw new RuntimeException("批量导出流程失败: " + e.getMessage());
        }
    }

    /**
     * 验证导入文件
     * 
     * @param file 导入文件
     * @return 验证结果
     */
    @PostMapping("/import/validate")
    public R<ValidationResultDTO> validateImportFile(@RequestParam("file") MultipartFile file) {
        log.info("验证导入文件, fileName={}, size={}", file.getOriginalFilename(), file.getSize());

        try {
            // 读取文件内容
            String json = new String(file.getBytes(), StandardCharsets.UTF_8);
            
            // 反序列化
            WorkflowExportFormat exportFormat = ExportFormatUtil.deserialize(json);
            
            // 验证
            ValidationResultDTO result = importValidator.validate(exportFormat);
            
            return R.ok(result);
            
        } catch (Exception e) {
            log.error("验证导入文件失败", e);
            return R.fail("验证失败: " + e.getMessage());
        }
    }

    /**
     * 导入流程
     * 
     * @param file 导入文件
     * @param conflictStrategy 冲突解决策略（overwrite/rename/skip）
     * @return 导入结果
     */
    @PostMapping("/import")
    public R<ImportResultDTO> importWorkflow(
            @RequestParam("file") MultipartFile file,
            @RequestParam(required = false, defaultValue = "skip") String conflictStrategy) {
        
        log.info("导入流程, fileName={}, conflictStrategy={}", 
            file.getOriginalFilename(), conflictStrategy);

        try {
            // 读取文件内容
            String json = new String(file.getBytes(), StandardCharsets.UTF_8);
            
            // 反序列化并验证校验和
            WorkflowExportFormat exportFormat = ExportFormatUtil.deserializeAndVerify(json);
            
            // 解析冲突策略
            ConflictStrategy strategy = conflictResolver.parseStrategy(conflictStrategy);
            
            // 导入流程
            ImportResultDTO result = importService.importWorkflow(exportFormat, strategy);
            
            if (result.getSuccess()) {
                return R.ok(result);
            } else {
                return R.fail(result.getMessage());
            }
            
        } catch (Exception e) {
            log.error("导入流程失败", e);
            return R.fail("导入失败: " + e.getMessage());
        }
    }

    /**
     * 批量导入流程（管理员权限）
     * 
     * @param files 导入文件列表
     * @param conflictStrategy 冲突解决策略
     * @return 导入结果列表
     */
    @PostMapping("/import/batch")
    @PreAuthorize("hasAnyRole('admin', 'ADMIN')")
    public R<List<ImportResultDTO>> importWorkflows(
            @RequestParam("files") List<MultipartFile> files,
            @RequestParam(required = false, defaultValue = "skip") String conflictStrategy) {
        
        log.info("批量导入流程, count={}, conflictStrategy={}", files.size(), conflictStrategy);

        try {
            // 解析所有文件
            List<WorkflowExportFormat> exportFormats = new ArrayList<>();
            for (MultipartFile file : files) {
                try {
                    String json = new String(file.getBytes(), StandardCharsets.UTF_8);
                    WorkflowExportFormat exportFormat = ExportFormatUtil.deserializeAndVerify(json);
                    exportFormats.add(exportFormat);
                } catch (Exception e) {
                    log.error("解析文件失败, fileName={}", file.getOriginalFilename(), e);
                    // 继续处理其他文件
                }
            }
            
            // 解析冲突策略
            ConflictStrategy strategy = conflictResolver.parseStrategy(conflictStrategy);
            
            // 批量导入
            List<ImportResultDTO> results = importService.importWorkflows(exportFormats, strategy);
            
            // 统计结果
            long successCount = results.stream().filter(r -> r.getSuccess()).count();
            long failedCount = results.stream().filter(r -> !r.getSuccess()).count();
            
            log.info("批量导入完成，成功 {} 个，失败 {} 个", successCount, failedCount);
            
            return R.ok(results);
            
        } catch (Exception e) {
            log.error("批量导入流程失败", e);
            return R.fail("批量导入失败: " + e.getMessage());
        }
    }
}
