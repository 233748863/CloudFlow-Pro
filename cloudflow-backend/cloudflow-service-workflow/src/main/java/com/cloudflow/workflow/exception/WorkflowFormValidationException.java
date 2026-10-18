package com.cloudflow.workflow.exception;

import com.cloudflow.workflow.domain.dto.ErrorResponse;

import java.util.List;
import java.util.Map;
import java.util.Set;

public final class WorkflowFormValidationException extends WorkflowException {
    private final List<ErrorResponse.FieldError> fieldErrors;
    private final Set<String> tamperedFields;

    public WorkflowFormValidationException(Map<String, String> errors) {
        this(errors, Set.of());
    }

    public WorkflowFormValidationException(Map<String, String> errors, Set<String> tamperedFields) {
        super("FORM_INVALID_DATA", "表单字段校验失败");
        this.tamperedFields = Set.copyOf(tamperedFields);
        fieldErrors = errors.entrySet().stream().map(entry -> ErrorResponse.FieldError.builder()
                .field(entry.getKey()).message(entry.getValue()).build()).toList();
    }

    public List<ErrorResponse.FieldError> getFieldErrors() {
        return fieldErrors;
    }

    /** Only schema field paths and rule messages belong in a caller-facing response. */
    public List<ErrorResponse.FieldError> getResponseFieldErrors() {
        return fieldErrors.stream()
                .filter(error -> error.getField() != null && error.getField().matches(
                        "[A-Za-z_][A-Za-z0-9_]{0,99}(?:\\[\\d+\\])?(?:\\.[A-Za-z_][A-Za-z0-9_]{0,99}(?:\\[\\d+\\])?)*"))
                .filter(error -> !tamperedFields.contains(error.getField()))
                .map(error -> ErrorResponse.FieldError.builder().field(error.getField()).message(error.getMessage()).build())
                .toList();
    }

    public Set<String> getTamperedFields() {
        return tamperedFields;
    }
}
