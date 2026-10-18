package com.cloudflow.auth.im;

import com.cloudflow.common.core.exception.ServiceException;

public final class ImFailure extends ServiceException {
    private static final long serialVersionUID = 1L;
    private final String reasonCode;
    private final Integer providerErrorCode;

    private ImFailure(String reasonCode, String message, int status) {
        this(reasonCode, message, status, null);
    }

    private ImFailure(String reasonCode, String message, int status, Integer providerErrorCode) {
        super(message, status);
        this.reasonCode = reasonCode;
        this.providerErrorCode = providerErrorCode;
    }

    public Integer getProviderErrorCode() { return providerErrorCode; }

    public String getReasonCode() {
        return reasonCode;
    }

    public static ImFailure callback() {
        return new ImFailure("IM_CALLBACK_INVALID", "企业通信回调校验失败", 400);
    }

    public static ImFailure callbackRate() {
        return new ImFailure("IM_CALLBACK_RATE_LIMITED", "企业通信回调请求过于频繁", 429);
    }

    public static ImFailure callbackUnavailable() {
        return new ImFailure("IM_CALLBACK_UNAVAILABLE", "企业通信回调暂不可用", 503);
    }

    public static ImFailure callbackActor() {
        return new ImFailure("IM_CALLBACK_ACTOR_UNAVAILABLE", "企业通信操作人绑定或审批权限已失效", 403);
    }

    public static ImFailure callbackStale() {
        return new ImFailure("IM_CALLBACK_STALE", "企业通信卡片或处理状态已变化", 409);
    }

    public static ImFailure configuration() {
        return new ImFailure("IM_CONFIGURATION_INVALID", "企业通信配置不完整或格式不正确", 400);
    }

    public static ImFailure secret() {
        return new ImFailure("IM_SECRET_UNAVAILABLE", "企业通信独立加密密钥未配置或密文无法验证", 503);
    }

    public static ImFailure disabled() {
        return new ImFailure("IM_DISABLED", "企业通信接入未启用", 503);
    }

    public static ImFailure unsupported() {
        return new ImFailure("IM_PROVIDER_UNSUPPORTED", "该企业通信提供商尚未实现", 503);
    }

    public static ImFailure remote() {
        return new ImFailure("IM_PROVIDER_REJECTED", "企业通信提供商未接受请求", 502);
    }

    public static ImFailure remote(int providerErrorCode) {
        return new ImFailure("IM_PROVIDER_REJECTED", "企业通信提供商未接受请求", 502, providerErrorCode);
    }

    public static ImFailure uncertain() {
        return new ImFailure("IM_PROVIDER_UNCERTAIN", "企业通信请求结果不确定，请等待核对", 502);
    }

    public static ImFailure tokenRejected() {
        return new ImFailure("IM_TOKEN_REJECTED", "企业通信访问凭据已失效，请重新尝试", 502);
    }

    public static ImFailure conflict() {
        return new ImFailure("IM_VERSION_CONFLICT", "企业通信配置已改变，请刷新后重试", 409);
    }

    public static ImFailure notFound() {
        return new ImFailure("IM_CONFIG_NOT_FOUND", "企业通信配置不存在", 404);
    }

    public static ImFailure unauthenticated() {
        return new ImFailure("IM_AUTHENTICATION_REQUIRED", "请使用有效的内部账号登录", 401);
    }

    public static ImFailure loginChallenge() {
        return new ImFailure("IM_LOGIN_CHALLENGE_INVALID", "企业微信登录验证已失效，请从原浏览器重新发起", 400);
    }

    public static ImFailure loginUnavailable() {
        return new ImFailure("IM_LOGIN_CHALLENGE_UNAVAILABLE", "企业微信登录验证暂不可用，请稍后重新发起", 503);
    }

    public static ImFailure loginAccount() {
        return new ImFailure("IM_LOGIN_ACCOUNT_UNAVAILABLE", "企业微信绑定或账号状态不可用，请使用原账号登录后核对绑定", 403);
    }

    public static ImFailure loginMfa() {
        return new ImFailure("IM_LOGIN_MFA_INVALID", "验证码错误，请重新发起企业微信登录", 400);
    }

    public static ImFailure loginPackage() {
        return new ImFailure("IM_LOGIN_PACKAGE_UNAVAILABLE", "当前套餐未启用我的通信绑定，请使用原账号登录", 403);
    }

