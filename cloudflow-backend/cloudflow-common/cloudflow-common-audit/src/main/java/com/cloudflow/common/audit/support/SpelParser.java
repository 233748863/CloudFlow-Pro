package com.cloudflow.common.audit.support;

import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.reflect.MethodSignature;
import org.springframework.beans.BeansException;
import org.springframework.context.ApplicationContext;
import org.springframework.context.ApplicationContextAware;
import org.springframework.expression.spel.standard.SpelExpressionParser;
import org.springframework.expression.spel.support.StandardEvaluationContext;

/**
 * SPEL 表达式解析器
 * <p>
 * 支持在表达式中引用方法参数和 Spring Bean。
 * 例如：{@code @userService.findById(#id)} 可以调用 Spring 容器中的 Bean 方法。
 * </p>
 *
 * @author CloudFlow
 */
public class SpelParser implements ApplicationContextAware {

    private static final SpelExpressionParser PARSER = new SpelExpressionParser();

    private static ApplicationContext applicationContext;

    /**
     * 解析 SPEL 表达式
     *
     * @param joinPoint 切入点（提供方法参数）
     * @param spel      SPEL 表达式字符串
     * @return 表达式计算结果
     */
    public static Object parser(ProceedingJoinPoint joinPoint, String spel) {
        StandardEvaluationContext context = new StandardEvaluationContext();
        // 注入 Spring Bean 解析器，支持 @beanName.method() 语法
        if (applicationContext != null) {
            context.setBeanResolver(new org.springframework.context.expression.BeanFactoryResolver(applicationContext));
        }
        // 将方法参数注入为 SPEL 变量
        String[] paramNames = ((MethodSignature) joinPoint.getSignature()).getParameterNames();
        Object[] args = joinPoint.getArgs();
        if (paramNames != null) {
            for (int i = 0; i < paramNames.length; i++) {
                context.setVariable(paramNames[i], args[i]);
            }
        }
        return PARSER.parseExpression(spel).getValue(context);
    }

    @Override
    public void setApplicationContext(ApplicationContext applicationContext) throws BeansException {
        SpelParser.applicationContext = applicationContext;
    }
}
