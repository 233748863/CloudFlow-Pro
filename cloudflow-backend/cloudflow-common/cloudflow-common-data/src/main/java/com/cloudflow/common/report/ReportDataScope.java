package com.cloudflow.common.report;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.datascope.DataScope;
import com.cloudflow.common.datascope.DataScopeHandle;
import java.util.List;

public record ReportDataScope(boolean all, Long userId, List<Long> departmentIds) {
    public ReportDataScope {
        departmentIds = departmentIds == null ? List.of() : List.copyOf(departmentIds);
    }

    public static ReportDataScope resolve(DataScopeHandle handle, DataScope scope) {
        if (UserContext.getUserId() == null || UserContext.getTenantId() == null || scope.isSkip()) {
            throw new ServiceException("报表缺少有效的人员数据范围", 403);
        }
        boolean all = Boolean.TRUE.equals(handle.calcScope(scope));
        return new ReportDataScope(all, scope.getUserId(), scope.getDeptList());
    }

    public static ReportDataScope self() {
        if (UserContext.getUserId() == null) throw new ServiceException("报表需要内部登录身份", 401);
        return new ReportDataScope(false, UserContext.getUserId(), List.of());
    }
}
