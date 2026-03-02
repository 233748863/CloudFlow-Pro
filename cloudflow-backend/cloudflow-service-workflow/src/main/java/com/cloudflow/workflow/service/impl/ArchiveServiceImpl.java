package com.cloudflow.workflow.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.workflow.domain.WfProcessArchive;
import com.cloudflow.workflow.domain.WfAuditLog;
import com.cloudflow.workflow.domain.WfProcessDefinition;
import com.cloudflow.workflow.domain.WorkflowVersion;
import com.cloudflow.workflow.domain.dto.ArchivedWorkflowDTO;
import com.cloudflow.workflow.domain.dto.BatchOperationResultDTO;
import com.cloudflow.workflow.domain.dto.OperationDetailDTO;
import com.cloudflow.workflow.domain.dto.SafetyCheckResultDTO;
import com.cloudflow.workflow.enums.OperationType;
import com.cloudflow.workflow.enums.TargetType;
import com.cloudflow.workflow.mapper.WfProcessArchiveMapper;
import com.cloudflow.workflow.mapper.WfAuditLogMapper;
import com.cloudflow.workflow.mapper.WfProcessDefinitionMapper;
import com.cloudflow.workflow.mapper.WorkflowVersionMapper;
import com.cloudflow.workflow.service.IArchiveService;
import com.cloudflow.workflow.service.IAuditLogService;
import com.cloudflow.workflow.service.INotificationService;
import com.cloudflow.workflow.util.SafetyChecker;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * 流程归档服务实现
 * 
 * @author CloudFlow
 */
@Slf4j
@Service
public class ArchiveServiceImpl implements IArchiveService {

    @Autowired
    private WfProcessDefinitionMapper definitionMapper;

    @Autowired
    private WfProcessArchiveMapper archiveMapper;

    @Autowired
    private WorkflowVersionMapper versionMapper;

    @Autowired
    private WfAuditLogMapper auditLogMapper;

    @Autowired
    private SafetyChecker safetyChecker;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private IAuditLogService auditLogService;

    @Autowired
    private INotificationService notificationService;

    /**
     * 归档单个流程
     */
    @Override
    public BatchOperationResultDTO archiveWorkflow(String workflowId, String reason) {
        List<String> workflowIds = new ArrayList<>();
        workflowIds.add(workflowId);
        return archiveWorkflows(workflowIds, reason);
    }

    /**
     * 批量归档流程
     */
    @Override
    public BatchOperationResultDTO archiveWorkflows(List<String> workflowIds, String reason) {
        log.info("开始批量归档流程, workflowCount={}, reason={}", workflowIds.size(), reason);

        // 1. 执行安全检查
        SafetyCheckResultDTO safetyCheck = safetyChecker.checkSafety(workflowIds);
        if (!safetyCheck.getSafe()) {
            log.warn("安全检查失败: {}", safetyCheck.getMessage());
            return BatchOperationResultDTO.builder()
                .totalCount(workflowIds.size())
                .successCount(0)
                .failedCount(workflowIds.size())
                .skippedCount(0)
                .message("安全检查失败: " + safetyCheck.getMessage())
                .details(new ArrayList<>())
                .build();
        }

        // 2. 批量归档（每个流程使用独立事务）
        List<OperationDetailDTO> details = new ArrayList<>();
        for (String workflowId : workflowIds) {
            OperationDetailDTO detail = archiveSingleWorkflow(workflowId, reason);
            details.add(detail);
        }

        // 3. 统计结果
        long successCount = details.stream()
            .filter(d -> "success".equals(d.getStatus()))
            .count();
        long failedCount = details.stream()
            .filter(d -> "failed".equals(d.getStatus()))
            .count();
        long skippedCount = details.stream()
            .filter(d -> "skipped".equals(d.getStatus()))
            .count();

        BatchOperationResultDTO result = BatchOperationResultDTO.builder()
            .totalCount(workflowIds.size())
            .successCount((int) successCount)
            .failedCount((int) failedCount)
            .skippedCount((int) skippedCount)
            .message(String.format("归档完成: 成功 %d, 失败 %d, 跳过 %d", 
                successCount, failedCount, skippedCount))
            .details(details)
            .build();

        log.info("批量归档完成: {}", result.getMessage());
        return result;
    }

