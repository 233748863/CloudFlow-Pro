package com.cloudflow.workflow.service.impl;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.workflow.domain.WfProcessDefinition;
import com.cloudflow.workflow.domain.dto.ConflictResolution;
import com.cloudflow.workflow.domain.dto.ImportResultDTO;
import com.cloudflow.workflow.domain.dto.ValidationResultDTO;
import com.cloudflow.workflow.domain.dto.WorkflowExportFormat;
import com.cloudflow.workflow.exception.WorkflowException;
import com.cloudflow.workflow.mapper.WfProcessDefinitionMapper;
import com.cloudflow.workflow.resolver.ConflictResolver;
import com.cloudflow.workflow.resolver.ConflictResolver.ConflictStrategy;
import com.cloudflow.workflow.service.IImportService;
import com.cloudflow.workflow.service.IVersionService;
import com.cloudflow.workflow.validator.ImportValidator;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * 流程导入服务实现类
 * 
 * @author CloudFlow
 */
@Slf4j
@Service
public class ImportServiceImpl implements IImportService {

    @Autowired
    private WfProcessDefinitionMapper definitionMapper;

    @Autowired
    private ImportValidator importValidator;

    @Autowired
    private ConflictResolver conflictResolver;

    @Autowired
    private IVersionService versionService;

    @Autowired
    private ObjectMapper objectMapper;

    /**
     * 导入单个流程
     * 使用事务保证原子性
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public ImportResultDTO importWorkflow(WorkflowExportFormat exportFormat, ConflictStrategy strategy) {
        log.info("开始导入流程, workflowName={}, strategy={}", 
            exportFormat.getWorkflow().getName(), strategy);

        try {
            // 1. 验证导入文件
            ValidationResultDTO validationResult = importValidator.validate(exportFormat);
            if (!validationResult.getValid()) {
                log.error("导入验证失败, errors={}", validationResult.getErrors());
                return ImportResultDTO.failure(
                    exportFormat.getWorkflow().getName(),
                    "验证失败: " + String.join(", ", validationResult.getErrors())
                );
            }

            // 2. 解决冲突
            ConflictResolution resolution = conflictResolver.resolveConflict(exportFormat, strategy);
            
            // 如果是跳过策略
            if ("skip".equals(resolution.getAction())) {
                log.info("跳过导入, workflowName={}", exportFormat.getWorkflow().getName());
                return ImportResultDTO.skipped(
                    exportFormat.getWorkflow().getName(),
                    resolution.getMessage()
                );
            }

            // 3. 执行导入
            String workflowId;
            String action;
            
            if ("update".equals(resolution.getAction())) {
                // 覆盖现有流程
                workflowId = updateExistingWorkflow(exportFormat, resolution);
                action = "updated";
            } else {
                // 创建新流程
                workflowId = createNewWorkflow(exportFormat, resolution);
                action = "created";
            }

            // 4. 创建初始版本
            createInitialVersion(workflowId, exportFormat);

            log.info("流程导入成功, workflowId={}, workflowName={}, action={}", 
                workflowId, resolution.getNewName(), action);

            ImportResultDTO result = ImportResultDTO.success(workflowId, resolution.getNewName(), action);
            
            // 添加警告信息
            if (validationResult.getWarnings() != null && !validationResult.getWarnings().isEmpty()) {
                result.setWarnings(validationResult.getWarnings());
            }
            
            return result;

        } catch (Exception e) {
            log.error("导入流程失败, workflowName={}", 
                exportFormat.getWorkflow().getName(), e);
            // 事务会自动回滚
            throw new WorkflowException("导入失败: " + e.getMessage());
        }
    }

    /**
     * 批量导入流程
     */
    @Override
    public List<ImportResultDTO> importWorkflows(List<WorkflowExportFormat> exportFormats, 
                                                 ConflictStrategy strategy) {
        log.info("开始批量导入流程, count={}, strategy={}", exportFormats.size(), strategy);

        List<ImportResultDTO> results = new ArrayList<>();

        for (WorkflowExportFormat exportFormat : exportFormats) {
            try {
                // 每个流程使用独立事务
                ImportResultDTO result = importWorkflow(exportFormat, strategy);
                results.add(result);
            } catch (Exception e) {
                log.error("导入流程失败, workflowName={}", 
                    exportFormat.getWorkflow() != null ? exportFormat.getWorkflow().getName() : "unknown", e);
                
                // 记录失败结果
                results.add(ImportResultDTO.failure(
                    exportFormat.getWorkflow() != null ? exportFormat.getWorkflow().getName() : "unknown",
                    e.getMessage()
                ));
            }
        }

        // 统计结果
        long successCount = results.stream().filter(r -> r.getSuccess()).count();
        long failedCount = results.stream().filter(r -> !r.getSuccess()).count();
        long skippedCount = results.stream().filter(r -> "skipped".equals(r.getAction())).count();

        log.info("批量导入完成, 总数={}, 成功={}, 失败={}, 跳过={}", 
            results.size(), successCount, failedCount, skippedCount);

        return results;
    }

