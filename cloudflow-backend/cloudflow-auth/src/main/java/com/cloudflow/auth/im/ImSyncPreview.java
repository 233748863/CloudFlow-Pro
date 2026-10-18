package com.cloudflow.auth.im;

import java.util.List;
import java.util.Locale;
import java.util.HashSet;
import java.util.Set;
import java.util.Objects;

public record ImSyncPreview(ImOrgSnapshot source, String localHash, List<DepartmentChange> departments, List<UserChange> users) {
    public ImSyncPreview {
        if (source == null || localHash == null || !localHash.matches("[a-f0-9]{64}") || departments == null || users == null
                || departments.size() != source.departments().size() || users.size() > ImLocalOrganization.MAX_LOCAL_USERS
                || departments.stream().anyMatch(value -> value == null) || users.stream().anyMatch(value -> value == null)) {
            throw ImFailure.orgLocal();
        }
        departments = List.copyOf(departments);
        users = List.copyOf(users);
        Set<Long> departmentIds = new HashSet<>();
        Set<Long> localDepartmentIds = new HashSet<>();
        for (DepartmentChange change : departments) {
            if (!source.departments().contains(change.source()) || !departmentIds.add(change.source().id())
                    || change.local() != null && (change.local().tenantId() != source.tenantId() || !localDepartmentIds.add(change.local().id()))
                    || change.mapping() != null && (change.mapping().tenantId() != source.tenantId()
                    || change.mapping().configId() != source.configId()
                    || !change.mapping().externalId().equals(Long.toString(change.source().id()))
                    || change.local() != null && change.mapping().departmentId() != change.local().id())) throw ImFailure.orgLocal();
        }
        Set<String> memberIds = new HashSet<>();
        Set<String> allMemberIds = new HashSet<>();
        Set<Long> localUserIds = new HashSet<>();
        for (UserChange change : users) {
            boolean outside = change.source() != null && source.outOfScopeMembers().contains(change.source());
            if (change.source() != null && (!(source.members().contains(change.source()) || outside) || !memberIds.add(change.source().id()))
                    || change.action() == Action.RELEASE && !outside
                    || outside && change.action() != Action.RELEASE && change.action() != Action.SKIP && change.action() != Action.CONFLICT
                    || change.local() != null && (change.local().tenantId() != source.tenantId() || !localUserIds.add(change.local().id()))
                    || change.mapping() != null && (change.mapping().tenantId() != source.tenantId()
                    || change.mapping().configId() != source.configId()
                    || change.source() != null && !change.mapping().externalId().equalsIgnoreCase(change.source().id())
                    || change.local() != null && change.mapping().userId() != change.local().id())) throw ImFailure.orgLocal();
            String identifier = change.source() == null ? change.mapping().externalId() : change.source().id();
            if (!allMemberIds.add(identifier.toLowerCase(Locale.ROOT))) throw ImFailure.orgLocal();
        }
        if (memberIds.size() != source.members().size() + source.outOfScopeMembers().size()) throw ImFailure.orgLocal();
    }

    public Summary summary() {
        return new Summary(countDepartments(Action.CREATE), countDepartments(Action.UPDATE), countDepartments(Action.UNCHANGED),
                countDepartments(Action.CONFLICT), countUsers(Action.CREATE), countUsers(Action.UPDATE), countUsers(Action.DISABLE),
                countUsers(Action.UNCHANGED) + countUsers(Action.RELEASE) + countUsers(Action.SKIP), countUsers(Action.CONFLICT));
    }

    private long countDepartments(Action action) { return departments.stream().filter(change -> change.action() == action).count(); }
    private long countUsers(Action action) { return users.stream().filter(change -> change.action() == action).count(); }

    @Override
    public String toString() { return "ImSyncPreview[departments=" + departments.size() + ", users=" + users.size() + "]"; }

    public enum Action { CREATE, UPDATE, DISABLE, UNCHANGED, RELEASE, SKIP, CONFLICT }

