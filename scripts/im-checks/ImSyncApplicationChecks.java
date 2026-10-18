package com.cloudflow.auth.im;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Consumer;

public final class ImSyncApplicationChecks {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final ImProperties PROPERTIES = ImConfigChecks.properties();
    private static final ImSecretCipher CIPHER = new ImSecretCipher(PROPERTIES);
    private static final ImOrgSnapshotCodec CODEC = new ImOrgSnapshotCodec(CIPHER);
    private static final ImOrgSnapshotCodec.Context CONTEXT = new ImOrgSnapshotCodec.Context(100, 200, 3, "corpA", 77);
    private static int assertions;

    public static void main(String[] arguments) throws Exception {
        transitions();
        effectsBatches();
        encryptedProgress();
        recordedConfirmation();
        committedRows();
        appliedReports();
        largeBatches();
        System.out.println("G4_IM_SYNC_APPLICATION_CHECKS: assertions=" + assertions
                + "; failed=0; encrypted_progress=true; batch_size=100; resume_state=true; organization_writes=false; mysql=false; http=false");
    }

    private static void transitions() {
        ImSyncPreview preview = preview(2, true);
        ImSyncApplication initial = ImSyncApplication.start(preview, CODEC.previewHash(preview));
        equal(0, initial.next(), "new application processes nothing");
        equal(4, initial.total(), "all departments and members planned");
        equal("RUNNING", initial.status(), "not falsely completed at start");
        equal(0L, initial.summary().actual().usersCreated(), "planned creation is not actual success");
        List<ImSyncApplication.Outcome> first = new ArrayList<>(List.of(outcome(0, ImSyncApplication.Kind.DEPARTMENT, "2", 1100L, ImSyncPreview.Action.CREATE)));
        ImSyncApplication afterParent = initial.advance(first, "a".repeat(64), List.of(), true);
        first.clear();
        equal(1, afterParent.next(), "progress owns immutable outcome list");
        check(afterParent.effectsPending(), "department cache work remains pending");
        rejected(() -> afterParent.advance(List.of(outcome(1, ImSyncApplication.Kind.DEPARTMENT, "3", 1101L, ImSyncPreview.Action.CREATE)), "b".repeat(64), List.of(), true));
        rejected(() -> afterParent.effectsCompleted("b".repeat(64)));
        ImSyncApplication ready = afterParent.effectsCompleted("a".repeat(64));
        equal(ready, ready.effectsCompleted("a".repeat(64)), "effects acknowledgment is idempotent");
        List<ImSyncApplication.Outcome> rest = List.of(outcome(1, ImSyncApplication.Kind.DEPARTMENT, "3", 1101L, ImSyncPreview.Action.CREATE),
                outcome(2, ImSyncApplication.Kind.USER, "person-0", 2200L, ImSyncPreview.Action.CREATE),
                new ImSyncApplication.Outcome(3, ImSyncApplication.Kind.USER, "person-1", null, ImSyncPreview.Action.CONFLICT, List.of(ImSyncPreview.Reason.FIELD_TOO_LONG)));
        ImSyncApplication awaitingEffects = ready.advance(rest, "b".repeat(64), List.of(2200L), true);
        equal(0, awaitingEffects.summary().remaining(), "business entries committed but effects remain");
        equal("RUNNING", awaitingEffects.status(), "pending effects prevent completion");
        ImSyncApplication done = awaitingEffects.effectsCompleted("b".repeat(64));
        equal("PARTIAL", done.status(), "conflict reported as partial");
        equal(2L, done.summary().actual().departmentsCreated(), "two real department results");
        equal(1L, done.summary().actual().usersCreated(), "only applied member counts as created");
        equal(1L, done.summary().actual().userConflicts(), "oversized source field remains conflict");
        rejected(() -> done.advance(rest, "c".repeat(64), List.of(), false));
        rejected(() -> initial.advance(List.of(), "a".repeat(64), List.of(), false));
        rejected(() -> initial.advance(List.of(outcome(1, ImSyncApplication.Kind.DEPARTMENT, "2", 1100L, ImSyncPreview.Action.CREATE)), "a".repeat(64), List.of(), true));
        rejected(() -> initial.advance(List.of(outcome(0, ImSyncApplication.Kind.USER, "2", 1100L, ImSyncPreview.Action.CREATE)), "a".repeat(64), List.of(1100L), false));
        rejected(() -> initial.advance(List.of(outcome(0, ImSyncApplication.Kind.DEPARTMENT, "3", 1100L, ImSyncPreview.Action.CREATE)), "a".repeat(64), List.of(), true));
        rejected(() -> initial.advance(List.of(outcome(0, ImSyncApplication.Kind.DEPARTMENT, "2", 1000L, ImSyncPreview.Action.CREATE)), "a".repeat(64), List.of(), true));
        rejected(() -> initial.advance(List.of(outcome(0, ImSyncApplication.Kind.DEPARTMENT, "2", 1100L, ImSyncPreview.Action.CREATE)), "a".repeat(64), List.of(), false));
        rejected(() -> ready.advance(rest, "b".repeat(64), List.of(), true));
        rejected(() -> new ImSyncApplication(preview, initial.previewHash(), "c".repeat(64), List.of(), List.of(), false));
        rejected(() -> new ImSyncApplication.Outcome(0, ImSyncApplication.Kind.DEPARTMENT, "2", 1100L, ImSyncPreview.Action.DISABLE, List.of()));
        rejected(() -> new ImSyncApplication.Outcome(0, ImSyncApplication.Kind.USER, "person-0", null, ImSyncPreview.Action.CREATE, List.of()));
        ImSyncApplication conflict = initial.advance(List.of(new ImSyncApplication.Outcome(0, ImSyncApplication.Kind.DEPARTMENT, "2", null,
                ImSyncPreview.Action.CONFLICT, List.of(ImSyncPreview.Reason.FIELD_TOO_LONG))), initial.localHash(), List.of(), false);
        rejected(() -> conflict.advance(List.of(outcome(1, ImSyncApplication.Kind.DEPARTMENT, "3", 1101L, ImSyncPreview.Action.CREATE)), "b".repeat(64), List.of(), true));
        check(!done.toString().contains("person-") && !done.outcomes().get(2).toString().contains("person-"), "diagnostics hide external identity");
    }

