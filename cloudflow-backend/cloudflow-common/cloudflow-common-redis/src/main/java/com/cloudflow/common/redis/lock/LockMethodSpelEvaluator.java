package com.cloudflow.common.redis.lock;

import org.springframework.core.DefaultParameterNameDiscoverer;
import org.springframework.expression.EvaluationContext;
import org.springframework.expression.ExpressionParser;
import org.springframework.expression.spel.standard.SpelExpressionParser;
import org.springframework.expression.spel.support.StandardEvaluationContext;

import java.lang.reflect.Method;

/**
 * 分布式锁 key 的本地 SpEL 解析器。
 */
public final class LockMethodSpelEvaluator {

    private static final ExpressionParser PARSER = new SpelExpressionParser();
    private static final DefaultParameterNameDiscoverer PARAMETER_NAME_DISCOVERER =
            new DefaultParameterNameDiscoverer();

    private LockMethodSpelEvaluator() {
    }

    public static String evaluateToString(String expression, Method method, Object[] args, Object target) {
        Object value = PARSER.parseExpression(expression).getValue(buildContext(method, args, target));
        return value == null ? null : String.valueOf(value);
    }

    private static EvaluationContext buildContext(Method method, Object[] args, Object target) {
        StandardEvaluationContext context = new StandardEvaluationContext();
        context.setVariable("method", method);
        context.setVariable("target", target);
        context.setVariable("args", args);
        String[] paramNames = PARAMETER_NAME_DISCOVERER.getParameterNames(method);
        for (int i = 0; i < args.length; i++) {
            Object arg = args[i];
            if (paramNames != null && i < paramNames.length) {
                context.setVariable(paramNames[i], arg);
            }
            context.setVariable("p" + i, arg);
            context.setVariable("a" + i, arg);
            context.setVariable("arg" + i, arg);
        }
        return context;
    }
}
