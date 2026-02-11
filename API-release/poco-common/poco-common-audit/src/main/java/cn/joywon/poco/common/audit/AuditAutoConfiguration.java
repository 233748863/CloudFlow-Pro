package cn.joywon.poco.common.audit;

import cn.joywon.poco.admin.api.feign.RemoteAuditLogService;
import cn.joywon.poco.common.audit.aop.AuditAspect;
import cn.joywon.poco.common.audit.handle.DefaultAuditLogHandle;
import cn.joywon.poco.common.audit.handle.IAuditLogHandle;
import cn.joywon.poco.common.audit.handle.ICompareHandle;
import cn.joywon.poco.common.audit.handle.JavesCompareHandle;
import cn.joywon.poco.common.audit.support.SpelParser;
import cn.joywon.poco.common.core.util.KeyStrResolver;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.scheduling.annotation.EnableAsync;

import java.util.Optional;

/**
 * 审计自动配置类
 *
 * @author poco
 * @date 2023/2/26
 */
@EnableAsync
@AutoConfiguration
@Import({ AuditAspect.class, SpelParser.class })
public class AuditAutoConfiguration {

	/**
	 * 默认注入 javers 的比较器实现
	 * @param auditNameHandleOptional 注入审计用户来源
	 * @return ICompareHandle
	 */
	@Bean
	@ConditionalOnMissingBean
	public ICompareHandle compareHandle(Optional<IAuditLogHandle> auditNameHandleOptional) {
		return new JavesCompareHandle(auditNameHandleOptional);
	}

	/**
	 * 默认的审计日志存储策略
	 * @return DefaultAuditLogHandle
	 */
	@Bean
	@ConditionalOnMissingBean
	public IAuditLogHandle auditLogHandle(RemoteAuditLogService logService, KeyStrResolver tenantKeyStrResolver) {
		return new DefaultAuditLogHandle(logService, tenantKeyStrResolver);
	}

}