    private static void encryptedProgress() throws Exception {
        ImSyncPreview preview = preview(2, false);
        ImSyncApplication state = ImSyncApplication.start(preview, CODEC.previewHash(preview)).advance(
                List.of(outcome(0, ImSyncApplication.Kind.DEPARTMENT, "2", 1100L, ImSyncPreview.Action.CREATE)), "a".repeat(64), List.of(), true);
        ImOrgSnapshotCodec.Sealed sealed = CODEC.encodeApplication(state);
        equal(state, CODEC.decodeApplication(CONTEXT, state.previewHash(), sealed), "partial application encrypted round trip");
        equal(state, CODEC.decodeCommittedApplication(100, 200, 3, state.previewHash(), sealed), "committed recovery uses recorded identity without current credentials");
        for (long[] identity : List.of(new long[]{0, 200, 3}, new long[]{101, 200, 3}, new long[]{100, 0, 3},
                new long[]{100, 201, 3}, new long[]{100, 200, -1}, new long[]{100, 200, 4})) {
            rejected(() -> CODEC.decodeCommittedApplication(identity[0], identity[1], (int) identity[2], state.previewHash(), sealed));
        }
        rejected(() -> CODEC.decodeCommittedApplication(100, 200, 3, null, sealed));
        rejected(() -> CODEC.decodeCommittedApplication(100, 200, 3, state.previewHash(), null));
        rejected(() -> CODEC.decodeCommittedApplication(100, 200, 3, "b".repeat(64), sealed));
        rejected(() -> CODEC.decodeCommittedApplication(100, 200, 3, state.previewHash(), new ImOrgSnapshotCodec.Sealed("b".repeat(64), sealed.encrypted())));
        byte[] encrypted = java.util.Base64.getDecoder().decode(sealed.encrypted().substring(4));
        encrypted[encrypted.length - 1] ^= 1;
        rejected(() -> CODEC.decodeCommittedApplication(100, 200, 3, state.previewHash(), new ImOrgSnapshotCodec.Sealed(sealed.hash(),
                "im1:" + java.util.Base64.getEncoder().encodeToString(encrypted))));
        ImSyncApplication progressed = state.effectsCompleted(state.localHash());
        check(!sealed.hash().equals(CODEC.encodeApplication(progressed).hash()), "acknowledged effects change progress digest");
        equal(state.previewHash(), progressed.previewHash(), "original confirmed preview digest remains stable");
        check(!JSON.writeValueAsString(sealed).contains("im1:"), "ordinary envelope omits ciphertext");
        rejected(() -> CODEC.decodeApplication(CONTEXT, "b".repeat(64), sealed));
        rejected(() -> CODEC.decodeApplication(new ImOrgSnapshotCodec.Context(100, 200, 4, "corpA", 77), state.previewHash(), sealed));
        rejected(() -> CODEC.decodeApplication(new ImOrgSnapshotCodec.Context(100, 201, 3, "corpA", 77), state.previewHash(), sealed));
        rejected(() -> CODEC.decodeApplication(new ImOrgSnapshotCodec.Context(101, 200, 3, "corpA", 77), state.previewHash(), sealed));
        rejected(() -> CODEC.decodePreview(CONTEXT, sealed));
        rejected(() -> CODEC.decodeApplication(CONTEXT, state.previewHash(), CODEC.encodePreview(preview)));
        rejected(() -> CODEC.encodeApplication(ImSyncApplication.start(preview, "b".repeat(64))));
        String raw = CIPHER.decrypt(100, "WECOM", ImSecretCipher.Field.SNAPSHOT, sealed.encrypted());
        for (Consumer<ObjectNode> mutation : List.<Consumer<ObjectNode>>of(node -> node.put("schema", 2), node -> node.put("schema", "3"),
                node -> node.put("unexpected", true), node -> node.remove("application"),
                node -> payload(node).put("previewHash", "b".repeat(64)), node -> payload(node).put("localHash", "invalid"),
                node -> payload(node).remove("pendingDepartments"), node -> payload(node).putNull("pendingUsers"),
                node -> payload(node).putArray("pendingUsers").add(1).add(1),
                node -> ((ObjectNode) payload(node).path("outcomes").get(0)).put("index", 1),
                node -> ((ObjectNode) payload(node).path("outcomes").get(0)).put("localId", 0),
                node -> ((ObjectNode) payload(node).path("preview").path("source")).put("corpId", "foreign"))) {
            ObjectNode changed = (ObjectNode) JSON.readTree(raw);
            mutation.accept(changed);
            String value = changed.toString();
            ImOrgSnapshotCodec.Sealed forged = new ImOrgSnapshotCodec.Sealed(hash(value), CIPHER.encrypt(100, "WECOM", ImSecretCipher.Field.SNAPSHOT, value));
            rejected(() -> CODEC.decodeApplication(CONTEXT, state.previewHash(), forged));
            rejected(() -> CODEC.decodeCommittedApplication(100, 200, 3, state.previewHash(), forged));
        }
        for (String malformed : List.of(raw + "{}", raw + " ", raw.replace("\"schema\":3", "\"schema\":3,\"schema\":3"))) {
            ImOrgSnapshotCodec.Sealed forged = new ImOrgSnapshotCodec.Sealed(hash(malformed), CIPHER.encrypt(100, "WECOM", ImSecretCipher.Field.SNAPSHOT, malformed));
            rejected(() -> CODEC.decodeApplication(CONTEXT, state.previewHash(), forged));
            rejected(() -> CODEC.decodeCommittedApplication(100, 200, 3, state.previewHash(), forged));
        }
    }

