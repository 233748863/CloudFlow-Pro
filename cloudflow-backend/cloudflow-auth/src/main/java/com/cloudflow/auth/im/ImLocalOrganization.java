package com.cloudflow.auth.im;

import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.List;
import java.util.Set;

public record ImLocalOrganization(long tenantId, List<Department> departments, List<User> users,
        List<DepartmentMapping> departmentMappings, List<UserMapping> userMappings, Set<Long> protectedUsers) {
    static final int MAX_LOCAL_DEPARTMENTS = 10000;
    static final int MAX_LOCAL_USERS = 20000;

    public ImLocalOrganization {
        if (tenantId <= 0 || departments == null || users == null || departmentMappings == null || userMappings == null
                || protectedUsers == null || departments.size() > MAX_LOCAL_DEPARTMENTS || users.size() > MAX_LOCAL_USERS
                || departmentMappings.size() > MAX_LOCAL_DEPARTMENTS || userMappings.size() > MAX_LOCAL_USERS) throw ImFailure.orgLocal();
        if (departments.stream().anyMatch(value -> value == null || value.tenantId() != tenantId)
                || users.stream().anyMatch(value -> value == null || value.tenantId() != tenantId)
                || departmentMappings.stream().anyMatch(value -> value == null || value.tenantId() != tenantId)
                || userMappings.stream().anyMatch(value -> value == null || value.tenantId() != tenantId)
                || protectedUsers.stream().anyMatch(value -> value == null || value <= 0)) throw ImFailure.orgLocal();
        departments = departments.stream().sorted(Comparator.comparingLong(Department::id)).toList();
        users = users.stream().sorted(Comparator.comparingLong(User::id)).toList();
        departmentMappings = departmentMappings.stream().sorted(Comparator.comparingLong(DepartmentMapping::id)).toList();
        userMappings = userMappings.stream().sorted(Comparator.comparingLong(UserMapping::id)).toList();
        protectedUsers = Set.copyOf(protectedUsers);
    }

    @Override
    public String toString() { return "ImLocalOrganization[tenantId=" + tenantId + ", users=" + users.size() + "]"; }

    public record Department(long tenantId, long id, Long parentId, String ancestors, String name, Integer order,
            String status, int deleted, int version) {
        public Department {
            if (tenantId <= 0 || id <= 0) throw ImFailure.orgLocal();
        }
        @Override public String toString() { return "ImLocalDepartment[id=" + id + "]"; }
    }

    public record User(long tenantId, long id, Long departmentId, String username, String name, String mobile,
            String email, String avatar, String status, int deleted, int version) {
        public User {
            if (tenantId <= 0 || id <= 0 || username == null || username.isBlank()) throw ImFailure.orgLocal();
        }
        @Override public String toString() { return "ImLocalUser[id=" + id + "]"; }
    }

    public record DepartmentMapping(long tenantId, long id, long configId, long departmentId, String externalId,
            String externalParentId, String status, int version) {
        public DepartmentMapping {
            if (tenantId <= 0 || id <= 0 || configId <= 0 || departmentId <= 0 || externalId == null
                    || !externalId.matches("[1-9][0-9]{0,18}")) throw ImFailure.orgLocal();
            try { Long.parseLong(externalId); }
            catch (NumberFormatException failure) { throw ImFailure.orgLocal(); }
        }
        @Override public String toString() { return "ImLocalDepartmentMapping[id=" + id + "]"; }
    }

    public record UserMapping(long tenantId, long id, long configId, long userId, String externalId, String bindType,
            LocalDateTime lastSyncTime, String status, int version) {
        public UserMapping {
            if (tenantId <= 0 || id <= 0 || configId <= 0 || userId <= 0 || externalId == null
                    || !externalId.matches("[A-Za-z0-9_.@=-]{1,128}") || bindType == null
                    || !Set.of("AUTO_SYNC", "MANUAL_BIND", "SCAN_BIND").contains(bindType)) throw ImFailure.orgLocal();
        }
        @Override public String toString() { return "ImLocalUserMapping[id=" + id + "]"; }
    }
}
