package com.cloudflow.workflow.service.impl;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.workflow.domain.WfProcessDefinition;
import com.cloudflow.workflow.domain.WorkflowVersion;
import com.cloudflow.workflow.domain.dto.WorkflowExportFormat;
import com.cloudflow.workflow.exception.WorkflowException;
import com.cloudflow.workflow.mapper.WfProcessDefinitionMapper;
import com.cloudflow.workflow.service.IExportService;
import com.cloudflow.workflow.service.IVersionService;
import com.cloudflow.workflow.util.ExportFormatUtil;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * 流程导出服务实现类
 * 
 * @author CloudFlow
 */
@Slf4j
@Service
public class ExportServiceImpl implements IExportService {

    @Autowired
    private WfProcessDefinitionMapper definitionMapper;

    @Autowired
    private IVersionService versionService;

    @Autowired
    private ObjectMapper objectMapper;

    /**
     * 敏感字段模式（用于过滤敏感配置）
     */
    private static final Pattern SENSITIVE_PATTERN = Pattern.compile(
        "(password|secret|token|key|credential|apikey|accesskey|privatekey)",
        Pattern.CASE_INSENSITIVE
    );

    /**
     * 导出单个流程
     */
    @Override
    public WorkflowExportFormat exportWorkflow(String workflowId, boolean includeSensitive) {
        log.info("开始导出流程, workflowId={}, includeSensitive={}", workflowId, includeSensitive);

        try {
            // 查询流程定义
            WfProcessDefinition definition = definitionMapper.selectById(workflowId);
            if (definition == null) {
                throw new WorkflowException("流程不存在: " + workflowId);
            }
            Long currentTenantId = UserContext.getTenantId();
            if (currentTenantId != null && definition.getTenantId() != null
                    && !currentTenantId.equals(definition.getTenantId())) {
                throw WorkflowException.permissionDenied("导出其他租户流程");
            }

            // 获取最新版本信息
            WorkflowVersion latestVersion = versionService.getLatestVersion(workflowId);
            String versionNumber = latestVersion != null ? latestVersion.getVersionNumber() : "1.0.0";

            // 创建导出格式对象
            WorkflowExportFormat exportFormat = new WorkflowExportFormat();
            exportFormat.setVersion("1.0.0"); // 导出格式版本
            exportFormat.setExportedAt(LocalDateTime.now());
            
            // 设置导出用户信息
            Long userId = UserContext.getUserId();
            String userName = UserContext.getUserName();
            exportFormat.setExportedBy(userId != null ? userId.toString() : "system");
            exportFormat.setExportedByName(userName != null ? userName : "系统");

            // 创建流程数据
            WorkflowExportFormat.WorkflowData workflowData = new WorkflowExportFormat.WorkflowData();
            workflowData.setId(definition.getDefinitionId());
            workflowData.setName(definition.getName());
            workflowData.setDescription(definition.getDescription());
            workflowData.setProcessKey(definition.getProcessKey());
            workflowData.setCategoryId(definition.getCategory());
            workflowData.setFormId(definition.getFormId());
            workflowData.setStartPermissionType(definition.getStartPermissionType());
            workflowData.setStartPermissionValue(definition.getStartPermissionValue());
            workflowData.setDeptId(definition.getDeptId());
            
            // 解析标签
            if (definition.getTags() != null && !definition.getTags().isEmpty()) {
                try {
                    @SuppressWarnings("unchecked")
                    List<String> tags = objectMapper.readValue(definition.getTags(), List.class);
                    workflowData.setTags(tags);
                } catch (Exception e) {
                    log.warn("解析标签失败, workflowId={}", workflowId, e);
                    workflowData.setTags(new ArrayList<>());
                }
            }

            // 处理流程定义
            Object processDefinition = parseDefinition(definition.getModelJson());
            if (!includeSensitive) {
                processDefinition = removeSensitiveData(processDefinition);
            }
            workflowData.setDefinition(processDefinition);
            workflowData.setVersion(versionNumber);
            workflowData.setIncludeSensitive(includeSensitive);

            // 创建元数据
            Map<String, Object> metadata = new HashMap<>();
            metadata.put("createdAt", definition.getCreateTime());
            metadata.put("updatedAt", definition.getUpdateTime());
            metadata.put("createdBy", definition.getCreateBy());
            metadata.put("status", definition.getStatus());
            metadata.put("processKey", definition.getProcessKey());
            metadata.put("formId", definition.getFormId());
            metadata.put("startPermissionType", definition.getStartPermissionType());
            metadata.put("startPermissionValue", definition.getStartPermissionValue());
            metadata.put("deptId", definition.getDeptId());
            workflowData.setMetadata(metadata);

            exportFormat.setWorkflow(workflowData);

            // 提取依赖信息
            WorkflowExportFormat.DependencyInfo dependencies = extractDependencies(processDefinition);
            exportFormat.setDependencies(dependencies);

            // 计算并设置校验和
            String checksum = ExportFormatUtil.calculateChecksum(exportFormat);
            exportFormat.setChecksum(checksum);

            log.info("流程导出成功, workflowId={}, workflowName={}", workflowId, definition.getName());
            return exportFormat;

        } catch (Exception e) {
            log.error("导出流程失败, workflowId={}", workflowId, e);
            throw new WorkflowException("导出流程失败: " + e.getMessage());
        }
    }

