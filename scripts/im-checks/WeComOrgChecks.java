package com.cloudflow.auth.im;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Consumer;
import java.util.function.Function;
import org.slf4j.LoggerFactory;

public final class WeComOrgChecks {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final String SCOPE = "IM_ORG_SCOPE_UNVERIFIED";
    private static final String INCOMPLETE = "IM_ORG_SNAPSHOT_INCOMPLETE";
    private static final String CHANGED = "IM_ORG_SNAPSHOT_CHANGED";
    private static final String CONFIGURATION = "IM_CONFIGURATION_INVALID";
    private static final String TOKEN = "org-private-test-token";
    private static int assertions;

    public static void main(String[] arguments) throws Exception {
        Logger sdkLogger = (Logger) LoggerFactory.getLogger("me.chanjar.weixin");
        Level previous = sdkLogger.getLevel();
        ListAppender<ILoggingEvent> logs = new ListAppender<>();
        logs.start();
        sdkLogger.addAppender(logs);
        sdkLogger.setLevel(Level.DEBUG);
        try (Fixture fixture = new Fixture()) {
            complete(fixture);
            departmentOptions(fixture);
            scopes(fixture);
            malformed(fixture);
            changes(fixture);
            fields(fixture);
            scopeExit(fixture);
            immutable(fixture);
            bounds(fixture);
            snapshotConstruction();
            performance(fixture);
            equal(0, logs.list.size(), "SDK does not log organization, personal fields or access tokens");
            System.out.println("G4_WECOM_ORG_CHECKS: assertions=" + assertions + "; failed=0; requests=" + fixture.total.get()
                    + "; real_loopback_http=true; vendor_service=false; local_org_writes=0; mysql=false; redis=false; production_modified=false");
        } finally {
            sdkLogger.setLevel(previous);
            sdkLogger.detachAppender(logs);
            logs.stop();
        }
    }

    private static void complete(Fixture fixture) {
        fixture.reset();
        ImOrgSnapshot snapshot = fixture.snapshot(scope());
        equal(List.of(2L, 3L), snapshot.departments().stream().map(ImOrgSnapshot.Department::id).toList(), "complete descendant tree");
        equal(List.of("private-Ada", "private-Bob"), snapshot.members().stream().map(ImOrgSnapshot.Member::id).toList(), "multi-department member deduplicated");
        equal(List.of(2L, 3L, 4L), snapshot.members().get(0).departmentIds(), "outside affiliation retained without fetching outside tree");
        equal(10, fixture.requests.size(), "three scope and department reads plus two full member passes");
        equal(100L, snapshot.tenantId(), "trusted tenant");
        equal(200L, snapshot.configId(), "trusted configuration");
        equal(3, snapshot.configVersion(), "trusted version");
        equal("corpA", snapshot.corpId(), "trusted enterprise");
        equal(77L, snapshot.agentId(), "trusted application");
        check(snapshot.capturedAt().isBefore(Instant.now().plusSeconds(1)), "capture time assigned locally");
        check(fixture.requests.stream().allMatch(request -> request.getRawQuery().contains("access_token=" + TOKEN)), "every request uses protected token supplier");
        check(fixture.requests.stream().noneMatch(request -> request.getRawQuery().contains("fetch_child")
                || request.getRawQuery().contains("cursor") || request.getRawQuery().contains("department_id=4")), "current official API and selected scope only");
        ImConfigRequest.SyncScope overlapping = scope();
        overlapping.setRemoteDepartmentIds(List.of(2L, 3L));
        fixture.reset();
        equal(2, fixture.snapshot(overlapping).members().size(), "overlapping roots deduplicated");
        equal(10, fixture.requests.size(), "overlapping roots do not add HTTP calls");
        fixture.reset();
        fixture.change("users:2", 0, node -> node.set("userlist", JSON.createArrayNode()));
        fixture.change("users:3", 0, node -> node.set("userlist", JSON.createArrayNode()));
        equal(0, fixture.snapshot(scope()).members().size(), "explicit complete empty organization is representable");
    }