    private static void recordedConfirmation() throws Exception {
        ImSyncPreview preview = preview(1, false);
        ImSyncApplication legacy = ImSyncApplication.start(preview, CODEC.previewHash(preview));
        ImOrgSnapshotCodec.Sealed legacySealed = CODEC.encodeApplication(legacy);
        String legacyPlain = CIPHER.decrypt(100, "WECOM", ImSecretCipher.Field.SNAPSHOT, legacySealed.encrypted());
        check(!payload((ObjectNode) JSON.readTree(legacyPlain)).has("confirmedBy"), "legacy canonical payload omits new confirmation field");
        equal(0L, CODEC.decodeApplication(CONTEXT, legacy.previewHash(), legacySealed).confirmedBy(), "missing confirmation never authorizes a user");
        equal(legacySealed.hash(), CODEC.encodeApplication(CODEC.decodeApplication(CONTEXT, legacy.previewHash(), legacySealed)).hash(), "legacy digest preserved after decode");
        ImSyncApplication confirmed = legacy.authorize(700);
        equal(700L, CODEC.decodeApplication(CONTEXT, confirmed.previewHash(), CODEC.encodeApplication(confirmed)).confirmedBy(), "recorded administrator survives encryption");
        check(!legacySealed.hash().equals(CODEC.encodeApplication(confirmed).hash()), "confirmation is integrity protected");
        equal(legacy.previewHash(), confirmed.previewHash(), "confirmation cannot change accepted preview");
        equal(701L, confirmed.authorize(701).confirmedBy(), "real reconfirmation can replace administrator");
        rejected(() -> confirmed.authorize(0));
        rejected(() -> confirmed.authorize(-1));
        ImSyncApplication pending = confirmed.advance(List.of(outcome(0, ImSyncApplication.Kind.DEPARTMENT, "2", 1100L,
                ImSyncPreview.Action.CREATE)), "a".repeat(64), List.of(2200L, 2201L), true);
        equal(700L, pending.confirmedBy(), "business batch preserves confirmation");
        equal(700L, pending.effectsCompleted(pending.localHash()).confirmedBy(), "completed effects preserve confirmation");
        equal(700L, pending.effectsApplied(List.of(2200L)).confirmedBy(), "partial effects preserve confirmation");
        equal(700L, pending.effectsApplied(List.of(2200L, 2201L)).confirmedBy(), "last effects preserve confirmation");
        for (Consumer<ObjectNode> mutation : List.<Consumer<ObjectNode>>of(node -> payload(node).put("confirmedBy", -1),
                node -> payload(node).put("confirmedBy", "700"), node -> payload(node).put("confirmedBy", 700.5),
                node -> payload(node).putNull("confirmedBy"), node -> payload(node).put("confirmedBy", 0))) {
            ObjectNode changed = (ObjectNode) JSON.readTree(legacyPlain);
            mutation.accept(changed);
            String value = changed.toString();
            ImOrgSnapshotCodec.Sealed forged = new ImOrgSnapshotCodec.Sealed(hash(value), CIPHER.encrypt(100, "WECOM", ImSecretCipher.Field.SNAPSHOT, value));
            rejected(() -> CODEC.decodeApplication(CONTEXT, legacy.previewHash(), forged));
            rejected(() -> CODEC.decodeCommittedApplication(100, 200, 3, legacy.previewHash(), forged));
        }
    }

