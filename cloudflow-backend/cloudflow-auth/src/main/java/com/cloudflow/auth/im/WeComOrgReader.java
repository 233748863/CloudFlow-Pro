package com.cloudflow.auth.im;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.function.LongSupplier;

final class WeComOrgReader {
    static final int MAX_DEPARTMENTS = 1000;
    static final int MAX_MEMBERS = 10000;
    private final WeComSdk sdk;
    private final ObjectMapper json = new ObjectMapper();
    private final LongSupplier clock;
    private final long started;

    WeComOrgReader(WeComSdk sdk) { this(sdk, System::nanoTime); }

    WeComOrgReader(WeComSdk sdk, LongSupplier clock) {
        this.sdk = sdk;
        this.clock = clock;
        this.started = clock.getAsLong();
    }

    Set<Long> visibility(long agentId) {
        JsonNode result = read("/cgi-bin/agent/get?agentid=" + agentId);
        if (positive(result.path("agentid")) != agentId || integer(result.path("close")) != 0) throw ImFailure.orgScope();
        JsonNode values = result.path("allow_partys").path("partyid");
        if (!values.isArray() || values.isEmpty() || values.size() > MAX_DEPARTMENTS) throw ImFailure.orgScope();
        Set<Long> allowed = new TreeSet<>();
        for (JsonNode value : values) if (!allowed.add(positive(value))) throw ImFailure.orgIncomplete();
        return Set.copyOf(allowed);
    }

    Map<Long, ImOrgSnapshot.Department> departments() {
        JsonNode values = array(read("/cgi-bin/department/list"), "department", MAX_DEPARTMENTS);
        Map<Long, ImOrgSnapshot.Department> result = new TreeMap<>();
        for (JsonNode value : values) {
            long id = positive(value.path("id"));
            long parentId = integer(value.path("parentid"));
            long order = value.has("order") ? integer(value.path("order")) : 0;
            if (parentId < 0 || parentId == id || order < 0 || order > 4294967295L) throw ImFailure.orgIncomplete();
            ImOrgSnapshot.Department department = new ImOrgSnapshot.Department(id, parentId, text(value.path("name"), 100), order);
            if (result.putIfAbsent(id, department) != null) throw ImFailure.orgIncomplete();
        }
        return Map.copyOf(result);
    }

    Map<String, ImOrgSnapshot.Member> members(Set<Long> selected) {
        Map<String, ImOrgSnapshot.Member> result = new TreeMap<>();
        Map<String, Set<Long>> observed = new HashMap<>();
        Map<String, String> identifiers = new HashMap<>();
        for (Long departmentId : new TreeSet<>(selected)) {
            JsonNode values = array(read("/cgi-bin/user/list?department_id=" + departmentId), "userlist", MAX_MEMBERS);
            Set<String> batch = new HashSet<>();
            for (JsonNode value : values) {
                String id = text(value.path("userid"), 128);
                if (!id.matches("[A-Za-z0-9_.@=-]{1,128}") || !batch.add(id)) throw ImFailure.orgIncomplete();
                String previousCase = identifiers.putIfAbsent(id.toLowerCase(Locale.ROOT), id);
                if (previousCase != null && !previousCase.equals(id)) throw ImFailure.orgIncomplete();
                List<Long> memberDepartments = departmentIds(value.path("department"));
                if (!memberDepartments.contains(departmentId)) throw ImFailure.orgIncomplete();
                long status = integer(value.path("status"));
                if (status != 1 && status != 2 && status != 4 && status != 5) throw ImFailure.orgIncomplete();
                ImOrgSnapshot.Member member = new ImOrgSnapshot.Member(id, text(value.path("name"), 100), memberDepartments,
                        (int) status, field(value, "mobile", 32), field(value, "email", 254), field(value, "avatar", 1000));
                ImOrgSnapshot.Member previous = result.putIfAbsent(id, member);
                if (previous != null && !previous.equals(member)) throw ImFailure.orgChanged();
                if (result.size() > MAX_MEMBERS) throw ImFailure.orgIncomplete();
                observed.computeIfAbsent(id, ignored -> new HashSet<>()).add(departmentId);
            }
        }
        for (ImOrgSnapshot.Member member : result.values()) {
            Set<Long> expected = new HashSet<>(member.departmentIds());
            expected.retainAll(selected);
            if (!expected.equals(observed.get(member.id()))) throw ImFailure.orgIncomplete();
        }
        return Map.copyOf(result);
    }

