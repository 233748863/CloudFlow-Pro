package cn.joywon.poco.common.audit.handle;

import cn.joywon.poco.common.audit.annotation.Audit;
import org.aspectj.lang.ProceedingJoinPoint;
import org.javers.core.Changes;

/**
 * 比较器抽象类
 *
 * @author poco
 * @date 2023/2/26
 */
public interface ICompareHandle {

	/**
	 * 比较两个对象是否变更，及其变更后如何审计
	 * @param oldVal 原有值
	 * @param newVal 变更后值
	 */
	Changes compare(Object oldVal, ProceedingJoinPoint joinPoint, Audit audit);

}
