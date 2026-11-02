package com.cloudflow.auth.util;

import com.cloudflow.auth.domain.SysDept;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** 按父节点一次分组，两个部门接口共享相同的顺序与根节点规则。 */
public final class DeptTreeBuilder {
    private DeptTreeBuilder() {}

    public static List<SysDept> build(List<SysDept> departments) {
        Set<Long> ids = new HashSet<>();
        Map<Long, List<SysDept>> children = new HashMap<>();
        for (SysDept department : departments) {
            ids.add(department.getDeptId());
            children.computeIfAbsent(department.getParentId(), key -> new ArrayList<>()).add(department);
        }
        List<SysDept> roots = new ArrayList<>();
        for (SysDept department : departments) {
            if (!ids.contains(department.getParentId())) {
                roots.add(department);
            }
        }
        if (roots.isEmpty()) {
            return departments;
        }
        for (SysDept department : departments) {
            department.setChildren(children.getOrDefault(department.getDeptId(), new ArrayList<>()));
        }
        return roots;
    }
}
