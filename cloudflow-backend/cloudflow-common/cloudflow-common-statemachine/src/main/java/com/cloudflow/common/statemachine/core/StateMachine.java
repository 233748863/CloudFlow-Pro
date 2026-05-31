package com.cloudflow.common.statemachine.core;

import com.cloudflow.common.statemachine.exception.IllegalStateTransitionException;

import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * 通用状态机。每个业务实体（如 报销单 / 流程实例 / 合同）注册一个 StateMachine 实例，
 * 注册 (from, event) → to 三元组，校验时调用 {@link #fire(StateValue, StateEvent)}。
 *
 * <p>线程安全：StateMachine 在启动期通过 Builder 一次性构建，运行期只读，无需同步。
 *
 * @param <S> 状态枚举类型，需实现 StateValue
 * @param <E> 事件枚举类型，需实现 StateEvent
 */
public final class StateMachine<S extends StateValue, E extends StateEvent> {

    private final String entityName;
    private final Class<S> stateType;
    private final Class<E> eventType;
    private final Map<TransitionKey<S, E>, S> transitions;
    private final Set<S> terminalStates;

    private StateMachine(Builder<S, E> builder) {
        this.entityName = builder.entityName;
        this.stateType = builder.stateType;
        this.eventType = builder.eventType;
        this.transitions = Collections.unmodifiableMap(new HashMap<>(builder.transitions));
        this.terminalStates = Collections.unmodifiableSet(new HashSet<>(builder.terminalStates));
    }

    /** 校验并返回流转后状态。fromState 不允许触发 event 时抛 IllegalStateTransitionException(409)。 */
    public S fire(S fromState, E event) {
        Objects.requireNonNull(fromState, "fromState");
        Objects.requireNonNull(event, "event");
        S to = transitions.get(new TransitionKey<>(fromState, event));
        if (to == null) {
            throw new IllegalStateTransitionException(entityName, fromState.code(), event.code());
        }
        return to;
    }

    /** 仅判断能否流转，不抛异常。 */
    public boolean canFire(S fromState, E event) {
        if (fromState == null || event == null) {
            return false;
        }
        return transitions.containsKey(new TransitionKey<>(fromState, event));
    }

    public boolean isTerminal(S state) {
        return terminalStates.contains(state);
    }

    public String entityName() {
        return entityName;
    }

    public Class<S> stateType() {
        return stateType;
    }

    public Class<E> eventType() {
        return eventType;
    }

    public Map<TransitionKey<S, E>, S> transitions() {
        return transitions;
    }

    public Set<S> terminalStates() {
        return terminalStates;
    }

    public static <S extends StateValue, E extends StateEvent> Builder<S, E> builder(
            String entityName, Class<S> stateType, Class<E> eventType) {
        return new Builder<>(entityName, stateType, eventType);
    }

    /** 状态机构建器。链式调用 transition / terminal，最后 build。 */
    public static final class Builder<S extends StateValue, E extends StateEvent> {

        private final String entityName;
        private final Class<S> stateType;
        private final Class<E> eventType;
        private final Map<TransitionKey<S, E>, S> transitions = new HashMap<>();
        private final Set<S> terminalStates = new HashSet<>();

        private Builder(String entityName, Class<S> stateType, Class<E> eventType) {
            this.entityName = Objects.requireNonNull(entityName, "entityName");
            this.stateType = Objects.requireNonNull(stateType, "stateType");
            this.eventType = Objects.requireNonNull(eventType, "eventType");
        }

        public Builder<S, E> transition(S from, E event, S to) {
            Objects.requireNonNull(from, "from");
            Objects.requireNonNull(event, "event");
            Objects.requireNonNull(to, "to");
            TransitionKey<S, E> key = new TransitionKey<>(from, event);
            S existing = transitions.put(key, to);
            if (existing != null && !existing.equals(to)) {
                throw new IllegalStateException(entityName + " transition (" + from.code() + ", "
                        + event.code() + ") 已注册到 " + existing.code() + "，不可改注到 " + to.code());
            }
            return this;
        }

        public Builder<S, E> terminal(S state) {
            terminalStates.add(Objects.requireNonNull(state, "state"));
            return this;
        }

        @SafeVarargs
        public final Builder<S, E> terminals(S... states) {
            for (S s : states) {
                terminal(s);
            }
            return this;
        }

        public StateMachine<S, E> build() {
            if (transitions.isEmpty()) {
                throw new IllegalStateException(entityName + " 状态机至少要注册一条 transition");
            }
            return new StateMachine<>(this);
        }
    }

    /** (from, event) 复合键。 */
    public static final class TransitionKey<S extends StateValue, E extends StateEvent> {
        private final S from;
        private final E event;

        public TransitionKey(S from, E event) {
            this.from = from;
            this.event = event;
        }

        public S from() {
            return from;
        }

        public E event() {
            return event;
        }

        @Override
        public boolean equals(Object o) {
            if (this == o) return true;
            if (!(o instanceof TransitionKey<?, ?> other)) return false;
            return Objects.equals(from, other.from) && Objects.equals(event, other.event);
        }

        @Override
        public int hashCode() {
            return Objects.hash(from, event);
        }

        @Override
        public String toString() {
            return "(" + from.code() + "," + event.code() + ")";
        }
    }
}
