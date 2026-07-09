package com.cloudflow.hr.client.dto;

import lombok.Data;

import java.io.Serializable;
import java.util.Map;

/**
 * workflow 公共启动接口请求体
 */
@Data
public class WorkflowStartRequest implements Serializable {

    private static final long serialVersionUID = 1L;

    /**
     * 流程定义Key
     */
    private String processDefKey;

    /**
     * 业务主键
     */
    private String businessKey;

    /**
     * 流程变量
     */
    private Map<String, Object> variables;

    /**
     * 发起人ID
     */
    private Long startUserId;

    /**
     * 发起人姓名
     */
    private String startUserName;

    /**
     * 租户ID
     */
    private Long tenantId;
}
