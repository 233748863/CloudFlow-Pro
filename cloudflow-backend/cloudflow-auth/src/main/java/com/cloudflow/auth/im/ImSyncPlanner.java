package com.cloudflow.auth.im;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;
import org.springframework.stereotype.Component;

@Component
public class ImSyncPlanner {
    public ImSyncPreview preview(ImOrgSnapshot source, ImLocalOrganization local, String localHash) {
        if (source == null || local == null || source.tenantId() != local.tenantId()) throw ImFailure.orgLocal();
        Map<Long, ImLocalOrganization.Department> localDepartments = unique(local.departments(), ImLocalOrganization.Department::id);
        Map<Long, ImLocalOrganization.User> localUsers = unique(local.users(), ImLocalOrganization.User::id);
        Map<String, ImLocalOrganization.DepartmentMapping> departmentMappings = unique(local.departmentMappings(), ImLocalOrganization.DepartmentMapping::externalId);
        Map<String, ImLocalOrganization.UserMapping> userMappings = unique(local.userMappings(), value -> key(value.externalId()));
        unique(local.departmentMappings(), ImLocalOrganization.DepartmentMapping::departmentId);
        unique(local.userMappings(), ImLocalOrganization.UserMapping::userId);
        if (local.departmentMappings().stream().anyMatch(value -> value.configId() != source.configId())
                || local.userMappings().stream().anyMatch(value -> value.configId() != source.configId())) throw ImFailure.orgLocal();
        Set<Long> withinRoot = localTree(localDepartments, source.localRootDeptId());
        List<ImSyncPreview.DepartmentChange> departments = departments(source, localDepartments, departmentMappings, withinRoot);
        List<ImSyncPreview.UserChange> users = users(source, local, localUsers, userMappings, departments, withinRoot);
        return new ImSyncPreview(source, localHash, departments, users);
    }

