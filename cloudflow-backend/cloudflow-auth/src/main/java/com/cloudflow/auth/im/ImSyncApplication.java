package com.cloudflow.auth.im;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

public record ImSyncApplication(ImSyncPreview preview, String previewHash, String localHash,
        List<Outcome> outcomes, List<Long> pendingUsers, boolean pendingDepartments,
        @JsonInclude(JsonInclude.Include.NON_DEFAULT) long confirmedBy) {
    public static final int BATCH_SIZE = 100;

    public ImSyncApplication(ImSyncPreview preview, String previewHash, String localHash,
            List<Outcome> outcomes, List<Long> pendingUsers, boolean pendingDepartments) {
        this(preview, previewHash, localHash, outcomes, pendingUsers, pendingDepartments, 0);
    }

    public ImSyncApplication {
        if (confirmedBy < 0 || preview == null || !hash(previewHash) || !hash(localHash) || outcomes == null || pendingUsers == null
                || outcomes.size() > preview.departments().size() + preview.users().size()
                || pendingUsers.size() > ImLocalOrganization.MAX_LOCAL_USERS
                || pendingUsers.stream().anyMatch(identifier -> identifier == null || identifier <= 0)
                || new HashSet<>(pendingUsers).size() != pendingUsers.size()) throw ImFailure.orgLocal();
        outcomes = List.copyOf(outcomes);
        pendingUsers = pendingUsers.stream().sorted().toList();
        Set<Long> departmentIds = new HashSet<>();
        Set<Long> userIds = new HashSet<>();
        Map<Long, Outcome> parents = new HashMap<>();
        for (int index = 0; index < outcomes.size(); index++) {
            Outcome outcome = outcomes.get(index);
            if (outcome == null || outcome.index() != index) throw ImFailure.orgLocal();
            if (index < preview.departments().size()) {
                ImSyncPreview.DepartmentChange change = preview.departments().get(index);
                verify(outcome, Kind.DEPARTMENT, Long.toString(change.source().id()), change.local() == null ? null : change.local().id(), change.action(), change.reasons());
                if (outcome.action() != ImSyncPreview.Action.CONFLICT) {
                    if (!departmentIds.add(outcome.localId()) || outcome.localId() == preview.source().localRootDeptId()) throw ImFailure.orgLocal();
                    if (change.parentExternalId() != null) {
                        Outcome parent = parents.get(change.parentExternalId());
                        if (parent == null || parent.action() == ImSyncPreview.Action.CONFLICT) throw ImFailure.orgLocal();
                    }
                }
                parents.put(change.source().id(), outcome);
            } else {
                ImSyncPreview.UserChange change = preview.users().get(index - preview.departments().size());
                String identifier = change.source() == null ? change.mapping().externalId() : change.source().id();
                verify(outcome, Kind.USER, identifier, change.local() == null ? null : change.local().id(), change.action(), change.reasons());
                if (outcome.action() != ImSyncPreview.Action.CONFLICT) {
                    if (!userIds.add(outcome.localId())) throw ImFailure.orgLocal();
                    Outcome department = parents.get(change.departmentExternalId());
                    if (outcome.action() != ImSyncPreview.Action.RELEASE && outcome.action() != ImSyncPreview.Action.SKIP
                            && (department == null || department.action() == ImSyncPreview.Action.CONFLICT)) throw ImFailure.orgLocal();
                }
            }
        }
        if (outcomes.isEmpty() && (!pendingUsers.isEmpty() || pendingDepartments || !localHash.equals(preview.localHash()))) throw ImFailure.orgLocal();
        if (pendingDepartments && outcomes.stream().noneMatch(outcome -> outcome.kind() == Kind.DEPARTMENT && outcome.changed())) throw ImFailure.orgLocal();
        List<Outcome> verifiedOutcomes = outcomes;
        if (!pendingDepartments && pendingUsers.stream().anyMatch(identifier -> verifiedOutcomes.stream().noneMatch(outcome -> outcome.kind() == Kind.USER
                && outcome.changed() && Objects.equals(outcome.localId(), identifier)))) throw ImFailure.orgLocal();
    }

    public static ImSyncApplication start(ImSyncPreview preview, String previewHash) {
        if (preview == null) throw ImFailure.orgLocal();
        return new ImSyncApplication(preview, previewHash, preview.localHash(), List.of(), List.of(), false);
    }

    public ImSyncApplication authorize(long userId) {
        if (userId <= 0) throw ImFailure.unauthenticated();
        return new ImSyncApplication(preview, previewHash, localHash, outcomes, pendingUsers, pendingDepartments, userId);
    }

    public ImSyncApplication advance(List<Outcome> completed, String nextLocalHash, List<Long> affectedUsers, boolean departmentsChanged) {
        if (effectsPending() || finished() || completed == null || completed.isEmpty() || completed.size() > BATCH_SIZE
                || affectedUsers == null) throw ImFailure.orgLocal();
        boolean changedDepartments = completed.stream().anyMatch(outcome -> outcome != null && outcome.kind() == Kind.DEPARTMENT && outcome.changed());
        if (departmentsChanged != changedDepartments) throw ImFailure.orgLocal();
        for (Outcome outcome : completed) {
            if (outcome == null || outcome.kind() == Kind.USER && outcome.changed() && !affectedUsers.contains(outcome.localId())) throw ImFailure.orgLocal();
        }
        List<Outcome> combined = new ArrayList<>(outcomes);
        combined.addAll(completed);
        return new ImSyncApplication(preview, previewHash, nextLocalHash, combined, affectedUsers, departmentsChanged, confirmedBy);
    }

    public ImSyncApplication effectsCompleted(String expectedLocalHash) {
        requireLocalHash(expectedLocalHash);
        if (!effectsPending()) return this;
        return new ImSyncApplication(preview, previewHash, localHash, outcomes, List.of(), false, confirmedBy);
    }

    ImSyncApplication superseded() {
        if (effectsPending() || confirmedBy <= 0) throw ImFailure.orgLocal();
        if (finished()) return this;
        List<Outcome> stopped = new ArrayList<>();
        for (int index = next(); index < Math.min(next() + BATCH_SIZE, total()); index++) {
            ImSyncBudget.check();
            Set<ImSyncPreview.Reason> reasons = new LinkedHashSet<>();
            reasons.add(ImSyncPreview.Reason.CONFIGURATION_CHANGED);
            if (index < preview.departments().size()) {
                ImSyncPreview.DepartmentChange change = preview.departments().get(index);
                reasons.addAll(change.reasons());
                stopped.add(new Outcome(index, Kind.DEPARTMENT, Long.toString(change.source().id()), change.local() == null ? null : change.local().id(),
                        ImSyncPreview.Action.CONFLICT, List.copyOf(reasons)));
            } else {
                ImSyncPreview.UserChange change = preview.users().get(index - preview.departments().size());
                reasons.addAll(change.reasons());
                stopped.add(new Outcome(index, Kind.USER, change.source() == null ? change.mapping().externalId() : change.source().id(),
                        change.local() == null ? null : change.local().id(), ImSyncPreview.Action.CONFLICT, List.copyOf(reasons)));
            }
        }
        return advance(stopped, localHash, List.of(), false);
    }

    public ImSyncApplication effectsApplied(List<Long> completedUsers) {
        if (!effectsPending() || completedUsers == null || completedUsers.size() > BATCH_SIZE
                || completedUsers.size() > pendingUsers.size()
                || completedUsers.isEmpty() && !pendingUsers.isEmpty()
                || !pendingUsers.subList(0, completedUsers.size()).equals(completedUsers)) throw ImFailure.orgLocal();
        List<Long> remaining = pendingUsers.subList(completedUsers.size(), pendingUsers.size());
        return new ImSyncApplication(preview, previewHash, localHash, outcomes, remaining, pendingDepartments && !remaining.isEmpty(), confirmedBy);
    }

    public void requireLocalHash(String actual) {
        if (!hash(actual) || !localHash.equals(actual)) throw ImFailure.orgLocal();
    }

    public int total() { return preview.departments().size() + preview.users().size(); }
    public int next() { return outcomes.size(); }
    public boolean effectsPending() { return pendingDepartments || !pendingUsers.isEmpty(); }
    public boolean finished() { return next() == total() && !effectsPending(); }
    public String status() {
        if (!finished()) return "RUNNING";
        return outcomes.stream().anyMatch(outcome -> outcome.action() == ImSyncPreview.Action.CONFLICT) ? "PARTIAL" : "COMPLETED";
    }

    public Summary summary() {
        return new Summary(next(), total(), total() - next(), effectsPending(), new ImSyncPreview.Summary(
                count(Kind.DEPARTMENT, ImSyncPreview.Action.CREATE), count(Kind.DEPARTMENT, ImSyncPreview.Action.UPDATE),
                count(Kind.DEPARTMENT, ImSyncPreview.Action.UNCHANGED), count(Kind.DEPARTMENT, ImSyncPreview.Action.CONFLICT),
                count(Kind.USER, ImSyncPreview.Action.CREATE), count(Kind.USER, ImSyncPreview.Action.UPDATE), count(Kind.USER, ImSyncPreview.Action.DISABLE),
                count(Kind.USER, ImSyncPreview.Action.UNCHANGED) + count(Kind.USER, ImSyncPreview.Action.RELEASE)
                        + count(Kind.USER, ImSyncPreview.Action.SKIP), count(Kind.USER, ImSyncPreview.Action.CONFLICT)));
    }

    private long count(Kind kind, ImSyncPreview.Action action) { return outcomes.stream().filter(outcome -> outcome.kind() == kind && outcome.action() == action).count(); }
    private static boolean hash(String value) { return value != null && value.matches("[a-f0-9]{64}"); }

    private static void verify(Outcome outcome, Kind kind, String externalId, Long localId, ImSyncPreview.Action action, List<ImSyncPreview.Reason> reasons) {
        if (outcome.kind() != kind || !outcome.externalId().equals(externalId)
                || localId != null && !Objects.equals(localId, outcome.localId())
                || outcome.action() != action && outcome.action() != ImSyncPreview.Action.CONFLICT
                || action == ImSyncPreview.Action.CONFLICT && !outcome.reasons().containsAll(reasons)
                || outcome.action() != ImSyncPreview.Action.CONFLICT && !outcome.reasons().equals(reasons)) throw ImFailure.orgLocal();
    }

    @Override public String toString() { return "ImSyncApplication[processed=" + next() + ", total=" + total() + ", status=" + status() + "]"; }
    public enum Kind { DEPARTMENT, USER }
    public record Summary(int processed, int total, int remaining, boolean effectsPending, ImSyncPreview.Summary actual) { }

    public record Outcome(int index, Kind kind, String externalId, Long localId, ImSyncPreview.Action action, List<ImSyncPreview.Reason> reasons) {
        public Outcome {
            if (index < 0 || kind == null || externalId == null || !externalId.matches("[A-Za-z0-9_.@=-]{1,128}")
                    || localId != null && localId <= 0 || action == null || reasons == null
                    || reasons.stream().anyMatch(reason -> reason == null) || new HashSet<>(reasons).size() != reasons.size()
                    || action == ImSyncPreview.Action.CONFLICT && reasons.isEmpty()
                    || action != ImSyncPreview.Action.CONFLICT && (localId == null || reasons.stream().anyMatch(reason -> reason != ImSyncPreview.Reason.LOCAL_DISABLED_PRESERVED
                        && !(action == ImSyncPreview.Action.RELEASE && reason == ImSyncPreview.Reason.SCOPE_EXIT_ACCOUNT_PRESERVED)
                        && !(action == ImSyncPreview.Action.SKIP && reason == ImSyncPreview.Reason.SYNC_MANAGEMENT_STOPPED)))
                    || action == ImSyncPreview.Action.RELEASE && !reasons.equals(List.of(ImSyncPreview.Reason.SCOPE_EXIT_ACCOUNT_PRESERVED))
                    || action == ImSyncPreview.Action.SKIP && !reasons.equals(List.of(ImSyncPreview.Reason.SYNC_MANAGEMENT_STOPPED))
                    || kind == Kind.DEPARTMENT && (action == ImSyncPreview.Action.DISABLE || action == ImSyncPreview.Action.RELEASE
                        || action == ImSyncPreview.Action.SKIP || !externalId.matches("[1-9][0-9]{0,18}"))) throw ImFailure.orgLocal();
            reasons = List.copyOf(reasons);
        }

        public boolean changed() { return action == ImSyncPreview.Action.CREATE || action == ImSyncPreview.Action.UPDATE || action == ImSyncPreview.Action.DISABLE; }
        @Override public String toString() { return "ImSyncOutcome[index=" + index + ", kind=" + kind + ", action=" + action + "]"; }
    }
}
