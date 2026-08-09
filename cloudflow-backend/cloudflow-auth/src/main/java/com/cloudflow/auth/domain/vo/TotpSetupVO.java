package com.cloudflow.auth.domain.vo;

/**
 * @param manualEntryKey 手输密钥（扫不了码时用）
 * @param otpAuthUri     otpauth:// 链接，前端渲染成二维码
 * @param regenerated    是否覆盖了上一次未完成的设置；为 true 时前端要提示旧二维码已作废
 */
public record TotpSetupVO(String manualEntryKey, String otpAuthUri, boolean regenerated) {
}
