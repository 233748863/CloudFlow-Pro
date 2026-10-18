package com.cloudflow.auth.im;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

final class ImOrgTopology {
    private ImOrgTopology() { }

    static Set<Long> select(Map<Long, ImOrgSnapshot.Department> departments, Set<Long> requested, Set<Long> visible) {
        if (requested.isEmpty() || requested.size() > 100 || !departments.keySet().containsAll(requested)) {
            throw ImFailure.orgScope();
        }
        Set<Long> checked = new HashSet<>();
        Map<Long, List<Long>> children = new HashMap<>();
        for (ImOrgSnapshot.Department department : departments.values()) {
            Set<Long> path = new HashSet<>();
            long current = department.id();
            while (departments.containsKey(current) && !checked.contains(current)) {
                if (!path.add(current)) throw ImFailure.orgIncomplete();
                current = departments.get(current).parentId();
            }
            checked.addAll(path);
            children.computeIfAbsent(department.parentId(), ignored -> new ArrayList<>()).add(department.id());
        }
        for (Long root : requested) {
            long current = root;
            boolean authorized = false;
            while (departments.containsKey(current)) {
                if (visible.contains(current)) { authorized = true; break; }
                current = departments.get(current).parentId();
            }
            if (!authorized) throw ImFailure.orgScope();
        }
        Set<Long> selected = new TreeSet<>();
        ArrayDeque<Long> pending = new ArrayDeque<>(requested);
        while (!pending.isEmpty()) {
            Long current = pending.removeFirst();
            if (selected.add(current)) pending.addAll(children.getOrDefault(current, List.of()));
        }
        return Set.copyOf(selected);
    }
}
