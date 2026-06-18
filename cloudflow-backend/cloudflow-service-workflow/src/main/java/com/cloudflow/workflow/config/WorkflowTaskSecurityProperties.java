package com.cloudflow.workflow.config;

import com.cloudflow.common.redis.config.RuntimeSysConfigService;
import com.cloudflow.common.redis.config.SysConfigKeys;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * 工作流任务安全策略配置
 *
 * 优先读取 sys_config 在线配置；本地字段仅作为启动期兜底。
 */
@Component
public class WorkflowTaskSecurityProperties {

    @Autowired(required = false)
    private RuntimeSysConfigService runtimeSysConfigService;

    public boolean isStrictOwner() {
        if (runtimeSysConfigService == null) {
            return true;
        }
        return runtimeSysConfigService.getBoolean(SysConfigKeys.WORKFLOW_TASK_STRICT_OWNER, true);
    }

    public String getOverridePermission() {
        if (runtimeSysConfigService == null) {
            return "workflow:task:override";
        }
        return runtimeSysConfigService.getString(
                SysConfigKeys.WORKFLOW_TASK_OVERRIDE_PERMISSION,
                "workflow:task:override");
    }
}