    private static void committedRows() throws Exception {
        ImSyncPreview preview = preview(1, false);
        ImSyncApplication initial = ImSyncApplication.start(preview, CODEC.previewHash(preview)).authorize(700);
        ImSyncApplication pending = initial.advance(List.of(outcome(0, ImSyncApplication.Kind.DEPARTMENT, "2", 1100L, ImSyncPreview.Action.CREATE)),
                "a".repeat(64), List.of(), true);
        equal(pending, CODEC.decodeRun(row(pending)), "committed running row fully validated");
        rejected(() -> CODEC.decodeRun(null));
        for (Consumer<ImSyncRunRow> mutation : List.<Consumer<ImSyncRunRow>>of(value -> value.setMode("PREVIEW"),
                value -> value.setFullSnapshotFlag(false), value -> value.setFullSnapshotFlag(null), value -> value.setTenantId(null),
                value -> value.setTenantId(101L), value -> value.setConfigId(null), value -> value.setConfigId(201L),
                value -> value.setConfigVersion(null), value -> value.setConfigVersion(4), value -> value.setStatus("COMPLETED"),
                value -> value.setCompletedTime(LocalDateTime.now()), value -> value.setProgressCursor("b".repeat(64)),
                value -> value.setSnapshotHash("b".repeat(64)), value -> value.setResultSummary(null), value -> value.setResultSummary("null"),
                value -> value.setResultSummary("{}"))) {
            ImSyncRunRow changed = row(pending);
            mutation.accept(changed);
            rejected(() -> CODEC.decodeRun(changed));
        }
        for (Consumer<ObjectNode> mutation : List.<Consumer<ObjectNode>>of(value -> value.put("processed", 2), value -> value.put("processed", 1.9),
                value -> value.put("processed", "1"), value -> value.put("effectsPending", false), value -> value.remove("remaining"),
                value -> value.putNull("effectsPending"), value -> value.put("unexpected", true),
                value -> ((ObjectNode) value.path("actual")).remove("usersCreated"))) {
            ImSyncRunRow changed = row(pending);
            ObjectNode summary = (ObjectNode) JSON.readTree(changed.getResultSummary());
            mutation.accept(summary);
            changed.setResultSummary(summary.toString());
            rejected(() -> CODEC.decodeRun(changed));
        }
        for (String malformed : List.of(JSON.writeValueAsString(pending.summary()) + "{}",
                JSON.writeValueAsString(pending.summary()).replace("\"processed\":1", "\"processed\":1,\"processed\":1"))) {
            ImSyncRunRow changed = row(pending);
            changed.setResultSummary(malformed);
            rejected(() -> CODEC.decodeRun(changed));
        }
        ImSyncApplication completed = pending.effectsApplied(List.of()).advance(List.of(
                outcome(1, ImSyncApplication.Kind.DEPARTMENT, "3", 1101L, ImSyncPreview.Action.CREATE),
                outcome(2, ImSyncApplication.Kind.USER, "person-0", 2200L, ImSyncPreview.Action.CREATE)), "b".repeat(64), List.of(2200L), true).effectsApplied(List.of(2200L));
        equal(completed, CODEC.decodeRun(row(completed)), "completed row requires matching completion state");
        ImSyncRunRow missingTime = row(completed);
        missingTime.setCompletedTime(null);
        rejected(() -> CODEC.decodeRun(missingTime));
    }