    /**
     * 更新现有流程
     */
    private String updateExistingWorkflow(WorkflowExportFormat exportFormat, 
                                         ConflictResolution resolution) {
        log.info("更新现有流程, workflowId={}", resolution.getExistingWorkflowId());

        // 查询现有流程
        WfProcessDefinition existing = definitionMapper.selectById(resolution.getExistingWorkflowId());
        if (existing == null) {
            throw new WorkflowException("现有流程不存在: " + resolution.getExistingWorkflowId());
        }

        // 更新流程定义
        try {
            String definitionJson = objectMapper.writeValueAsString(
                exportFormat.getWorkflow().getDefinition());
            existing.setModelJson(definitionJson);
        } catch (Exception e) {
            throw new WorkflowException("序列化流程定义失败: " + e.getMessage());
        }

        // 更新描述
        if (exportFormat.getWorkflow().getDescription() != null) {
            existing.setDescription(exportFormat.getWorkflow().getDescription());
        }

        // 更新标签
        if (exportFormat.getWorkflow().getTags() != null) {
            try {
                existing.setTags(objectMapper.writeValueAsString(exportFormat.getWorkflow().getTags()));
            } catch (Exception e) {
                log.warn("序列化标签失败", e);
            }
        }

        // 更新时间和操作人
        existing.setUpdateTime(LocalDateTime.now());
        existing.setUpdateBy(UserContext.getUserId() != null ? 
            UserContext.getUserId().toString() : "system");

        // 保存到数据库
        definitionMapper.updateById(existing);

        return existing.getDefinitionId();
    }

    /**
     * 创建新流程
     */
    private String createNewWorkflow(WorkflowExportFormat exportFormat, 
                                    ConflictResolution resolution) {
        log.info("创建新流程, workflowName={}", resolution.getNewName());

        WfProcessDefinition definition = new WfProcessDefinition();
        
        // 生成新 ID
        definition.setDefinitionId(UUID.randomUUID().toString().replace("-", ""));
        
        // 设置名称（使用解决冲突后的名称）
        definition.setProcessName(resolution.getNewName());
        
        // 设置描述
        definition.setDescription(exportFormat.getWorkflow().getDescription());
        
        // 设置分类
        if (exportFormat.getWorkflow().getCategoryId() != null) {
            definition.setCategory(exportFormat.getWorkflow().getCategoryId());
        }
        
        // 设置标签
        if (exportFormat.getWorkflow().getTags() != null) {
            try {
                definition.setTags(objectMapper.writeValueAsString(exportFormat.getWorkflow().getTags()));
            } catch (Exception e) {
                log.warn("序列化标签失败", e);
            }
        }
        
        // 设置流程定义
        try {
            String definitionJson = objectMapper.writeValueAsString(
                exportFormat.getWorkflow().getDefinition());
            definition.setModelJson(definitionJson);
        } catch (Exception e) {
            throw new WorkflowException("序列化流程定义失败: " + e.getMessage());
        }
        
        // 设置状态
        definition.setStatus("draft");
        
        // 设置创建信息
        definition.setCreateTime(LocalDateTime.now());
        definition.setUpdateTime(LocalDateTime.now());
        Long userId = UserContext.getUserId();
        String userIdStr = userId != null ? userId.toString() : "system";
        definition.setCreateBy(userIdStr);
        definition.setUpdateBy(userIdStr);
        
        // 设置租户信息
        Long tenantId = UserContext.getTenantId();
        if (tenantId != null) {
            definition.setTenantId(tenantId);
        }
        
        // 保存到数据库
        definitionMapper.insert(definition);

        return definition.getDefinitionId();
    }

    /**
     * 创建初始版本
     */
    private void createInitialVersion(String workflowId, WorkflowExportFormat exportFormat) {
        log.debug("创建初始版本, workflowId={}", workflowId);

        try {
            // 序列化流程定义
            String definitionJson = objectMapper.writeValueAsString(
                exportFormat.getWorkflow().getDefinition());

            // 获取当前用户
            String createdBy = UserContext.getUserId() != null ? 
                UserContext.getUserId().toString() : "system";

            // 创建版本记录
            versionService.createVersion(
                workflowId,
                definitionJson,
                "从导入创建",
                createdBy
            );
        } catch (Exception e) {
            log.warn("创建初始版本失败, workflowId={}", workflowId, e);
            // 不抛出异常，版本创建失败不影响导入
        }
    }
}
