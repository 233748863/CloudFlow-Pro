package com.cloudflow.common.audit.handle;

import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.audit.support.DataAuditor;
import com.cloudflow.common.audit.support.SpelParser;
import lombok.RequiredArgsConstructor;
import org.aspectj.lang.ProceedingJoinPoint;
import org.javers.core.Changes;
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
public class JaversCompareHandle implements ICompareHandle {

    private final Optional<IAuditLogHandle> auditLogHandleOptional;

    @Override
    public Changes compare(Object oldVal, ProceedingJoinPoint joinPoint, Audit audit) {
        // 通过 SPEL 获取方法执行后的新值
        Object newVal = SpelParser.parser(joinPoint,
                StringUtils.hasText(audit.newVal()) ? audit.newVal() : audit.spel());

        // 使用 Javers 比较新旧值差异
        Changes changes = DataAuditor.compare(oldVal, newVal);

        // 如果存在审计日志处理器，则交给它处理（M0-5：传递 oldVal/newVal 用于 diff=true）
        auditLogHandleOptional.ifPresent(handle -> {
            if (handle instanceof com.cloudflow.common.audit.handle.DefaultAuditLogHandle defaultHandle) {
                defaultHandle.handle(audit, changes, oldVal, newVal);
            } else {
                handle.handle(audit, changes);
            }
        });

        return changes;
    }
}
