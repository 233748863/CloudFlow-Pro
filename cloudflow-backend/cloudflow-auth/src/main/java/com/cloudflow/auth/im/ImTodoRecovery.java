package com.cloudflow.auth.im;

import com.cloudflow.auth.domain.SysMessageDelivery;
import com.cloudflow.auth.mapper.ImTodoMapper;
import com.cloudflow.auth.message.MessageDeliveryService;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.security.im.ImTaskTodos;
import com.cloudflow.common.tenant.TenantBroker;
import com.cloudflow.common.tenant.TenantContext;
import java.time.Duration;
import java.util.List;
import java.util.Objects;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Supplier;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class ImTodoRecovery {
    private final ImProperties properties;
    private final ImTodoMapper mapper;
    private final ImDatabase database;
    private final ImTodoScanClient workflow;
    private final ImTodoRegistration registration;
    private final MessageDeliveryService deliveries;
    private final ImTodoReconciler reconciler;
    private final AtomicReference<String> taskCursor = new AtomicReference<>("");
    private final AtomicLong mappingCursor = new AtomicLong();

    public Sweep recoverDue() {
        if (!properties.isEnabled() || Thread.currentThread().isInterrupted()) return new Sweep(0, 0, 0);
        int processed = 0;
        int synchronizedRows = 0;
        int failed = 0;
        long scanDeadline = System.nanoTime() + Duration.ofSeconds(90).toNanos();
        if (unscoped(mapper::enabledConfigurations) > 0) {
            try {
                R<ImTaskTodos.Page> response = workflow.scan(new ImTaskTodos.Scan(taskCursor.get()));
                if (response == null || !response.isSuccess() || response.getData() == null) throw ImFailure.callbackUnavailable();
                ImTaskTodos.Page page = response.getData();
                boolean finished = true;
                for (ImTaskTodos.Candidate candidate : page.candidates()) {
                    if (Thread.currentThread().isInterrupted() || System.nanoTime() >= scanDeadline) { finished = false; break; }
                    for (Long receiver : candidate.receivers()) {
                        try {
                            Long deliveryId = registration.register(candidate, receiver);
                            if (deliveryId != null) {
                                database.read(candidate.tenantId(), ignored -> { deliveries.deliver(candidate.tenantId(), deliveryId); return null; });
                                if (synchronize(candidate.tenantId(), deliveryId)) synchronizedRows++;
                            }
                        } catch (RuntimeException failure) { failed++; }
                    }
                    processed++;
                    taskCursor.set(candidate.taskId());
                }
                if (finished) taskCursor.set(Objects.toString(page.nextTaskId(), ""));
            } catch (RuntimeException failure) { failed++; }
        }
        long stateDeadline = System.nanoTime() + Duration.ofSeconds(90).toNanos();
        List<ImTodoRow> rows = unscoped(() -> mapper.pending(mappingCursor.get()));
        int checked = 0;
        for (ImTodoRow row : rows) {
            if (Thread.currentThread().isInterrupted() || System.nanoTime() >= stateDeadline) break;
            try {
                boolean changed = synchronize(row.getTenantId(), row.getDeliveryId());
                if (reconciler.reconcile(row.getTenantId(), row.getDeliveryId()) || changed) synchronizedRows++;
            }
            catch (RuntimeException failure) { failed++; }
            mappingCursor.set(row.getMappingId()); checked++;
        }
        if (rows.size() < 100 && checked == rows.size()) mappingCursor.set(0);
        return new Sweep(processed, synchronizedRows, failed);
    }

    private boolean synchronize(long tenantId, long deliveryId) {
        return database.write(tenantId, ignored -> {
            ImTodoRow row = mapper.byDelivery(tenantId, deliveryId);
            if (row == null || !List.of("PENDING", "SENT", "UNKNOWN").contains(row.getStatus())) return false;
            SysMessageDelivery delivery = deliveries.getOwned(tenantId, deliveryId);
            String state = switch (delivery.getStatus()) {
                case "SENT" -> "SENT";
                case "UNKNOWN" -> "UNKNOWN";
                case "FAILED" -> "FAILED";
                case "SKIPPED", "CANCELLED" -> "CANCELLED";
                default -> row.getStatus();
            };
            if (Objects.equals(state, row.getStatus()) && Objects.equals(delivery.getProviderMessageId(), row.getImTodoId())) return false;
            return mapper.state(tenantId, row.getMappingId(), row.getVersion(), state, delivery.getProviderMessageId()) == 1;
        });
    }

    private <Result> Result unscoped(Supplier<Result> action) {
        boolean previousSkip = TenantContext.getTenantSkip();
        try { return TenantBroker.applyWithoutTenant(ignored -> action.get()); }
        finally { if (previousSkip) TenantContext.setTenantSkip(); }
    }

    public record Sweep(int scanned, int synchronizedRows, int failed) { }
}
