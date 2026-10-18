package com.cloudflow.auth.im;

import com.cloudflow.auth.mapper.ImCallbackMapper;
import com.cloudflow.common.tenant.TenantBroker;
import com.cloudflow.common.tenant.TenantContext;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class ImCallbackRecovery {
    private final ImCallbackMapper mapper;
    private final ImCallbackProcessor processor;
    private final ImProperties properties;
    private final AtomicLong cursor = new AtomicLong();

    public Sweep recoverDue() {
        if (!properties.isEnabled() || Thread.currentThread().isInterrupted()) return new Sweep(0, 0, 0, 0);
        long deadline = System.nanoTime() + Duration.ofMinutes(3).toNanos();
        List<Target> targets;
        boolean previousSkip = TenantContext.getTenantSkip();
        try { targets = TenantBroker.applyWithoutTenant(ignored -> mapper.recoveryTargets(cursor.get(), 100)); }
        finally { if (previousSkip) TenantContext.setTenantSkip(); }
        int attempted = 0;
        int recorded = 0;
        int waiting = 0;
        int failed = 0;
        for (Target target : targets) {
            if (Thread.currentThread().isInterrupted() || System.nanoTime() >= deadline) break;
            cursor.set(target.callbackId()); attempted++;
            try {
                if (processor.process(target.tenantId(), target.callbackId())) recorded++;
                else waiting++;
            } catch (RuntimeException failure) { failed++; }
        }
        if (targets.size() < 100 && attempted == targets.size()) cursor.set(0);
        return new Sweep(attempted, recorded, waiting, failed);
    }

    public record Target(long tenantId, long callbackId) { }
    public record Sweep(int attempted, int recorded, int waiting, int failed) { }
}
