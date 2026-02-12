package com.cloudflow.common.core.constant;

/**
 * 安全相关常量
 * 
 * @author CloudFlow
 */
public class SecurityConstants {

    /**
     * 内部调用请求头标识
     * 网关在转发内部服务间调用时，会在请求头中添加此标识
     */
    public static final String INNER_CALL_HEADER = "X-Inner-Call";

    /**
     * 内部调用请求头的合法值
     */
    public static final String INNER_CALL_VALUE = "true";

    /**
     * 来源服务名请求头
     * 用于标识发起内部调用的服务名称
     */
    public static final String FROM_SERVICE_HEADER = "X-From-Service";

    /**
     * 租户ID请求头
     */
    public static final String TENANT_ID_HEADER = "X-User-Tenant-Id";
}
