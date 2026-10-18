package com.cloudflow.auth.im;

import com.cloudflow.auth.domain.SysDept;
import com.cloudflow.auth.domain.SysUser;
import com.cloudflow.auth.mapper.ImMapper;
import com.cloudflow.auth.mapper.ImOrganizationMapper;
import com.cloudflow.auth.service.PasswordService;
import com.cloudflow.common.core.event.UserDisabledEvent;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.event.outbox.OutboxPublisher;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.common.tenant.quota.TenantQuotaService;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Base64;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Component
@RequiredArgsConstructor
public class ImOrganizationWriter {
    private final ImOrganizationMapper writes;
    private final ImLocalOrganizationReader reader;
    private final ImOrgSnapshotCodec codec;
    private final TenantQuotaService quotas;
    private final PasswordService passwords;
    private final OutboxPublisher outbox;
    private final ObjectMapper json;
    private final SecureRandom random = new SecureRandom();

    ImSyncApplication write(ImMapper mapper, ImSyncApplication application, ImActors.Actor actor) {
        if (application == null || actor == null || application.effectsPending() || application.finished()
                || application.preview().source().tenantId() != actor.tenantId()
                || !Objects.equals(TenantContext.getTenantId(), actor.tenantId()) || TenantContext.getTenantSkip()
                || !TransactionSynchronizationManager.isActualTransactionActive()
                || TransactionSynchronizationManager.isCurrentTransactionReadOnly()
                || !Integer.valueOf(TransactionDefinition.ISOLATION_SERIALIZABLE).equals(TransactionSynchronizationManager.getCurrentTransactionIsolationLevel())) {
            throw ImFailure.orgLocal();
        }
        ImOrgSnapshot source = application.preview().source();
        ImLocalOrganization local = reader.read(mapper, actor.tenantId(), source.configId());
        application.requireLocalHash(codec.localHash(local));
        Map<Long, ImLocalOrganization.Department> departments = new LinkedHashMap<>();
        local.departments().forEach(department -> departments.put(department.id(), department));
        Map<Long, ImLocalOrganization.User> users = new HashMap<>();
        local.users().forEach(user -> users.put(user.id(), user));
        Map<Long, ImSyncApplication.Outcome> parents = new HashMap<>();
        application.outcomes().stream().filter(outcome -> outcome.kind() == ImSyncApplication.Kind.DEPARTMENT)
                .forEach(outcome -> parents.put(Long.parseLong(outcome.externalId()), outcome));
        List<ImSyncApplication.Outcome> completed = new ArrayList<>();
        Set<Long> affectedUsers = new LinkedHashSet<>();
        boolean changedDepartments = false;
        LocalDateTime now = LocalDateTime.now();
        for (int index = application.next(); index < Math.min(application.next() + ImSyncApplication.BATCH_SIZE, application.total()); index++) {
            ImSyncBudget.check();
            ImSyncApplication.Outcome outcome;
            if (index < application.preview().departments().size()) {
                ImSyncPreview.DepartmentChange change = application.preview().departments().get(index);
                outcome = department(index, change, source, departments, parents, actor, now);
                parents.put(change.source().id(), outcome);
                changedDepartments |= outcome.changed();
            } else {
                ImSyncPreview.UserChange change = application.preview().users().get(index - application.preview().departments().size());
                outcome = user(index, change, source, parents, users, actor, now);
                if (outcome.changed()) affectedUsers.add(outcome.localId());
            }
            completed.add(outcome);
        }
        ImLocalOrganization after = reader.read(mapper, actor.tenantId(), source.configId());
        if (changedDepartments) {
            long expected = after.users().stream().filter(user -> user.deleted() == 0).count();
            if (writes.advanceUserRevisions(actor.tenantId()) != expected) throw ImFailure.orgApplyPersistence();
            after = reader.read(mapper, actor.tenantId(), source.configId());
            after.users().forEach(user -> affectedUsers.add(user.id()));
        }
        return application.advance(completed, codec.localHash(after), List.copyOf(affectedUsers), changedDepartments);
    }