    private static void scopes(Fixture fixture) {
        for (Consumer<ObjectNode> change : List.<Consumer<ObjectNode>>of(node -> node.put("agentid", 78), node -> node.put("close", 1),
                node -> node.remove("allow_partys"), node -> node.set("allow_partys", JSON.createObjectNode().set("partyid", JSON.createArrayNode())),
                node -> node.set("allow_partys", JSON.createObjectNode().set("partyid", JSON.createArrayNode().add(4))))) {
            fail(fixture, "agent", 0, change, SCOPE);
            equal(0, fixture.count("users:2"), "unverified scope never fetches members");
        }
        fixture.reset();
        fixture.change("agent", 0, node -> {
            node.remove("allow_partys");
            node.set("allow_userinfos", JSON.createObjectNode().putArray("user").addObject().put("userid", "private-Ada"));
            node.set("allow_tags", JSON.createObjectNode().set("tagid", JSON.createArrayNode().add(1)));
        });
        rejected(() -> fixture.snapshot(scope()), SCOPE);
        fixture.reset();
        ImConfigRequest.SyncScope missing = scope();
        missing.setRemoteDepartmentIds(List.of(99L));
        rejected(() -> fixture.snapshot(missing), SCOPE);
        fixture.reset();
        fixture.change("agent", 0, node -> node.set("allow_partys", JSON.createObjectNode().set("partyid", JSON.createArrayNode().add(2))));
        equal(2, fixture.snapshot(scope()).members().size(), "directly authorized subtree valid without root-wide access");
        fixture.reset();
        fixture.change("departments", 0, node -> node.set("department", JSON.createArrayNode().add(department(2, 99)).add(department(3, 2))));
        fixture.change("agent", 0, node -> node.set("allow_partys", JSON.createObjectNode().set("partyid", JSON.createArrayNode().add(99))));
        rejected(() -> fixture.snapshot(scope()), SCOPE);
        fixture.reset();
        fixture.change("agent", 0, node -> node.set("allow_partys", JSON.createObjectNode().set("partyid", JSON.createArrayNode().add(2))));
        fixture.change("departments", 0, node -> node.set("department", JSON.createArrayNode().add(department(2, 99)).add(department(3, 2))));
        equal(2, fixture.snapshot(scope()).departments().size(), "authorized subtree does not require invisible ancestor");
    }

    private static void departmentOptions(Fixture fixture) {
        fixture.reset();
        equal(List.of(1L, 2L, 3L, 4L), WeComOrgProvider.departments(fixture.sdk, ImSecurityChecks.fixture()).stream()
                .map(ImOrgSnapshot.Department::id).toList(), "department choices include complete authorized descendants");
        equal(6, fixture.requests.size(), "choices reread permissions and departments three times");
        check(fixture.requests.stream().noneMatch(request -> request.getPath().contains("/user/")), "choices never fetch people");
        fixture.reset();
        fixture.change("agent", 0, node -> node.withObject("/allow_partys").set("partyid", JSON.createArrayNode().add(2).add(3)));
        equal(List.of(2L, 3L), WeComOrgProvider.departments(fixture.sdk, ImSecurityChecks.fixture()).stream()
                .map(ImOrgSnapshot.Department::id).toList(), "overlapping scope choices exclude outside department names");
        fixture.reset();
        fixture.change("agent", 0, node -> node.withObject("/allow_partys").set("partyid", JSON.createArrayNode().add(999)));
        rejected(() -> WeComOrgProvider.departments(fixture.sdk, ImSecurityChecks.fixture()), SCOPE);
        fixture.reset();
        fixture.change("agent", 2, node -> node.withObject("/allow_partys").set("partyid", JSON.createArrayNode().add(2)));
        rejected(() -> WeComOrgProvider.departments(fixture.sdk, ImSecurityChecks.fixture()), CHANGED);
        fixture.reset();
        fixture.change("departments", 2, node -> ((ObjectNode) node.path("department").get(1)).put("name", "changed"));
        rejected(() -> WeComOrgProvider.departments(fixture.sdk, ImSecurityChecks.fixture()), CHANGED);
        fixture.reset();
        fixture.change("departments", 0, node -> {
            ArrayNode departments = node.putArray("department").add(department(1, 0));
            for (int identifier = 2; identifier <= 151; identifier++) departments.add(department(identifier, 1));
        });
        fixture.change("agent", 0, node -> {
            ArrayNode roots = node.withObject("/allow_partys").putArray("partyid");
            for (int identifier = 2; identifier <= 151; identifier++) roots.add(identifier);
        });
        equal(150, WeComOrgProvider.departments(fixture.sdk, ImSecurityChecks.fixture()).size(), "more than 100 authorized roots do not truncate department choices");
    }

