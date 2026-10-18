package com.cloudflow.auth.im;

import com.cloudflow.common.message.channel.ChannelSendResult;
import com.fasterxml.jackson.annotation.JsonIgnore;
import java.time.Instant;
import java.util.List;

public interface ImTodoProvider {
    String providerType();
    ChannelSendResult send(WeComCredentials credentials, Card card);
    ChannelSendResult terminal(WeComCredentials credentials, Completion completion);

    record Field(@JsonIgnore String label, @JsonIgnore String value) {
        @Override public String toString() { return "ImTodoProvider.Field[protected]"; }
    }

    record Card(@JsonIgnore String member, @JsonIgnore String cardKey, @JsonIgnore String title,
            @JsonIgnore String initiator, @JsonIgnore List<Field> fields, @JsonIgnore String detailUrl, boolean directAction) {
        public Card { fields = fields == null ? List.of() : List.copyOf(fields); }
        @Override public String toString() { return "ImTodoProvider.Card[protected]"; }
    }

    record Completion(@JsonIgnore String member, @JsonIgnore String responseCode, Instant expiresAt, String state) {
        @Override public String toString() { return "ImTodoProvider.Completion[protected]"; }
    }
}
