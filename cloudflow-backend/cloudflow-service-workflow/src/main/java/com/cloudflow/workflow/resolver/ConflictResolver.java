package com.cloudflow.workflow.resolver;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.workflow.domain.WfProcessDefinition;
import com.cloudflow.workflow.domain.dto.ConflictResolution;
import com.cloudflow.workflow.domain.dto.WorkflowExportFormat;
import com.cloudflow.workflow.mapper.WfProcessDefinitionMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

/**
 * 流程导入冲突解决器
 * 处理流程名称冲突，提供三种解决策略：覆盖、重命名、跳过
 * 
 * @author CloudFlow
 */
@Slf4j
@Component
public class ConflictResolver {

    @Autowired
    private WfProcessDefinitionMapper definitionMapper;

    /**
     * 冲突解决策略枚举
     */
    public enum ConflictStrategy {
        OVERWRITE,  // 覆盖现有流程
        RENAME,     // 重命名新流程
        SKIP        // 跳过导入
    }

    /**
     * 检测流程名称冲突
     * 
     * @param workflowName 流程名称
     * @return 冲突的流程定义，如果不存在冲突则返回 null
     */
    public WfProcessDefinition detectConflict(String workflowName) {
        log.debug("检测流程名称冲突, workflowName={}", workflowName);

        if (workflowName == null || workflowName.trim().isEmpty()) {
            return null;
        }

        try {
            LambdaQueryWrapper<WfProcessDefinition> wrapper = new LambdaQueryWrapper<>();
            wrapper.eq(WfProcessDefinition::getName, workflowName);
            
            WfProcessDefinition existing = definitionMapper.selectOne(wrapper);
            
            if (existing != null) {
                log.info("检测到流程名称冲突, workflowName={}, existingId={}", 
                    workflowName, existing.getDefinitionId());
            }
            
            return existing;
        } catch (Exception e) {
            log.error("检测流程名称冲突失败", e);
            return null;
        }
    }

    /**
     * 解决冲突
     * 
     * @param exportFormat 导入的流程数据
     * @param strategy 冲突解决策略
     * @return 冲突解决结果
     */
    public ConflictResolution resolveConflict(WorkflowExportFormat exportFormat, ConflictStrategy strategy) {
        log.info("开始解决冲突, workflowName={}, strategy={}", 
            exportFormat.getWorkflow().getName(), strategy);

        ConflictResolution resolution = new ConflictResolution();
        resolution.setStrategy(strategy.name().toLowerCase());
        resolution.setOriginalName(exportFormat.getWorkflow().getName());

        // 检测冲突
        WfProcessDefinition existingWorkflow = detectConflict(exportFormat.getWorkflow().getName());
        
        if (existingWorkflow == null) {
            // 没有冲突，直接导入
            resolution.setAction("create");
            resolution.setNewName(exportFormat.getWorkflow().getName());
            resolution.setMessage("没有冲突，可以直接导入");
            return resolution;
        }

        // 有冲突，根据策略处理
        switch (strategy) {
            case OVERWRITE:
                resolution = resolveByOverwrite(existingWorkflow, exportFormat);
                break;
                
            case RENAME:
                resolution = resolveByRename(exportFormat);
                break;
                
            case SKIP:
                resolution = resolveBySkip(exportFormat);
                break;
                
            default:
                resolution.setAction("error");
                resolution.setMessage("未知的冲突解决策略: " + strategy);
        }

        log.info("冲突解决完成, action={}, newName={}", resolution.getAction(), resolution.getNewName());
        return resolution;
    }

    /**
     * 覆盖策略：替换现有流程，创建新版本
     */
    private ConflictResolution resolveByOverwrite(WfProcessDefinition existingWorkflow, 
                                                  WorkflowExportFormat exportFormat) {
        ConflictResolution resolution = new ConflictResolution();
        resolution.setStrategy("overwrite");
        resolution.setOriginalName(exportFormat.getWorkflow().getName());
        resolution.setAction("update");
        resolution.setNewName(exportFormat.getWorkflow().getName());
        resolution.setExistingWorkflowId(existingWorkflow.getDefinitionId());
        resolution.setMessage("将覆盖现有流程并创建新版本");
        
        return resolution;
    }

    /**
     * 重命名策略：自动生成新名称
     */
    private ConflictResolution resolveByRename(WorkflowExportFormat exportFormat) {
        String originalName = exportFormat.getWorkflow().getName();
        String newName = generateUniqueName(originalName);
        
        ConflictResolution resolution = new ConflictResolution();
        resolution.setStrategy("rename");
        resolution.setOriginalName(originalName);
        resolution.setAction("create");
        resolution.setNewName(newName);
        resolution.setMessage("已自动重命名为: " + newName);
        
        return resolution;
    }

