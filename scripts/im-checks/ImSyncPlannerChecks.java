package com.cloudflow.auth.im;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

public final class ImSyncPlannerChecks {
    private static int assertions;
    private static final ImSyncPlanner PLANNER = new ImSyncPlanner();
    private static final ImOrgSnapshotCodec CODEC = codec();
    private static final ImLocalOrganization.Department ROOT = department(1000, 0, "0", "本地根", "0", 0, 0);

    public static void main(String[] arguments) throws Exception {
        createAndUpdate();
        memberConflicts();
        departmentConflicts();
        statusAndAbsence();
        preservedFields();
        scopeExit();
        stoppedManagement();
        envelopes();
        localIntegrity();
        performance();
        System.out.println("G4_IM_SYNC_PLANNER_CHECKS: assertions=" + assertions
                + "; failed=0; pure_comparison=true; local_writes=0; missing_field_policy=preserve; scope_exit_policy=release_management; mysql=false; http=false");
    }

    private static void createAndUpdate() {
        ImOrgSnapshot source = source(List.of(member("alpha", "甲", 1, 2), member("beta", "乙", 1, 3)), Map.of());
        ImSyncPreview preview = plan(source, local(List.of(ROOT), List.of(), List.of(), List.of(), Set.of()));
        equal(2L, preview.summary().departmentsCreated(), "two departments planned under configured root");
        equal(2L, preview.summary().usersCreated(), "two users planned");
        equal(0L, preview.summary().userConflicts(), "fully supplied fields do not fabricate conflicts");
        equal(1000L, preview.departments().get(0).parentLocalId(), "external root mounted under local root");
        equal(2L, preview.departments().get(1).parentExternalId(), "child retains external parent");
        for (ImSyncPreview.UserChange user : preview.users()) {
            check(user.username().matches("im[a-f0-9]{28}"), "bounded stable generated username");
            equal("0", user.desiredStatus(), "active source new user planned active without assigning roles");
        }
        equal(ImSyncPlanner.username(200, "ALPHA"), ImSyncPlanner.username(200, "alpha"), "external ID case does not generate another account");
        check(!ImSyncPlanner.username(200, "alpha").equals(ImSyncPlanner.username(201, "alpha")), "configuration separates generated accounts");
        ImLocalOrganization.Department existingDepartment = department(1100, 1000, "0,1000", "销售", "0", 0, 4);
        ImLocalOrganization.User existingUser = user(2000, 1100L, "local-alpha", "甲", "", "", "", "0", 0, 8);
        ImLocalOrganization baseline = local(List.of(ROOT, existingDepartment), List.of(existingUser), List.of(departmentMapping(2, 1100, "ACTIVE", 2)), List.of(userMapping("alpha", 2000, "ACTIVE", 1)), Set.of());
        preview = plan(source, baseline);
        equal(ImSyncPreview.Action.UNCHANGED, preview.departments().get(0).action(), "unchanged mapped department");
        equal(ImSyncPreview.Action.UNCHANGED, preview.users().get(0).action(), "unchanged mapped user");
        equal("local-alpha", preview.users().get(0).username(), "existing username never overwritten");
        equal(1100L, preview.departments().get(1).parentLocalId(), "new child points to existing mapped parent");
        ImOrgSnapshot changed = source(List.of(member("alpha", "改名", 1, 2)), Map.of());
        preview = plan(changed, baseline);
        equal(ImSyncPreview.Action.UPDATE, preview.users().get(0).action(), "name change preview");
        equal(existingUser, preview.users().get(0).local(), "before image preserved");
        equal(8, preview.users().get(0).local().version(), "optimistic version retained");
        equal(baseline, local(List.of(ROOT, existingDepartment), List.of(existingUser), List.of(departmentMapping(2, 1100, "ACTIVE", 2)), List.of(userMapping("alpha", 2000, "ACTIVE", 1)), Set.of()), "comparison does not mutate inputs");
    }

