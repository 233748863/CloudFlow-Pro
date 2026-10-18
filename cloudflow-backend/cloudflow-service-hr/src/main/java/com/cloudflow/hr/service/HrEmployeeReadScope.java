package com.cloudflow.hr.service;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import java.util.List;

public record HrEmployeeReadScope(boolean all, Long userId, List<Long> departmentIds, String creator) {
    public HrEmployeeReadScope {
        departmentIds = departmentIds == null ? List.of() : List.copyOf(departmentIds);
    }

    public static HrEmployeeReadScope from(boolean privileged, Integer scopeType, Long userId, String username, List<Long> departmentIds) {
        if (privileged || scopeType == null || scopeType == 0) return new HrEmployeeReadScope(true, null, List.of(), null);
        if (scopeType == 4 && userId != null) return new HrEmployeeReadScope(false, userId, List.of(), null);
        if (scopeType != 4 && departmentIds != null && !departmentIds.isEmpty()) {
            return new HrEmployeeReadScope(false, null, departmentIds, null);
        }
        if (username != null && !username.isBlank()) return new HrEmployeeReadScope(false, null, List.of(), username);
        return new HrEmployeeReadScope(true, null, List.of(), null);
    }

    public <Entity> void restrict(QueryWrapper<Entity> wrapper) {
        if (all) return;
        if (userId != null) wrapper.eq("user_id", userId);
        else if (!departmentIds.isEmpty()) wrapper.in("dept_id", departmentIds);
        else if (creator != null && !creator.isBlank()) wrapper.eq("create_by", creator);
        else wrapper.eq("id", -1L);
    }
}
