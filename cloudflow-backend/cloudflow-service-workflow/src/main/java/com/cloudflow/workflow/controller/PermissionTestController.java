package com.cloudflow.workflow.controller;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.workflow.exception.PermissionDeniedException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.access.prepost.PreAuthorize;
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
     * 测试 Spring Security 权限异常 (AccessDeniedException)
     * 
     * 访问此接口会抛出 Spring Security 的 AccessDeniedException
     * 预期返回 403 状态码和友好的错误提示
     */
    @GetMapping("/security-denied")
    public R<?> testSecurityAccessDenied() {
        throw new AccessDeniedException("Access is denied");
    }

    /**
     * 测试 @PreAuthorize 注解（需要管理员权限）
     * 
     * 使用非管理员用户访问此接口会触发 AccessDeniedException
     * 预期返回 403 状态码和 "此操作需要管理员权限" 的提示
     */
    @GetMapping("/admin-only")
    @PreAuthorize("hasRole('ADMIN')")
    public R<?> testAdminOnly() {
        return R.ok("管理员专属功能访问成功");
    }

    /**
     * 测试 @PreAuthorize 注解（需要特定权限）
     * 
     * 使用没有 workflow:template:create 权限的用户访问会触发 AccessDeniedException
     * 预期返回 403 状态码和权限不足的提示
     */
    @GetMapping("/template-create")
    @PreAuthorize("hasAuthority('workflow:template:create')")
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