    private static void malformed(Fixture fixture) {
        for (String field : List.of("id", "parentid", "order")) {
            for (JsonNode value : List.of(JSON.getNodeFactory().textNode("2"), JSON.getNodeFactory().numberNode(2.5), JSON.nullNode(),
                    JSON.getNodeFactory().numberNode(new java.math.BigInteger("18446744073709551616")))) {
                fail(fixture, "departments", 0, node -> ((ObjectNode) node.path("department").get(1)).set(field, value), INCOMPLETE);
            }
        }
        for (Consumer<ObjectNode> change : List.<Consumer<ObjectNode>>of(
                node -> ((ObjectNode) node.path("department").get(1)).put("id", 0),
                node -> ((ObjectNode) node.path("department").get(1)).put("parentid", -1),
                node -> ((ObjectNode) node.path("department").get(1)).put("parentid", 2),
                node -> ((ObjectNode) node.path("department").get(1)).put("parentid", 3),
                node -> ((ObjectNode) node.path("department").get(1)).put("order", 4294967296L),
                node -> ((ObjectNode) node.path("department").get(1)).put("name", ""),
                node -> ((ObjectNode) node.path("department").get(1)).put("name", "department\nprivate"),
                node -> ((ArrayNode) node.path("department")).add(department(2, 1)),
                node -> node.set("department", JSON.createObjectNode()))) {
            fail(fixture, "departments", 0, change, INCOMPLETE);
        }
        for (Consumer<ObjectNode> change : List.<Consumer<ObjectNode>>of(node -> node.put("userid", "private invalid"),
                node -> node.remove("userid"), node -> node.put("status", 0), node -> node.put("status", 3), node -> node.put("status", 6),
                node -> node.put("status", "1"), node -> node.put("name", " "), node -> node.put("name", "a".repeat(101)),
                node -> node.set("department", JSON.createArrayNode()), node -> node.set("department", JSON.createArrayNode().add(2).add(2)),
                node -> node.set("department", JSON.createArrayNode().add(4)), node -> node.set("department", JSON.createArrayNode().add("2")))) {
            fail(fixture, "users:2", 0, node -> change.accept((ObjectNode) node.path("userlist").get(0)), INCOMPLETE);
        }
        fail(fixture, "users:2", 0, node -> ((ArrayNode) node.path("userlist")).add(member("private-Ada", 2, 3, 4)), INCOMPLETE);
        fail(fixture, "users:3", 0, node -> ((ObjectNode) node.path("userlist").get(0)).put("userid", "private-ADA"), INCOMPLETE);
        fail(fixture, "users:3", 0, node -> ((ArrayNode) node.path("userlist")).remove(0), INCOMPLETE);
        fail(fixture, "users:2", 0, node -> node.put("errcode", 48002).put("errmsg", TOKEN), "IM_PROVIDER_REJECTED");
        for (String field : List.of("next_cursor", "has_more")) {
            for (String endpoint : List.of("agent", "departments", "users:2")) {
                fail(fixture, endpoint, 0, node -> node.put(field, "unexpected"), INCOMPLETE);
            }
        }
        for (String raw : List.of("{\"errcode\":0,\"errcode\":1}", "{\"errcode\":0}{}", "{\"errcode\":\"0\"}", "{}", "private-invalid-body")) {
            fixture.reset();
            fixture.raw.set(request -> request.key().equals("users:2") ? raw : request.body().toString());
            rejected(() -> fixture.snapshot(scope()), "IM_PROVIDER_REJECTED");
        }
        fixture.reset();
        fixture.change("users:3", 0, node -> node.put("errcode", 42001));
        rejected(() -> fixture.snapshot(scope()), "IM_TOKEN_REJECTED");
        equal(TOKEN, fixture.invalidated.get(), "token failure invalidates only the exact rejected token");
        equal(1, fixture.count("users:3"), "partial failure not retried or treated as empty member list");
    }

    private static void changes(Fixture fixture) {
        fail(fixture, "users:3", 0, node -> ((ObjectNode) node.path("userlist").get(0)).put("name", "changed-private-name"), CHANGED);
        for (int occurrence : List.of(2, 3)) {
            fail(fixture, "departments", occurrence, node -> ((ObjectNode) node.path("department").get(1)).put("name", "changed-private-name"), CHANGED);
            fail(fixture, "agent", occurrence, node -> node.set("allow_partys", JSON.createObjectNode().set("partyid", JSON.createArrayNode().add(2))), CHANGED);
        }
        fail(fixture, "users:3", 2, node -> ((ArrayNode) node.path("userlist")).remove(1), CHANGED);
        fail(fixture, "users:3", 2, node -> ((ObjectNode) node.path("userlist").get(1)).put("status", 2), CHANGED);
        fixture.reset();
        fixture.change("users:2", 2, node -> ((ObjectNode) node.path("userlist").get(0)).put("name", "changed-private-name"));
        fixture.change("users:3", 2, node -> ((ObjectNode) node.path("userlist").get(0)).put("name", "changed-private-name"));
        rejected(() -> fixture.snapshot(scope()), CHANGED);
        fixture.reset();
        fixture.change("departments", 2, node -> {
            ArrayNode reversed = JSON.createArrayNode();
            for (int index = node.path("department").size() - 1; index >= 0; index--) reversed.add(node.path("department").get(index));
            node.set("department", reversed);
        });
        fixture.change("users:3", 2, node -> ((ObjectNode) node.path("userlist").get(0)).set("department", JSON.createArrayNode().add(4).add(3).add(2)));
        equal(2, fixture.snapshot(scope()).members().size(), "ordering-only changes accepted");
    }

