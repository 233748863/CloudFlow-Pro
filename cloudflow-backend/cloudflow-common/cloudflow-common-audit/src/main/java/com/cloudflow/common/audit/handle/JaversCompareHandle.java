package com.cloudflow.common.audit.handle;

import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.audit.support.DataAuditor;
import com.cloudflow.common.audit.support.AuditSnapshotContext;
import com.cloudflow.common.audit.support.SpelParser;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.aspectj.lang.ProceedingJoinPoint;
import org.javers.core.Changes;
import org.springframework.aop.support.AopUtils;
import org.springframework.util.StringUtils;

import java.util.Optional;

/**
 * Javers 差异比较实现
 * <p>
 * 使用 Javers 比较方法执行前后的对象差异，
 * 并将变更交给 {@link IAuditLogHandle} 处理。
 * </p>
 *
 * @author CloudFlow
 */
@RequiredArgsConstructor
@Slf4j
public class JaversCompareHandle implements ICompareHandle {

    private final Optional<IAuditLogHandle> auditLogHandleOptional;

    @Override
    public void compare(Object oldVal, ProceedingJoinPoint joinPoint, Audit audit) {
        Class<?> sourceClass = joinPoint.getTarget() == null ? null : AopUtils.getTargetClass(joinPoint.getTarget());
        try {
            Object before = oldVal;
            Object after;
            if (audit.providedSnapshots()) {
                AuditSnapshotContext.Snapshots snapshots = AuditSnapshotContext.current();
                if (snapshots == null) return;
                before = snapshots.before();
                after = snapshots.after();
            } else {
                after = SpelParser.parser(joinPoint,
                        StringUtils.hasText(audit.newVal()) ? audit.newVal() : audit.spel());
            }
            Changes changes = DataAuditor.compare(before, after);
            if (auditLogHandleOptional.isPresent()) {
                auditLogHandleOptional.get().handle(audit, changes, before, after, sourceClass);
            }
        } catch (RuntimeException failure) {
            comparisonFailed(joinPoint, audit, failure);
        }
    }

    @Override
    public void comparisonFailed(ProceedingJoinPoint joinPoint, Audit audit, RuntimeException failure) {
        Class<?> sourceClass = joinPoint.getTarget() == null ? null : AopUtils.getTargetClass(joinPoint.getTarget());
        log.error("审计比较失败: audit={}, source={}, failureType={}", audit.name(),
                sourceClass == null ? null : sourceClass.getName(), failure.getClass().getName());
        auditLogHandleOptional.ifPresent(handle -> handle.comparisonFailed(audit, sourceClass, failure));
    }
}
