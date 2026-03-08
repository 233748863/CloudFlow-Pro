package com.cloudflow.workflow.validator;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.workflow.domain.WfProcessDefinition;
import com.cloudflow.workflow.domain.dto.ValidationResultDTO;
import com.cloudflow.workflow.domain.dto.WorkflowExportFormat;
import com.cloudflow.workflow.exception.WorkflowException;
import com.cloudflow.workflow.mapper.WfProcessDefinitionMapper;
import com.cloudflow.workflow.model.WorkflowGraphModelResolver;
import com.cloudflow.workflow.util.ExportFormatUtil;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.*;

/**
 * 流程导入验证器
 * 验证导入文件的格式、完整性、兼容性等
 * 
 * @author CloudFlow
 */
@Slf4j
@Component
public class ImportValidator {

    @Autowired
    private WfProcessDefinitionMapper definitionMapper;
    @Autowired
    private WorkflowGraphModelResolver workflowGraphModelResolver;

    private final ObjectMapper objectMapper = new ObjectMapper();

    /**
     * 系统支持的节点类型
     */
    private static final Set<String> SUPPORTED_NODE_TYPES = new HashSet<>(Arrays.asList(
        "start", "end", "approval", "condition", "parallel", "subprocess",
        "userTask", "serviceTask", "scriptTask", "timer", "message"
    ));

    /**
     * 系统支持的集成类型
     */
    private static final Set<String> SUPPORTED_INTEGRATIONS = new HashSet<>(Arrays.asList(
        "email", "sms", "webhook", "database", "api"
    ));

    /**
     * 最低兼容的导出格式版本
     */
    private static final String MIN_EXPORT_FORMAT_VERSION = "1.0.0";

    /**
     * 验证导入文件
     * 
     * @param exportFormat 导出格式对象
     * @return 验证结果
     */
    public ValidationResultDTO validate(WorkflowExportFormat exportFormat) {
        log.info("开始验证导入文件");

        List<String> errors = new ArrayList<>();
        List<String> warnings = new ArrayList<>();

        // 处理 null 输入
        if (exportFormat == null) {
            errors.add("导入文件为空");
            return ValidationResultDTO.builder()
                .valid(false)
                .errors(errors)
                .warnings(warnings)
                .details("验证失败，有 1 个错误")
                .build();
        }

        // 1. 验证基本结构
        validateBasicStructure(exportFormat, errors);

        // 2. 验证必要字段
        validateRequiredFields(exportFormat, errors);

        // 3. 验证校验和
        boolean checksumValid = validateChecksum(exportFormat, warnings);

        // 4. 验证格式版本兼容性
        validateFormatVersion(exportFormat, errors, warnings);

        // 5. 验证节点类型兼容性（不支持类型直接阻断导入）
        List<String> unsupportedNodeTypes = validateNodeTypes(exportFormat, errors, warnings);

        // 6. 验证集成兼容性（不支持集成直接阻断导入）
        List<String> unsupportedIntegrations = validateIntegrations(exportFormat, errors, warnings);

        // 7. 检查名称冲突
        boolean hasNameConflict = false;
        String conflictingWorkflowId = null;
        if (exportFormat.getWorkflow() != null && exportFormat.getWorkflow().getName() != null) {
            Map<String, String> conflictInfo = checkNameConflict(exportFormat.getWorkflow().getName());
            hasNameConflict = conflictInfo.containsKey("conflictingWorkflowId");
            conflictingWorkflowId = conflictInfo.get("conflictingWorkflowId");
            
            if (hasNameConflict) {
                warnings.add("流程名称已存在，导入时需要选择冲突解决策略");
            }
        }

        // 8. 验证流程定义结构
        validateWorkflowDefinition(exportFormat, errors, warnings);

        // 构建验证结果
        boolean valid = errors.isEmpty();

        ValidationResultDTO result = ValidationResultDTO.builder()
            .valid(valid)
            .workflowName(exportFormat.getWorkflow() != null ? exportFormat.getWorkflow().getName() : null)
            .version(exportFormat.getWorkflow() != null ? exportFormat.getWorkflow().getVersion() : null)
            .exportFormatVersion(exportFormat.getVersion())
            .errors(errors)
            .warnings(warnings)
            .unsupportedNodeTypes(unsupportedNodeTypes)
            .unsupportedIntegrations(unsupportedIntegrations)
            .hasNameConflict(hasNameConflict)
            .conflictingWorkflowId(conflictingWorkflowId)
            .checksumValid(checksumValid)
            .details(generateDetails(valid, errors, warnings))
            .build();

        log.info("验证完成, valid={}, errors={}, warnings={}", valid, errors.size(), warnings.size());
        return result;
    }

