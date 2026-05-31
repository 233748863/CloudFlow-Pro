package com.cloudflow.common.audit.annotation;

import org.springframework.core.annotation.AliasFor;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * 审计日志注解
 * <p>
 * 标注在 Service 方法上，自动记录数据变更的字段级差异。
 * 使用 Javers 进行对象差异比较，支持 SPEL 表达式获取新旧值。
 * </p>
 *
 * 使用示例：
 * <pre>
 * // 基本用法：通过 SPEL 获取对象
 * {@code @Audit(name = "更新用户信息", spel = "#user")}
 * public User update(User user) { ... }
 *
 * // 高级用法：自定义旧值查询表达式
 * {@code @Audit(name = "删除用户", spel = "#id", oldVal = "@userService.findById(#id)")}
 * public void delete(Long id) { ... }
 * </pre>
 *
 * @author CloudFlow
 */
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface Audit {

    /**
     * 审计业务名称
     * @return 名称
     */
    String name();

    /**
     * 默认查询对象的 SPEL 表达式
     * @return SPEL 表达式
     */
    @AliasFor("spel")
    String value() default "";

    /**
     * 默认查询对象的 SPEL 表达式（与 value 互为别名）
     * @return SPEL 表达式
     */
    @AliasFor("value")
    String spel() default "";

    /**
     * 查询旧值的 SPEL 表达式
     * <p>如果为空，则使用 spel() 的值</p>
     * @return SPEL 表达式
     */
    String oldVal() default "";

    /**
     * 查询新值的 SPEL 表达式
     * <p>如果为空，则使用 spel() 的值</p>
     * @return SPEL 表达式
     */
    String newVal() default "";

    /**
     * 是否记录完整 JSON diff（M0-5：before_json / after_json / diff_json）
     * <p>默认 false，仅记录字段级差异（beforeVal / afterVal）</p>
     * @return true=记录完整 JSON
     */
    boolean diff() default false;

    /**
     * 是否高风险操作（M0-5：高风险操作未落审计时启动期检查失败）
     * <p>高风险操作示例：删除用户、禁用账号、修改角色权限、重置密码</p>
     * @return true=高风险
     */
    boolean highRisk() default false;

    /**
     * 是否触发通知（M0-5：配合 INF-06 通知系统）
     * <p>true 时需在 outbox 路径有对应 NotifyDispatchService.dispatch</p>
     * @return true=触发通知
     */
    boolean sendNotify() default false;
}