    private static void stoppedManagement() throws Exception {
        ImLocalOrganization.User existing = user(2000, 1000L, "retained", "本地资料", "13900000000", "retained@example.test", "local-avatar", "0", 0, 4);
        ImLocalOrganization.UserMapping mapping = userMapping("alpha", 2000, "DISABLED", 9);
        ImLocalOrganization local = local(List.of(ROOT), List.of(existing), List.of(), List.of(mapping), Set.of());
        for (int remoteStatus : List.of(1, 2, 4, 5)) {
            ImOrgSnapshot source = source(List.of(member("alpha", "外部变更", remoteStatus, 2, 3)), Map.of());
            ImSyncPreview preview = plan(source, local);
            ImSyncPreview.UserChange change = preview.users().get(0);
            equal(ImSyncPreview.Action.SKIP, change.action(), "stopped employee skipped despite changed source and missing primary department");
            equal(List.of(ImSyncPreview.Reason.SYNC_MANAGEMENT_STOPPED), change.reasons(), "explicit stopped management reason");
            equal(existing, change.local(), "retained local account details");
            equal("0", change.desiredStatus(), "external disable never disables stopped account");
            equal(0L, preview.summary().usersCreated(), "stopped employee never recreated");
            equal(0L, preview.summary().usersDisabled(), "stopped employee never disabled");
            equal(0L, preview.summary().userConflicts(), "intentional stop is not a sync conflict");
            equal(1L, preview.summary().usersUnchanged(), "stopped employee counted as preserved");
            ImOrgSnapshotCodec.Sealed sealed = CODEC.encodePreview(preview);
            equal(preview, CODEC.decodePreview(ImOrgSnapshotCodec.context(ImSecurityChecks.fixture()), sealed), "stopped state survives persisted preview");
        }
        ImSyncPreview restored = plan(source(List.of(member("alpha", "外部变更", 1, 2)), Map.of()),
                local(List.of(ROOT), List.of(existing), List.of(), List.of(userMapping("alpha", 2000, "ACTIVE", 10)), Set.of()));
        equal(ImSyncPreview.Action.UPDATE, restored.users().get(0).action(), "administrator resumption restores sync of same local account");
        equal(2000L, restored.users().get(0).local().id(), "resumption keeps original local account");
        rejected(() -> new ImSyncPreview.UserChange(member("alpha", "外部变更", 1, 2), existing,
                userMapping("alpha", 2000, "ACTIVE", 9), null, null, existing.username(), existing.status(), ImSyncPreview.Action.SKIP,
                List.of(ImSyncPreview.Reason.SYNC_MANAGEMENT_STOPPED)), "IM_ORG_LOCAL_INVALID");
    }

    private static void memberConflicts() {
        ImLocalOrganization empty = local(List.of(ROOT), List.of(), List.of(), List.of(), Set.of());
        reason(plan(source(List.of(member("alpha", "甲", 1, 2, 3)), Map.of()), empty).users().get(0), ImSyncPreview.Reason.PRIMARY_DEPARTMENT_REQUIRED);
        ImSyncPreview selected = plan(source(List.of(member("alpha", "甲", 1, 2, 3)), Map.of("ALPHA", 3L)), empty);
        equal(3L, selected.users().get(0).departmentExternalId(), "explicit primary choice is case insensitive");
        equal(ImSyncPreview.Action.CREATE, selected.users().get(0).action(), "valid primary choice accepted");
        reason(plan(source(List.of(member("alpha", "甲", 1, 2, 4)), Map.of("alpha", 4L)), empty).users().get(0), ImSyncPreview.Reason.PRIMARY_DEPARTMENT_INVALID);
        ImOrgSnapshot.Member missing = new ImOrgSnapshot.Member("alpha", "甲", List.of(2L), 1, new ImOrgSnapshot.Field(false, null), present(""), present(""));
        equal(ImSyncPreview.Action.CREATE, plan(source(List.of(missing), Map.of()), empty).users().get(0).action(), "missing field allows new account with no fabricated contact");
        for (ImOrgSnapshot.Member member : List.of(member("alpha", "甲".repeat(31), 1, 2),
                contacts("alpha", "123456789012", "", ""), contacts("alpha", "", "a".repeat(51), ""),
                contacts("alpha", "", "", "https://wework.qpic.cn/" + "a".repeat(500)))) {
            reason(plan(source(List.of(member), Map.of()), empty).users().get(0), ImSyncPreview.Reason.FIELD_TOO_LONG);
        }
        ImLocalOrganization outside = local(List.of(ROOT), List.of(user(2000, null, "old", "existing", "13900000000", "private@example.test", "", "0", 0, 0)), List.of(), List.of(), Set.of());
        reason(plan(source(List.of(contacts("alpha", "13900000000", "", "")), Map.of()), outside).users().get(0), ImSyncPreview.Reason.CONTACT_COLLISION);
        reason(plan(source(List.of(contacts("alpha", "", "PRIVATE@EXAMPLE.TEST", "")), Map.of()), outside).users().get(0), ImSyncPreview.Reason.CONTACT_COLLISION);
        ImSyncPreview duplicates = plan(source(List.of(contacts("alpha", "13900000000", "", ""), contacts("beta", "13900000000", "", "")), Map.of()), empty);
        reason(duplicates.users().get(0), ImSyncPreview.Reason.CONTACT_COLLISION);
        reason(duplicates.users().get(1), ImSyncPreview.Reason.CONTACT_COLLISION);
        ImLocalOrganization usernameCollision = local(List.of(ROOT), List.of(user(2000, null, ImSyncPlanner.username(200, "alpha"), "existing", "", "", "", "0", 0, 0)), List.of(), List.of(), Set.of());
        reason(plan(source(List.of(member("alpha", "甲", 1, 2)), Map.of()), usernameCollision).users().get(0), ImSyncPreview.Reason.USERNAME_COLLISION);
        ImLocalOrganization.Department mappedDepartment = department(1100, 1000, "0,1000", "销售", "0", 0, 0);
        for (ImLocalOrganization.User localUser : List.of(user(2000, 1100L, "alpha", "甲", "", "", "", "0", 1, 0),
                user(2000, 1100L, "alpha", "甲", "", "", "", "0", 0, Integer.MAX_VALUE),
                user(2000, null, "alpha", "甲", "", "", "", "0", 0, 0))) {
            ImSyncPreview preview = plan(source(List.of(member("alpha", "甲", 1, 2)), Map.of()), local(List.of(ROOT, mappedDepartment), List.of(localUser), List.of(departmentMapping(2, 1100, "ACTIVE", 0)), List.of(userMapping("alpha", 2000, "ACTIVE", 0)), Set.of()));
            equal(ImSyncPreview.Action.CONFLICT, preview.users().get(0).action(), "deleted, exhausted and outside users are not overwritten");
        }
        for (String status : List.of("DISABLED", "ACTIVE")) {
            ImSyncPreview preview = plan(source(List.of(member("alpha", "甲", 1, 2)), Map.of()), local(List.of(ROOT), List.of(), List.of(), List.of(userMapping("alpha", 2000, status, 0)), Set.of()));
            reason(preview.users().get(0), ImSyncPreview.Reason.MAPPING_TARGET_MISSING);
        }
    }

