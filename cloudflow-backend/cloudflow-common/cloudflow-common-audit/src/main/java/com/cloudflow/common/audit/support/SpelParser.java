package com.cloudflow.common.audit.support;

import com.cloudflow.common.core.spel.MethodBasedSpelEvaluator;
import org.aspectj.lang.ProceedingJoinPoint;
import org.springframework.beans.BeansException;
import org.springframework.context.ApplicationContext;
import org.springframework.context.ApplicationContextAware;
import org.springframework.util.StringUtils;

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

    /**
     * 解析 SPEL 表达式
     *
     * @param joinPoint 切入点（提供方法参数）
     * @param spel      SPEL 表达式字符串
     * @return 表达式计算结果
     */
    public static Object parser(ProceedingJoinPoint joinPoint, String spel) {
        if (!StringUtils.hasText(spel)) {
            return null;
        }
        return MethodBasedSpelEvaluator.evaluate(spel, joinPoint);
    }

    @Override
    public void setApplicationContext(ApplicationContext applicationContext) throws BeansException {
        new MethodBasedSpelEvaluator().setApplicationContext(applicationContext);
    }
}