    /**
     * 验证基本结构
     */
    private void validateBasicStructure(WorkflowExportFormat exportFormat, List<String> errors) {
        if (exportFormat == null) {
            errors.add("导入文件为空");
            return;
        }

        if (exportFormat.getWorkflow() == null) {
            errors.add("缺少流程数据");
        }
    }

    /**
     * 验证必要字段
     */
    private void validateRequiredFields(WorkflowExportFormat exportFormat, List<String> errors) {
        if (exportFormat.getWorkflow() == null) {
            return; // 已在基本结构验证中报错
        }

        WorkflowExportFormat.WorkflowData workflow = exportFormat.getWorkflow();

        if (workflow.getName() == null || workflow.getName().trim().isEmpty()) {
            errors.add("流程名称不能为空");
        }
        if (workflow.getProcessKey() == null || workflow.getProcessKey().trim().isEmpty()) {
            errors.add("流程标识 processKey 不能为空");
        }

        if (workflow.getDefinition() == null) {
            errors.add("流程定义不能为空");
        }

        if (exportFormat.getVersion() == null || exportFormat.getVersion().trim().isEmpty()) {
            errors.add("导出格式版本不能为空");
        }
    }

    /**
     * 验证校验和
     */
    private boolean validateChecksum(WorkflowExportFormat exportFormat, List<String> warnings) {
        try {
            boolean valid = ExportFormatUtil.verifyChecksum(exportFormat);
            if (!valid) {
                warnings.add("文件校验和验证失败，文件可能已被篡改或损坏");
            }
            return valid;
        } catch (Exception e) {
            log.warn("校验和验证失败", e);
            warnings.add("无法验证文件校验和");
            return false;
        }
    }

    /**
     * 验证格式版本兼容性
     */
    private void validateFormatVersion(WorkflowExportFormat exportFormat, 
                                      List<String> errors, List<String> warnings) {
        String version = exportFormat.getVersion();
        if (version == null) {
            return; // 已在必要字段验证中报错
        }

        try {
            if (compareVersion(version, MIN_EXPORT_FORMAT_VERSION) < 0) {
                errors.add("导出格式版本过低，最低支持版本: " + MIN_EXPORT_FORMAT_VERSION);
            }
        } catch (Exception e) {
            warnings.add("无法解析导出格式版本号");
        }
    }

    /**
     * 验证节点类型兼容性
     */
    @SuppressWarnings("unchecked")
    private List<String> validateNodeTypes(WorkflowExportFormat exportFormat, List<String> errors, List<String> warnings) {
        List<String> unsupportedTypes = new ArrayList<>();

        if (exportFormat.getDependencies() != null && 
            exportFormat.getDependencies().getNodeTypes() != null) {
            
            for (String nodeType : exportFormat.getDependencies().getNodeTypes()) {
                if (!SUPPORTED_NODE_TYPES.contains(nodeType)) {
                    unsupportedTypes.add(nodeType);
                }
            }

            if (!unsupportedTypes.isEmpty()) {
                String message = "流程包含不支持的节点类型: " + String.join(", ", unsupportedTypes);
                errors.add(message);
                warnings.add("该文件无法导入，请删除或替换不支持节点后重试");
            }
        }

        return unsupportedTypes;
    }