    /**
     * 批量导出流程
     */
    @Override
    public List<WorkflowExportFormat> exportWorkflows(List<String> workflowIds, boolean includeSensitive) {
        log.info("开始批量导出流程, count={}, includeSensitive={}", workflowIds.size(), includeSensitive);

        List<WorkflowExportFormat> results = new ArrayList<>();
        List<String> failedIds = new ArrayList<>();

        for (String workflowId : workflowIds) {
            try {
                WorkflowExportFormat exportFormat = exportWorkflow(workflowId, includeSensitive);
                results.add(exportFormat);
            } catch (Exception e) {
                log.error("导出流程失败, workflowId={}", workflowId, e);
                failedIds.add(workflowId);
            }
        }

        if (!failedIds.isEmpty()) {
            log.warn("部分流程导出失败, failedIds={}", failedIds);
        }

        log.info("批量导出完成, 成功={}, 失败={}", results.size(), failedIds.size());
        return results;
    }

    /**
     * 生成导出文件名
     */
    @Override
    public String generateExportFileName(String workflowName, String version) {
        // 清理文件名中的非法字符
        String cleanName = workflowName.replaceAll("[^a-zA-Z0-9\\u4e00-\\u9fa5_-]", "_");
        
        // 生成日期字符串
        String dateStr = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMdd_HHmmss"));
        
        return String.format("workflow_%s_%s_%s.json", cleanName, version, dateStr);
    }

    /**
     * 生成批量导出文件名
     */
    @Override
    public String generateBatchExportFileName() {
        String dateStr = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMdd_HHmmss"));
        return String.format("workflows_batch_%s.json", dateStr);
    }

    /**
     * 解析流程定义 JSON
     */
    private Object parseDefinition(String definitionJson) {
        try {
            return objectMapper.readValue(definitionJson, Object.class);
        } catch (Exception e) {
            log.error("解析流程定义失败", e);
            return definitionJson; // 返回原始字符串
        }
    }

    /**
     * 移除敏感数据
     * 递归遍历对象，移除包含敏感关键字的字段
     */
    @SuppressWarnings("unchecked")
    private Object removeSensitiveData(Object obj) {
        if (obj == null) {
            return null;
        }

        if (obj instanceof Map) {
            Map<String, Object> map = (Map<String, Object>) obj;
            Map<String, Object> cleaned = new HashMap<>();
            
            for (Map.Entry<String, Object> entry : map.entrySet()) {
                String key = entry.getKey();
                Object value = entry.getValue();
                
                // 检查字段名是否包含敏感关键字
                if (SENSITIVE_PATTERN.matcher(key).find()) {
                    cleaned.put(key, "***REDACTED***");
                } else {
                    cleaned.put(key, removeSensitiveData(value));
                }
            }
            return cleaned;
            
        } else if (obj instanceof List) {
            List<Object> list = (List<Object>) obj;
            return list.stream()
                .map(this::removeSensitiveData)
                .collect(Collectors.toList());
                
        } else {
            return obj;
        }
    }

    /**
     * 提取依赖信息
     * 分析流程定义，提取使用的节点类型和集成
     */
    @SuppressWarnings("unchecked")
    private WorkflowExportFormat.DependencyInfo extractDependencies(Object definition) {
        WorkflowExportFormat.DependencyInfo dependencies = new WorkflowExportFormat.DependencyInfo();
        
        List<String> nodeTypes = new ArrayList<>();
        List<String> integrations = new ArrayList<>();

        try {
            if (definition instanceof Map) {
                Map<String, Object> defMap = (Map<String, Object>) definition;
                
                // 提取节点类型
                Object nodesObj = defMap.get("nodes");
                if (nodesObj instanceof List) {
                    List<Object> nodes = (List<Object>) nodesObj;
                    for (Object nodeObj : nodes) {
                        if (nodeObj instanceof Map) {
                            Map<String, Object> node = (Map<String, Object>) nodeObj;
                            Object typeObj = node.get("type");
                            if (typeObj != null && !nodeTypes.contains(typeObj.toString())) {
                                nodeTypes.add(typeObj.toString());
                            }
                            
                            // 检查是否有集成配置
                            Object integrationObj = node.get("integration");
                            if (integrationObj != null && !integrations.contains(integrationObj.toString())) {
                                integrations.add(integrationObj.toString());
                            }
                        }
                    }
                } else if (defMap.get("type") != null) {
                    // 兼容 CloudFlow 树结构模型（root + next + branches）
                    collectDependenciesFromTree(defMap, nodeTypes, integrations);
                }
            }
        } catch (Exception e) {
            log.warn("提取依赖信息失败", e);
        }

        dependencies.setNodeTypes(nodeTypes);
        dependencies.setIntegrations(integrations);
        dependencies.setMinCompatibleVersion("1.0.0");

        return dependencies;
    }

    /**
     * 递归提取树结构流程模型中的节点类型与集成配置。
     */
    @SuppressWarnings("unchecked")
    private void collectDependenciesFromTree(Map<String, Object> node,
                                             List<String> nodeTypes,
                                             List<String> integrations) {
        if (node == null) {
            return;
        }

        Object typeObj = node.get("type");
        if (typeObj != null) {
            String type = String.valueOf(typeObj);
            if (!nodeTypes.contains(type)) {
                nodeTypes.add(type);
            }
        }

        Object integrationObj = node.get("integration");
        if (integrationObj != null) {
            String integration = String.valueOf(integrationObj);
            if (!integrations.contains(integration)) {
                integrations.add(integration);
            }
        }

        Object nextObj = node.get("next");
        if (nextObj instanceof Map) {
            collectDependenciesFromTree((Map<String, Object>) nextObj, nodeTypes, integrations);
        }

        Object branchesObj = node.get("branches");
        if (branchesObj instanceof List) {
            for (Object branch : (List<?>) branchesObj) {
                if (branch instanceof Map) {
                    collectDependenciesFromTree((Map<String, Object>) branch, nodeTypes, integrations);
                }
            }
        }
    }
}
