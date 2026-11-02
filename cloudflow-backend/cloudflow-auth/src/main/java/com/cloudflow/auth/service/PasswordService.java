package com.cloudflow.auth.service;

import cn.hutool.crypto.SecureUtil;
import cn.hutool.crypto.digest.BCrypt;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

/** 原始密码去除首尾空格后，统一以 BCrypt(SHA-256) 存储和校验。 */
@Service
public class PasswordService {
    public String encodePassword(String password) {
        return BCrypt.hashpw(normalizeIncomingPassword(password), BCrypt.gensalt());
    }

    public boolean matchesPassword(String password, String storedHash) {
        return StringUtils.hasText(password) && StringUtils.hasText(storedHash)
                && BCrypt.checkpw(normalizeIncomingPassword(password), storedHash);
    }

    private String normalizeIncomingPassword(String password) {
        return SecureUtil.sha256(password == null ? "" : password.trim());
    }
}