    private static ImSyncRunRow row(ImSyncApplication application) throws Exception {
        ImOrgSnapshotCodec.Sealed sealed = CODEC.encodeApplication(application);
        ImSyncRunRow row = new ImSyncRunRow();
        row.setSyncRunId(900L);
        row.setTenantId(100L);
        row.setConfigId(200L);
        row.setConfigVersion(3);
        row.setMode("APPLY");
        row.setRequestedBy(700L);
        row.setCreateTime(LocalDateTime.now());
        row.setFullSnapshotFlag(true);
        row.setSnapshotHash(application.previewHash());
        row.setProgressCursor(sealed.hash());
        row.setSnapshotEncrypted(sealed.encrypted());
        row.setStatus(application.status());
        row.setCompletedTime(application.finished() ? LocalDateTime.now() : null);
        row.setResultSummary(JSON.writeValueAsString(application.summary()));
        return row;
    }

    private static void appliedReports() throws Exception {
        ImSyncPreview preview = preview(1, false);
        ImSyncApplication pending = ImSyncApplication.start(preview, CODEC.previewHash(preview)).authorize(700)
                .advance(List.of(outcome(0, ImSyncApplication.Kind.DEPARTMENT, "2", 1100L, ImSyncPreview.Action.CREATE)), "a".repeat(64), List.of(), true);
        ImSyncViews.Report first = ImSyncViews.appliedReport(row(pending), 3, pending, 1, 1);
        equal("APPLY", first.header().mode(), "report distinguishes execution from preview");
        equal(pending.summary(), first.progress(), "report uses actual committed progress");
        equal(preview.summary(), first.summary(), "report retains original planned totals separately");
        equal(1100L, first.entries().getRows().get(0).localId(), "processed report contains actual local identifier");
        check(first.entries().getRows().get(0).processed(), "first page marks committed outcome");
        ImSyncViews.Report second = ImSyncViews.appliedReport(row(pending), 3, pending, 2, 1);
        check(!second.entries().getRows().get(0).processed(), "second page uses absolute index and stays planned");
        check(ImSyncViews.appliedReport(row(pending), 4, pending, 1, 1).configurationChanged(), "execution report flags changed configuration");
        equal(0, ImSyncViews.appliedReport(row(pending), 3, pending, 9, 1).entries().getRows().size(), "page beyond results contains no fabricated outcomes");
        ImSyncApplication conflict = pending.effectsApplied(List.of()).advance(List.of(new ImSyncApplication.Outcome(1,
                ImSyncApplication.Kind.DEPARTMENT, "3", null, ImSyncPreview.Action.CONFLICT, List.of(ImSyncPreview.Reason.DUPLICATE_NAME))), "b".repeat(64), List.of(), false);
        ImSyncViews.Entry rejected = ImSyncViews.appliedReport(row(conflict), 3, conflict, 2, 1).entries().getRows().get(0);
        equal(ImSyncPreview.Action.CONFLICT, rejected.action(), "write-time conflict replaces planned creation");
        equal(List.of(ImSyncPreview.Reason.DUPLICATE_NAME), rejected.reasons(), "actual conflict reason included");
        check(rejected.processed() && rejected.localId() == null, "conflict is processed without fabricated local identifier");
        String json = new ObjectMapper().findAndRegisterModules().writeValueAsString(first);
        for (String hidden : List.of("confirmedBy", "snapshotEncrypted", "im1:", "pendingUsers", "localHash")) check(!json.contains(hidden), "public report hides private execution metadata");
    }

