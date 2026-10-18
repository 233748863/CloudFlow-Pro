package com.cloudflow.auth.im;

import java.util.ConcurrentModificationException;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

record ImOrgScope(long localRootDeptId, Set<Long> roots, Map<String, Long> primaryDepartments) {
    ImOrgScope {
        if (localRootDeptId <= 0 || roots == null || roots.isEmpty() || roots.size() > 100
                || roots.stream().anyMatch(identifier -> identifier == null || identifier <= 0)
                || primaryDepartments == null || primaryDepartments.size() > WeComOrgReader.MAX_MEMBERS) {
            throw ImFailure.configuration();
        }
        Set<String> identifiers = new HashSet<>();
        for (Map.Entry<String, Long> entry : primaryDepartments.entrySet()) {
            if (entry.getKey() == null || !entry.getKey().matches("[A-Za-z0-9_.@=-]{1,128}")
                    || entry.getValue() == null || entry.getValue() <= 0
                    || !identifiers.add(entry.getKey().toLowerCase(Locale.ROOT))) throw ImFailure.configuration();
        }
        roots = Set.copyOf(roots);
        primaryDepartments = Map.copyOf(primaryDepartments);
    }

    static ImOrgScope copy(ImConfigRequest.SyncScope request) {
        if (request == null) throw ImFailure.configuration();
        try {
            Long localRoot = request.getLocalRootDeptId();
            List<Long> requested = List.copyOf(request.getRemoteDepartmentIds());
            Map<String, Long> primary = request.getPrimaryDepartments();
            Set<Long> roots = new HashSet<>(requested);
            if (localRoot == null || roots.size() != requested.size()) throw ImFailure.configuration();
            return new ImOrgScope(localRoot, roots, primary == null ? Map.of() : new HashMap<>(primary));
        } catch (NullPointerException | ConcurrentModificationException failure) { throw ImFailure.configuration(); }
    }

    @Override
    public String toString() { return "ImOrgScope[localRootDeptId=" + localRootDeptId + ", roots=" + roots.size() + "]"; }
}