    private static void fields(Fixture fixture) {
        fixture.reset();
        ImOrgSnapshot.Member member = fixture.snapshot(scope()).members().get(0);
        equal(new ImOrgSnapshot.Field(false, null), member.mobile(), "missing phone distinguished");
        equal(new ImOrgSnapshot.Field(false, null), member.email(), "null email distinguished");
        equal(new ImOrgSnapshot.Field(true, ""), member.avatar(), "returned empty value distinguished");
        for (int status : List.of(1, 2, 4, 5)) {
            fixture.reset();
            fixture.change("users:3", 0, node -> ((ObjectNode) node.path("userlist").get(1)).put("status", status));
            equal(status, fixture.snapshot(scope()).members().get(1).status(), "all official member states preserved");
        }
        for (String avatar : List.of("https://wework.qpic.cn/path", "https://wework.qlogo.cn/path", "https://wx.qlogo.cn/path")) {
            fixture.reset();
            fixture.change("users:3", 0, node -> ((ObjectNode) node.path("userlist").get(1)).put("avatar", avatar)
                    .put("mobile", "13900000000").put("email", "private@example.test"));
            ImOrgSnapshot.Member withFields = fixture.snapshot(scope()).members().get(1);
            equal(avatar, withFields.avatar().value(), "approved avatar returned without fetching it");
            equal("13900000000", withFields.mobile().value(), "returned phone preserved");
            equal("private@example.test", withFields.email().value(), "returned email preserved");
        }
        for (String avatar : List.of("http://wework.qpic.cn/path", "https://wework.qpic.cn.evil.test/path", "https://127.0.0.1/path",
                "https://user@wework.qpic.cn/path", "https://wework.qpic.cn:443/path", "https://wework.qpic.cn/path#secret", "not a uri")) {
            fail(fixture, "users:3", 0, node -> ((ObjectNode) node.path("userlist").get(1)).put("avatar", avatar), INCOMPLETE);
        }
        for (String field : List.of("mobile", "email", "avatar")) {
            fail(fixture, "users:3", 0, node -> ((ObjectNode) node.path("userlist").get(1)).put(field, 123), INCOMPLETE);
            fail(fixture, "users:3", 0, node -> ((ObjectNode) node.path("userlist").get(1)).put(field, "private\nvalue"), INCOMPLETE);
        }
        fail(fixture, "users:3", 0, node -> ((ObjectNode) node.path("userlist").get(1)).put("mobile", "1".repeat(33)), INCOMPLETE);
        fail(fixture, "users:3", 0, node -> ((ObjectNode) node.path("userlist").get(1)).put("email", "e".repeat(255)), INCOMPLETE);
    }

