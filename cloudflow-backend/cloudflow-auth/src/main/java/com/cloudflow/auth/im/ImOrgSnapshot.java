package com.cloudflow.auth.im;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.net.URI;
import java.time.Instant;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

public record ImOrgSnapshot(long tenantId, long configId, int configVersion, String corpId, long agentId, Instant capturedAt,
        long localRootDeptId, Set<Long> roots, Map<String, Long> primaryDepartments,
        List<Department> departments, List<Member> members,
        @JsonInclude(JsonInclude.Include.NON_EMPTY) List<Member> outOfScopeMembers) {

    public ImOrgSnapshot(long tenantId, long configId, int configVersion, String corpId, long agentId, Instant capturedAt,
            long localRootDeptId, Set<Long> roots, Map<String, Long> primaryDepartments, List<Department> departments, List<Member> members) {
        this(tenantId, configId, configVersion, corpId, agentId, capturedAt, localRootDeptId, roots, primaryDepartments, departments, members, List.of());
    }

    public ImOrgSnapshot {
        if (tenantId <= 0 || configId <= 0 || configVersion < 0 || agentId <= 0 || corpId == null
                || !corpId.matches("[A-Za-z0-9_-]{1,100}") || capturedAt == null
                || departments == null || departments.isEmpty() || departments.size() > WeComOrgReader.MAX_DEPARTMENTS
                || members == null || members.size() > WeComOrgReader.MAX_MEMBERS) throw ImFailure.orgIncomplete();
        ImOrgScope scope = new ImOrgScope(localRootDeptId, roots, primaryDepartments);
        roots = scope.roots();
        primaryDepartments = scope.primaryDepartments();
        Map<Long, Department> indexed = new HashMap<>();
        for (Department department : departments) {
            if (department == null || indexed.putIfAbsent(department.id(), department) != null) throw ImFailure.orgIncomplete();
        }
        if (!ImOrgTopology.select(indexed, roots, roots).equals(indexed.keySet())) throw ImFailure.orgIncomplete();
        Set<String> identifiers = new HashSet<>();
        for (Member member : members) {
            if (member == null || !identifiers.add(member.id().toLowerCase(Locale.ROOT))
                    || member.departmentIds().stream().noneMatch(indexed::containsKey)) throw ImFailure.orgIncomplete();
        }
        outOfScopeMembers = outOfScopeMembers == null ? List.of() : outOfScopeMembers;
        if (outOfScopeMembers.size() > ImLocalOrganization.MAX_LOCAL_USERS) throw ImFailure.orgIncomplete();
        for (Member member : outOfScopeMembers) {
            if (member == null || member.status() == 5 || !identifiers.add(member.id().toLowerCase(Locale.ROOT))
                    || member.departmentIds().stream().anyMatch(indexed::containsKey)) throw ImFailure.orgIncomplete();
        }
        departments = departments.stream().sorted(Comparator.comparingLong(Department::id)).toList();
        members = members.stream().sorted(Comparator.comparing(Member::id)).toList();
        outOfScopeMembers = outOfScopeMembers.stream().sorted(Comparator.comparing(Member::id)).toList();
    }

    @Override
    public String toString() {
        return "ImOrgSnapshot[tenantId=" + tenantId + ", configId=" + configId + ", version=" + configVersion
                + ", departments=" + departments.size() + ", members=" + members.size() + "]";
    }

    public record Department(long id, long parentId, String name, long order) {
        public Department {
            if (id <= 0 || parentId < 0 || parentId == id || order < 0 || order > 4294967295L) throw ImFailure.orgIncomplete();
            requireText(name, 100);
        }

        @Override
        public String toString() { return "ImOrgDepartment[id=" + id + "]"; }
    }

    public record Member(String id, String name, List<Long> departmentIds, int status,
            Field mobile, Field email, Field avatar) {
        public Member {
            if (id == null || !id.matches("[A-Za-z0-9_.@=-]{1,128}") || departmentIds == null
                    || departmentIds.isEmpty() || departmentIds.size() > WeComOrgReader.MAX_DEPARTMENTS
                    || departmentIds.stream().anyMatch(identifier -> identifier == null || identifier <= 0)
                    || new HashSet<>(departmentIds).size() != departmentIds.size()
                    || status != 1 && status != 2 && status != 4 && status != 5) throw ImFailure.orgIncomplete();
            requireText(name, 100);
            requireField(mobile, 32);
            requireField(email, 254);
            requireField(avatar, 1000);
            requireAvatar(avatar);
            departmentIds = departmentIds.stream().sorted().toList();
        }

        @Override
        public String toString() { return "ImOrgMember[departments=" + departmentIds.size() + "]"; }
    }

    public record Field(boolean available, String value) {
        public Field {
            if (available != (value != null) || value != null && (value.length() > 1000
                    || value.codePoints().anyMatch(Character::isISOControl))) throw ImFailure.orgIncomplete();
        }

        @Override
        public String toString() { return "ImOrgField[available=" + available + "]"; }
    }

    private static void requireText(String value, int maximum) {
        if (value == null || value.isBlank() || value.length() > maximum
                || value.codePoints().anyMatch(Character::isISOControl)) throw ImFailure.orgIncomplete();
    }

    private static void requireField(Field field, int maximum) {
        if (field == null || field.available() && field.value().length() > maximum) throw ImFailure.orgIncomplete();
    }

    private static void requireAvatar(Field field) {
        if (!field.available() || field.value().isEmpty()) return;
        try {
            URI uri = URI.create(field.value());
            if (!"https".equals(uri.getScheme()) || uri.getHost() == null
                    || !Set.of("wework.qpic.cn", "wework.qlogo.cn", "wx.qlogo.cn").contains(uri.getHost())
                    || uri.getPort() != -1 || uri.getRawUserInfo() != null || uri.getRawFragment() != null) throw ImFailure.orgIncomplete();
        } catch (IllegalArgumentException failure) { throw ImFailure.orgIncomplete(); }
    }
}
