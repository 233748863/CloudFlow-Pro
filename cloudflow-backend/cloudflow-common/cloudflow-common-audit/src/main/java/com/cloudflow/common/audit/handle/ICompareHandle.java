package com.cloudflow.common.audit.handle;

import com.cloudflow.common.audit.annotation.Audit;
import org.aspectj.lang.ProceedingJoinPoint;
import org.javers.core.Changes;

/**
 * 对象差异比较处理器接口
 * <p>
 * 定义比较新旧值差异的策略，支持自定义实现。
 * 默认使用 Javers 实现。
 * </p>
 *
 * @author CloudFlow
 */
public interface ICompareHandle {

    /**
     * 比较新旧值差异并处理审计日志
     *
     * @param oldVal    方法执行前的旧值
     * @param joinPoint 切入点（用于获取新值）
     * @param audit     审计注解信息
     * @return 变更列表
     */
    Changes compare(Object oldVal, ProceedingJoinPoint joinPoint, Audit audit);
}