    private static void effectsBatches() {
        ImSyncPreview preview = preview(1, false);
        ImSyncApplication initial = ImSyncApplication.start(preview, CODEC.previewHash(preview));
        List<Long> affected = new ArrayList<>();
        for (long identifier = 2200; identifier < 2401; identifier++) affected.add(identifier);
        ImSyncApplication pending = initial.advance(List.of(outcome(0, ImSyncApplication.Kind.DEPARTMENT, "2", 1100L,
                ImSyncPreview.Action.CREATE)), "a".repeat(64), affected, true);
        rejected(() -> initial.effectsApplied(List.of()));
        rejected(() -> pending.effectsApplied(null));
        rejected(() -> pending.effectsApplied(List.of()));
        rejected(() -> pending.effectsApplied(affected.subList(0, 101)));
        rejected(() -> pending.effectsApplied(List.of(2201L)));
        rejected(() -> pending.effectsApplied(List.of(2201L, 2200L)));
        rejected(() -> pending.effectsApplied(List.of(2200L, 2200L)));
        ImSyncApplication first = pending.effectsApplied(affected.subList(0, 100));
        equal(101, first.pendingUsers().size(), "first recovery removes only hundred-user prefix");
        check(first.pendingDepartments() && first.effectsPending(), "department invalidation stays pending during partial cleanup");
        equal("RUNNING", first.status(), "partial security cleanup never completes run");
        equal(pending.outcomes(), first.outcomes(), "cleanup does not repeat organization changes");
        equal(pending.localHash(), first.localHash(), "cleanup preserves committed organization digest");
        rejected(() -> first.effectsApplied(affected.subList(0, 100)));
        rejected(() -> first.advance(List.of(outcome(1, ImSyncApplication.Kind.DEPARTMENT, "3", 1101L,
                ImSyncPreview.Action.CREATE)), "b".repeat(64), List.of(), true));
        ImSyncApplication second = first.effectsApplied(affected.subList(100, 200));
        ImSyncApplication last = second.effectsApplied(affected.subList(200, 201));
        check(!last.effectsPending() && !last.pendingDepartments(), "last user clears department invalidation marker");
        check(!last.finished(), "security recovery alone cannot skip remaining organization entries");
        ImSyncApplication departmentOnly = initial.advance(List.of(outcome(0, ImSyncApplication.Kind.DEPARTMENT, "2", 1100L,
                ImSyncPreview.Action.CREATE)), "a".repeat(64), List.of(), true);
        check(!departmentOnly.effectsApplied(List.of()).effectsPending(), "department-only recovery accepts empty user prefix");
        ImSyncApplication ready = departmentOnly.effectsApplied(List.of()).advance(List.of(outcome(1, ImSyncApplication.Kind.DEPARTMENT,
                "3", 1101L, ImSyncPreview.Action.CREATE)), "a".repeat(64), List.of(), true).effectsApplied(List.of());
        ImSyncApplication userOnly = ready.advance(List.of(outcome(2, ImSyncApplication.Kind.USER, "person-0", 2200L,
                ImSyncPreview.Action.CREATE)), "b".repeat(64), List.of(2200L), false);
        rejected(() -> userOnly.effectsApplied(List.of(2200L, 2201L)));
        equal("COMPLETED", userOnly.effectsApplied(List.of(2200L)).status(), "user-only final recovery completes run");
    }