    /**
     * 归档单个流程（使用独立事务）
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW, rollbackFor = Exception.class)
    public OperationDetailDTO archiveSingleWorkflow(String workflowId, String reason) {
        try {
            log.debug("归档流程: workflowId={}", workflowId);

            // 1. 查询流程
            WfProcessDefinition definition = definitionMapper.selectById(workflowId);
            if (definition == null) {
                return OperationDetailDTO.builder()
                    .workflowId(workflowId)
                    .workflowName("未知")
                    .status("failed")
                    .message("流程不存在")
                    .build();
            }

            // 2. 检查是否已归档
            if (definition.getIsArchived() != null && definition.getIsArchived() == 1) {
                return OperationDetailDTO.builder()
                    .workflowId(workflowId)
                    .workflowName(definition.getProcessName())
                    .status("skipped")
                    .message("流程已归档")
                    .build();
            }

            // 3. 创建归档记录
            WfProcessArchive archive = new WfProcessArchive();
            archive.setId(UUID.randomUUID().toString().replace("-", ""));
            archive.setWorkflowId(workflowId);
            archive.setWorkflowName(definition.getProcessName());
            archive.setArchivedBy(UserContext.getUserId().toString());
            archive.setArchivedAt(LocalDateTime.now());
            archive.setArchiveReason(reason);
            archive.setCanRestore(1); // 默认可恢复

            // 4. 保存原始数据（JSON 格式）
            try {
                String originalData = objectMapper.writeValueAsString(definition);
                archive.setOriginalData(originalData);
            } catch (JsonProcessingException e) {
                log.error("序列化流程数据失败: workflowId={}", workflowId, e);
                return OperationDetailDTO.builder()
                    .workflowId(workflowId)
                    .workflowName(definition.getProcessName())
                    .status("failed")
                    .message("序列化流程数据失败: " + e.getMessage())
                    .build();
            }

            archiveMapper.insert(archive);

            // 5. 标记流程为归档状态
            definition.setIsArchived(1);
            definitionMapper.updateById(definition);

            // 6. 发送归档通知
            String operatorName = UserContext.getUserName();
            if (operatorName == null || operatorName.isEmpty()) {
                operatorName = "管理员";
            }
            // 将 createBy 从 String 转换为 Long
            Long createById = null;
            try {
                if (definition.getCreateBy() != null && !definition.getCreateBy().isEmpty()) {
                    createById = Long.parseLong(definition.getCreateBy());
                }
            } catch (NumberFormatException e) {
                log.warn("无法解析创建者ID: {}", definition.getCreateBy());
            }
            
            if (createById != null) {
                notificationService.sendArchiveNotification(
                    createById, 
                    workflowId, 
                    definition.getProcessName(),
                    reason,
                    operatorName
                );
            }

            // 7. 记录审计日志
            auditLogService.log(
                OperationType.WORKFLOW_ARCHIVE,
                TargetType.WORKFLOW,
                workflowId,
                definition.getProcessName(),
                reason
            );

            log.info("流程归档成功: workflowId={}, name={}", workflowId, definition.getProcessName());

            return OperationDetailDTO.builder()
                .workflowId(workflowId)
                .workflowName(definition.getProcessName())
                .status("success")
                .message("归档成功")
                .build();

        } catch (Exception e) {
            log.error("归档流程失败: workflowId={}", workflowId, e);
            return OperationDetailDTO.builder()
                .workflowId(workflowId)
                .workflowName("未知")
                .status("failed")
                .message("归档失败: " + e.getMessage())
                .build();
        }
    }

    /**
     * 恢复归档流程
     */
    @Override
    public BatchOperationResultDTO restoreWorkflow(String workflowId) {
        List<String> workflowIds = new ArrayList<>();
        workflowIds.add(workflowId);
        return restoreWorkflows(workflowIds);
    }

    /**
     * 批量恢复归档流程
     */
    @Override
    public BatchOperationResultDTO restoreWorkflows(List<String> workflowIds) {
        log.info("开始批量恢复归档流程, workflowCount={}", workflowIds.size());

        // 批量恢复（每个流程使用独立事务）
        List<OperationDetailDTO> details = new ArrayList<>();
        for (String workflowId : workflowIds) {
            OperationDetailDTO detail = restoreSingleWorkflow(workflowId);
            details.add(detail);
        }

        // 统计结果
        long successCount = details.stream()
            .filter(d -> "success".equals(d.getStatus()))
            .count();
        long failedCount = details.stream()
            .filter(d -> "failed".equals(d.getStatus()))
            .count();
        long skippedCount = details.stream()
            .filter(d -> "skipped".equals(d.getStatus()))
            .count();

        BatchOperationResultDTO result = BatchOperationResultDTO.builder()
            .totalCount(workflowIds.size())
            .successCount((int) successCount)
            .failedCount((int) failedCount)
            .skippedCount((int) skippedCount)
            .message(String.format("恢复完成: 成功 %d, 失败 %d, 跳过 %d", 
                successCount, failedCount, skippedCount))
            .details(details)
            .build();

        log.info("批量恢复完成: {}", result.getMessage());
        return result;
    }

