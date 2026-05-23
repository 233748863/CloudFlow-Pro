package com.cloudflow.workflow.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * 工作流任务安全策略配置
 *
 * cloudflow.workflow.task.strict-owner=true（默认）
 *   严格模式：addSign / removeSign / delegate 等任务操作必须由 task.assignee 本人发起，
 *   否则抛 WorkflowException.permissionDenied("...")。持有 workflow:task:override 权限码的
 *   admin/运维账号可跨人操作。
 *
 * cloudflow.workflow.task.strict-owner=false
 *   宽松模式：跳过办理人归属校验，仅由 Controller 层 @SaCheckPermission 兜底，适用于代办/秘书代签等
 *   运维场景。
 */
@Data
@Component
@ConfigurationProperties(prefix = "cloudflow.workflow.task")
public class WorkflowTaskSecurityProperties {

    /** 是否启用任务办理人归属严格校验，默认开启 */
    private boolean strictOwner = true;

    /** 跨人操作专用权限码，持有者跳过办理人归属校验 */
    private String overridePermission = "workflow:task:override";
}
