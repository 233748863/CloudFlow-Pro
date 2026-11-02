package com.cloudflow.common.audit.aop;

import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.audit.handle.ICompareHandle;
import com.cloudflow.common.audit.support.AuditChangeScope;
import org.aspectj.lang.ProceedingJoinPoint;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class AuditAspectTest {
    @Audit(name = "test", captureChanges = true)
    public void capturedOperation() {}

    private Audit annotation() throws Exception {
        return getClass().getMethod("capturedOperation").getAnnotation(Audit.class);
    }

    @Test
    void usesCapturedRecordsAndRestoresOuterScope() throws Throwable {
        ICompareHandle compare = mock(ICompareHandle.class);
        ProceedingJoinPoint call = mock(ProceedingJoinPoint.class);
        Audit audit = annotation();
        when(call.proceed()).thenAnswer(invocation -> {
            AuditChangeScope.capture("before", "after");
            return 42;
        });
        try (AuditChangeScope outer = AuditChangeScope.open()) {
            AuditChangeScope.capture("outerBefore", "outerAfter");
            assertEquals(42, new AuditAspect(compare).auditLog(call, audit));
            assertEquals("outerBefore", outer.before());
            AuditChangeScope.capture("restored", "updated");
            assertEquals("restored", outer.before());
        }
        verify(compare).compare("before", "after", call, audit);
        verifyNoMoreInteractions(compare);
    }

    @Test
    void exceptionRestoresScopeWithoutPublishingChanges() throws Throwable {
        ICompareHandle compare = mock(ICompareHandle.class);
        ProceedingJoinPoint call = mock(ProceedingJoinPoint.class);
        when(call.proceed()).thenAnswer(invocation -> {
            AuditChangeScope.capture("before", "after");
            throw new IllegalStateException("failed");
        });
        try (AuditChangeScope outer = AuditChangeScope.open()) {
            assertThrows(IllegalStateException.class, () -> new AuditAspect(compare).auditLog(call, annotation()));
            AuditChangeScope.capture("restored", "after");
            assertEquals("restored", outer.before());
        }
        try (AuditChangeScope next = AuditChangeScope.open()) {
            assertFalse(next.captured());
        }
        verifyNoInteractions(compare);
    }
}