    public enum Reason {
        LOCAL_ROOT_INVALID, LOCAL_TREE_INVALID, LOCAL_RECORD_DELETED, LOCAL_RECORD_DISABLED, MAPPING_DISABLED,
        MAPPING_TARGET_MISSING, MAPPING_OUTSIDE_ROOT, ROOT_MAPPING_COLLISION, PARENT_CONFLICT, DUPLICATE_NAME,
        FIELD_TOO_LONG, ORDER_OUT_OF_RANGE, VERSION_EXHAUSTED, PRIMARY_DEPARTMENT_REQUIRED, PRIMARY_DEPARTMENT_INVALID,
        CONTACT_COLLISION, USERNAME_COLLISION, SOURCE_FIELD_POLICY_PENDING, SCOPE_EXIT_POLICY_PENDING,
        ABSENCE_UNVERIFIED, PROTECTED_ACCOUNT, LOCAL_DISABLED_PRESERVED, SCOPE_EXIT_ACCOUNT_PRESERVED, SYNC_MANAGEMENT_STOPPED, CONFIGURATION_CHANGED
    }

    public record DepartmentChange(ImOrgSnapshot.Department source, ImLocalOrganization.Department local,
            ImLocalOrganization.DepartmentMapping mapping, Long parentLocalId, Long parentExternalId,
            Action action, List<Reason> reasons) {
        public DepartmentChange {
            if (source == null || action == null || action == Action.DISABLE || action == Action.RELEASE || action == Action.SKIP || reasons == null
                    || (parentLocalId == null && parentExternalId == null) && action != Action.CONFLICT) throw ImFailure.orgLocal();
            if (action == Action.CREATE && (local != null || mapping != null)
                    || (action == Action.UPDATE || action == Action.UNCHANGED) && (local == null || mapping == null)) throw ImFailure.orgLocal();
            reasons = checkedReasons(action, reasons);
        }

        @Override public String toString() { return "ImDepartmentChange[action=" + action + "]"; }
    }

    public record UserChange(ImOrgSnapshot.Member source, ImLocalOrganization.User local,
            ImLocalOrganization.UserMapping mapping, Long departmentLocalId, Long departmentExternalId,
            String username, String desiredStatus, Action action, List<Reason> reasons) {
        public UserChange {
            if (action == null || reasons == null || source == null && mapping == null
                    || action != Action.CONFLICT && (source == null || action != Action.RELEASE && action != Action.SKIP && departmentExternalId == null || username == null
                    || !"0".equals(desiredStatus) && !"1".equals(desiredStatus))) throw ImFailure.orgLocal();
            if (action == Action.CREATE && (local != null || mapping != null)
                    || (action == Action.UPDATE || action == Action.DISABLE || action == Action.UNCHANGED || action == Action.RELEASE || action == Action.SKIP) && (local == null || mapping == null)) throw ImFailure.orgLocal();
            if (action == Action.SKIP && (departmentExternalId != null || departmentLocalId != null || !Objects.equals(desiredStatus, local.status())
                    || !Objects.equals(username, local.username()) || !"AUTO_SYNC".equals(mapping.bindType()) || !"DISABLED".equals(mapping.status())
                    || !reasons.equals(List.of(Reason.SYNC_MANAGEMENT_STOPPED)))) throw ImFailure.orgLocal();
            if (action == Action.RELEASE && (departmentExternalId != null || departmentLocalId != null || !Objects.equals(desiredStatus, local.status())
                    || !Objects.equals(username, local.username()) || !"ACTIVE".equals(mapping.status()) || mapping.lastSyncTime() == null
                    || !reasons.equals(List.of(Reason.SCOPE_EXIT_ACCOUNT_PRESERVED)))) throw ImFailure.orgLocal();
            reasons = checkedReasons(action, reasons);
        }

        @Override public String toString() { return "ImUserChange[action=" + action + "]"; }
    }

    public record Summary(long departmentsCreated, long departmentsUpdated, long departmentsUnchanged, long departmentConflicts,
            long usersCreated, long usersUpdated, long usersDisabled, long usersUnchanged, long userConflicts) { }

    private static List<Reason> checkedReasons(Action action, List<Reason> reasons) {
        if (reasons.stream().anyMatch(reason -> reason == null) || new HashSet<>(reasons).size() != reasons.size()
                || action == Action.CONFLICT && reasons.isEmpty()
                || action != Action.CONFLICT && reasons.stream().anyMatch(reason -> reason != Reason.LOCAL_DISABLED_PRESERVED
                    && !(action == Action.RELEASE && reason == Reason.SCOPE_EXIT_ACCOUNT_PRESERVED)
                    && !(action == Action.SKIP && reason == Reason.SYNC_MANAGEMENT_STOPPED))) throw ImFailure.orgLocal();
        return List.copyOf(reasons);
    }
}
