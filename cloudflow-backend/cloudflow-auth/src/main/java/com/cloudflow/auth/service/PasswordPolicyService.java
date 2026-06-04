package com.cloudflow.auth.service;

import com.cloudflow.auth.domain.SysUser;
import com.cloudflow.common.core.exception.ErrorCodeConstants;
import com.cloudflow.common.core.exception.ServiceException;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

@Service
public class PasswordPolicyService {

    public void validateOrThrow(String rawPassword, SysUser user) {
        if (!StringUtils.hasText(rawPassword)) {
            throw new ServiceException("密码不能为空", ErrorCodeConstants.BAD_REQUEST);
        }
        String password = rawPassword.trim();
        if (!password.matches("^[A-Za-z0-9]+$")) {
            throw new ServiceException("密码只能包含字母或数字", ErrorCodeConstants.BAD_REQUEST);
        }
    }
}