    private static void departmentConflicts() {
        ImOrgSnapshot source = source(List.of(), Map.of());
        ImLocalOrganization duplicateName = local(List.of(ROOT, department(1200, 1000, "0,1000", "销售", "0", 0, 0)), List.of(), List.of(), List.of(), Set.of());
        equal(ImSyncPreview.Action.CONFLICT, plan(source, duplicateName).departments().get(0).action(), "same name never auto-binds a local department");
        ImSyncPreview child = plan(source, duplicateName);
        check(child.departments().get(1).reasons().contains(ImSyncPreview.Reason.PARENT_CONFLICT), "parent conflict propagates");
        for (ImLocalOrganization.Department department : List.of(department(1100, 0, "0", "销售", "0", 0, 0),
                department(1100, 1000, "0,1000", "销售", "1", 0, 0), department(1100, 1000, "0,1000", "销售", "0", 1, 0),
                department(1100, 1000, "0,1000", "销售", "0", 0, Integer.MAX_VALUE), department(1100, 1000, "wrong", "销售", "0", 0, 0))) {
            ImSyncPreview preview = plan(source, local(List.of(ROOT, department), List.of(), List.of(departmentMapping(2, 1100, "ACTIVE", 0)), List.of(), Set.of()));
            equal(ImSyncPreview.Action.CONFLICT, preview.departments().get(0).action(), "unsafe local department is a conflict");
        }
        ImSyncPreview rootMapping = plan(source, local(List.of(ROOT), List.of(), List.of(departmentMapping(2, 1000, "ACTIVE", 0)), List.of(), Set.of()));
        check(rootMapping.departments().get(0).reasons().contains(ImSyncPreview.Reason.ROOT_MAPPING_COLLISION), "configured root cannot be overwritten");
        ImOrgSnapshot oversize = new ImOrgSnapshot(100, 200, 3, "corpA", 77, Instant.now(), 1000, Set.of(2L), Map.of(),
                List.of(new ImOrgSnapshot.Department(2, 1, "长".repeat(31), 2147483648L)), List.of());
        ImSyncPreview oversized = plan(oversize, local(List.of(ROOT), List.of(), List.of(), List.of(), Set.of()));
        check(oversized.departments().get(0).reasons().containsAll(List.of(ImSyncPreview.Reason.FIELD_TOO_LONG, ImSyncPreview.Reason.ORDER_OUT_OF_RANGE)), "no truncation of name or numeric order");
        for (List<ImLocalOrganization.Department> departments : List.of(List.<ImLocalOrganization.Department>of(),
                List.of(department(1000, 0, "0", "root", "1", 0, 0)), List.of(department(1000, 0, "0", "root", "0", 1, 0)),
                List.of(department(1000, 1100, "", "root", "0", 0, 0), department(1100, 1000, "", "child", "0", 0, 0)),
                List.of(ROOT, ROOT))) {
            rejected(() -> plan(source, local(departments, List.of(), List.of(), List.of(), Set.of())), "IM_ORG_LOCAL_INVALID");
        }
    }

