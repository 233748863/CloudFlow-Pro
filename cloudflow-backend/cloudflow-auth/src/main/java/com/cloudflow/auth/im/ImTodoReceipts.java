package com.cloudflow.auth.im;

import com.cloudflow.auth.message.MessageDeliveryService;
import com.fasterxml.jackson.annotation.JsonIgnore;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.function.UnaryOperator;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class ImTodoReceipts {
    private static final Set<String> ACTIVE = Set.of("PENDING", "SENT", "UNKNOWN");
    private final ImDatabase database;
    private final MessageDeliveryService deliveries;

    public void capture(ImTodoRow todo, ImCardCallback event) {
        if (todo == null || todo.getDeliveryId() == null || event == null || event.responseCode() == null
                || !Objects.equals(todo.getImUserId(), event.externalUserId()) || !Objects.equals(todo.getCardKeyHash(), event.cardKeyHash())
                || !ACTIVE.contains(Objects.toString(todo.getStatus(), ""))) return;
        update(todo, existing -> {
            String status = existing.get("terminalStatus");
            if (status != null && !"EXPIRED".equals(status)) return existing;
            if (ImTodoContent.receipt(existing.get("responseCode")) && instant(existing.get("expiresAt")).isAfter(Instant.now())) return existing;
            Map<String, String> receipt = new LinkedHashMap<>(existing);
            for (String key : Set.of("terminalStatus", "terminalState", "terminalOwner", "terminalClaimUntil")) receipt.remove(key);
            receipt.put("responseCode", event.responseCode()); receipt.put("expiresAt", event.responseExpiresAt().toString());
            return Map.copyOf(receipt);
        });
    }

    public Lease claim(ImTodoRow todo, String terminalState) {
        if (!Set.of("COMPLETED", "CANCELLED").contains(Objects.toString(terminalState, ""))) throw ImFailure.callback();
        String owner = UUID.randomUUID().toString();
        Instant now = Instant.now();
        Map<String, String> receipt = update(todo, existing -> {
            String status = existing.get("terminalStatus");
            if ("CLAIMED".equals(status) && !instant(existing.get("terminalClaimUntil")).isAfter(now)) {
                return with(existing, Map.of("terminalStatus", "UNKNOWN"));
            }
            if (status != null) return existing;
            if (!ImTodoContent.receipt(existing.get("responseCode"))) return existing;
            if (!instant(existing.get("expiresAt")).isAfter(now)) return with(existing, Map.of("terminalStatus", "EXPIRED", "terminalState", terminalState));
            return with(existing, Map.of("terminalStatus", "CLAIMED", "terminalState", terminalState,
                    "terminalOwner", owner, "terminalClaimUntil", now.plusSeconds(60).toString()));
        });
        if (!owner.equals(receipt.get("terminalOwner")) || !"CLAIMED".equals(receipt.get("terminalStatus"))) return null;
        return new Lease(owner, receipt.get("responseCode"), instant(receipt.get("expiresAt")), terminalState);
    }

    public String finish(ImTodoRow todo, Lease lease, String result) {
        if (lease == null || !Set.of("APPLIED", "UNKNOWN", "FAILED", "EXPIRED").contains(Objects.toString(result, ""))) throw ImFailure.callback();
        Map<String, String> receipt = update(todo, existing -> {
            if (!lease.owner().equals(existing.get("terminalOwner")) || !"CLAIMED".equals(existing.get("terminalStatus"))
                    || !lease.state().equals(existing.get("terminalState"))) return existing;
            return with(existing, Map.of("terminalStatus", instant(existing.get("terminalClaimUntil")).isAfter(Instant.now()) ? result : "UNKNOWN"));
        });
        return Objects.toString(receipt.get("terminalStatus"), "MISSING");
    }

    public Status status(ImTodoRow todo) {
        Map<String, String> receipt = update(todo, existing -> {
            if ("CLAIMED".equals(existing.get("terminalStatus")) && !instant(existing.get("terminalClaimUntil")).isAfter(Instant.now())) {
                return with(existing, Map.of("terminalStatus", "UNKNOWN"));
            }
            return existing;
        });
        return new Status(receipt.get("terminalState"), Objects.toString(receipt.get("terminalStatus"), "MISSING"));
    }

    private Map<String, String> update(ImTodoRow todo, UnaryOperator<Map<String, String>> action) {
        if (todo == null || todo.getTenantId() == null || todo.getDeliveryId() == null || !"WECOM".equals(todo.getImType())) throw ImFailure.callback();
        return database.read(todo.getTenantId(), ignored -> deliveries.updatePrivateReceipt(todo.getTenantId(), todo.getDeliveryId(),
                "cloudflow-auth", "IM_TASK_TODO", todo.getTaskId(), action).values());
    }

    private static Map<String, String> with(Map<String, String> existing, Map<String, String> changes) {
        Map<String, String> updated = new LinkedHashMap<>(existing); updated.putAll(changes); return Map.copyOf(updated);
    }

    private static Instant instant(String value) {
        try { return Instant.parse(value); }
        catch (RuntimeException invalid) { return Instant.EPOCH; }
    }

    public record Lease(@JsonIgnore String owner, @JsonIgnore String responseCode, Instant expiresAt, String state) {
        @Override public String toString() { return "ImTodoReceipts.Lease[protected]"; }
    }
    public record Status(String state, String outcome) { }
}
