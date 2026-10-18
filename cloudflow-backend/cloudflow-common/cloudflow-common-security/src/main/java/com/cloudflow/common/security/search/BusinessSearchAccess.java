package com.cloudflow.common.security.search;

import cn.dev33.satoken.stp.StpLogic;
import cn.dev33.satoken.stp.StpUtil;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.core.search.BusinessSearchType;
import java.util.EnumSet;
import java.util.List;
import java.util.Set;

public final class BusinessSearchAccess {
    private BusinessSearchAccess() { }

    public static void requireContext() {
        StpUtil.checkPermission("system:search:business");
        if (UserContext.getTenantId() == null || UserContext.getUserId() == null || UserContext.getAuthToken() == null) {
            throw new ServiceException("业务搜索需要有效的内部登录会话", 401);
        }
    }

    public static boolean allowed(BusinessSearchType type) {
        return type.permissions().stream().allMatch(StpUtil::hasPermission);
    }

    public static Set<BusinessSearchType> allowedTypes() {
        StpLogic logic = StpUtil.getStpLogic();
        List<String> permissions = logic.getPermissionList();
        Set<BusinessSearchType> allowed = EnumSet.noneOf(BusinessSearchType.class);
        for (BusinessSearchType type : BusinessSearchType.values()) {
            if (type.permissions().stream().allMatch(permission -> logic.hasElement(permissions, permission))) allowed.add(type);
        }
        return Set.copyOf(allowed);
    }
}
