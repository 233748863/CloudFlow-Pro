package com.cloudflow.common.workflow.callback.registry;

import java.util.List;

import lombok.extern.slf4j.Slf4j;
import org.springframework.context.event.ContextRefreshedEvent;
import org.springframework.context.event.EventListener;

/**
 * 业务类型注册收集器。
 *
 * <p>监听 {@link ContextRefreshedEvent}，把容器内所有 {@link BusinessTypeContributor} 收集起来，
 * 依次调用 {@link BusinessTypeContributor#contribute(BusinessTypeRegistry)}。
 *
 * <p>使用容器级事件而不是 {@link org.springframework.beans.factory.InitializingBean}，
 * 是为了确保所有 Bean 都已完成初始化（特别是模块自身的 {@code @Configuration} 类）。
 */
@Slf4j
public class BusinessTypeRegistrar {

    private final BusinessTypeRegistry registry;
    private final List<BusinessTypeContributor> contributors;

    public BusinessTypeRegistrar(BusinessTypeRegistry registry,
                                 List<BusinessTypeContributor> contributors) {
        this.registry = registry;
        this.contributors = contributors;
    }

    @EventListener
    public void onContextRefreshed(ContextRefreshedEvent event) {
        if (registry.size() > 0) {
            return;
        }
        for (BusinessTypeContributor contributor : contributors) {
            try {
                contributor.contribute(registry);
            } catch (Exception e) {
                log.error("[BusinessType] contributor {} 注册失败", contributor.getClass().getSimpleName(), e);
            }
        }
        log.info("[BusinessType] 已注册 {} 项业务类型: {}", registry.size(),
                registry.all().stream().map(BusinessTypeDef::getCode).toList());
    }
}
