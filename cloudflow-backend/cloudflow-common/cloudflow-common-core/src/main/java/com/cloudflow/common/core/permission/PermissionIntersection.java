package com.cloudflow.common.core.permission;

import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Pattern;

public final class PermissionIntersection {
    private PermissionIntersection() { }

    public static Set<String> retain(Collection<String> rolePermissions, Collection<String> ceiling) {
        if (rolePermissions == null) return Set.of();
        Set<String> roles = new TreeSet<>();
        for (String grant : rolePermissions) if (grant != null && !grant.isBlank()) roles.add(grant);
        if (ceiling == null) return Collections.unmodifiableSet(roles);
        List<Pattern> patterns = new ArrayList<>();
        for (String grant : roles) {
            StringBuilder expression = new StringBuilder("\\A");
            for (int index = 0; index < grant.length(); index++) {
                char symbol = grant.charAt(index);
                expression.append(symbol == '*' ? ".*" : Pattern.quote(String.valueOf(symbol)));
            }
            patterns.add(Pattern.compile(expression.append("\\z").toString()));
        }
        Set<String> allowed = new TreeSet<>();
        for (String permission : ceiling) {
            if (permission == null || permission.isBlank() || permission.contains("*")) throw new IllegalArgumentException("套餐权限上限必须是具体权限");
            if (patterns.stream().anyMatch(pattern -> pattern.matcher(permission).matches())) allowed.add(permission);
        }
        return Collections.unmodifiableSet(allowed);
    }
}
