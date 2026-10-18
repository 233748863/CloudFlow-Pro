package com.cloudflow.crm.service.receivable;

import com.cloudflow.crm.exception.CrmBusinessException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

public final class CrmRefundWorkflowModel {
    public static final String PROCESS_KEY = "crm_refund_review";
    public static final String OWNER = "customerOwnerApproverIds";
    public static final String FINANCE = "financeReviewerIds";
    public static final String SNAPSHOT = "refundApproval";
    private static final ObjectMapper JSON = new ObjectMapper().configure(SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS, true);

    private CrmRefundWorkflowModel() { }

    public static Map<String, String> stages(JsonNode model) {
        if (model == null || !model.isObject()) throw invalid();
        JsonNode nodes = model.path("nodes");
        JsonNode edges = model.path("edges");
        if (!nodes.isArray() || nodes.size() != 4 || !edges.isArray() || edges.size() != 3) throw invalid();
        Map<String, String> stages = new LinkedHashMap<>();
        Set<String> ids = new LinkedHashSet<>();
        for (JsonNode node : nodes) {
            String id = node.path("id").asText();
            String type = node.path("type").asText();
            if (id.isBlank() || !ids.add(id)) throw invalid();
            manual(node);
            String stage = type;
            if ("APPROVAL".equals(type)) {
                stage = node.path("approverValue").asText();
                if (!"VARIABLE_USER".equals(node.path("approverType").asText()) || !Set.of(OWNER, FINANCE).contains(stage)
                        || !disabled(node, "allowDelegate") || !disabled(node, "allowAddSign")) throw invalid();
                JsonNode sign = node.path("signType");
                if (FINANCE.equals(stage) ? !"ANY".equals(sign.asText()) : !sign.isMissingNode() && !sign.isNull() && !sign.asText().isBlank()) throw invalid();
                for (JsonNode configured : node.findValues("signType")) {
                    if (FINANCE.equals(stage) ? !"ANY".equals(configured.asText()) : !configured.isNull() && !configured.asText().isBlank()) throw invalid();
                }
            } else if (!Set.of("START", "END").contains(type)) throw invalid();
            if (stages.put(stage, id) != null) throw invalid();
        }
        List<String> order = List.of("START", OWNER, FINANCE, "END");
        if (!stages.keySet().equals(new LinkedHashSet<>(order))) throw invalid();
        Set<String> expected = new LinkedHashSet<>();
        for (int index = 0; index < order.size() - 1; index++) expected.add(stages.get(order.get(index)) + ":" + stages.get(order.get(index + 1)));
        Set<String> actual = new LinkedHashSet<>();
        for (JsonNode edge : edges) {
            unconditional(edge);
            actual.add(edge.path("source").asText() + ":" + edge.path("target").asText());
        }
        if (!expected.equals(actual)) throw invalid();
        return Map.of(OWNER, stages.get(OWNER), FINANCE, stages.get(FINANCE));
    }

    public static String digest(JsonNode model) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(JSON.writeValueAsBytes(model))); }
        catch (Exception failure) { throw new CrmBusinessException("退款审批模型无法核验"); }
    }

    private static JsonNode value(JsonNode node, String field) { return node.has(field) ? node.path(field) : node.path("props").path(field); }

    private static boolean disabled(JsonNode node, String field) {
        JsonNode configured = value(node, field);
        return configured.isBoolean() && !configured.booleanValue()
                && node.findValues(field).stream().allMatch(entry -> entry.isBoolean() && !entry.booleanValue());
    }

    private static void manual(JsonNode node) {
        unconditional(node);
        for (JsonNode entry : node.findValues("approveSelf")) if ("AUTO_SKIP".equals(entry.asText())) throw invalid();
        for (String field : List.of("allowSelection", "allowEdit", "allowRollback", "allowReduceSign", "allowAgent")) {
            for (JsonNode entry : node.findValues(field)) if (!entry.isNull() && (!entry.isBoolean() || entry.booleanValue())) throw invalid();
        }
        for (String field : List.of("slaHours", "slaAction", "inputs", "outputs", "triggers", "retry")) {
            for (JsonNode entry : node.findValues(field)) {
                if (!entry.isNull() && !(entry.isTextual() && entry.asText().isBlank())
                        && !(entry.isContainerNode() && entry.isEmpty()) && !(entry.isIntegralNumber() && entry.longValue() == 0)) throw invalid();
            }
        }
    }

    private static void unconditional(JsonNode source) {
        for (String field : List.of("condition", "conditionExpression", "expression", "conditions")) {
            for (JsonNode entry : source.findValues(field)) {
                if (!entry.isNull() && !(entry.isTextual() && entry.asText().isBlank()) && !(entry.isArray() && entry.isEmpty())) throw invalid();
            }
        }
    }

    private static CrmBusinessException invalid() {
        return new CrmBusinessException("退款审批模型须依次由客户业务负责人和另一名财务实际办理，禁止跳过、自审或变更审批人");
    }
}
