package com.cloudflow.auth.im;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.time.Instant;
import java.util.Set;

final class ImTodoContent {
    private static final ObjectMapper JSON = new ObjectMapper();
    private ImTodoContent() { }

    static String send(WeComCredentials credentials, ImTodoProvider.Card card, String publicUrl) {
        if (credentials == null || card == null || !ImMessageContent.member(card.member()) || card.cardKey() == null
                || !card.cardKey().matches("[A-Za-z0-9_-]{43}") || card.fields().size() > 5) throw ImFailure.configuration();
        String link = ImMessageContent.destination(publicUrl, card.detailUrl());
        if (link == null) throw ImFailure.configuration();
        ObjectNode root = JSON.createObjectNode();
        root.put("touser", card.member()); root.put("agentid", credentials.agentId()); root.put("msgtype", "template_card");
        root.put("enable_id_trans", 0); root.put("enable_duplicate_check", 1); root.put("duplicate_check_interval", 14400);
        ObjectNode content = root.putObject("template_card");
        content.put("card_type", "button_interaction"); content.put("task_id", card.cardKey());
        content.putObject("main_title").put("title", text(card.title(), 36)).put("desc", "发起人：" + text(card.initiator(), 38));
        if (!card.fields().isEmpty()) {
            ArrayNode fields = content.putArray("horizontal_content_list");
            for (ImTodoProvider.Field field : card.fields()) {
                if (field == null) throw ImFailure.configuration();
                fields.addObject().put("keyname", text(field.label(), 16)).put("value", text(field.value(), 128));
            }
        }
        content.putObject("card_action").put("type", 1).put("url", link);
        ArrayNode buttons = content.putArray("button_list");
        if (card.directAction()) {
            buttons.addObject().put("text", "同意").put("style", 1).put("key", "APPROVE");
            buttons.addObject().put("text", "驳回").put("style", 2).put("key", "REJECT");
        }
        buttons.addObject().put("type", 1).put("text", "查看详情").put("url", link);
        return json(root);
    }

    static String terminal(WeComCredentials credentials, ImTodoProvider.Completion completion, Instant now) {
        if (credentials == null || completion == null || !ImMessageContent.member(completion.member())
                || !receipt(completion.responseCode()) || completion.expiresAt() == null || !completion.expiresAt().isAfter(now)
                || !Set.of("COMPLETED", "CANCELLED").contains(completion.state())) throw ImFailure.configuration();
        ObjectNode root = JSON.createObjectNode();
        root.putArray("userids").add(completion.member()); root.put("agentid", credentials.agentId());
        root.put("response_code", completion.responseCode());
        root.putObject("button").put("replace_name", "COMPLETED".equals(completion.state()) ? "已处理" : "已失效，请进入系统查看");
        return json(root);
    }

    static boolean receipt(String value) {
        return value != null && !value.isBlank() && value.length() <= 4096
                && value.codePoints().noneMatch(character -> Character.isWhitespace(character) || Character.isISOControl(character));
    }

    private static String text(String value, int maximum) {
        if (value == null || value.isBlank() || value.length() > 1048576
                || value.codePoints().anyMatch(Character::isISOControl)) throw ImFailure.configuration();
        return value.codePointCount(0, value.length()) <= maximum ? value : value.substring(0, value.offsetByCodePoints(0, maximum - 1)) + "…";
    }

    private static String json(ObjectNode value) {
        try { return JSON.writeValueAsString(value); }
        catch (JsonProcessingException failure) { throw ImFailure.configuration(); }
    }
}