    private List<ImSyncPreview.DepartmentChange> departments(ImOrgSnapshot source,
            Map<Long, ImLocalOrganization.Department> local, Map<String, ImLocalOrganization.DepartmentMapping> mappings, Set<Long> withinRoot) {
        Map<Long, ImOrgSnapshot.Department> remote = unique(source.departments(), ImOrgSnapshot.Department::id);
        List<ImSyncPreview.DepartmentChange> result = new ArrayList<>();
        Set<Long> processed = new HashSet<>();
        Set<Long> conflicting = new HashSet<>();
        while (result.size() < remote.size()) {
            int before = result.size();
            for (ImOrgSnapshot.Department department : source.departments()) {
                if (processed.contains(department.id()) || remote.containsKey(department.parentId()) && !processed.contains(department.parentId())) continue;
                Set<ImSyncPreview.Reason> reasons = new LinkedHashSet<>();
                ImLocalOrganization.DepartmentMapping mapping = mappings.get(Long.toString(department.id()));
                ImLocalOrganization.Department existing = mapping == null ? null : local.get(mapping.departmentId());
                Long parentRemote = remote.containsKey(department.parentId()) ? department.parentId() : null;
                ImLocalOrganization.DepartmentMapping parentMapping = parentRemote == null ? null : mappings.get(Long.toString(parentRemote));
                final Long parentLocal;
                if (parentRemote == null) parentLocal = source.localRootDeptId();
                else if (parentMapping != null) parentLocal = parentMapping.departmentId();
                else parentLocal = null;
                if (parentRemote != null && conflicting.contains(parentRemote)) reasons.add(ImSyncPreview.Reason.PARENT_CONFLICT);
                if (mapping != null) {
                    if (!"ACTIVE".equals(mapping.status())) reasons.add(ImSyncPreview.Reason.MAPPING_DISABLED);
                    if (mapping.version() < 0 || mapping.version() == Integer.MAX_VALUE) reasons.add(ImSyncPreview.Reason.VERSION_EXHAUSTED);
                    if (existing == null) reasons.add(ImSyncPreview.Reason.MAPPING_TARGET_MISSING);
                    else {
                        if (existing.id() == source.localRootDeptId()) reasons.add(ImSyncPreview.Reason.ROOT_MAPPING_COLLISION);
                        if (!withinRoot.contains(existing.id())) reasons.add(ImSyncPreview.Reason.MAPPING_OUTSIDE_ROOT);
                        if (existing.deleted() != 0) reasons.add(ImSyncPreview.Reason.LOCAL_RECORD_DELETED);
                        if (!"0".equals(existing.status())) reasons.add(ImSyncPreview.Reason.LOCAL_RECORD_DISABLED);
                        if (existing.version() < 0 || existing.version() == Integer.MAX_VALUE) reasons.add(ImSyncPreview.Reason.VERSION_EXHAUSTED);
                        if (existing.parentId() != null && existing.deleted() == 0
                                && !validAncestors(local, existing)) reasons.add(ImSyncPreview.Reason.LOCAL_TREE_INVALID);
                        if (parentLocal != null && descendant(local, parentLocal, existing.id())) reasons.add(ImSyncPreview.Reason.LOCAL_TREE_INVALID);
                    }
                }
                if (department.name().length() > 30) reasons.add(ImSyncPreview.Reason.FIELD_TOO_LONG);
                if (department.order() > Integer.MAX_VALUE) reasons.add(ImSyncPreview.Reason.ORDER_OUT_OF_RANGE);
                boolean remoteDuplicate = remote.values().stream().anyMatch(other -> other.id() != department.id()
                        && Objects.equals(parent(remote, other), parent(remote, department)) && key(other.name()).equals(key(department.name())));
                boolean localDuplicate = parentLocal != null && local.values().stream().anyMatch(other -> other.deleted() == 0
                        && (existing == null || existing.id() != other.id()) && Objects.equals(other.parentId(), parentLocal)
                        && key(other.name()).equals(key(department.name())));
                if (remoteDuplicate || localDuplicate) reasons.add(ImSyncPreview.Reason.DUPLICATE_NAME);
                if (parentLocal != null && local.containsKey(parentLocal) && !reasons.contains(ImSyncPreview.Reason.PARENT_CONFLICT)) {
                    String ancestors = ancestors(local, parentLocal);
                    if (ancestors.length() > 50) reasons.add(ImSyncPreview.Reason.FIELD_TOO_LONG);
                }
                ImSyncPreview.Action action = ImSyncPreview.Action.CREATE;
                if (existing != null) action = Objects.equals(existing.parentId(), parentLocal) && Objects.equals(existing.name(), department.name())
                        && Objects.equals(existing.order(), (int) department.order()) ? ImSyncPreview.Action.UNCHANGED : ImSyncPreview.Action.UPDATE;
                if (!reasons.isEmpty()) { action = ImSyncPreview.Action.CONFLICT; conflicting.add(department.id()); }
                result.add(new ImSyncPreview.DepartmentChange(department, existing, mapping, parentLocal, parentRemote, action, List.copyOf(reasons)));
                processed.add(department.id());
            }
            if (result.size() == before) throw ImFailure.orgLocal();
        }
        return List.copyOf(result);
    }