    /**
     * 验证集成兼容性
     */
    private List<String> validateIntegrations(WorkflowExportFormat exportFormat, List<String> errors, List<String> warnings) {
        List<String> unsupportedIntegrations = new ArrayList<>();

        if (exportFormat.getDependencies() != null && 
            exportFormat.getDependencies().getIntegrations() != null) {
            
            for (String integration : exportFormat.getDependencies().getIntegrations()) {
                if (!SUPPORTED_INTEGRATIONS.contains(integration)) {
                    unsupportedIntegrations.add(integration);
                }
            }

            if (!unsupportedIntegrations.isEmpty()) {
                String message = "流程包含不支持的集成: " + String.join(", ", unsupportedIntegrations);
                errors.add(message);
                warnings.add("该文件无法导入，请删除或替换不支持集成后重试");
            }
        }

        return unsupportedIntegrations;
    }

    /**
     * 检查名称冲突
     */
    private Map<String, String> checkNameConflict(String workflowName) {
        Map<String, String> result = new HashMap<>();

        // 如果 mapper 未注入（如在单元测试中），跳过检查
        if (definitionMapper == null) {
            log.debug("definitionMapper 未注入，跳过名称冲突检查");
            return result;
        }

        try {
            LambdaQueryWrapper<WfProcessDefinition> wrapper = new LambdaQueryWrapper<>();
            wrapper.eq(WfProcessDefinition::getProcessName, workflowName);

            WfProcessDefinition existing = definitionMapper.selectOne(wrapper);
            if (existing != null) {
                result.put("conflictingWorkflowId", existing.getDefinitionId());
            }
        } catch (Exception e) {
            log.warn("检查名称冲突失败", e);
        }

        return result;
    }

    /**
     * 验证流程定义结构
     */
    private void validateWorkflowDefinition(WorkflowExportFormat exportFormat, 
                                           List<String> errors, List<String> warnings) {
        if (exportFormat.getWorkflow() == null || 
            exportFormat.getWorkflow().getDefinition() == null) {
            return; // 已在必要字段验证中报错
        }

        Object definition = exportFormat.getWorkflow().getDefinition();

        try {
            if (!(definition instanceof Map)) {
                errors.add("流程定义格式错误：必须是 JSON 对象");
                return;
            }

            String definitionJson = objectMapper.writeValueAsString(definition);
            if (!workflowGraphModelResolver.validateGraphModel(definitionJson)) {
                errors.add("流程定义必须为合法的 nodes+edges 图模型");
            }
        } catch (Exception e) {
            log.warn("验证流程定义结构失败", e);
            warnings.add("无法验证流程定义结构");
        }
    }

    /**
     * 生成详细信息
     */
    private String generateDetails(boolean valid, List<String> errors, List<String> warnings) {
        if (valid && warnings.isEmpty()) {
            return "验证通过，可以导入";
        } else if (valid && !warnings.isEmpty()) {
            return "验证通过，但有 " + warnings.size() + " 个警告";
        } else {
            return "验证失败，有 " + errors.size() + " 个错误";
        }
    }

    /**
     * 比较版本号
     * 
     * @return 负数表示 v1 < v2，0 表示相等，正数表示 v1 > v2
     */
    private int compareVersion(String v1, String v2) {
        String[] parts1 = v1.split("\\.");
        String[] parts2 = v2.split("\\.");

        int maxLength = Math.max(parts1.length, parts2.length);

        for (int i = 0; i < maxLength; i++) {
            int num1 = i < parts1.length ? Integer.parseInt(parts1[i]) : 0;
            int num2 = i < parts2.length ? Integer.parseInt(parts2[i]) : 0;

            if (num1 != num2) {
                return num1 - num2;
            }
        }

        return 0;
    }
}