    private static void scopeExit(Fixture fixture) {
        for (int status : List.of(1, 2, 4)) {
            fixture.reset();
            fixture.change("user:private-Moved", 0, node -> node.put("status", status));
            ImOrgSnapshot snapshot = fixture.snapshot(scope(), Set.of("PRIVATE-ADA", "private-Moved"));
            equal(1, snapshot.outOfScopeMembers().size(), "only already managed absent member looked up");
            equal(status, snapshot.outOfScopeMembers().get(0).status(), "still-in-enterprise member retained for management release");
            equal(2, fixture.count("user:private-Moved"), "outside membership verified on two complete reads");
            equal(12, fixture.requests.size(), "in-scope account not fetched through individual lookup");
            unmodifiable(() -> snapshot.outOfScopeMembers().clear());
        }
        for (Consumer<ObjectNode> change : List.<Consumer<ObjectNode>>of(node -> node.put("userid", "different-user"),
                node -> node.put("status", 5), node -> node.put("status", 0), node -> node.remove("status"),
                node -> node.put("has_more", true), node -> node.putArray("department"))) {
            fixture.reset();
            fixture.change("user:private-Moved", 0, change);
            rejected(() -> fixture.snapshot(scope(), Set.of("private-Moved")), INCOMPLETE);
        }
        fixture.reset();
        fixture.change("user:private-Moved", 0, node -> node.putArray("department").add(999));
        rejected(() -> fixture.snapshot(scope(), Set.of("private-Moved")), SCOPE);
        fixture.reset();
        fixture.change("user:private-Moved", 0, node -> node.putArray("department").add(3));
        rejected(() -> fixture.snapshot(scope(), Set.of("private-Moved")), CHANGED);
        fixture.reset();
        fixture.change("user:private-Moved", 2, node -> node.put("name", "changed-between-reads"));
        rejected(() -> fixture.snapshot(scope(), Set.of("private-Moved")), CHANGED);
        for (int code : List.of(60111, 48002)) {
            fixture.reset();
            fixture.change("user:private-Moved", 0, node -> node.put("errcode", code).put("errmsg", TOKEN));
            rejected(() -> fixture.snapshot(scope(), Set.of("private-Moved")), "IM_PROVIDER_REJECTED");
            equal(1, fixture.count("user:private-Moved"), "lookup refusal never interpreted as release and not retried");
        }
        for (Set<String> invalid : List.of(Set.of("bad/id"), Set.of("private-Moved", "PRIVATE-MOVED"))) {
            fixture.reset();
            rejected(() -> fixture.snapshot(scope(), invalid), INCOMPLETE);
            equal(0, fixture.requests.size(), "invalid managed identifiers rejected before network");
        }
        fixture.reset();
        Set<String> mutable = new java.util.HashSet<>(Set.of("private-Moved"));
        fixture.change("agent", 1, node -> mutable.clear());
        equal(1, fixture.snapshot(scope(), mutable).outOfScopeMembers().size(), "managed selection frozen before network");
        fixture.reset();
        String special = "private-Moved@company.test=branch";
        equal(special, fixture.snapshot(scope(), Set.of(special)).outOfScopeMembers().get(0).id(), "query identity decoded exactly after safe encoding");
        fixture.reset();
        fixture.raw.set(request -> {
            if (request.key().equals("user:private-Moved")) {
                try { Thread.sleep(3500); }
                catch (InterruptedException failure) { Thread.currentThread().interrupt(); }
            }
            return request.body().toString();
        });
        rejected(() -> fixture.snapshot(scope(), Set.of("private-Moved")), "IM_PROVIDER_REJECTED");
    }

    private static void immutable(Fixture fixture) {
        fixture.reset();
        ImConfigRequest.SyncScope request = scope();
        List<Long> requested = new ArrayList<>(List.of(2L));
        Map<String, Long> primary = new HashMap<>(Map.of("private-Ada", 3L));
        request.setRemoteDepartmentIds(requested);
        request.setPrimaryDepartments(primary);
        fixture.change("agent", 1, node -> {
            request.setLocalRootDeptId(999L);
            requested.clear();
            primary.put("private-Ada", 999L);
        });
        ImOrgSnapshot snapshot = fixture.snapshot(request);
        equal(1000L, snapshot.localRootDeptId(), "request root frozen before first network request");
        equal(Set.of(2L), snapshot.roots(), "root collection frozen");
        equal(Map.of("private-Ada", 3L), snapshot.primaryDepartments(), "primary choices frozen");
        unmodifiable(() -> snapshot.members().clear());
        unmodifiable(() -> snapshot.departments().clear());
        unmodifiable(() -> snapshot.roots().clear());
        unmodifiable(() -> snapshot.primaryDepartments().clear());
        unmodifiable(() -> snapshot.members().get(0).departmentIds().clear());
        for (Object value : List.of(snapshot, snapshot.members().get(0), snapshot.departments().get(0),
                new ImOrgSnapshot.Field(true, "private@example.test"), ImOrgScope.copy(scope()))) {
            check(!value.toString().contains("private"), "diagnostic output hides personal identifiers and organization names");
        }
        for (Consumer<ImConfigRequest.SyncScope> invalid : List.<Consumer<ImConfigRequest.SyncScope>>of(
                value -> value.setLocalRootDeptId(null), value -> value.setLocalRootDeptId(0L), value -> value.setRemoteDepartmentIds(null),
                value -> value.setRemoteDepartmentIds(List.of()), value -> value.setRemoteDepartmentIds(List.of(2L, 2L)),
                value -> value.setRemoteDepartmentIds(java.util.Arrays.asList(2L, null)), value -> value.setRemoteDepartmentIds(List.of(-1L)),
                value -> value.setPrimaryDepartments(Map.of("private-Ada", 0L)), value -> value.setPrimaryDepartments(Map.of("bad id", 2L)),
                value -> value.setPrimaryDepartments(Map.of("private-Ada", 2L, "private-ADA", 3L)))) {
            fixture.reset();
            ImConfigRequest.SyncScope invalidRequest = scope();
            invalid.accept(invalidRequest);
            rejected(() -> fixture.snapshot(invalidRequest), CONFIGURATION);
            equal(0, fixture.requests.size(), "invalid scope cannot contact provider");
        }
        for (Map<String, Long> invalid : List.of(java.util.Collections.<String, Long>singletonMap(null, 2L),
                java.util.Collections.<String, Long>singletonMap("private-Ada", null))) {
            fixture.reset();
            ImConfigRequest.SyncScope invalidRequest = scope();
            invalidRequest.setPrimaryDepartments(invalid);
            rejected(() -> fixture.snapshot(invalidRequest), CONFIGURATION);
            equal(0, fixture.requests.size(), "null mapping gets safe error before network");
        }
        fixture.reset();
        rejected(() -> fixture.snapshot(null), CONFIGURATION);
        ImProperties disabled = new ImProperties();
        rejected(() -> new WeComOrgProvider(disabled, null).snapshot(ImSecurityChecks.fixture(), scope()), "IM_DISABLED");
        equal(0, fixture.requests.size(), "disabled provider makes no requests");
    }