    private static void statusAndAbsence() {
        ImLocalOrganization.Department department = department(1100, 1000, "0,1000", "销售", "0", 0, 0);
        for (int status : List.of(1, 2, 4, 5)) {
            for (String localStatus : List.of("0", "1")) {
                ImLocalOrganization baseline = local(List.of(ROOT, department), List.of(user(2000, 1100L, "alpha", "甲", "", "", "", localStatus, 0, 0)),
                        List.of(departmentMapping(2, 1100, "ACTIVE", 0)), List.of(userMapping("alpha", 2000, "ACTIVE", 0)), Set.of());
                ImSyncPreview preview = plan(source(List.of(member("alpha", "甲", status, 2)), Map.of()), baseline);
                boolean disable = status == 2 || status == 5;
                equal(disable || localStatus.equals("1") ? "1" : "0", preview.users().get(0).desiredStatus(), "local security disable never revived");
                equal(disable && localStatus.equals("0") ? ImSyncPreview.Action.DISABLE : ImSyncPreview.Action.UNCHANGED, preview.users().get(0).action(), "official inactive states distinguished from pending activation");
                ImLocalOrganization protectedBaseline = local(baseline.departments(), baseline.users(), baseline.departmentMappings(), baseline.userMappings(), Set.of(2000L));
                ImSyncPreview protectedPreview = plan(source(List.of(member("alpha", "甲", status, 2)), Map.of()), protectedBaseline);
                if (disable) reason(protectedPreview.users().get(0), ImSyncPreview.Reason.PROTECTED_ACCOUNT);
            }
        }
        ImLocalOrganization baseline = local(List.of(ROOT, department), List.of(user(2000, 1100L, "alpha", "甲", "", "", "", "0", 0, 0)),
                List.of(departmentMapping(2, 1100, "ACTIVE", 0)), List.of(userMapping("alpha", 2000, "ACTIVE", 0)), Set.of());
        ImSyncPreview missing = plan(source(List.of(), Map.of()), baseline);
        reason(missing.users().get(0), ImSyncPreview.Reason.ABSENCE_UNVERIFIED);
        equal(0L, missing.summary().usersDisabled(), "absence does not falsely prove external deletion");
        equal(1L, missing.summary().userConflicts(), "unverified absence explicitly reported");
        ImLocalOrganization outside = local(List.of(ROOT, department), List.of(user(2000, null, "alpha", "甲", "", "", "", "0", 0, 0)), baseline.departmentMappings(), baseline.userMappings(), Set.of());
        equal(0, plan(source(List.of(), Map.of()), outside).users().size(), "outside unobserved user never disabled");
    }

    private static void preservedFields() {
        ImLocalOrganization.Department department = department(1100, 1000, "0,1000", "销售", "0", 0, 0);
        ImLocalOrganization.User existing = user(2000, 1100L, "alpha", "甲", "13900000000", "local@example.test",
                "https://wework.qpic.cn/local", "0", 0, 0);
        ImLocalOrganization baseline = local(List.of(ROOT, department), List.of(existing),
                List.of(departmentMapping(2, 1100, "ACTIVE", 0)), List.of(userMapping("alpha", 2000, "ACTIVE", 0)), Set.of());
        ImOrgSnapshot.Field absent = new ImOrgSnapshot.Field(false, null);
        for (int mask = 0; mask < 8; mask++) {
            ImOrgSnapshot.Member member = new ImOrgSnapshot.Member("alpha", "甲", List.of(2L), 1,
                    (mask & 1) == 0 ? absent : present(existing.mobile()),
                    (mask & 2) == 0 ? absent : present(existing.email()),
                    (mask & 4) == 0 ? absent : present(existing.avatar()));
            ImSyncPreview preview = plan(source(List.of(member), Map.of()), baseline);
            equal(ImSyncPreview.Action.UNCHANGED, preview.users().get(0).action(), "missing contact combination never implies clearing");
            equal(existing, preview.users().get(0).local(), "complete local before image retained");
            ImSyncRunRow row = new ImSyncRunRow();
            row.setConfigVersion(3);
            row.setSyncRunId(1L); row.setConfigId(200L); row.setRequestedBy(500L);
            ImSyncViews.Entry entry = ImSyncViews.report(row, 3, preview, null, 1, 100).entries().getRows().get(2);
            equal((mask & 1) == 0 ? "LOCAL_PRESERVED" : "***", entry.after().get("mobile"), "phone preservation visible without exposing value");
            equal((mask & 2) == 0 ? "LOCAL_PRESERVED" : "***", entry.after().get("email"), "email preservation visible without exposing value");
            equal((mask & 4) == 0 ? "LOCAL_PRESERVED" : "SOURCE_RETURNED", entry.after().get("avatar"), "avatar availability visible");
        }
        equal(ImSyncPreview.Action.UPDATE, plan(source(List.of(contacts("alpha", "", "", "")), Map.of()), baseline).users().get(0).action(), "explicit empty fields can clear old values");
    }

