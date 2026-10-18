package com.cloudflow.auth.printing;

/** 来自服务端用户上下文，禁止从请求体接受身份。 */
public record PrintContext(Long tenantId, Long userId) { }