    private List<ImSyncPreview.UserChange> users(ImOrgSnapshot source, ImLocalOrganization local,
            Map<Long, ImLocalOrganization.User> localUsers, Map<String, ImLocalOrganization.UserMapping> mappings,
            List<ImSyncPreview.DepartmentChange> departments, Set<Long> withinRoot) {
        Map<Long, ImSyncPreview.DepartmentChange> remoteDepartments = unique(departments, value -> value.source().id());
        Map<String, Set<Long>> localPhones = contacts(local.users(), ImLocalOrganization.User::mobile, ImLocalOrganization.User::id);
        Map<String, Set<Long>> localEmails = contacts(local.users(), ImLocalOrganization.User::email, ImLocalOrganization.User::id);
        Map<String, Set<String>> remotePhones = contacts(source.members(), value -> value.mobile().value(), ImOrgSnapshot.Member::id);
        Map<String, Set<String>> remoteEmails = contacts(source.members(), value -> value.email().value(), ImOrgSnapshot.Member::id);
        Set<String> usernames = new HashSet<>();
        for (ImLocalOrganization.User user : local.users()) usernames.add(key(user.username()));
        Map<String, Long> primaryDepartments = new HashMap<>();
        source.primaryDepartments().forEach((identifier, department) -> primaryDepartments.put(key(identifier), department));
        Set<String> observed = new HashSet<>();
        List<ImSyncPreview.UserChange> result = new ArrayList<>();
        for (ImOrgSnapshot.Member member : source.members()) {
            observed.add(key(member.id()));
            ImLocalOrganization.UserMapping mapping = mappings.get(key(member.id()));
            ImLocalOrganization.User existing = mapping == null ? null : localUsers.get(mapping.userId());
            if (stopped(mapping, existing)) {
                result.add(stoppedChange(member, existing, mapping));
                continue;
            }
            Set<ImSyncPreview.Reason> reasons = new LinkedHashSet<>();
            if (mapping != null) {
                if (!"ACTIVE".equals(mapping.status()) && !"OUT_OF_SCOPE".equals(mapping.status())) reasons.add(ImSyncPreview.Reason.MAPPING_DISABLED);
                if (mapping.version() < 0 || mapping.version() == Integer.MAX_VALUE) reasons.add(ImSyncPreview.Reason.VERSION_EXHAUSTED);
                if (existing == null) reasons.add(ImSyncPreview.Reason.MAPPING_TARGET_MISSING);
            }
            if (existing != null) {
                if (existing.deleted() != 0) reasons.add(ImSyncPreview.Reason.LOCAL_RECORD_DELETED);
                if (existing.version() < 0 || existing.version() == Integer.MAX_VALUE) reasons.add(ImSyncPreview.Reason.VERSION_EXHAUSTED);
                if (existing.departmentId() == null || !withinRoot.contains(existing.departmentId())) reasons.add(ImSyncPreview.Reason.MAPPING_OUTSIDE_ROOT);
                if (!"0".equals(existing.status()) && !"1".equals(existing.status())) reasons.add(ImSyncPreview.Reason.LOCAL_RECORD_DISABLED);
            }
            Long primary = primaryDepartments.get(key(member.id()));
            if (primary == null && member.departmentIds().size() == 1) primary = member.departmentIds().get(0);
            if (primary == null) reasons.add(ImSyncPreview.Reason.PRIMARY_DEPARTMENT_REQUIRED);
            else if (!member.departmentIds().contains(primary) || !remoteDepartments.containsKey(primary)) reasons.add(ImSyncPreview.Reason.PRIMARY_DEPARTMENT_INVALID);
            ImSyncPreview.DepartmentChange department = primary == null ? null : remoteDepartments.get(primary);
            Long localDepartment = department == null || department.local() == null ? null : department.local().id();
            if (department != null && department.action() == ImSyncPreview.Action.CONFLICT) reasons.add(ImSyncPreview.Reason.PARENT_CONFLICT);
            if (member.name().length() > 30 || tooLong(member.mobile(), 11) || tooLong(member.email(), 50) || tooLong(member.avatar(), 500)) {
                reasons.add(ImSyncPreview.Reason.FIELD_TOO_LONG);
            }
            if (collides(localPhones, member.mobile().value(), existing) || collides(localEmails, member.email().value(), existing)
                    || remotePhones.getOrDefault(key(member.mobile().value()), Set.of()).size() > 1
                    || remoteEmails.getOrDefault(key(member.email().value()), Set.of()).size() > 1) reasons.add(ImSyncPreview.Reason.CONTACT_COLLISION);
            String username = existing == null ? username(source.configId(), member.id()) : existing.username();
            if (existing == null && !usernames.add(key(username))) reasons.add(ImSyncPreview.Reason.USERNAME_COLLISION);
            boolean disabling = member.status() == 2 || member.status() == 5;
            String status = disabling || existing != null && "1".equals(existing.status()) ? "1" : "0";
            if (existing != null && local.protectedUsers().contains(existing.id()) && disabling) reasons.add(ImSyncPreview.Reason.PROTECTED_ACCOUNT);
            ImSyncPreview.Action action = ImSyncPreview.Action.CREATE;
            if (existing != null) {
                action = !Objects.equals(existing.name(), member.name()) || !Objects.equals(existing.departmentId(), localDepartment)
                        || member.mobile().available() && !same(existing.mobile(), member.mobile().value())
                        || member.email().available() && !same(existing.email(), member.email().value())
                        || member.avatar().available() && !same(existing.avatar(), member.avatar().value()) ? ImSyncPreview.Action.UPDATE : ImSyncPreview.Action.UNCHANGED;
                if (disabling && "0".equals(existing.status())) action = ImSyncPreview.Action.DISABLE;
            }
            if (!reasons.isEmpty()) action = ImSyncPreview.Action.CONFLICT;
            if (existing != null && "1".equals(existing.status()) && !disabling) reasons.add(ImSyncPreview.Reason.LOCAL_DISABLED_PRESERVED);
            result.add(new ImSyncPreview.UserChange(member, existing, mapping, localDepartment, primary, username, status, action, List.copyOf(reasons)));
        }
        for (ImOrgSnapshot.Member member : source.outOfScopeMembers()) {
            observed.add(key(member.id()));
            ImLocalOrganization.UserMapping mapping = mappings.get(key(member.id()));
            ImLocalOrganization.User existing = mapping == null ? null : localUsers.get(mapping.userId());
            if (mapping == null || existing == null || mapping.lastSyncTime() == null) throw ImFailure.orgLocal();
            if (stopped(mapping, existing)) {
                result.add(stoppedChange(member, existing, mapping));
                continue;
            }
            List<ImSyncPreview.Reason> reasons = new ArrayList<>();
            if (!"ACTIVE".equals(mapping.status())) reasons.add(ImSyncPreview.Reason.MAPPING_DISABLED);
            if (mapping.version() < 0 || mapping.version() == Integer.MAX_VALUE) reasons.add(ImSyncPreview.Reason.VERSION_EXHAUSTED);
            if (existing.deleted() != 0) reasons.add(ImSyncPreview.Reason.LOCAL_RECORD_DELETED);
            if (existing.departmentId() == null || !withinRoot.contains(existing.departmentId())) reasons.add(ImSyncPreview.Reason.MAPPING_OUTSIDE_ROOT);
            if (!"0".equals(existing.status()) && !"1".equals(existing.status())) reasons.add(ImSyncPreview.Reason.LOCAL_RECORD_DISABLED);
            ImSyncPreview.Action action = reasons.isEmpty() ? ImSyncPreview.Action.RELEASE : ImSyncPreview.Action.CONFLICT;
            if (reasons.isEmpty()) reasons.add(ImSyncPreview.Reason.SCOPE_EXIT_ACCOUNT_PRESERVED);
            result.add(new ImSyncPreview.UserChange(member, existing, mapping, null, null, existing.username(), existing.status(), action, reasons));
        }
        for (ImLocalOrganization.UserMapping mapping : local.userMappings()) {
            if (observed.contains(key(mapping.externalId()))) continue;
            ImLocalOrganization.User existing = localUsers.get(mapping.userId());
            if (existing == null || existing.departmentId() == null || !withinRoot.contains(existing.departmentId()) || !"ACTIVE".equals(mapping.status())) continue;
            List<ImSyncPreview.Reason> reasons = local.protectedUsers().contains(existing.id()) ? List.of(ImSyncPreview.Reason.PROTECTED_ACCOUNT)
                    : List.of(ImSyncPreview.Reason.ABSENCE_UNVERIFIED);
            result.add(new ImSyncPreview.UserChange(null, existing, mapping, null, null, existing.username(), existing.status(), ImSyncPreview.Action.CONFLICT, reasons));
        }
        return List.copyOf(result);
    }