    /**
     * 跳过策略：跳过导入
     */
    private ConflictResolution resolveBySkip(WorkflowExportFormat exportFormat) {
        ConflictResolution resolution = new ConflictResolution();
        resolution.setStrategy("skip");
        resolution.setOriginalName(exportFormat.getWorkflow().getName());
        resolution.setAction("skip");
        resolution.setNewName(null);
        resolution.setMessage("已跳过导入");
        
        return resolution;
    }

    /**
     * 生成唯一的流程名称
     * 格式：原名称_副本_序号
     * 
     * @param originalName 原始名称
     * @return 唯一的新名称
     */
    public String generateUniqueName(String originalName) {
        log.debug("生成唯一名称, originalName={}", originalName);

        String baseName = originalName;
        int counter = 1;
        String newName;

        // 尝试生成唯一名称，最多尝试 100 次
        while (counter <= 100) {
            newName = String.format("%s_副本_%d", baseName, counter);
            
            // 检查名称是否已存在
            if (detectConflict(newName) == null) {
                log.info("生成唯一名称成功, newName={}", newName);
                return newName;
            }
            
            counter++;
        }

        // 如果 100 次都失败，使用时间戳
        newName = String.format("%s_副本_%d", baseName, System.currentTimeMillis());
        log.warn("使用时间戳生成名称, newName={}", newName);
        return newName;
    }

    /**
     * 批量检测冲突
     * 
     * @param exportFormats 导入的流程列表
     * @return 冲突的流程名称列表
     */
    public List<String> detectBatchConflicts(List<WorkflowExportFormat> exportFormats) {
        log.info("批量检测冲突, count={}", exportFormats.size());

        List<String> conflicts = new ArrayList<>();

        for (WorkflowExportFormat exportFormat : exportFormats) {
            if (exportFormat.getWorkflow() != null && exportFormat.getWorkflow().getName() != null) {
                WfProcessDefinition existing = detectConflict(exportFormat.getWorkflow().getName());
                if (existing != null) {
                    conflicts.add(exportFormat.getWorkflow().getName());
                }
            }
        }

        log.info("批量冲突检测完成, conflictCount={}", conflicts.size());
        return conflicts;
    }

    /**
     * 批量解决冲突
     * 
     * @param exportFormats 导入的流程列表
     * @param strategy 冲突解决策略
     * @return 冲突解决结果列表
     */
    public List<ConflictResolution> resolveBatchConflicts(List<WorkflowExportFormat> exportFormats, 
                                                          ConflictStrategy strategy) {
        log.info("批量解决冲突, count={}, strategy={}", exportFormats.size(), strategy);

        List<ConflictResolution> resolutions = new ArrayList<>();

        for (WorkflowExportFormat exportFormat : exportFormats) {
            try {
                ConflictResolution resolution = resolveConflict(exportFormat, strategy);
                resolutions.add(resolution);
            } catch (Exception e) {
                log.error("解决冲突失败, workflowName={}", 
                    exportFormat.getWorkflow() != null ? exportFormat.getWorkflow().getName() : "unknown", e);
                
                // 创建错误结果
                ConflictResolution errorResolution = new ConflictResolution();
                errorResolution.setStrategy(strategy.name().toLowerCase());
                errorResolution.setOriginalName(
                    exportFormat.getWorkflow() != null ? exportFormat.getWorkflow().getName() : "unknown");
                errorResolution.setAction("error");
                errorResolution.setMessage("解决冲突失败: " + e.getMessage());
                resolutions.add(errorResolution);
            }
        }

        log.info("批量冲突解决完成, totalCount={}", resolutions.size());
        return resolutions;
    }

    /**
     * 验证冲突解决策略
     * 
     * @param strategyStr 策略字符串
     * @return 是否有效
     */
    public boolean isValidStrategy(String strategyStr) {
        if (strategyStr == null || strategyStr.trim().isEmpty()) {
            return false;
        }

        try {
            ConflictStrategy.valueOf(strategyStr.toUpperCase());
            return true;
        } catch (IllegalArgumentException e) {
            return false;
        }
    }

    /**
     * 解析冲突解决策略
     * 
     * @param strategyStr 策略字符串
     * @return 策略枚举
     */
    public ConflictStrategy parseStrategy(String strategyStr) {
        if (strategyStr == null || strategyStr.trim().isEmpty()) {
            return ConflictStrategy.SKIP; // 默认策略
        }

        try {
            return ConflictStrategy.valueOf(strategyStr.toUpperCase());
        } catch (IllegalArgumentException e) {
            log.warn("无效的冲突解决策略: {}, 使用默认策略 SKIP", strategyStr);
            return ConflictStrategy.SKIP;
        }
    }
}