    private static void scopeExit() {
        ImLocalOrganization.Department department = department(1100, 1000, "0,1000", "销售", "0", 0, 0);
        ImOrgSnapshot.Member outside = member("alpha", "外部已调动", 1, 4);
        ImOrgSnapshot base = source(List.of(), Map.of());
        ImOrgSnapshot source = new ImOrgSnapshot(base.tenantId(), base.configId(), base.configVersion(), base.corpId(), base.agentId(),
                base.capturedAt(), base.localRootDeptId(), base.roots(), base.primaryDepartments(), base.departments(), base.members(), List.of(outside));
        for (String status : List.of("0", "1")) {
            ImLocalOrganization.User existing = user(2000, 1100L, "alpha", "甲", "13900000000", "local@example.test", "", status, 0, 0);
            ImLocalOrganization baseline = local(List.of(ROOT, department), List.of(existing),
                    List.of(departmentMapping(2, 1100, "ACTIVE", 0)), List.of(userMapping("alpha", 2000, "ACTIVE", 0)), Set.of(2000L));
            ImSyncPreview preview = plan(source, baseline);
            ImSyncPreview.UserChange release = preview.users().get(0);
            equal(ImSyncPreview.Action.RELEASE, release.action(), "verified outside employee leaves only sync management");
            equal(status, release.desiredStatus(), "release preserves active or disabled local status including protected account");
            equal(1L, preview.summary().usersUnchanged(), "release counts as unchanged account, not account update");
            equal(0L, preview.summary().usersDisabled(), "release never disables");
            equal(preview, CODEC.decodePreview(ImOrgSnapshotCodec.context(ImSecurityChecks.fixture()), CODEC.encodePreview(preview)), "release preview encrypted round trip");
            ImSyncApplication initial = ImSyncApplication.start(preview, CODEC.previewHash(preview));
            ImSyncApplication applied = initial.advance(List.of(
                    new ImSyncApplication.Outcome(0, ImSyncApplication.Kind.DEPARTMENT, "2", 1100L, ImSyncPreview.Action.UNCHANGED, List.of()),
                    new ImSyncApplication.Outcome(1, ImSyncApplication.Kind.DEPARTMENT, "3", 1200L, ImSyncPreview.Action.CREATE, List.of()),
                    new ImSyncApplication.Outcome(2, ImSyncApplication.Kind.USER, "alpha", 2000L, ImSyncPreview.Action.RELEASE, release.reasons())),
                    "a".repeat(64), List.of(), true).effectsCompleted("a".repeat(64));
            equal("COMPLETED", applied.status(), "release state can finish without a selected target department");
            equal(1L, applied.summary().actual().usersUnchanged(), "committed release summarized as unchanged account");
            equal(applied, CODEC.decodeApplication(ImOrgSnapshotCodec.context(ImSecurityChecks.fixture()), initial.previewHash(), CODEC.encodeApplication(applied)), "release application encrypted round trip");
            rejected(() -> new ImSyncApplication.Outcome(2, ImSyncApplication.Kind.USER, "alpha", 2000L, ImSyncPreview.Action.RELEASE, List.of()), "IM_ORG_LOCAL_INVALID");
            ImSyncRunRow row = new ImSyncRunRow();
            row.setConfigVersion(3);
            row.setSyncRunId(1L); row.setConfigId(200L); row.setRequestedBy(500L);
            ImSyncViews.Entry entry = ImSyncViews.report(row, 3, preview, null, 1, 100).entries().getRows().get(2);
            equal("甲", entry.after().get("name"), "release report does not propose outside name as local update");
            equal("OUT_OF_SCOPE", entry.after().get("syncManagement"), "released management clearly reported");
            ImLocalOrganization released = local(baseline.departments(), baseline.users(), baseline.departmentMappings(),
                    List.of(userMapping("alpha", 2000, "OUT_OF_SCOPE", 1)), Set.of());
            equal(0, plan(base, released).users().size(), "future absence no longer participates in management");
            ImSyncPreview returned = plan(source(List.of(member("alpha", "甲", 1, 2)), Map.of()), released);
            check(returned.users().get(0).action() != ImSyncPreview.Action.CONFLICT, "return to selected scope restores management without duplicate account");
            equal(status, returned.users().get(0).desiredStatus(), "return cannot revive local disabled account");
            ImLocalOrganization unsynced = local(baseline.departments(), baseline.users(), baseline.departmentMappings(),
                    List.of(new ImLocalOrganization.UserMapping(100, 2000, 200, 2000, "alpha", "MANUAL_BIND", null, "ACTIVE", 0)), Set.of());
            rejected(() -> plan(source, unsynced), "IM_ORG_LOCAL_INVALID");
            rejected(() -> new ImSyncPreview(base, preview.localHash(), preview.departments(), preview.users()), "IM_ORG_LOCAL_INVALID");
        }
    }

