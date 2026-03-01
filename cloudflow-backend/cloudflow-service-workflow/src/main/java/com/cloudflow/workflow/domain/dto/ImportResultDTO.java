package com.cloudflow.workflow.domain.dto;

import lombok.Data;
import java.util.List;

/**
 * 导入结果 DTO
 */
@Data
public class ImportResultDTO {
    /** 是否成功 */
    private Boolean success;

    /** 流程ID */
    private String workflowId;

    /** 流程名称 */
    private String workflowName;

    /** 操作类型 (created/updated/skipped) */
    private String action;

    /** 错误信息列表 */
    private List<String> errors;

    /** 警告信息列表 */
    private List<String> warnings;
}
