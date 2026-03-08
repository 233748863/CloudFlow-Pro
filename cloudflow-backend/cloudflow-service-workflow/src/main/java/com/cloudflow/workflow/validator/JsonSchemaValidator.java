package com.cloudflow.workflow.validator;

import com.cloudflow.workflow.exception.WorkflowException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

/**
 * JSON 校验器。
 * 说明：流程定义已统一走 nodes+edges 图模型校验（WorkflowGraphModelResolver），
 * 这里仅保留表单 Schema 校验逻辑。
 */
@Component
public class JsonSchemaValidator {

    private static final Logger log = LoggerFactory.getLogger(JsonSchemaValidator.class);
    private final ObjectMapper objectMapper = new ObjectMapper();

    /**
     * 校验表单 Schema。
     */
    public void validateFormSchema(String formSchema) {
        if (formSchema == null || formSchema.trim().isEmpty()) {
            throw WorkflowException.validationError("表单Schema不能为空");
        }

        try {
            JsonNode root = objectMapper.readTree(formSchema);
            if (!root.isArray()) {
                throw WorkflowException.validationError("表单Schema必须是数组格式");
            }

            Set<String> fieldIds = new HashSet<>();
            for (JsonNode field : root) {
                if (!field.has("id")) {
                    throw WorkflowException.validationError("表单字段缺少id");
                }
                if (!field.has("type")) {
                    throw WorkflowException.validationError("表单字段缺少type");
                }
                if (!field.has("label")) {
                    throw WorkflowException.validationError("表单字段缺少label");
                }

                String fieldId = field.get("id").asText();
                if (fieldIds.contains(fieldId)) {
                    throw WorkflowException.validationError("表单字段ID重复: " + fieldId);
                }
                fieldIds.add(fieldId);

                String fieldType = field.get("type").asText();
                if (!isValidFieldType(fieldType)) {
                    throw WorkflowException.validationError("不支持的字段类型: " + fieldType);
                }
            }

            log.info("[validateFormSchema] 表单Schema验证通过, 字段数={}", fieldIds.size());
        } catch (WorkflowException e) {
            throw e;
        } catch (Exception e) {
            log.error("[validateFormSchema] JSON解析失败: {}", e.getMessage());
            throw WorkflowException.validationError("表单Schema格式错误: " + e.getMessage());
        }
    }

    private boolean isValidFieldType(String type) {
        Set<String> validTypes = new HashSet<>(Arrays.asList(
            "text", "textarea", "number", "date", "datetime", "select",
            "radio", "checkbox", "file", "email", "phone", "url"
        ));
        return validTypes.contains(type);
    }
}