    /**
     * 恢复单个归档流程（使用独立事务）
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW, rollbackFor = Exception.class)
    public OperationDetailDTO restoreSingleWorkflow(String workflowId) {
        try {
            log.debug("恢复归档流程: workflowId={}", workflowId);

            // 1. 查询流程
            WfProcessDefinition definition = definitionMapper.selectById(workflowId);
            if (definition == null) {
                return OperationDetailDTO.builder()
                    .workflowId(workflowId)
                    .workflowName("未知")
                    .status("failed")
                    .message("流程不存在")
                    .build();
            }

            // 2. 检查是否已归档
            if (definition.getIsArchived() == null || definition.getIsArchived() == 0) {
                return OperationDetailDTO.builder()
                    .workflowId(workflowId)
                    .workflowName(definition.getProcessName())
                    .status("skipped")
                    .message("流程未归档")
                    .build();
            }

            // 3. 恢复流程状态
            definition.setIsArchived(0);
            definitionMapper.updateById(definition);

            // 4. 发送恢复通知
            String operatorName = UserContext.getUserName();
            if (operatorName == null || operatorName.isEmpty()) {
                operatorName = "管理员";
            }
            // 将 createBy 从 String 转换为 Long
            Long createById = null;
            try {
                if (definition.getCreateBy() != null && !definition.getCreateBy().isEmpty()) {
                    createById = Long.parseLong(definition.getCreateBy());
                }
            } catch (NumberFormatException e) {
                log.warn("无法解析创建者ID: {}", definition.getCreateBy());
            }
            
            if (createById != null) {
                notificationService.sendRestoreNotification(
                    createById,
                    workflowId,
                    definition.getProcessName(),
                    operatorName
                );
            }

            // 5. 记录审计日志
            auditLogService.log(
                OperationType.WORKFLOW_RESTORE,
                TargetType.WORKFLOW,
                workflowId,
                definition.getProcessName(),
                "恢复归档流程"
            );

            log.info("流程恢复成功: workflowId={}, name={}", workflowId, definition.getProcessName());

            return OperationDetailDTO.builder()
                .workflowId(workflowId)
                .workflowName(definition.getProcessName())
                .status("success")
                .message("恢复成功")
                .build();

        } catch (Exception e) {
            log.error("恢复流程失败: workflowId={}", workflowId, e);
            return OperationDetailDTO.builder()
                .workflowId(workflowId)
                .workflowName("未知")
                .status("failed")
                .message("恢复失败: " + e.getMessage())
                .build();
        }
    }

    /**
     * 查询归档流程列表（分页）
     */
    @Override
    public Page<ArchivedWorkflowDTO> listArchivedWorkflows(
            String keyword,
            LocalDateTime archivedAfter,
            LocalDateTime archivedBefore,
            int pageNum,
            int pageSize) {
        
        log.info("查询归档流程列表: keyword={}, archivedAfter={}, archivedBefore={}, pageNum={}, pageSize={}",
            keyword, archivedAfter, archivedBefore, pageNum, pageSize);

        // 构建查询条件
        LambdaQueryWrapper<WfProcessArchive> queryWrapper = new LambdaQueryWrapper<>();
        
        // 关键词搜索（流程名称或归档原因）
        if (StringUtils.hasText(keyword)) {
            queryWrapper.and(wrapper -> wrapper
                .like(WfProcessArchive::getWorkflowName, keyword)
                .or()
                .like(WfProcessArchive::getArchiveReason, keyword)
            );
        }
        
        // 归档时间范围
        if (archivedAfter != null) {
            queryWrapper.ge(WfProcessArchive::getArchivedAt, archivedAfter);
        }
        if (archivedBefore != null) {
            queryWrapper.le(WfProcessArchive::getArchivedAt, archivedBefore);
        }
        
        // 按归档时间倒序
        queryWrapper.orderByDesc(WfProcessArchive::getArchivedAt);

        // 分页查询
        Page<WfProcessArchive> page = new Page<>(pageNum, pageSize);
        Page<WfProcessArchive> archivePage = archiveMapper.selectPage(page, queryWrapper);

        // 转换为 DTO
        Page<ArchivedWorkflowDTO> resultPage = new Page<>(pageNum, pageSize);
        resultPage.setTotal(archivePage.getTotal());
        
        List<ArchivedWorkflowDTO> dtoList = archivePage.getRecords().stream()
            .map(this::convertToDTO)
            .collect(Collectors.toList());
        
        resultPage.setRecords(dtoList);

        log.info("查询归档流程列表完成: total={}", resultPage.getTotal());
        return resultPage;
    }

    /**
     * 永久删除流程
     */
    @Override
    public BatchOperationResultDTO permanentDeleteWorkflow(String workflowId) {
        List<String> workflowIds = new ArrayList<>();
        workflowIds.add(workflowId);
        return permanentDeleteWorkflows(workflowIds);
    }