    private static void largeBatches() {
        ImSyncPreview preview = preview(1000, false);
        ImSyncApplication state = ImSyncApplication.start(preview, CODEC.previewHash(preview));
        long started = System.nanoTime();
        while (!state.finished()) {
            List<ImSyncApplication.Outcome> outcomes = new ArrayList<>();
            List<Long> users = new ArrayList<>();
            boolean departments = false;
            for (int index = state.next(); index < Math.min(state.total(), state.next() + 100); index++) {
                if (index < 2) {
                    departments = true;
                    outcomes.add(outcome(index, ImSyncApplication.Kind.DEPARTMENT, Long.toString(index + 2), 1100L + index, ImSyncPreview.Action.CREATE));
                } else {
                    long localId = 2200L + index;
                    outcomes.add(outcome(index, ImSyncApplication.Kind.USER, preview.users().get(index - 2).source().id(), localId, ImSyncPreview.Action.CREATE));
                    users.add(localId);
                }
            }
            state = state.advance(outcomes, "a".repeat(64), users, departments);
            state = CODEC.decodeApplication(CONTEXT, state.previewHash(), CODEC.encodeApplication(state));
            state = state.effectsCompleted(state.localHash());
        }
        equal("COMPLETED", state.status(), "all applied after durable state replay");
        equal(1000L, state.summary().actual().usersCreated(), "no double count across eleven batches");
        long millis = (System.nanoTime() - started) / 1000000;
        check(millis < 300000, "1000-member state encode and resume under five minutes");
        System.out.println("G4_IM_APPLICATION_STATE_PERFORMANCE: members=1000; batches=11; elapsed_ms=" + millis + "; organization_writes=false; complete_sync=false");
    }

    private static ImSyncApplication.Outcome outcome(int index, ImSyncApplication.Kind kind, String externalId, Long localId, ImSyncPreview.Action action) {
        return new ImSyncApplication.Outcome(index, kind, externalId, localId, action, List.of());
    }
    private static ObjectNode payload(ObjectNode envelope) { return (ObjectNode) envelope.path("application"); }
    private static String hash(String value) throws Exception { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))); }
    private static ImSyncPreview preview(int count, boolean oversized) {
        List<ImOrgSnapshot.Member> members = new ArrayList<>();
        for (int index = 0; index < count; index++) members.add(new ImOrgSnapshot.Member("person-" + index,
                oversized && index == 1 ? "过长姓名".repeat(9) : "成员" + index, List.of(3L), 1,
                new ImOrgSnapshot.Field(true, ""), new ImOrgSnapshot.Field(true, ""), new ImOrgSnapshot.Field(true, "")));
        ImOrgSnapshot source = new ImOrgSnapshot(100, 200, 3, "corpA", 77, Instant.parse("2026-09-29T00:00:00Z"), 1000, Set.of(2L), Map.of(),
                List.of(new ImOrgSnapshot.Department(2, 1, "销售", 0), new ImOrgSnapshot.Department(3, 2, "销售二组", 0)), members);
        ImLocalOrganization local = new ImLocalOrganization(100, List.of(new ImLocalOrganization.Department(100, 1000, 0L, "0", "本地根", 0, "0", 0, 0)),
                List.of(), List.of(), List.of(), Set.of());
        return new ImSyncPlanner().preview(source, local, CODEC.localHash(local));
    }
    private static void rejected(Runnable action) {
        try { action.run(); throw new AssertionError("unsafe application state accepted"); }
        catch (ImFailure expected) { check(expected.getCause() == null, "invalid state rejected without raw cause"); }
    }
    private static void equal(Object expected, Object actual, String message) { check(Objects.equals(expected, actual), message); }
    private static void check(boolean condition, String message) { assertions++; if (!condition) throw new AssertionError(message); }
}
