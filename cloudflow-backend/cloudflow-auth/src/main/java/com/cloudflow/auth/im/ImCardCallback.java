package com.cloudflow.auth.im;

import com.fasterxml.jackson.annotation.JsonIgnore;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;

public record ImCardCallback(String eventKey, String payloadHash, @JsonIgnore String externalUserId,
        String cardKeyHash, String action, LocalDateTime occurredTime, @JsonIgnore String responseCode, Instant responseExpiresAt) {
    public ImCardCallback(String eventKey, String payloadHash, String externalUserId, String cardKeyHash, String action, LocalDateTime occurredTime) {
        this(eventKey, payloadHash, externalUserId, cardKeyHash, action, occurredTime, null, null);
    }
    public ImCardCallback {
        if (eventKey == null || !eventKey.matches("wecom-card:[a-f0-9]{64}") || payloadHash == null || !payloadHash.matches("[a-f0-9]{64}")
                || !ImMessageContent.member(externalUserId) || cardKeyHash == null || !cardKeyHash.matches("[a-f0-9]{64}")
                || action == null || !List.of("APPROVE", "REJECT").contains(action) || occurredTime == null
                || responseCode == null && responseExpiresAt != null
                || responseCode != null && (!ImTodoContent.receipt(responseCode) || responseExpiresAt == null)) throw ImFailure.callback();
    }

    public static ImCardCallback parse(WeComCredentials credentials, WeComCallbackCodec.VerifiedCallback verified) {
        return parse(credentials, verified, Clock.systemUTC());
    }

    static ImCardCallback parse(WeComCredentials credentials, WeComCallbackCodec.VerifiedCallback verified, Clock clock) {
        if (credentials == null || verified == null || clock == null) throw ImFailure.callback();
        Map<String, String> fields = verified.fields();
        String member = fields.get("FromUserName");
        String created = fields.get("CreateTime");
        String action = fields.get("EventKey");
        String cardKey = fields.get("TaskId");
        if (!credentials.corpId().equals(fields.get("ToUserName")) || !Long.toString(credentials.agentId()).equals(fields.get("AgentID"))
                || !"event".equals(fields.get("MsgType")) || !"template_card_event".equals(fields.get("Event"))
                || !"button_interaction".equals(fields.get("CardType")) || !ImMessageContent.member(member)
                || action == null || !List.of("APPROVE", "REJECT").contains(action) || cardKey == null || !cardKey.matches("[A-Za-z0-9_-]{43}")
                || created == null || !created.matches("[1-9][0-9]{0,11}")) throw ImFailure.callback();
        long seconds = Long.parseLong(created);
        long now = clock.instant().getEpochSecond();
        if (seconds < now - 300 || seconds > now + 300) throw ImFailure.callback();
        String identity = String.join("\n", credentials.corpId(), Long.toString(credentials.agentId()), member, created, action, cardKey);
        return new ImCardCallback("wecom-card:" + hash(identity), verified.payloadHash(), member, hash(cardKey), action,
                LocalDateTime.ofInstant(Instant.ofEpochSecond(seconds), ZoneId.systemDefault()), fields.get("ResponseCode"),
                fields.get("ResponseCode") == null ? null : Instant.ofEpochSecond(seconds).plusSeconds(72 * 60 * 60));
    }

    static String hash(String value) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))); }
        catch (NoSuchAlgorithmException failure) { throw new IllegalStateException("IM_DIGEST_UNAVAILABLE"); }
    }

    @Override public String toString() { return "ImCardCallback[redacted]"; }
}
