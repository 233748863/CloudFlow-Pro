package com.cloudflow.auth.im;

import com.cloudflow.common.message.channel.ChannelSendResult;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Component
public class WeComTodoProvider implements ImTodoProvider {
    private final ImProperties properties;
    private final ImAccessTokens tokens;
    private final WeComHttp http = new WeComHttp();

    public WeComTodoProvider(ImProperties properties, ImAccessTokens tokens) { this.properties = properties; this.tokens = tokens; }
    @Override public String providerType() { return "WECOM"; }

    @Override public ChannelSendResult send(WeComCredentials credentials, Card card) {
        if (!properties.isEnabled()) return ChannelSendResult.skipped("IM_DISABLED");
        return send(sdk(credentials), credentials, card, properties.getPublicUrl());
    }

    @Override public ChannelSendResult terminal(WeComCredentials credentials, Completion completion) {
        if (!properties.isEnabled()) return ChannelSendResult.skipped("IM_DISABLED");
        return terminal(sdk(credentials), credentials, completion);
    }

    static ChannelSendResult send(WeComSdk sdk, WeComCredentials credentials, Card card, String publicUrl) {
        requireOutsideTransaction();
        String body;
        try { body = ImTodoContent.send(credentials, card, publicUrl); }
        catch (RuntimeException failure) { return ChannelSendResult.failed("IM_CARD_CONTENT_INVALID"); }
        Instant started = Instant.now();
        try {
            JsonNode result = new ObjectMapper().readTree(sdk.post("https://qyapi.weixin.qq.com/cgi-bin/message/send", body));
            if (!success(result)) return ChannelSendResult.unknown("IM_CARD_OUTCOME_UNKNOWN");
            for (String field : List.of("invaliduser", "unlicenseduser", "invalidparty", "invalidtag")) {
                if (!result.has(field)) continue;
                if (!result.path(field).isTextual()) return ChannelSendResult.unknown("IM_CARD_OUTCOME_UNKNOWN");
                if (!result.path(field).asText().isEmpty()) return List.of("invaliduser", "unlicenseduser").contains(field)
                        && card.member().equalsIgnoreCase(result.path(field).asText()) ? ChannelSendResult.failed("IM_CARD_RECIPIENT_REJECTED")
                        : ChannelSendResult.unknown("IM_CARD_OUTCOME_UNKNOWN");
            }
            String messageId = result.path("msgid").isTextual() ? result.path("msgid").asText() : null;
            String responseCode = result.path("response_code").isTextual() ? result.path("response_code").asText() : null;
            if (!ImTodoContent.receipt(messageId) || messageId.length() > 255 || !ImTodoContent.receipt(responseCode)) return ChannelSendResult.unknown("IM_CARD_RECEIPT_MISSING");
            ChannelSendResult accepted = ChannelSendResult.accepted(messageId);
            accepted.setPrivateReceipt(Map.of("responseCode", responseCode, "expiresAt", started.plus(Duration.ofHours(72)).toString()));
            return accepted;
        } catch (ImFailure failure) { return failure(failure); }
        catch (IOException | RuntimeException failure) { return ChannelSendResult.unknown("IM_CARD_OUTCOME_UNKNOWN"); }
    }

    static ChannelSendResult terminal(WeComSdk sdk, WeComCredentials credentials, Completion completion) {
        requireOutsideTransaction();
        if (completion != null && completion.expiresAt() != null && !completion.expiresAt().isAfter(Instant.now())) return ChannelSendResult.skipped("IM_CARD_UPDATE_EXPIRED");
        String body;
        try { body = ImTodoContent.terminal(credentials, completion, Instant.now()); }
        catch (RuntimeException failure) { return ChannelSendResult.failed("IM_CARD_UPDATE_INVALID"); }
        try {
            JsonNode result = new ObjectMapper().readTree(sdk.post("https://qyapi.weixin.qq.com/cgi-bin/message/update_template_card", body));
            if (!success(result)) return ChannelSendResult.unknown("IM_CARD_UPDATE_UNKNOWN");
            if (result.has("invaliduser")) {
                JsonNode invalid = result.path("invaliduser");
                if (!invalid.isArray()) return ChannelSendResult.unknown("IM_CARD_UPDATE_UNKNOWN");
                if (!invalid.isEmpty()) return invalid.size() == 1 && invalid.get(0).isTextual()
                        && completion.member().equalsIgnoreCase(invalid.get(0).asText()) ? ChannelSendResult.failed("IM_CARD_RECIPIENT_REJECTED")
                        : ChannelSendResult.unknown("IM_CARD_UPDATE_UNKNOWN");
            }
            return ChannelSendResult.success();
        } catch (ImFailure failure) { return failure(failure); }
        catch (IOException | RuntimeException failure) { return ChannelSendResult.unknown("IM_CARD_UPDATE_UNKNOWN"); }
    }

    private WeComSdk sdk(WeComCredentials credentials) {
        return new WeComSdk(credentials, http, () -> tokens.resolve(credentials, () -> WeComSdk.fetchToken(credentials, http)), rejected -> tokens.discard(credentials, rejected));
    }

    private static boolean success(JsonNode result) {
        return result != null && result.isObject() && result.path("errcode").isIntegralNumber() && result.path("errcode").intValue() == 0;
    }

    private static ChannelSendResult failure(ImFailure failure) {
        if ("IM_PROVIDER_UNCERTAIN".equals(failure.getReasonCode())) return ChannelSendResult.unknown("IM_CARD_OUTCOME_UNKNOWN");
        if ("IM_TOKEN_REJECTED".equals(failure.getReasonCode())) return ChannelSendResult.retryable("IM_CARD_TOKEN_REJECTED");
        if ("IM_PROVIDER_REJECTED".equals(failure.getReasonCode())) {
            Integer code = failure.getProviderErrorCode();
            return code == null || code == -1 || code == 45009 ? ChannelSendResult.retryable("IM_CARD_PROVIDER_UNAVAILABLE") : ChannelSendResult.failed("IM_CARD_PROVIDER_REJECTED");
        }
        return ChannelSendResult.failed("IM_CARD_CONFIGURATION_INVALID");
    }

    private static void requireOutsideTransaction() {
        if (TransactionSynchronizationManager.isActualTransactionActive()) throw new IllegalStateException("IM_CARD_TRANSACTION_INVALID");
    }
}
