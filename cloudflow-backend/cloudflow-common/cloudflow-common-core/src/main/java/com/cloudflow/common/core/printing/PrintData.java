package com.cloudflow.common.core.printing;

import java.util.Map;

/** 由业务服务完成对象权限与脱敏；流程字段仍须在渲染前过滤。 */
public record PrintData(Long tenantId, String bizType, String bizId, String instanceId, String businessKey, Map<String, Object> values) { }
