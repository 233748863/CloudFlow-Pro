package com.cloudflow.auth.service;

import com.cloudflow.auth.domain.SysUser;
import com.cloudflow.auth.mapper.SysUserMapper;
import org.springframework.stereotype.Service;

/**
 * 首次改密标记服务。
 */
@Service
public class ForcePasswordChangeService {

    public static final String REQUIRED = "1";
    public static final String NOT_REQUIRED = "0";

    private final SysUserMapper sysUserMapper;

    public ForcePasswordChangeService(SysUserMapper sysUserMapper) {
        this.sysUserMapper = sysUserMapper;
    }

    public boolean isRequired(SysUser user) {
        return user != null && REQUIRED.equals(user.getPwdResetRequired());
    }

    public void markRequired(Long userId) {
        updateFlag(userId, REQUIRED);
    }

    public void markNotRequired(Long userId) {
        updateFlag(userId, NOT_REQUIRED);
    }

    private void updateFlag(Long userId, String value) {
        if (userId == null) {
            return;
        }
        SysUser update = new SysUser();
        update.setUserId(userId);
        update.setPwdResetRequired(value);
        sysUserMapper.updateById(update);
    }
}
