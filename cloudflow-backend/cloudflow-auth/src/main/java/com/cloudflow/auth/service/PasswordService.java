package com.cloudflow.auth.service;

import cn.hutool.crypto.SecureUtil;
import cn.hutool.crypto.digest.BCrypt;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.Locale;
import java.util.regex.Pattern;

/**
 * 密码服务。
 * 统一处理前端明文密码、历史前端 SHA-256 口令，以及历史直接 BCrypt(明文) 账号兼容。
 */
@Service
public class PasswordService {

    private static final Pattern SHA256_HEX_PATTERN = Pattern.compile("^[a-f0-9]{64}$");

    public String normalizeIncomingPassword(String password) {
        if (!StringUtils.hasText(password)) {
            return "";
        }
        String normalized = password.trim().toLowerCase(Locale.ROOT);
        if (SHA256_HEX_PATTERN.matcher(normalized).matches()) {
            return normalized;
        }
        return SecureUtil.sha256(normalizedSource(password));
    }

    public String encodePassword(String password) {
        return BCrypt.hashpw(normalizeIncomingPassword(password), BCrypt.gensalt());
    }

    public PasswordMatchResult matchesPassword(String password, String storedHash) {
        if (!StringUtils.hasText(password) || !StringUtils.hasText(storedHash)) {
            return PasswordMatchResult.notMatched();
        }

        String normalized = normalizeIncomingPassword(password);
        if (BCrypt.checkpw(normalized, storedHash)) {
            return PasswordMatchResult.matched(normalized, false);
        }

        String raw = normalizedSource(password);
        if (BCrypt.checkpw(raw, storedHash)) {
            return PasswordMatchResult.matched(normalized, true);
        }

        return PasswordMatchResult.notMatched();
    }

    public boolean isSha256Hex(String value) {
        return StringUtils.hasText(value) && SHA256_HEX_PATTERN.matcher(value.trim().toLowerCase(Locale.ROOT)).matches();
    }

    private String normalizedSource(String password) {
        return password == null ? "" : password.trim();
    }

    public record PasswordMatchResult(boolean matched, String normalizedPassword, boolean legacyPlaintextMatch) {

        public static PasswordMatchResult matched(String normalizedPassword, boolean legacyPlaintextMatch) {
            return new PasswordMatchResult(true, normalizedPassword, legacyPlaintextMatch);
        }

        public static PasswordMatchResult notMatched() {
            return new PasswordMatchResult(false, null, false);
        }
    }
}
