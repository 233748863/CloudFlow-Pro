package com.cloudflow.auth.util;

import com.cloudflow.auth.domain.SysDept;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** 部门管理和内部读取共用的索引构树。 */
public final class DeptTreeBuilder {

    private DeptTreeBuilder() {
    }

    public static List<SysDept> build(List<SysDept> departments) {
        List<SysDept> roots = new ArrayList<>();
        Set<Long> ids = new HashSet<>();
        Map<Long, List<SysDept>> children = new HashMap<>();
        for (SysDept dept : departments) {
            ids.add(dept.getDeptId());
            children.computeIfAbsent(dept.getParentId(), ignored -> new ArrayList<>()).add(dept);
        }
        for (SysDept dept : departments) {
            if (!ids.contains(dept.getParentId())) {
                attachChildren(dept, children, new HashSet<>());
                roots.add(dept);
            }
        }
        return roots.isEmpty() ? departments : roots;
    }

    private static void attachChildren(SysDept dept, Map<Long, List<SysDept>> children, Set<Long> visited) {
        if (!visited.add(dept.getDeptId())) {
            throw new IllegalStateException("部门关系存在循环或重复编号");
        }
        List<SysDept> nested = children.getOrDefault(dept.getDeptId(), List.of());
        dept.setChildren(nested);
        for (SysDept child : nested) {
            attachChildren(child, children, visited);
        }
    }
}
