package com.cloudflow.auth.printing;

import com.cloudflow.common.core.printing.PrintData;

/**
 * 新增业务只需注册提供器；提供器校验对象访问权限后返回当前租户数据。
 * 关联流程时必须返回真实 instanceId 及业务键（业务前缀:记录ID），
 * 统一字段过滤器再核对实际流程、租户与当前用户的字段可见范围。
 */
public interface PrintDataProvider {
    String bizType();
    PrintData buildData(Long bizId, PrintContext context);
}
