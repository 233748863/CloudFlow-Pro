package com.cloudflow.common.statemachine.core;

/**
 * 状态机定义钩子。业务模块写一个 @Component 实现该接口，
 * 在 register(StateMachineRegistry) 中通过 registry.register(...) 注册自己的状态机。
 *
 * <p>启动期 StateMachineRegistry 收集所有 StateMachineDefinition Bean，依次调用 register。
 *
 * <p>示例：
 * <pre>
 * &#64;Component
 * public class AnnouncementStateMachineDefinition implements StateMachineDefinition {
 *     &#64;Override
 *     public void register(StateMachineRegistry registry) {
 *         registry.register(StateMachine.builder("SysAnnouncement", AnnouncementStatus.class, AnnouncementEvent.class)
 *             .transition(DRAFT, PUBLISH, PUBLISHED)
 *             .transition(PUBLISHED, ARCHIVE, ARCHIVED)
 *             .terminals(ARCHIVED)
 *             .build());
 *     }
 * }
 * </pre>
 */
public interface StateMachineDefinition {

    void register(StateMachineRegistry registry);
}