    private ImSyncApplication.Outcome department(int index, ImSyncPreview.DepartmentChange change, ImOrgSnapshot source,
            Map<Long, ImLocalOrganization.Department> departments, Map<Long, ImSyncApplication.Outcome> parents,
            ImActors.Actor actor, LocalDateTime now) {
        Long localId = change.local() == null ? null : change.local().id();
        Long existingId = localId;
        String externalId = Long.toString(change.source().id());
        if (change.action() == ImSyncPreview.Action.CONFLICT) return conflict(index, ImSyncApplication.Kind.DEPARTMENT, externalId, localId, change.reasons());
        ImSyncApplication.Outcome parent = change.parentExternalId() == null ? null : parents.get(change.parentExternalId());
        if (change.parentExternalId() != null && (parent == null || parent.action() == ImSyncPreview.Action.CONFLICT)) {
            return conflict(index, ImSyncApplication.Kind.DEPARTMENT, externalId, localId, List.of(ImSyncPreview.Reason.PARENT_CONFLICT));
        }
        long parentId = parent == null ? source.localRootDeptId() : parent.localId();
        Map<Long, ImLocalOrganization.Department> replacements = new LinkedHashMap<>();
        String ancestors;
        try {
            ancestors = ImSyncPlanner.ancestors(departments, parentId);
            if (ancestors.length() > 50) return conflict(index, ImSyncApplication.Kind.DEPARTMENT, externalId, localId, List.of(ImSyncPreview.Reason.FIELD_TOO_LONG));
            if (departments.values().stream().anyMatch(other -> other.deleted() == 0 && !Objects.equals(existingId, other.id())
                    && Objects.equals(other.parentId(), parentId) && key(other.name()).equals(key(change.source().name())))) {
                return conflict(index, ImSyncApplication.Kind.DEPARTMENT, externalId, localId, List.of(ImSyncPreview.Reason.DUPLICATE_NAME));
            }
            if (localId != null && change.action() == ImSyncPreview.Action.UPDATE) {
                ImLocalOrganization.Department current = departments.get(localId);
                Set<Long> descendants = ImSyncPlanner.localTree(departments, localId);
                if (descendants.contains(parentId)) throw ImFailure.orgLocal();
                Map<Long, ImLocalOrganization.Department> proposed = new HashMap<>(departments);
                proposed.put(localId, new ImLocalOrganization.Department(actor.tenantId(), localId, parentId, ancestors,
                        change.source().name(), (int) change.source().order(), current.status(), current.deleted(), current.version()));
                for (Long identifier : descendants) {
                    ImLocalOrganization.Department descendant = proposed.get(identifier);
                    String path = ImSyncPlanner.ancestors(proposed, descendant.parentId());
                    if (path.length() > 50) return conflict(index, ImSyncApplication.Kind.DEPARTMENT, externalId, localId, List.of(ImSyncPreview.Reason.FIELD_TOO_LONG));
                    if (identifier.equals(localId) || !Objects.equals(path, descendant.ancestors())) {
                        if (descendant.version() < 0 || descendant.version() == Integer.MAX_VALUE) {
                            return conflict(index, ImSyncApplication.Kind.DEPARTMENT, externalId, localId, List.of(ImSyncPreview.Reason.VERSION_EXHAUSTED));
                        }
                        replacements.put(identifier, new ImLocalOrganization.Department(actor.tenantId(), identifier, descendant.parentId(), path,
                                descendant.name(), descendant.order(), descendant.status(), descendant.deleted(), descendant.version() + 1));
                    }
                }
            }
        } catch (ImFailure failure) {
            return conflict(index, ImSyncApplication.Kind.DEPARTMENT, externalId, localId, List.of(ImSyncPreview.Reason.LOCAL_TREE_INVALID));
        }
        String operator = Long.toString(actor.userId());
        SysDept row = new SysDept();
        row.setTenantId(actor.tenantId());
        row.setDeptId(localId);
        row.setParentId(parentId);
        row.setAncestors(ancestors);
        row.setDeptName(change.source().name());
        row.setOrderNum((int) change.source().order());
        if (change.action() == ImSyncPreview.Action.CREATE) {
            requireOne(writes.insertDepartment(row, operator, now));
            if (row.getDeptId() == null || row.getDeptId() <= 0) throw ImFailure.orgApplyPersistence();
            localId = row.getDeptId();
            departments.put(localId, new ImLocalOrganization.Department(actor.tenantId(), localId, parentId, ancestors, row.getDeptName(), row.getOrderNum(), "0", 0, 0));
            requireOne(writes.insertDepartmentMapping(actor.tenantId(), source.configId(), localId, change.source(), operator, now));
        } else {
            if (change.action() == ImSyncPreview.Action.UPDATE) {
                row.setVersion(departments.get(localId).version());
                requireOne(writes.updateDepartment(row, operator, now));
                for (ImLocalOrganization.Department replacement : replacements.values()) {
                    if (replacement.id() != localId) requireOne(writes.updateAncestors(actor.tenantId(), replacement.id(), replacement.version() - 1, replacement.ancestors(), operator, now));
                }
                departments.putAll(replacements);
            }
            requireOne(writes.updateDepartmentMapping(change.mapping(), change.source(), operator, now));
        }
        return new ImSyncApplication.Outcome(index, ImSyncApplication.Kind.DEPARTMENT, externalId, localId, change.action(), change.reasons());
    }