    private static void envelopes() throws Exception {
        ImLocalOrganization baseline = local(List.of(ROOT), List.of(), List.of(), List.of(), Set.of(99L, 98L));
        ImOrgSnapshot source = source(List.of(contacts("alpha", "13900000000", "private@example.test", "https://wework.qpic.cn/private-avatar")), Map.of());
        ImSyncPreview preview = plan(source, baseline);
        ImOrgSnapshotCodec.Sealed sealed = CODEC.encodePreview(preview);
        ImOrgSnapshotCodec.Context context = ImOrgSnapshotCodec.context(ImSecurityChecks.fixture());
        equal(preview, CODEC.decodePreview(context, sealed), "preview source and complete before/after plans encrypted together");
        rejected(() -> CODEC.decodePreview(new ImOrgSnapshotCodec.Context(101, 200, 3, "corpA", 77), sealed), "IM_SECRET_UNAVAILABLE");
        rejected(() -> CODEC.decodePreview(new ImOrgSnapshotCodec.Context(100, 200, 4, "corpA", 77), sealed), "IM_SECRET_UNAVAILABLE");
        rejected(() -> CODEC.decodePreview(new ImOrgSnapshotCodec.Context(100, 200, 3, "corpA", 78), sealed), "IM_SECRET_UNAVAILABLE");
        rejected(() -> CODEC.decodePreview(context, CODEC.encode(source)), "IM_SECRET_UNAVAILABLE");
        rejected(() -> CODEC.decode(ImSecurityChecks.fixture(), sealed), "IM_SECRET_UNAVAILABLE");
        equal(CODEC.localHash(baseline), CODEC.localHash(local(List.of(ROOT), List.of(), List.of(), List.of(), Set.of(98L, 99L))), "local hash deterministic across set order");
        check(!CODEC.localHash(baseline).equals(CODEC.localHash(local(List.of(ROOT), List.of(), List.of(), List.of(), Set.of()))), "protection changes invalidate local baseline");
        ImSyncRunRow row = new ImSyncRunRow();
        row.setSyncRunId(1L); row.setConfigId(200L); row.setConfigVersion(3); row.setStatus("PREVIEWED"); row.setFullSnapshotFlag(true);
        row.setRequestedBy(500L); row.setCreateTime(LocalDateTime.now()); row.setSnapshotHash(sealed.hash()); row.setSnapshotEncrypted(sealed.encrypted());
        ImSyncViews.Report report = ImSyncViews.report(row, 4, preview, null, 1, 100);
        String response = new ObjectMapper().registerModule(new JavaTimeModule()).writeValueAsString(report);
        for (String privateValue : List.of("13900000000", "private@example.test", "https://wework.qpic.cn/private-avatar", sealed.encrypted())) {
            check(!response.contains(privateValue), "report masks contact values and omits encrypted payload");
        }
        check(report.configurationChanged(), "historical report explicitly says configuration changed");
        equal(0, ImSyncViews.report(row, 3, preview, null, 999, 50).entries().getRows().size(), "out of page range returns empty page");
        check(!preview.toString().contains("private"), "preview diagnostic private data hidden");
        check(!preview.users().get(0).toString().contains("private"), "user change diagnostic private data hidden");
        rejected(() -> new ImSyncPreview(source, CODEC.localHash(baseline), preview.departments(), List.of()), "IM_ORG_LOCAL_INVALID");
        rejected(() -> new ImSyncPreview(source, CODEC.localHash(baseline), List.of(preview.departments().get(0), preview.departments().get(0)), preview.users()), "IM_ORG_LOCAL_INVALID");
    }