    private static void bounds(Fixture fixture) {
        fixture.reset();
        AtomicLong clock = new AtomicLong();
        WeComOrgReader reader = new WeComOrgReader(fixture.sdk, clock::get);
        clock.set(Duration.ofMinutes(4).toNanos());
        rejected(() -> reader.departments(), INCOMPLETE);
        equal(0, fixture.requests.size(), "deadline prevents further network request");
        clock.set(0);
        fixture.change("departments", 1, node -> clock.set(Duration.ofMinutes(4).toNanos()));
        rejected(() -> reader.departments(), INCOMPLETE);
        equal(1, fixture.requests.size(), "late last response is rejected");
        fixture.reset();
        try {
            Thread.currentThread().interrupt();
            rejected(() -> fixture.snapshot(scope()), INCOMPLETE);
            check(Thread.currentThread().isInterrupted(), "caller interruption preserved");
            equal(0, fixture.requests.size(), "interruption prevents requests");
        } finally { Thread.interrupted(); }
        fixture.reset();
        fixture.change("departments", 0, node -> {
            ArrayNode departments = JSON.createArrayNode();
            for (int identifier = 1; identifier <= 1001; identifier++) departments.add(department(identifier, identifier - 1));
            node.set("department", departments);
        });
        rejected(() -> fixture.snapshot(scope()), INCOMPLETE);
        fixture.reset();
        fixture.change("users:2", 0, node -> {
            ArrayNode members = JSON.createArrayNode();
            for (int identifier = 0; identifier <= 10000; identifier++) members.addObject();
            node.set("userlist", members);
        });
        rejected(() -> fixture.snapshot(scope()), INCOMPLETE);
        ImConfigRequest.SyncScope tooMany = scope();
        List<Long> roots = new ArrayList<>();
        for (long identifier = 1; identifier <= 101; identifier++) roots.add(identifier);
        tooMany.setRemoteDepartmentIds(roots);
        fixture.reset();
        rejected(() -> fixture.snapshot(tooMany), CONFIGURATION);
        equal(0, fixture.requests.size(), "root maximum checked before network");
    }