    private static boolean stopped(ImLocalOrganization.UserMapping mapping, ImLocalOrganization.User existing) {
        return mapping != null && existing != null && "AUTO_SYNC".equals(mapping.bindType()) && "DISABLED".equals(mapping.status());
    }

    private static ImSyncPreview.UserChange stoppedChange(ImOrgSnapshot.Member member, ImLocalOrganization.User existing,
            ImLocalOrganization.UserMapping mapping) {
        return new ImSyncPreview.UserChange(member, existing, mapping, null, null, existing.username(), existing.status(),
                ImSyncPreview.Action.SKIP, List.of(ImSyncPreview.Reason.SYNC_MANAGEMENT_STOPPED));
    }

    private static Long parent(Map<Long, ImOrgSnapshot.Department> departments, ImOrgSnapshot.Department department) {
        return departments.containsKey(department.parentId()) ? department.parentId() : null;
    }

    static Set<Long> localTree(Map<Long, ImLocalOrganization.Department> departments, long root) {
        ImLocalOrganization.Department selected = departments.get(root);
        if (selected == null || selected.deleted() != 0 || !"0".equals(selected.status())) throw ImFailure.orgLocal();
        Map<Long, List<Long>> children = new HashMap<>();
        for (ImLocalOrganization.Department department : departments.values()) {
            if (department.id() <= 0 || department.parentId() == null || department.parentId() < 0) throw ImFailure.orgLocal();
            children.computeIfAbsent(department.parentId(), ignored -> new ArrayList<>()).add(department.id());
        }
        ancestors(departments, root);
        if (!Objects.equals(selected.ancestors(), ancestors(departments, selected.parentId()))) throw ImFailure.orgLocal();
        Set<Long> included = new HashSet<>();
        ArrayDeque<Long> pending = new ArrayDeque<>(List.of(root));
        while (!pending.isEmpty()) {
            Long current = pending.removeFirst();
            if (!included.add(current)) throw ImFailure.orgLocal();
            pending.addAll(children.getOrDefault(current, List.of()));
        }
        return Set.copyOf(included);
    }