    private static void performance() {
        List<ImOrgSnapshot.Member> people = new ArrayList<>();
        for (int identifier = 0; identifier < 1000; identifier++) people.add(member("private-perf-" + identifier, "人员" + identifier, 1, 2));
        long started = System.nanoTime();
        ImSyncPreview preview = plan(source(people, Map.of()), local(List.of(ROOT), List.of(), List.of(), List.of(), Set.of()));
        ImOrgSnapshotCodec.Sealed sealed = CODEC.encodePreview(preview);
        equal(preview, CODEC.decodePreview(ImOrgSnapshotCodec.context(ImSecurityChecks.fixture()), sealed), "1000-person preview encrypted round trip");
        long millis = java.time.Duration.ofNanos(System.nanoTime() - started).toMillis();
        check(millis < 300000, "1000-person comparison and encryption under five minutes");
        System.out.println("G4_IM_SYNC_PLANNER_PERFORMANCE: members=1000; elapsed_ms=" + millis + "; database=false; complete_sync=false");
    }

    private static void localIntegrity() {
        ImLocalOrganization.Department deletedParent = department(1100, 1000, "0,1000", "销售", "0", 1, 0);
        ImLocalOrganization.Department child = department(1200, 1100, "0,1000,1100", "销售二组", "0", 0, 0);
        ImSyncPreview preview = plan(source(List.of(), Map.of()), local(List.of(ROOT, deletedParent, child), List.of(),
                List.of(departmentMapping(2, 1100, "ACTIVE", 0), departmentMapping(3, 1200, "ACTIVE", 0)), List.of(), Set.of()));
        equal(2L, preview.summary().departmentConflicts(), "deleted mapped parent and child reported without null or ancestor exception");
        check(preview.departments().get(1).reasons().contains(ImSyncPreview.Reason.PARENT_CONFLICT), "deleted parent conflict reaches mapped child");
        for (String identifier : List.of("", "0", "02", "-1", "9223372036854775808")) {
            rejected(() -> new ImLocalOrganization.DepartmentMapping(100, 1, 200, 1100, identifier, "1", "ACTIVE", 0), "IM_ORG_LOCAL_INVALID");
        }
        for (String identifier : List.of("", " bad", "bad/identifier")) {
            rejected(() -> userMapping(identifier, 2000, "ACTIVE", 0), "IM_ORG_LOCAL_INVALID");
        }
        rejected(() -> new ImLocalOrganization.UserMapping(100, 1, 200, 2000, "alpha", "UNKNOWN", null, "ACTIVE", 0), "IM_ORG_LOCAL_INVALID");
        rejected(() -> user(0, 1100L, "alpha", "甲", "", "", "", "0", 0, 0), "IM_ORG_LOCAL_INVALID");
        ImLocalOrganization local = local(List.of(ROOT), List.of(), List.of(), List.of(), Set.of());
        ImOrgSnapshot source = source(List.of(member("alpha", "甲", 1, 2)), Map.of());
        ImSyncPreview original = plan(source, local);
        ImSyncPreview.UserChange mismatched = new ImSyncPreview.UserChange(source.members().get(0),
                user(2000, 1100L, "alpha", "甲", "", "", "", "0", 0, 0), userMapping("alpha", 2001, "ACTIVE", 0),
                1100L, 2L, "alpha", "0", ImSyncPreview.Action.CONFLICT, List.of(ImSyncPreview.Reason.CONTACT_COLLISION));
        rejected(() -> new ImSyncPreview(source, CODEC.localHash(local), original.departments(), List.of(mismatched)), "IM_ORG_LOCAL_INVALID");
        ImSyncPreview.DepartmentChange department = new ImSyncPreview.DepartmentChange(source.departments().get(0), null,
                departmentMapping(3, 1100, "ACTIVE", 0), 1000L, null, ImSyncPreview.Action.CONFLICT, List.of(ImSyncPreview.Reason.MAPPING_TARGET_MISSING));
        rejected(() -> new ImSyncPreview(source, CODEC.localHash(local), List.of(department, original.departments().get(1)), original.users()), "IM_ORG_LOCAL_INVALID");
        ImOrgSnapshot emptySource = source(List.of(), Map.of());
        ImSyncPreview.UserChange absent = new ImSyncPreview.UserChange(null,
                user(2000, 1100L, "alpha", "甲", "", "", "", "0", 0, 0), userMapping("alpha", 2000, "ACTIVE", 0),
                null, null, "alpha", "0", ImSyncPreview.Action.CONFLICT, List.of(ImSyncPreview.Reason.ABSENCE_UNVERIFIED));
        rejected(() -> new ImSyncPreview(emptySource, CODEC.localHash(local), original.departments(), List.of(absent, absent)), "IM_ORG_LOCAL_INVALID");
        rejected(() -> new ImSyncPreview.UserChange(source.members().get(0), null, null, null, 2L, "alpha", "0",
                ImSyncPreview.Action.CREATE, List.of(ImSyncPreview.Reason.CONTACT_COLLISION)), "IM_ORG_LOCAL_INVALID");
        rejected(() -> new ImSyncPreview.UserChange(source.members().get(0), null, null, null, 2L, "alpha", "0",
                ImSyncPreview.Action.CONFLICT, List.of()), "IM_ORG_LOCAL_INVALID");
    }

