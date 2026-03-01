package com.cloudflow.workflow.exception;

import com.cloudflow.workflow.domain.dto.ErrorResponse;
import lombok.Getter;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 验证异常
 * 用于参数验证失败、数据格式错误等场景
 * 
 * @author CloudFlow
 */
@Getter
public class ValidationException extends RuntimeException {
    
    private static final long serialVersionUID = 1L;
    
    /**
     * 错误代码
     */
    private final String code;
    
    /**
     * 字段级别的错误列表
     */
    private final List<ErrorResponse.FieldError> fieldErrors;
    
    /**
     * 附加数据
     */
    private final Map<String, Object> data;
    
    public ValidationException(String message) {
        super(message);
        this.code = "INVALID_REQUEST";
        this.fieldErrors = new ArrayList<>();
        this.data = null;
    }
    
    public ValidationException(String code, String message) {
        super(message);
        this.code = code;
        this.fieldErrors = new ArrayList<>();
        this.data = null;
    }
    
    public ValidationException(String code, String message, List<ErrorResponse.FieldError> fieldErrors) {
        super(message);
        this.code = code;
        this.fieldErrors = fieldErrors != null ? fieldErrors : new ArrayList<>();
        this.data = null;
    }
    
    public ValidationException(String code, String message, Map<String, Object> data) {
        super(message);
        this.code = code;
        this.fieldErrors = new ArrayList<>();
        this.data = data;
    }
    
    /**
     * 添加字段错误
     */
    public ValidationException addFieldError(String field, String message) {
        this.fieldErrors.add(ErrorResponse.FieldError.builder()
                .field(field)
                .message(message)
                .build());
        return this;
    }
    
    /**
     * 添加字段错误（包含被拒绝的值）
     */
    public ValidationException addFieldError(String field, String message, Object rejectedValue) {
        this.fieldErrors.add(ErrorResponse.FieldError.builder()
                .field(field)
                .message(message)
                .rejectedValue(rejectedValue)
                .build());
        return this;
    }
    
    // 常用验证异常工厂方法
    
    /**
     * 必填字段缺失
     */
    public static ValidationException missingField(String fieldName) {
        ValidationException ex = new ValidationException("INVALID_REQUEST", "请求参数验证失败");
        ex.addFieldError(fieldName, fieldName + " 不能为空");
        return ex;
    }
    
    /**
     * 字段格式错误
     */
    public static ValidationException invalidFormat(String fieldName, String expectedFormat) {
        ValidationException ex = new ValidationException("INVALID_REQUEST", "请求参数验证失败");
        ex.addFieldError(fieldName, fieldName + " 格式不正确，期望格式: " + expectedFormat);
        return ex;
    }
    
    /**
     * JSON 格式无效
     */
    public static ValidationException invalidJson(String message) {
        return new ValidationException("INVALID_JSON_FORMAT", "JSON 格式不正确: " + message);
    }
    
    /**
     * 模板结构无效
     */
    public static ValidationException invalidTemplateStructure(String message) {
        return new ValidationException("INVALID_TEMPLATE_STRUCTURE", message);
    }
    
    /**
     * 节点类型不支持
     */
    public static ValidationException unsupportedNodeTypes(List<String> nodeTypes) {
        return new ValidationException("UNSUPPORTED_NODE_TYPES", 
                "流程包含不支持的节点类型", 
                Map.of("unsupportedTypes", nodeTypes));
    }
}
