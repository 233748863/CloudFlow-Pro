package com.cloudflow.workflow.domain.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serializable;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * 标准化错误响应格式
 * 用于统一返回错误信息，包含错误代码、消息、详细错误列表和附加数据
 * 
 * @author CloudFlow
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ErrorResponse implements Serializable {
    
    private static final long serialVersionUID = 1L;
    
    /**
     * 错误代码（如 INVALID_REQUEST, PERMISSION_DENIED, RESOURCE_NOT_FOUND 等）
     */
    private String code;
    
    /**
     * 错误消息（用户友好的错误描述）
     */
    private String message;
    
    /**
     * 详细错误列表（用于字段级别的验证错误）
     */
    private List<FieldError> errors;
    
    /**
     * 附加数据（如冲突信息、建议操作等）
     */
    private Map<String, Object> data;
    
    /**
     * 错误发生时间
     */
    @Builder.Default
    private LocalDateTime timestamp = LocalDateTime.now();
    
    /**
     * 请求路径
     */
    private String path;
    
    /**
     * 字段级别的错误信息
     */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class FieldError implements Serializable {
        
        private static final long serialVersionUID = 1L;
        
        /**
         * 字段名称
         */
        private String field;
        
        /**
         * 错误消息
         */
        private String message;
        
        /**
         * 被拒绝的值
         */
        private Object rejectedValue;
    }
}
