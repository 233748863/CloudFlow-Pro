package com.cloudflow.auth.im;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.List;

final class ImMessageContent {
    private static final ObjectMapper JSON = new ObjectMapper();

    private ImMessageContent() { }

    static String body(WeComCredentials credentials, ImMessageSender.Notice notice) {
        if (credentials == null || notice == null || !member(notice.externalUserId())) throw ImFailure.configuration();
        String title = text(notice.title(), true);
        String content = text(notice.content(), false);
        ObjectNode message = JSON.createObjectNode();
        message.put("touser", notice.externalUserId());
        message.put("agentid", credentials.agentId());
        message.put("enable_id_trans", 0);
        if (notice.linkUrl() == null) {
            String combined = title.isEmpty() ? content : title + "\n" + content;
            if (combined.getBytes(StandardCharsets.UTF_8).length > 2048) throw ImFailure.configuration();
            message.put("msgtype", "text");
            message.put("safe", 1);
            message.putObject("text").put("content", combined);
        } else {
            URI link = URI.create(notice.linkUrl());
            if (!"https".equals(link.getScheme()) || link.getHost() == null || link.getRawUserInfo() != null) throw ImFailure.configuration();
            message.put("msgtype", "template_card");
            ObjectNode card = message.putObject("template_card");
            card.put("card_type", "text_notice");
            card.putObject("main_title").put("title", summary(title.isEmpty() ? "消息通知" : title, 36));
            card.put("sub_title_text", summary(content, 160));
            card.putObject("card_action").put("type", 1).put("url", notice.linkUrl());
        }
        try { return JSON.writeValueAsString(message); }
        catch (JsonProcessingException failure) { throw ImFailure.configuration(); }
    }

    static String destination(String publicUrl, String linkUrl) {
        if (linkUrl == null || linkUrl.isBlank()) return null;
        String origin = ImConfigRules.origin(publicUrl);
        if (origin == null || linkUrl.length() > 2000 || linkUrl.contains("\\")
                || linkUrl.codePoints().anyMatch(character -> character <= 32 || character == 127)) throw ImFailure.configuration();
        try {
            URI link = URI.create(linkUrl);
            if (link.getRawUserInfo() != null || link.getRawAuthority() != null && link.getScheme() == null) throw ImFailure.configuration();
            URI absolute = link.isAbsolute() ? link : URI.create(origin).resolve(link);
            if (!origin.equals(ImConfigRules.origin(absolute.getScheme() + "://" + absolute.getRawAuthority()))
                    || !absolute.normalize().equals(absolute) || absolute.getRawFragment() != null
                    || absolute.getPath() == null || !absolute.getRawPath().equals(absolute.getPath())
                    || !absolute.getPath().matches("/(?:[A-Za-z0-9_-]+/)*[A-Za-z0-9_-]*")) throw ImFailure.configuration();
            for (String prefix : List.of("/api", "/auth", "/login", "/register")) {
                if (absolute.getPath().equals(prefix) || absolute.getPath().startsWith(prefix + "/")) throw ImFailure.configuration();
            }
            return absolute.toASCIIString();
        } catch (IllegalArgumentException failure) { throw ImFailure.configuration(); }
    }

    static boolean member(String value) {
        return value != null && !value.isBlank() && value.length() <= 128 && !"@all".equalsIgnoreCase(value)
                && value.codePoints().noneMatch(character -> Character.isWhitespace(character) || Character.isISOControl(character) || character == '|');
    }

    private static String text(String value, boolean optional) {
        if (value == null) { if (optional) return ""; throw ImFailure.configuration(); }
        if (value.length() > 1_048_576 || value.codePoints().anyMatch(character -> Character.isISOControl(character)
                && character != '\n' && character != '\r' && character != '\t')) throw ImFailure.configuration();
        String normalized = value.replace("\r\n", "\n").replace('\r', '\n').strip();
        if (!optional && normalized.isEmpty()) throw ImFailure.configuration();
        return normalized;
    }

    private static String summary(String value, int maximum) {
        return value.codePointCount(0, value.length()) <= maximum ? value : value.substring(0, value.offsetByCodePoints(0, maximum - 1)) + "…";
    }
}