    private static void snapshotConstruction() {
        ImOrgSnapshot.Field absent = new ImOrgSnapshot.Field(false, null);
        rejected(() -> new ImOrgSnapshot.Field(true, null), INCOMPLETE);
        rejected(() -> new ImOrgSnapshot.Field(false, "private"), INCOMPLETE);
        rejected(() -> new ImOrgSnapshot.Department(1, 1, "private", 0), INCOMPLETE);
        rejected(() -> new ImOrgSnapshot.Member("private-Ada", "private", List.of(2L, 2L), 1, absent, absent, absent), INCOMPLETE);
        rejected(() -> new ImOrgSnapshot.Member("private-Ada", "private", List.of(2L), 1, null, absent, absent), INCOMPLETE);
        rejected(() -> new ImOrgSnapshot.Member("private-Ada", "private", List.of(2L), 1,
                new ImOrgSnapshot.Field(true, "1".repeat(33)), absent, absent), INCOMPLETE);
        ImOrgSnapshot.Department root = new ImOrgSnapshot.Department(2, 1, "private-root", 0);
        ImOrgSnapshot.Member member = new ImOrgSnapshot.Member("private-Ada", "private-name", List.of(2L), 1, absent, absent, absent);
        rejected(() -> construct(List.of(root, root), List.of(member)), INCOMPLETE);
        rejected(() -> construct(List.of(root), List.of(member, member)), INCOMPLETE);
        rejected(() -> construct(List.of(root, new ImOrgSnapshot.Department(3, 4, "private-outside", 0)), List.of(member)), INCOMPLETE);
        rejected(() -> construct(List.of(root), List.of(new ImOrgSnapshot.Member("outside", "private-name", List.of(4L), 1, absent, absent, absent))), INCOMPLETE);
        rejected(() -> construct(List.of(new ImOrgSnapshot.Department(2, 3, "private", 0), new ImOrgSnapshot.Department(3, 2, "private", 0)), List.of()), INCOMPLETE);
        rejected(() -> construct(java.util.Arrays.asList(root, null), List.of()), INCOMPLETE);
        rejected(() -> construct(List.of(root), java.util.Arrays.asList(member, null)), INCOMPLETE);
    }

    private static ImOrgSnapshot construct(List<ImOrgSnapshot.Department> departments, List<ImOrgSnapshot.Member> members) {
        return new ImOrgSnapshot(100, 200, 3, "corpA", 77, Instant.now(), 1000, Set.of(2L), Map.of(), departments, members);
    }

    private static void performance(Fixture fixture) {
        fixture.reset();
        fixture.change("users:2", 0, node -> {
            ArrayNode members = JSON.createArrayNode();
            for (int identifier = 0; identifier < 1000; identifier++) members.add(member("private-perf-" + identifier, 2));
            node.set("userlist", members);
        });
        fixture.change("users:3", 0, node -> node.set("userlist", JSON.createArrayNode()));
        long started = System.nanoTime();
        ImOrgSnapshot snapshot = fixture.snapshot(scope());
        long elapsed = Duration.ofNanos(System.nanoTime() - started).toMillis();
        equal(1000, snapshot.members().size(), "1000 unique members read and checked twice");
        check(elapsed < 300000, "1000 member read performance under five minutes");
        System.out.println("G4_WECOM_ORG_READ_PERFORMANCE: members=1000; departments=" + snapshot.departments().size()
                + "; requests=" + fixture.requests.size() + "; elapsed_ms=" + elapsed + "; under_5_minutes=true; complete_sync=false; vendor_service=false");
    }

    private static void fail(Fixture fixture, String endpoint, int occurrence, Consumer<ObjectNode> change, String reason) {
        fixture.reset();
        fixture.change(endpoint, occurrence, change);
        rejected(() -> fixture.snapshot(scope()), reason);
    }

    private static ImConfigRequest.SyncScope scope() {
        ImConfigRequest.SyncScope scope = new ImConfigRequest.SyncScope();
        scope.setLocalRootDeptId(1000L);
        scope.setRemoteDepartmentIds(List.of(2L));
        scope.setPrimaryDepartments(Map.of("private-Ada", 3L));
        return scope;
    }

    private static ObjectNode department(long identifier, long parent) {
        return JSON.createObjectNode().put("id", identifier).put("parentid", parent).put("name", "private-department-" + identifier).put("order", 0);
    }

    private static ObjectNode member(String identifier, long... departments) {
        ObjectNode result = JSON.createObjectNode().put("userid", identifier).put("name", "private-name-" + identifier).put("status", 1).putNull("email").put("avatar", "");
        ArrayNode values = result.putArray("department");
        for (long department : departments) values.add(department);
        return result;
    }

    private static ObjectNode payload(String key) {
        ObjectNode result = JSON.createObjectNode().put("errcode", 0);
        switch (key) {
            case "agent" -> {
                result.put("agentid", 77).put("close", 0);
                result.putObject("allow_partys").putArray("partyid").add(1);
            }
            case "departments" -> result.putArray("department").add(department(1, 0)).add(department(2, 1)).add(department(3, 2)).add(department(4, 1));
            case "users:2" -> result.putArray("userlist").add(member("private-Ada", 2, 3, 4));
            case "users:3" -> result.putArray("userlist").add(member("private-Ada", 2, 3, 4)).add(member("private-Bob", 3));
            default -> {
                if (key.startsWith("user:")) result.setAll(member(key.substring(5), 4));
                else result.put("errcode", 40003);
            }
        }
        return result;
    }

