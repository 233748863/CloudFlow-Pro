package com.cloudflow.auth.im;

import com.cloudflow.common.message.channel.ChannelSendResult;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.util.List;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Component
public class WeComMessageSender implements ImMessageSender {
    private final ImProperties properties;
    private final ImAccessTokens tokens;
    private final WeComHttp http = new WeComHttp();

    public WeComMessageSender(ImProperties properties, ImAccessTokens tokens) {
        this.properties = properties;
        this.tokens = tokens;
    }

    @Override public String providerType() { return "WECOM"; }

    @Override
    public ChannelSendResult send(WeComCredentials credentials, Notice notice) {
        if (!properties.isEnabled()) return ChannelSendResult.skipped("IM_DISABLED");
        WeComSdk sdk = new WeComSdk(credentials, http, () -> tokens.resolve(credentials,
                () -> WeComSdk.fetchToken(credentials, http)), rejected -> tokens.discard(credentials, rejected));
        return send(sdk, credentials, notice);
    }

    static ChannelSendResult send(WeComSdk sdk, WeComCredentials credentials, Notice notice) {
        if (TransactionSynchronizationManager.isActualTransactionActive()) throw new IllegalStateException("IM_MESSAGE_TRANSACTION_INVALID");
        String body;
        try { body = ImMessageContent.body(credentials, notice); }
        catch (RuntimeException failure) { return ChannelSendResult.failed("IM_MESSAGE_CONTENT_INVALID"); }
        String response;
        try { response = sdk.post("https://qyapi.weixin.qq.com/cgi-bin/message/send", body); }
        catch (ImFailure failure) {
            if ("IM_PROVIDER_UNCERTAIN".equals(failure.getReasonCode())) return ChannelSendResult.unknown("IM_MESSAGE_OUTCOME_UNKNOWN");
            if ("IM_TOKEN_REJECTED".equals(failure.getReasonCode())) return ChannelSendResult.retryable("IM_MESSAGE_TOKEN_REJECTED");
            if ("IM_PROVIDER_REJECTED".equals(failure.getReasonCode())) {
                Integer code = failure.getProviderErrorCode();
                return code == null || code == -1 || code == 45009 ? ChannelSendResult.retryable("IM_MESSAGE_PROVIDER_UNAVAILABLE")
                        : ChannelSendResult.failed("IM_MESSAGE_PROVIDER_REJECTED");
            }
            return ChannelSendResult.failed("IM_MESSAGE_CONFIGURATION_INVALID");
        } catch (RuntimeException failure) { return ChannelSendResult.unknown("IM_MESSAGE_OUTCOME_UNKNOWN"); }
        try {
            JsonNode result = new ObjectMapper().readTree(response);
            if (result == null || !result.isObject() || !result.path("errcode").isIntegralNumber() || result.path("errcode").intValue() != 0) {
                return ChannelSendResult.unknown("IM_MESSAGE_OUTCOME_UNKNOWN");
            }
            for (String field : List.of("invaliduser", "unlicenseduser", "invalidparty", "invalidtag")) {
                if (!result.has(field)) continue;
                if (!result.path(field).isTextual()) return ChannelSendResult.unknown("IM_MESSAGE_OUTCOME_UNKNOWN");
                if (!result.path(field).textValue().isEmpty()) {
                    if (List.of("invaliduser", "unlicenseduser").contains(field)
                            && result.path(field).textValue().equalsIgnoreCase(notice.externalUserId())) {
                        return ChannelSendResult.failed("IM_MESSAGE_RECIPIENT_REJECTED");
                    }
                    return ChannelSendResult.unknown("IM_MESSAGE_OUTCOME_UNKNOWN");
                }
            }
            JsonNode identifier = result.path("msgid");
            if (!identifier.isTextual() || identifier.textValue().isBlank() || identifier.textValue().length() > 255
                    || identifier.textValue().codePoints().anyMatch(character -> Character.isWhitespace(character) || Character.isISOControl(character))) {
                return ChannelSendResult.unknown("IM_MESSAGE_OUTCOME_UNKNOWN");
            }
            return ChannelSendResult.accepted(identifier.textValue());
        } catch (IOException | RuntimeException failure) { return ChannelSendResult.unknown("IM_MESSAGE_OUTCOME_UNKNOWN"); }
    }
}