    Map<String, ImOrgSnapshot.Member> outOfScope(Set<String> managed, Map<String, ImOrgSnapshot.Member> members,
            Set<Long> selected, Set<Long> knownDepartments) {
        if (managed == null || managed.size() > ImLocalOrganization.MAX_LOCAL_USERS || managed.stream().anyMatch(identifier -> identifier == null)) throw ImFailure.orgIncomplete();
        Set<String> observed = new HashSet<>();
        members.keySet().forEach(identifier -> observed.add(identifier.toLowerCase(Locale.ROOT)));
        Set<String> requested = new HashSet<>();
        Map<String, ImOrgSnapshot.Member> result = new TreeMap<>();
        for (String identifier : new TreeSet<>(managed)) {
            if (identifier == null || !identifier.matches("[A-Za-z0-9_.@=-]{1,128}")
                    || !requested.add(identifier.toLowerCase(Locale.ROOT))) throw ImFailure.orgIncomplete();
            if (observed.contains(identifier.toLowerCase(Locale.ROOT))) continue;
            JsonNode value = read("/cgi-bin/user/get?userid=" + java.net.URLEncoder.encode(identifier, java.nio.charset.StandardCharsets.UTF_8));
            String returnedId = text(value.path("userid"), 128);
            if (!identifier.equalsIgnoreCase(returnedId)) throw ImFailure.orgIncomplete();
            List<Long> departments = departmentIds(value.path("department"));
            if (!knownDepartments.containsAll(departments)) throw ImFailure.orgScope();
            if (departments.stream().anyMatch(selected::contains)) throw ImFailure.orgChanged();
            long status = integer(value.path("status"));
            if (status != 1 && status != 2 && status != 4) throw ImFailure.orgIncomplete();
            result.put(identifier, new ImOrgSnapshot.Member(returnedId, text(value.path("name"), 100), departments,
                    (int) status, field(value, "mobile", 32), field(value, "email", 254), field(value, "avatar", 1000)));
        }
        return Map.copyOf(result);
    }

    private JsonNode read(String path) {
        requireTime();
        try {
            JsonNode result = json.readTree(sdk.get("https://qyapi.weixin.qq.com" + path, null));
            requireTime();
            if (result == null || !result.isObject() || result.has("next_cursor") || result.has("has_more")) {
                throw ImFailure.orgIncomplete();
            }
            return result;
        } catch (JsonProcessingException failure) { throw ImFailure.orgIncomplete(); }
    }

    private void requireTime() {
        if (ImSyncBudget.active()) ImSyncBudget.check();
        if (Thread.currentThread().isInterrupted() || clock.getAsLong() - started >= Duration.ofMinutes(4).toNanos()) {
            throw ImFailure.orgIncomplete();
        }
    }

    private static JsonNode array(JsonNode result, String name, int maximum) {
        JsonNode array = result.path(name);
        if (!array.isArray() || array.size() > maximum) throw ImFailure.orgIncomplete();
        return array;
    }

    private static List<Long> departmentIds(JsonNode array) {
        if (!array.isArray() || array.isEmpty() || array.size() > MAX_DEPARTMENTS) throw ImFailure.orgIncomplete();
        Set<Long> values = new TreeSet<>();
        for (JsonNode node : array) if (!values.add(positive(node))) throw ImFailure.orgIncomplete();
        return new ArrayList<>(values);
    }

    private static ImOrgSnapshot.Field field(JsonNode node, String name, int maximum) {
        JsonNode value = node.get(name);
        if (value == null || value.isNull()) return new ImOrgSnapshot.Field(false, null);
        if (!value.isTextual() || value.textValue().length() > maximum || value.textValue().codePoints().anyMatch(Character::isISOControl)) {
            throw ImFailure.orgIncomplete();
        }
        return new ImOrgSnapshot.Field(true, value.textValue());
    }

    private static long positive(JsonNode node) {
        long value = integer(node);
        if (value <= 0) throw ImFailure.orgIncomplete();
        return value;
    }

    private static long integer(JsonNode node) {
        if (!node.isIntegralNumber() || !node.canConvertToLong()) throw ImFailure.orgIncomplete();
        return node.longValue();
    }

    private static String text(JsonNode node, int maximum) {
        if (!node.isTextual() || node.textValue().isBlank() || node.textValue().length() > maximum
                || node.textValue().codePoints().anyMatch(Character::isISOControl)) throw ImFailure.orgIncomplete();
        return node.textValue();
    }
}