    private static final class Fixture implements AutoCloseable {
        private final HttpServer server;
        private final ExecutorService workers = Executors.newFixedThreadPool(2);
        private final List<URI> requests = new CopyOnWriteArrayList<>();
        private final Map<String, AtomicInteger> counts = new ConcurrentHashMap<>();
        private final List<Mutation> mutations = new CopyOnWriteArrayList<>();
        private final AtomicReference<Function<Request, String>> raw = new AtomicReference<>(request -> request.body().toString());
        private final AtomicReference<String> invalidated = new AtomicReference<>();
        private final AtomicInteger total = new AtomicInteger();
        private final WeComSdk sdk;

        private Fixture() throws IOException {
            server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            server.setExecutor(workers);
            server.createContext("/", this::serve);
            server.start();
            URI local = URI.create("http://127.0.0.1:" + server.getAddress().getPort());
            WeComHttp http = new WeComHttp(WeComHttp.directClient(), official -> local.resolve(official.getRawPath() + "?" + official.getRawQuery()), Duration.ofSeconds(3));
            sdk = new WeComSdk(ImSecurityChecks.fixture(), http, () -> TOKEN, invalidated::set);
        }

        private void reset() {
            requests.clear();
            counts.clear();
            mutations.clear();
            invalidated.set(null);
            raw.set(request -> request.body().toString());
        }

        private void change(String key, int occurrence, Consumer<ObjectNode> change) { mutations.add(new Mutation(key, occurrence, change)); }
        private int count(String key) { return counts.getOrDefault(key, new AtomicInteger()).get(); }
        private ImOrgSnapshot snapshot(ImConfigRequest.SyncScope scope) { return WeComOrgProvider.snapshot(sdk, ImSecurityChecks.fixture(), scope); }
        private ImOrgSnapshot snapshot(ImConfigRequest.SyncScope scope, Set<String> managed) { return WeComOrgProvider.snapshot(sdk, ImSecurityChecks.fixture(), scope, managed); }

        private void serve(HttpExchange exchange) throws IOException {
            URI uri = exchange.getRequestURI();
            requests.add(uri);
            total.incrementAndGet();
            String key = switch (uri.getPath()) {
                case "/cgi-bin/agent/get" -> "agent";
                case "/cgi-bin/department/list" -> "departments";
                case "/cgi-bin/user/list" -> "users:" + uri.getRawQuery().replaceFirst(".*department_id=([0-9]+).*", "$1");
                case "/cgi-bin/user/get" -> "user:" + java.net.URLDecoder.decode(uri.getRawQuery().replaceFirst(".*userid=([^&]+).*", "$1"), StandardCharsets.UTF_8);
                default -> "unsupported";
            };
            int occurrence = counts.computeIfAbsent(key, ignored -> new AtomicInteger()).incrementAndGet();
            ObjectNode body = payload(key);
            for (Mutation mutation : mutations) {
                if (mutation.key().equals(key) && (mutation.occurrence() == 0 || mutation.occurrence() == occurrence)) mutation.change().accept(body);
            }
            byte[] bytes = raw.get().apply(new Request(key, occurrence, body)).getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            try {
                exchange.sendResponseHeaders(200, bytes.length);
                exchange.getResponseBody().write(bytes);
            } finally { exchange.close(); }
        }

        @Override
        public void close() { server.stop(0); workers.shutdownNow(); }
    }

    private record Request(String key, int occurrence, ObjectNode body) { }
    private record Mutation(String key, int occurrence, Consumer<ObjectNode> change) { }
    private static void check(boolean result, String name) { assertions++; if (!result) throw new AssertionError(name); }
    private static void equal(Object expected, Object actual, String name) { check(Objects.equals(expected, actual), name); }
    private static void unmodifiable(Runnable action) {
        try { action.run(); throw new AssertionError("collection must be immutable"); }
        catch (UnsupportedOperationException expected) { assertions++; }
    }
    private static void rejected(Runnable action, String reason) {
        try { action.run(); throw new AssertionError("expected " + reason); }
        catch (ImFailure failure) {
            equal(reason, failure.getReasonCode(), "safe reason expected=" + reason + ", actual=" + failure.getReasonCode());
            check(failure.getCause() == null && !failure.getMessage().contains("private") && !failure.getMessage().contains(TOKEN), "safe failure has no personal data or nested cause");
        }
    }
}