    /**
     * 批量永久删除流程
     */
    @Override
    public BatchOperationResultDTO permanentDeleteWorkflows(List<String> workflowIds) {
        log.info("开始批量永久删除流程, workflowCount={}", workflowIds.size());

        // 批量删除（每个流程使用独立事务）
        List<OperationDetailDTO> details = new ArrayList<>();
        for (String workflowId : workflowIds) {
            OperationDetailDTO detail = permanentDeleteSingleWorkflow(workflowId);
            details.add(detail);
        }

        // 统计结果
        long successCount = details.stream()
            .filter(d -> "success".equals(d.getStatus()))
            .count();
        long failedCount = details.stream()
            .filter(d -> "failed".equals(d.getStatus()))
            .count();
        long skippedCount = details.stream()
            .filter(d -> "skipped".equals(d.getStatus()))
            .count();

        BatchOperationResultDTO result = BatchOperationResultDTO.builder()
            .totalCount(workflowIds.size())
            .successCount((int) successCount)
            .failedCount((int) failedCount)
            .skippedCount((int) skippedCount)
            .message(String.format("永久删除完成: 成功 %d, 失败 %d, 跳过 %d", 
                successCount, failedCount, skippedCount))
            .details(details)
            .build();

        log.info("批量永久删除完成: {}", result.getMessage());
        return result;
    }

    /**
     * 永久删除单个流程（使用独立事务）
     * 级联删除流程定义、版本历史和归档记录
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW, rollbackFor = Exception.class)
    public OperationDetailDTO permanentDeleteSingleWorkflow(String workflowId) {
        try {
            log.debug("永久删除流程: workflowId={}", workflowId);

            // 1. 查询流程
            WfProcessDefinition definition = definitionMapper.selectById(workflowId);
            if (definition == null) {
                return OperationDetailDTO.builder()
                    .workflowId(workflowId)
                    .workflowName("未知")
                    .status("failed")
                    .message("流程不存在")
                    .build();
            }

            String workflowName = definition.getProcessName();

            // 2. 删除版本历史
            LambdaQueryWrapper<WorkflowVersion> versionQuery = new LambdaQueryWrapper<>();
            versionQuery.eq(WorkflowVersion::getWorkflowId, workflowId);
            int versionCount = versionMapper.delete(versionQuery);
            log.debug("删除版本历史: workflowId={}, count={}", workflowId, versionCount);

            // 3. 删除归档记录
            LambdaQueryWrapper<WfProcessArchive> archiveQuery = new LambdaQueryWrapper<>();
            archiveQuery.eq(WfProcessArchive::getWorkflowId, workflowId);
            int archiveCount = archiveMapper.delete(archiveQuery);
            log.debug("删除归档记录: workflowId={}, count={}", workflowId, archiveCount);

            // 4. 删除流程定义
            LambdaQueryWrapper<WfAuditLog> auditLogQuery = new LambdaQueryWrapper<>();
            auditLogQuery.eq(WfAuditLog::getTargetType, TargetType.WORKFLOW.name())
                .eq(WfAuditLog::getTargetId, workflowId);
            int auditLogCount = auditLogMapper.delete(auditLogQuery);
            log.debug("Deleted workflow audit logs: workflowId={}, count={}", workflowId, auditLogCount);

            definitionMapper.deleteById(workflowId);

            // 5. 记录审计日志
            auditLogService.log(
                OperationType.WORKFLOW_DELETE,
                TargetType.WORKFLOW,
                workflowId,
                workflowName,
                "永久删除流程"
            );

            log.info("流程永久删除成功: workflowId={}, name={}", workflowId, workflowName);

            return OperationDetailDTO.builder()
                .workflowId(workflowId)
                .workflowName(workflowName)
                .status("success")
                .message("永久删除成功")
                .build();

        } catch (Exception e) {
            log.error("永久删除流程失败: workflowId={}", workflowId, e);
            return OperationDetailDTO.builder()
                .workflowId(workflowId)
                .workflowName("未知")
                .status("failed")
                .message("永久删除失败: " + e.getMessage())
                .build();
        }
    }

    /**
     * 转换归档记录为 DTO
     */
    private ArchivedWorkflowDTO convertToDTO(WfProcessArchive archive) {
        return ArchivedWorkflowDTO.builder()
            .id(archive.getId())
            .workflowId(archive.getWorkflowId())
            .workflowName(archive.getWorkflowName())
            .archivedBy(archive.getArchivedBy())
            .archivedByName(archive.getArchivedBy()) // TODO: 查询用户名称
            .archivedAt(archive.getArchivedAt())
            .archiveReason(archive.getArchiveReason())
            .canRestore(archive.getCanRestore() == 1)
            .build();
    }
}