    static String ancestors(Map<Long, ImLocalOrganization.Department> departments, long parent) {
        List<Long> path = new ArrayList<>();
        Set<Long> visited = new HashSet<>();
        long current = parent;
        while (current != 0) {
            ImLocalOrganization.Department department = departments.get(current);
            if (department == null || department.deleted() != 0 || department.parentId() == null || !visited.add(current)) throw ImFailure.orgLocal();
            path.add(0, current);
            current = department.parentId();
        }
        path.add(0, 0L);
        return String.join(",", path.stream().map(String::valueOf).toList());
    }

    private static boolean descendant(Map<Long, ImLocalOrganization.Department> departments, long candidate, long ancestor) {
        Set<Long> visited = new HashSet<>();
        long current = candidate;
        while (current != 0) {
            if (current == ancestor) return true;
            ImLocalOrganization.Department department = departments.get(current);
            if (department == null || department.parentId() == null || !visited.add(current)) return true;
            current = department.parentId();
        }
        return false;
    }

    private static boolean validAncestors(Map<Long, ImLocalOrganization.Department> departments, ImLocalOrganization.Department department) {
        try { return Objects.equals(department.ancestors(), ancestors(departments, department.parentId())); }
        catch (ImFailure failure) { return false; }
    }

    private static boolean tooLong(ImOrgSnapshot.Field field, int limit) { return field.available() && field.value().length() > limit; }
    private static boolean same(String before, String after) { return Objects.equals(before == null ? "" : before, after == null ? "" : after); }
    private static String key(String value) { return value == null ? "" : value.strip().toLowerCase(Locale.ROOT); }

    private static boolean collides(Map<String, Set<Long>> contacts, String contact, ImLocalOrganization.User current) {
        return contacts.getOrDefault(key(contact), Set.of()).stream().anyMatch(identifier -> current == null || current.id() != identifier);
    }

    private static <Item, Identifier> Map<String, Set<Identifier>> contacts(List<Item> values, Function<Item, String> contact, Function<Item, Identifier> identifier) {
        Map<String, Set<Identifier>> result = new HashMap<>();
        for (Item item : values) {
            String key = key(contact.apply(item));
            if (!key.isEmpty()) result.computeIfAbsent(key, ignored -> new HashSet<>()).add(identifier.apply(item));
        }
        return result;
    }

    private static <Identifier, Value> Map<Identifier, Value> unique(List<Value> values, Function<Value, Identifier> key) {
        Map<Identifier, Value> result = new HashMap<>();
        for (Value value : values) {
            Identifier identifier = key.apply(value);
            if (identifier == null || result.putIfAbsent(identifier, value) != null) throw ImFailure.orgLocal();
        }
        return result;
    }

    static String username(long configId, String externalId) {
        try {
            byte[] hash = MessageDigest.getInstance("SHA-256").digest((configId + ":" + key(externalId)).getBytes(StandardCharsets.UTF_8));
            return "im" + HexFormat.of().formatHex(hash).substring(0, 28);
        } catch (NoSuchAlgorithmException failure) { throw ImFailure.orgLocal(); }
    }
}