    private static ImSyncPreview plan(ImOrgSnapshot source, ImLocalOrganization local) { return PLANNER.preview(source, local, CODEC.localHash(local)); }
    private static ImLocalOrganization local(List<ImLocalOrganization.Department> departments, List<ImLocalOrganization.User> users,
            List<ImLocalOrganization.DepartmentMapping> departmentMappings, List<ImLocalOrganization.UserMapping> userMappings, Set<Long> protectedUsers) {
        return new ImLocalOrganization(100, departments, users, departmentMappings, userMappings, protectedUsers);
    }
    private static ImOrgSnapshot source(List<ImOrgSnapshot.Member> members, Map<String, Long> primary) {
        return new ImOrgSnapshot(100, 200, 3, "corpA", 77, Instant.parse("2026-09-29T00:00:00Z"), 1000, Set.of(2L), primary,
                List.of(new ImOrgSnapshot.Department(2, 1, "销售", 0), new ImOrgSnapshot.Department(3, 2, "销售二组", 0)), members);
    }
    private static ImOrgSnapshot.Member member(String id, String name, int status, long... departments) {
        List<Long> identifiers = new ArrayList<>();
        for (long department : departments) identifiers.add(department);
        return new ImOrgSnapshot.Member(id, name, identifiers, status, present(""), present(""), present(""));
    }
    private static ImOrgSnapshot.Member contacts(String id, String mobile, String email, String avatar) {
        return new ImOrgSnapshot.Member(id, "甲", List.of(2L), 1, present(mobile), present(email), present(avatar));
    }
    private static ImOrgSnapshot.Field present(String value) { return new ImOrgSnapshot.Field(true, value); }
    private static ImLocalOrganization.Department department(long id, long parent, String ancestors, String name, String status, int deleted, int version) {
        return new ImLocalOrganization.Department(100, id, parent, ancestors, name, 0, status, deleted, version);
    }
    private static ImLocalOrganization.User user(long id, Long department, String username, String name, String mobile, String email, String avatar, String status, int deleted, int version) {
        return new ImLocalOrganization.User(100, id, department, username, name, mobile, email, avatar, status, deleted, version);
    }
    private static ImLocalOrganization.DepartmentMapping departmentMapping(long external, long local, String status, int version) {
        return new ImLocalOrganization.DepartmentMapping(100, external, 200, local, Long.toString(external), "1", status, version);
    }
    private static ImLocalOrganization.UserMapping userMapping(String external, long local, String status, int version) {
        return new ImLocalOrganization.UserMapping(100, local, 200, local, external, "AUTO_SYNC", LocalDateTime.of(2026, 9, 29, 0, 0), status, version);
    }
    private static ImOrgSnapshotCodec codec() {
        ImProperties properties = new ImProperties();
        properties.setSecretKey("im-preview-checks-" + "K".repeat(48));
        return new ImOrgSnapshotCodec(new ImSecretCipher(properties));
    }
    private static void reason(ImSyncPreview.UserChange change, ImSyncPreview.Reason reason) {
        equal(ImSyncPreview.Action.CONFLICT, change.action(), "conflict action");
        check(change.reasons().contains(reason), "expected conflict reason " + reason);
    }
    private static void check(boolean value, String message) { assertions++; if (!value) throw new AssertionError(message); }
    private static void equal(Object expected, Object actual, String message) { check(Objects.equals(expected, actual), message); }
    private static void rejected(Runnable action, String code) {
        try { action.run(); throw new AssertionError("expected " + code); }
        catch (ImFailure failure) { equal(code, failure.getReasonCode(), "safe rejection code"); check(failure.getCause() == null, "no unsafe nested cause"); }
    }
}
