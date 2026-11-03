package com.cloudflow.auth.service;

import cn.hutool.crypto.SecureUtil;
import cn.hutool.crypto.digest.BCrypt;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

/** 当前口令协议：接收明文，去除首尾空格后以 BCrypt(SHA-256(password)) 保存和校验。 */
@Service
public class PasswordService {
    public String encodePassword(String password) {
        if (!StringUtils.hasText(password)) throw new IllegalArgumentException("密码不能为空");
        return BCrypt.hashpw(SecureUtil.sha256(password.trim()), BCrypt.gensalt());
    }

    public boolean matchesPassword(String password, String storedHash) {
        return StringUtils.hasText(password) && StringUtils.hasText(storedHash)
                && BCrypt.checkpw(SecureUtil.sha256(password.trim()), storedHash);
    }
}
