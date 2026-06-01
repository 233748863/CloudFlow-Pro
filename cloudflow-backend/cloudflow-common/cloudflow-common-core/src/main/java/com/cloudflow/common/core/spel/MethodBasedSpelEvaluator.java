package com.cloudflow.common.core.spel;

import org.aspectj.lang.JoinPoint;
import org.aspectj.lang.reflect.MethodSignature;
import org.springframework.beans.BeansException;
import org.springframework.context.ApplicationContext;
import org.springframework.context.ApplicationContextAware;
import org.springframework.context.expression.BeanFactoryResolver;
import org.springframework.core.DefaultParameterNameDiscoverer;
import org.springframework.expression.EvaluationContext;
import org.springframework.expression.ExpressionParser;
import org.springframework.expression.spel.standard.SpelExpressionParser;
import org.springframework.expression.spel.support.StandardEvaluationContext;

import java.lang.reflect.Method;

/**
 * 方法级 SpEL 解析器，支持参数名与 p0/a0/arg0 回退变量。
 */
public class MethodBasedSpelEvaluator implements ApplicationContextAware {

    private static final ExpressionParser PARSER = new SpelExpressionParser();
    private static final DefaultParameterNameDiscoverer PARAMETER_NAME_DISCOVERER =
            new DefaultParameterNameDiscoverer();

    private static ApplicationContext applicationContext;

    public static Object evaluate(String expression, JoinPoint joinPoint) {
        MethodSignature signature = (MethodSignature) joinPoint.getSignature();
        return evaluate(expression, signature.getMethod(), joinPoint.getArgs(), joinPoint.getTarget());
    }

    public static <T> T evaluate(String expression, JoinPoint joinPoint, Class<T> targetType) {
        Object value = evaluate(expression, joinPoint);
        if (value == null) {
            return null;
        }
        return targetType.cast(value);
    }

    public static Object evaluate(String expression, Method method, Object[] args, Object target) {
        return PARSER.parseExpression(expression).getValue(buildContext(method, args, target));
    }

    public static String evaluateToString(String expression, Method method, Object[] args, Object target) {
        Object value = evaluate(expression, method, args, target);
        return value == null ? null : String.valueOf(value);
    }

    public static EvaluationContext buildContext(Method method, Object[] args, Object target) {
        StandardEvaluationContext context = new StandardEvaluationContext();
        if (applicationContext != null) {
            context.setBeanResolver(new BeanFactoryResolver(applicationContext));
        }
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

    @Override
    public void setApplicationContext(ApplicationContext applicationContext) throws BeansException {
        MethodBasedSpelEvaluator.applicationContext = applicationContext;
    }
}
