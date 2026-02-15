package com.cloudflow.common.audit;

import com.cloudflow.common.audit.aop.AuditAspect;
import com.cloudflow.common.audit.handle.DefaultAuditLogHandle;
import com.cloudflow.common.audit.handle.IAuditLogHandle;
import com.cloudflow.common.audit.handle.ICompareHandle;
import com.cloudflow.common.audit.handle.JaversCompareHandle;
import com.cloudflow.common.audit.mapper.SysAuditLogMapper;
import com.cloudflow.common.audit.support.SpelParser;
import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableAsync;

import java.util.Optional;

/**
 * 审计日志自动配置
 * <p>
 * 自动注册审计切面、Javers 比较器、默认日志处理器等组件。
 * 支持通过自定义 Bean 覆盖默认实现。
 * </p>
 *
 * @author CloudFlow
 */
@EnableAsync
@Configuration
@MapperScan("com.cloudflow.common.audit.mapper")
public class AuditAutoConfiguration {

    /**
     * SPEL 表达式解析器（需要 ApplicationContext 注入）
     */
    @Bean
    public SpelParser spelParser() {
        return new SpelParser();
    }

    /**
     * 默认审计日志处理器（本地 Mapper 入库）
     * <p>可通过自定义 {@link IAuditLogHandle} Bean 覆盖</p>
     */
    @Bean
    @ConditionalOnMissingBean(IAuditLogHandle.class)
    public IAuditLogHandle defaultAuditLogHandle(SysAuditLogMapper auditLogMapper) {
        return new DefaultAuditLogHandle(auditLogMapper);
    }

    /**
     * Javers 差异比较处理器
     * <p>可通过自定义 {@link ICompareHandle} Bean 覆盖</p>
     */
    @Bean
    @ConditionalOnMissingBean(ICompareHandle.class)
    public ICompareHandle javersCompareHandle(Optional<IAuditLogHandle> auditLogHandle) {
        return new JaversCompareHandle(auditLogHandle);
    }

    /**
     * 审计日志切面
     */
    @Bean
    public AuditAspect auditAspect(ICompareHandle compareHandle) {
        return new AuditAspect(compareHandle);
    }
}
