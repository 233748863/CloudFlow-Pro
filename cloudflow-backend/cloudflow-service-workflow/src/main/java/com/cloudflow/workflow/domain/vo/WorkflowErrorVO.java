package com.cloudflow.workflow.domain.vo;

import java.io.Serializable;
import java.time.LocalDateTime;
import java.util.List;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 工作流错误返回 VO。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class WorkflowErrorVO implements Serializable {

    private static final long serialVersionUID = 1L;

    private String code;

    private String message;

    private List<String> errors;

    private DynamicMapVO data;

    @Builder.Default
    private LocalDateTime timestamp = LocalDateTime.now();

    private String path;
}
