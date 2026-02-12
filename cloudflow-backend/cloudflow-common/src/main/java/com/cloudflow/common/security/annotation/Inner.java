package com.cloudflow.common.security.annotation;

import java.lang.annotation.*;

/**
 * 内部调用注解
 * 标记在 Controller 方法上，表示该接口仅允许微服务内部调用（通过网关转发时携带内部标识头）
 * 外部直接调用将被拒绝
 * 
 * 使用示例：
 * @Inner
 * @GetMapping("/user/info")
 * public R<UserInfo> info(@RequestParam String username) {
 *     return R.ok(userService.findUserInfo(username));
 * }
 * 
 * // 允许外部访问（不校验内部标识）
 * @Inner(value = false)
 * @GetMapping("/public/info")
 * public R<String> publicInfo() {
 *     return R.ok("public");
 * }
 * 
 * @author CloudFlow
 */
@Target({ElementType.METHOD, ElementType.TYPE})
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface Inner {

    /**
     * 是否仅限内部调用，默认 true
     * - true: 仅允许内部调用（需要携带 X-Inner-Call 请求头）
     * - false: 允许外部调用（不校验内部标识）
     */
    boolean value() default true;

    /**
     * 需要特殊判断的场景，可以指定允许的来源服务名
     * 为空时表示允许所有内部服务调用
     */
    String[] allowedServices() default {};
}