    public static ImFailure loginTransport() {
        return new ImFailure("IM_LOGIN_TRANSPORT_INVALID", "请从本系统HTTPS页面发起企业微信登录", 403);
    }

    public static ImFailure loginIp() {
        return new ImFailure("IM_LOGIN_IP_DENIED", "当前网络地址不允许登录", 403);
    }

    public static ImFailure loginRate() {
        return new ImFailure("IM_LOGIN_RATE_LIMITED", "企业微信登录尝试过于频繁，请稍后再试", 429);
    }

    public static ImFailure forbidden() {
        return new ImFailure("IM_PERMISSION_DENIED", "无权执行此企业通信操作", 403);
    }

    public static ImFailure bindingVerification() {
        return new ImFailure("IM_BINDING_VERIFICATION_REQUIRED", "请重新验证本人密码和已启用的动态码", 403);
    }

    public static ImFailure bindingVerificationUnavailable() {
        return new ImFailure("IM_BINDING_VERIFICATION_UNAVAILABLE", "本人身份验证暂不可用，请稍后重试", 503);
    }

    public static ImFailure bindingConflict() {
        return new ImFailure("IM_BINDING_CONFLICT", "当前账号或企业微信成员已有绑定，请先核对现有绑定", 409);
    }

    public static ImFailure bindingRequest() {
        return new ImFailure("IM_BINDING_REQUEST_INVALID", "绑定请求无效，请刷新页面后重新操作", 400);
    }

    public static ImFailure bindingManaged() {
        return new ImFailure("IM_BINDING_ADMIN_REQUIRED", "组织同步建立的绑定仅可由管理员通过管理入口解除", 403);
    }

    public static ImFailure bindingChanged() {
        return new ImFailure("IM_BINDING_CHANGED", "绑定已变更或已解除，请刷新核对当前绑定", 409);
    }

    public static ImFailure bindingTransport() {
        return new ImFailure("IM_BINDING_TRANSPORT_INVALID", "请从本系统HTTPS页面操作本人通信绑定", 403);
    }

    public static ImFailure bindingUnavailable() {
        return new ImFailure("IM_BINDING_UNAVAILABLE", "企业微信绑定未启用或配置已改变，请刷新后重试", 503);
    }

    public static ImFailure immutableIdentity() {
        return new ImFailure("IM_IDENTITY_IN_USE", "该企业或应用已有绑定及业务记录，不能更换身份标识", 409);
    }

    public static ImFailure duplicate() {
        return new ImFailure("IM_CONFIG_EXISTS", "本租户已存在该提供商配置，请刷新后编辑", 409);
    }

    public static ImFailure audit() {
        return new ImFailure("IM_AUDIT_UNAVAILABLE", "企业通信审计未保存，操作未提交", 503);
    }

    public static ImFailure persistence() {
        return new ImFailure("IM_SAVE_FAILED", "企业通信配置未保存，请刷新后重试", 503);
    }

    public static ImFailure orgScope() {
        return new ImFailure("IM_ORG_SCOPE_UNVERIFIED", "企业微信应用未完整授权所选部门，组织同步未执行", 409);
    }

    public static ImFailure orgIncomplete() {
        return new ImFailure("IM_ORG_SNAPSHOT_INCOMPLETE", "企业微信组织数据不完整或格式不受支持，组织同步未执行", 409);
    }

    public static ImFailure orgChanged() {
        return new ImFailure("IM_ORG_SNAPSHOT_CHANGED", "读取期间企业微信组织或应用范围发生变化，请重新预览", 409);
    }

    public static ImFailure orgLocal() {
        return new ImFailure("IM_ORG_LOCAL_INVALID", "本地组织、映射或同步预览不符合安全条件，请核对后重试", 409);
    }

    public static ImFailure orgPersistence() {
        return new ImFailure("IM_ORG_PREVIEW_SAVE_FAILED", "企业微信同步预览未保存，请重新读取记录后重试", 503);
    }

    public static ImFailure orgNotFound() {
        return new ImFailure("IM_ORG_RUN_NOT_FOUND", "企业微信同步记录不存在", 404);
    }

    public static ImFailure orgApplyPersistence() {
        return new ImFailure("IM_ORG_APPLY_SAVE_FAILED", "本批组织同步未提交，请读取已保存进度后重试", 503);
    }

    public static ImFailure orgEffectsUnavailable() {
        return new ImFailure("IM_ORG_SECURITY_RECOVERY_PENDING", "组织变更已提交，安全清理尚未完成，请等待恢复后再继续同步", 503);
    }
}