    private ImSyncApplication.Outcome user(int index, ImSyncPreview.UserChange change, ImOrgSnapshot source,
            Map<Long, ImSyncApplication.Outcome> parents, Map<Long, ImLocalOrganization.User> users, ImActors.Actor actor, LocalDateTime now) {
        Long localId = change.local() == null ? null : change.local().id();
        String externalId = change.source() == null ? change.mapping().externalId() : change.source().id();
        if (change.action() == ImSyncPreview.Action.CONFLICT) return conflict(index, ImSyncApplication.Kind.USER, externalId, localId, change.reasons());
        if (change.action() == ImSyncPreview.Action.SKIP) {
            return new ImSyncApplication.Outcome(index, ImSyncApplication.Kind.USER, externalId, localId, change.action(), change.reasons());
        }
        ImLocalOrganization.User current = localId == null ? null : users.get(localId);
        if (localId != null && current == null) throw ImFailure.orgLocal();
        if (change.action() == ImSyncPreview.Action.RELEASE) {
            requireOne(writes.releaseUserMapping(change.mapping(), Long.toString(actor.userId()), now));
            return new ImSyncApplication.Outcome(index, ImSyncApplication.Kind.USER, externalId, localId, change.action(), change.reasons());
        }
        if (current != null && (current.version() < 0 || current.version() == Integer.MAX_VALUE)) {
            return conflict(index, ImSyncApplication.Kind.USER, externalId, localId, List.of(ImSyncPreview.Reason.VERSION_EXHAUSTED));
        }
        ImSyncApplication.Outcome department = parents.get(change.departmentExternalId());
        if (department == null || department.action() == ImSyncPreview.Action.CONFLICT) {
            return conflict(index, ImSyncApplication.Kind.USER, externalId, localId, List.of(ImSyncPreview.Reason.PARENT_CONFLICT));
        }
        String operator = Long.toString(actor.userId());
        SysUser row = new SysUser();
        row.setTenantId(actor.tenantId());
        row.setUserId(localId);
        row.setDeptId(department.localId());
        row.setUserName(change.username());
        row.setNickName(change.source().name());
        row.setPhonenumber(change.source().mobile().available() || current == null ? change.source().mobile().value() : current.mobile());
        row.setEmail(change.source().email().available() || current == null ? change.source().email().value() : current.email());
        row.setAvatar(change.source().avatar().available() || current == null ? change.source().avatar().value() : current.avatar());
        row.setStatus(change.desiredStatus());
        if (change.action() == ImSyncPreview.Action.CREATE) {
            quotas.requireUserCapacity(actor.tenantId());
            byte[] entropy = new byte[32];
            random.nextBytes(entropy);
            try { row.setPassword(passwords.encodePassword(Base64.getUrlEncoder().withoutPadding().encodeToString(entropy))); }
            finally { Arrays.fill(entropy, (byte) 0); }
            try { requireOne(writes.insertUser(row, operator, now)); }
            finally { row.setPassword(null); }
            if (row.getUserId() == null || row.getUserId() <= 0) throw ImFailure.orgApplyPersistence();
            localId = row.getUserId();
            requireOne(writes.insertUserMapping(actor.tenantId(), source.configId(), localId, change.source(), operator, now));
        } else {
            if (change.action() != ImSyncPreview.Action.UNCHANGED) {
                row.setVersion(current.version());
                requireOne(writes.updateUser(row, operator, now));
                if (change.action() == ImSyncPreview.Action.DISABLE) disabledEvent(row, now);
            }
            requireOne(writes.updateUserMapping(change.mapping(), change.source(), operator, now));
        }
        return new ImSyncApplication.Outcome(index, ImSyncApplication.Kind.USER, externalId, localId, change.action(), change.reasons());
    }

    private void disabledEvent(SysUser row, LocalDateTime now) {
        UserDisabledEvent event = new UserDisabledEvent();
        event.setUserId(row.getUserId());
        event.setUserName(row.getNickName());
        event.setDeptId(row.getDeptId());
        event.setDisabledAt(now);
        try {
            outbox.publish(BusinessEventEnvelope.builder().eventType("USER_DISABLED").sourceModule("cloudflow-auth")
                    .sourceId(row.getUserId()).tenantId(row.getTenantId()).payload(json.writeValueAsString(event)).build());
        } catch (JsonProcessingException failure) { throw ImFailure.orgApplyPersistence(); }
    }

    private static void requireOne(int affected) { if (affected != 1) throw ImFailure.orgApplyPersistence(); }
    private static String key(String value) { return value == null ? "" : value.strip().toLowerCase(Locale.ROOT); }
    private static ImSyncApplication.Outcome conflict(int index, ImSyncApplication.Kind kind, String externalId, Long localId, List<ImSyncPreview.Reason> reasons) {
        return new ImSyncApplication.Outcome(index, kind, externalId, localId, ImSyncPreview.Action.CONFLICT, reasons);
    }
}
