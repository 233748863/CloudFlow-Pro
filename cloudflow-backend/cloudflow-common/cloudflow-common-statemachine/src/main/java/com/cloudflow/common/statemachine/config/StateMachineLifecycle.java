package com.cloudflow.common.statemachine.config;

import com.cloudflow.common.statemachine.core.StateMachineRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.SmartLifecycle;

/**
 * 状态机生命周期钩子。在 Spring 容器启动收尾阶段（所有 Bean 初始化完毕后）触发 verifyAll()。
 * 失败则抛异常，让 Spring 启动失败 fail-fast。
 */
public class StateMachineLifecycle implements SmartLifecycle {

    private static final Logger log = LoggerFactory.getLogger(StateMachineLifecycle.class);

    private final StateMachineRegistry registry;
    private volatile boolean running = false;

    public StateMachineLifecycle(StateMachineRegistry registry) {
        this.registry = registry;
    }

    @Override
    public void start() {
        log.info("StateMachineLifecycle.start() 触发 verifyAll()");
        registry.verifyAll();
        running = true;
    }

    @Override
    public void stop() {
        running = false;
    }

    @Override
    public boolean isRunning() {
        return running;
    }

    @Override
    public int getPhase() {
        // 最后阶段执行，确保所有业务 Bean 已初始化
        return Integer.MAX_VALUE;
    }
}
