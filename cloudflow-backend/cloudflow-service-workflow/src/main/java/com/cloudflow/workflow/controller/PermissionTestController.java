package com.cloudflow.workflow.controller;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.workflow.exception.PermissionDeniedException;

import cn.dev33.satoken.annotation.SaCheckPermission;
import cn.dev33.satoken.annotation.SaCheckRole;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 权限错误处理测试控制器
 * 用于测试任务 6.3 实现的权限错误处理功能
 * 
 * 注意：此控制器仅用于开发和测试，生产环境应删除或禁用
 * 
 * @author CloudFlow
 */
@RestController
@RequestMapping("/api/workflow/test/permission")
@SaCheckRole("admin")
public class PermissionTestController {

    /**
     * 测试自定义权限异常 (PermissionDeniedException)
     * 
     * 访问此接口会抛出 PermissionDeniedException
     * 预期返回 403 状态码和友好的错误提示
     */
    @GetMapping("/custom-denied")
    public R<?> testCustomPermissionDenied() {
        throw new PermissionDeniedException("您没有权限访问此测试资源");
    }

    /**
     * 测试权限拒绝异常。
     *
     * 访问此接口会抛出自定义 PermissionDeniedException。
     */
    @GetMapping("/security-denied")
    public R<?> testSecurityAccessDenied() {
        throw new PermissionDeniedException("模拟访问被拒绝");
    }

    /**
     * 测试 Sa-Token 角色注解（需要管理员权限）。
     */
    @GetMapping("/admin-only")
    @SaCheckRole("admin")
    public R<?> testAdminOnly() {
        return R.ok("管理员专属功能访问成功");
    }

    /**
     * 测试 Sa-Token 权限注解（需要特定权限）。
     */
    @GetMapping("/template-create")
    @SaCheckPermission("workflow:template:create")
    public R<?> testTemplateCreatePermission() {
        return R.ok("模板创建权限验证成功");
    }

    /**
     * 正常访问（无权限限制）
     * 
     * 用于对比测试，验证正常请求不受影响
     */
    @GetMapping("/public")
    public R<?> testPublicAccess() {
        return R.ok("公开访问成功");
    }
}
