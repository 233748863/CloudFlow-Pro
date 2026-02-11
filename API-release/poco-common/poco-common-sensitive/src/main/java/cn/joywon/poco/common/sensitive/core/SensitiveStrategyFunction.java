package cn.joywon.poco.common.sensitive.core;

/**
 * @author poco
 * @date 2024/6/27
 */
@FunctionalInterface
public interface SensitiveStrategyFunction<T, U, R> {

    R apply(T t, U u);
}
