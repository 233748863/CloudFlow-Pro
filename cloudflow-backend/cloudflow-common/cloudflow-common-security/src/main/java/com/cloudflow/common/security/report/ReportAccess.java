package com.cloudflow.common.security.report;

import cn.dev33.satoken.stp.StpUtil;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.core.report.ReportDataset;

public final class ReportAccess {
    private ReportAccess() { }

    public static void requireContext() {
        StpUtil.checkLogin();
        if (UserContext.getTenantId() == null || UserContext.getUserId() == null
                || UserContext.getAuthToken() == null || UserContext.getAuthToken().isBlank()
                || StpUtil.getLoginIdAsLong() != UserContext.getUserId()) {
            throw new ServiceException("报表需要有效的内部登录身份", 401);
        }
    }

    public static boolean allowed(ReportDataset dataset) {
        return StpUtil.hasPermission(dataset.permission())
                && dataset.sourcePermissions().stream().anyMatch(StpUtil::hasPermission);
    }

    public static void requireDataset(ReportDataset dataset) {
        requireContext();
        StpUtil.checkPermission(dataset.permission());
        if (dataset.sourcePermissions().stream().noneMatch(StpUtil::hasPermission)) {
            throw new ServiceException("缺少源业务读取权限", 403);
        }
    }
}
