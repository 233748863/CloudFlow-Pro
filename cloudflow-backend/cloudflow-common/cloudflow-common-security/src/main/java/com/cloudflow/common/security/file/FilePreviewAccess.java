package com.cloudflow.common.security.file;

import cn.dev33.satoken.stp.StpUtil;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.exception.ServiceException;

public final class FilePreviewAccess {
    private FilePreviewAccess() { }

    public static void requireContext() {
        StpUtil.checkPermission("system:file:preview");
        requireSession();
    }

    /** 下载使用业务自身权限，仍须验证真实内部登录会话。 */
    public static void requireSession() {
        String token = UserContext.getAuthToken();
        if (UserContext.getUserId() == null || UserContext.getTenantId() == null || token == null || token.isBlank()
                || UserContext.getUserName() == null || UserContext.getUserName().isBlank()
                || !UserContext.getUserId().toString().equals(String.valueOf(StpUtil.getStpLogic().getLoginIdByToken(token)))) {
            throw new ServiceException("附件访问需要有效的内部登录会话", 401);
        }
    }
}
