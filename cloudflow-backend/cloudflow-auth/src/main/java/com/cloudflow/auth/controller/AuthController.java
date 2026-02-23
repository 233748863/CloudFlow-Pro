package com.cloudflow.auth.controller;

import cn.hutool.crypto.digest.BCrypt;
import java.time.LocalDateTime;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.auth.domain.LoginBody;
import com.cloudflow.auth.domain.RegisterBody;
import com.cloudflow.auth.domain.SysMenu;
import com.cloudflow.auth.domain.SysUser;
import com.cloudflow.auth.domain.dto.UserInfo;
import com.cloudflow.auth.mapper.SysUserMapper;
import com.cloudflow.auth.service.ISysMenuService;
import com.cloudflow.auth.service.ISysUserService;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.utils.TokenService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import jakarta.servlet.http.HttpServletRequest;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 认证控制器
 * 重构：使用 Spring Cache 缓存用户信息和菜单，参考 Poco 架构
 * - 登录时通过 findUserInfo 获取用户信息（自动缓存到 Redis）
 * - 菜单树通过 selectMenuTreeByUserId 获取（自动缓存到 Redis）
 * - 不再手动操作 RedisCache 存储菜单
 */
@RestController
public class AuthController {

    @Autowired
    private TokenService tokenService;

    @Autowired
    private SysUserMapper sysUserMapper;

    @Autowired
    private ISysMenuService menuService;

    @Autowired
    private ISysUserService sysUserService;

    @Autowired
    private com.cloudflow.auth.service.CaptchaService captchaService;

    @Autowired
    private com.cloudflow.auth.mapper.SysDeptMapper sysDeptMapper;

    @Autowired
    private com.cloudflow.auth.mapper.SysUserRoleMapper sysUserRoleMapper;

    @Autowired
    private com.cloudflow.auth.mapper.SysRoleMapper sysRoleMapper;

    @PostMapping("/login")
    public R<?> login(@RequestBody @Validated LoginBody form, HttpServletRequest request) {
        // 验证码校验
        if (!captchaService.validatePassToken(form.getCaptchaToken())) {
            return R.fail("验证码失效或错误，请重新验证");
        }

        // 查询用户（直接查库验证密码，不走缓存）
        LambdaQueryWrapper<SysUser> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.eq(SysUser::getUserName, form.getUsername());
        SysUser user = sysUserMapper.selectOne(queryWrapper);

        if (user == null) {
            return R.fail("用户不存在");
        }

        if (!BCrypt.checkpw(form.getPassword(), user.getPassword())) {
            return R.fail("密码错误");
        }

        // 记录登录IP和时间
        String loginIp = getClientIp(request);
        user.setLoginIp(loginIp);
        user.setLoginDate(LocalDateTime.now());
        sysUserMapper.updateById(user);

        // 通过 Spring Cache 获取用户完整信息（含角色+权限，自动缓存）
        UserInfo userInfo = sysUserService.findUserInfo(form.getUsername());
        if (userInfo == null) {
            return R.fail("获取用户信息失败");
        }

        // 创建 Token 并存入 Redis（Token 缓存仍用原有机制）
        Map<String, Object> loginUser = new HashMap<>();
        loginUser.put("userId", user.getUserId());
        loginUser.put("username", user.getUserName());
        loginUser.put("nickName", user.getNickName());
        loginUser.put("deptId", user.getDeptId());
        // 查询部门名称，存入 token 以便网关传递给下游服务
        if (user.getDeptId() != null) {
            com.cloudflow.auth.domain.SysDept dept = sysDeptMapper.selectById(user.getDeptId());
            loginUser.put("deptName", dept != null ? dept.getDeptName() : null);
        }
        loginUser.put("tenantId", user.getTenantId()); // 添加租户ID
        loginUser.put("avatar", user.getAvatar());
        loginUser.put("roles", userInfo.getRoles());
        loginUser.put("permissions", userInfo.getPermissions());

        // 计算数据权限信息并存入 Redis，下游服务直接从 UserContext 读取，无需查库
        Map<String, Object> dsInfo = calcDataScopeInfo(user.getUserId(), user.getDeptId());
        loginUser.put("dsType", dsInfo.get("dsType"));
        loginUser.put("dsDeptIds", dsInfo.get("dsDeptIds"));

        String token = tokenService.createToken(loginUser);

        Map<String, String> result = new HashMap<>();
        result.put("token", token);
        return R.ok(result);
    }

    @PostMapping("/register")
    public R<?> register(@RequestBody @Validated RegisterBody registerBody) {
        if (!captchaService.validatePassToken(registerBody.getCaptchaToken())) {
            return R.fail("验证码失效或错误，请重新验证");
        }

        if (!registerBody.getPassword().equals(registerBody.getConfirmPassword())) {
            return R.fail("两次输入的密码不一致");
        }

        LambdaQueryWrapper<SysUser> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.eq(SysUser::getUserName, registerBody.getUsername());
        if (sysUserMapper.selectCount(queryWrapper) > 0) {
            return R.fail("用户 '" + registerBody.getUsername() + "' 已存在");
        }

        SysUser user = new SysUser();
        user.setUserName(registerBody.getUsername());
        user.setNickName(registerBody.getUsername());
        user.setPassword(registerBody.getPassword());
        user.setEmail(registerBody.getEmail());
        user.setStatus("0");
        user.setDelFlag("0");
        // 注册时设置默认租户ID为1（默认租户）
        // 如果需要支持多租户注册，可以从注册表单获取 tenantId
        user.setTenantId(1L);

        sysUserService.insertUser(user);

        return R.ok("注册成功");
    }

    @GetMapping("/info")
    public R<?> info(HttpServletRequest request) {
        String token = request.getHeader("Authorization");
        if (token != null && token.startsWith("Bearer ")) {
            token = token.substring(7);
        }

        Map<String, Object> userMap = tokenService.verifyToken(token);
        if (userMap == null) {
            return R.fail(401, "Token已过期或无效");
        }

        String username = (String) userMap.get("username");

        // 从 Spring Cache 获取用户完整信息（命中缓存则不查库）
        UserInfo userInfo = sysUserService.findUserInfo(username);
        if (userInfo == null) {
            return R.fail(401, "用户信息不存在");
        }

        SysUser cachedUser = userInfo.getSysUser();

        // 构建返回对象
        SysUser user = new SysUser();
        user.setUserId(cachedUser.getUserId());
        user.setUserName(cachedUser.getUserName());
        user.setNickName(cachedUser.getNickName());
        user.setAvatar(cachedUser.getAvatar());
        user.setTenantId(cachedUser.getTenantId()); // 添加租户ID
        user.setDeptId(cachedUser.getDeptId()); // 添加部门ID

        if (user.getAvatar() == null) {
            user.setAvatar("https://api.dicebear.com/7.x/avataaars/svg?seed=" + user.getUserName());
        }

        // 从缓存的角色集合中取第一个作为主角色
        String resolvedRole = "USER";
        if (userInfo.getRoles() != null && !userInfo.getRoles().isEmpty()) {
            resolvedRole = userInfo.getRoles().iterator().next().toUpperCase();
        }
        user.setRole(resolvedRole);

        Map<String, Object> data = new HashMap<>();
        data.put("user", user);
        data.put("roles", userInfo.getRoles());
        data.put("permissions", userInfo.getPermissions());

        return R.ok(data);
    }

    /**
     * 获取路由信息（菜单树）- 通过 Spring Cache 自动缓存
     */
    @GetMapping("/getRouters")
    public R<?> getRouters(HttpServletRequest request) {
        String token = request.getHeader("Authorization");
        if (token != null && token.startsWith("Bearer ")) {
            token = token.substring(7);
        }

        Map<String, Object> userMap = tokenService.verifyToken(token);
        if (userMap == null) {
            return R.fail(401, "Token已过期或无效");
        }

        Object userIdObj = userMap.get("userId");
        Long userId;
        if (userIdObj instanceof Integer) {
            userId = ((Integer) userIdObj).longValue();
        } else {
            userId = (Long) userIdObj;
        }

        // 通过 Spring Cache 获取菜单树（@Cacheable 自动缓存，菜单变更时自动失效）
        List<SysMenu> menus = menuService.selectMenuTreeByUserId(userId);
        return R.ok(menus);
    }

    private String getClientIp(HttpServletRequest request) {
        String ip = request.getHeader("X-Forwarded-For");
        if (ip == null || ip.isEmpty() || "unknown".equalsIgnoreCase(ip)) {
            ip = request.getHeader("Proxy-Client-IP");
        }
        if (ip == null || ip.isEmpty() || "unknown".equalsIgnoreCase(ip)) {
            ip = request.getHeader("WL-Proxy-Client-IP");
        }
        if (ip == null || ip.isEmpty() || "unknown".equalsIgnoreCase(ip)) {
            ip = request.getHeader("X-Real-IP");
        }
        if (ip == null || ip.isEmpty() || "unknown".equalsIgnoreCase(ip)) {
            ip = request.getRemoteAddr();
        }
        if (ip != null && ip.contains(",")) {
            ip = ip.split(",")[0].trim();
        }
        return ip;
    }

    /**
     * 租户切换接口（仅超级管理员可用）
     * 允许超级管理员切换到指定租户，以便查看和管理该租户的数据
     */
    @PostMapping("/switchTenant")
    public R<?> switchTenant(@RequestBody Map<String, Object> params, HttpServletRequest request) {
        String token = request.getHeader("Authorization");
        if (token != null && token.startsWith("Bearer ")) {
            token = token.substring(7);
        }

        Map<String, Object> userMap = tokenService.verifyToken(token);
        if (userMap == null) {
            return R.fail(401, "Token已过期或无效");
        }

        // 检查是否为超级管理员
        @SuppressWarnings("unchecked")
        List<String> roles = (List<String>) userMap.get("roles");
        if (roles == null || !roles.contains("ADMIN")) {
            return R.fail(403, "只有超级管理员才能切换租户");
        }

        // 获取目标租户ID
        Object tenantIdObj = params.get("tenantId");
        if (tenantIdObj == null) {
            return R.fail("租户ID不能为空");
        }

        Long targetTenantId;
        if (tenantIdObj instanceof Integer) {
            targetTenantId = ((Integer) tenantIdObj).longValue();
        } else if (tenantIdObj instanceof Long) {
            targetTenantId = (Long) tenantIdObj;
        } else {
            try {
                targetTenantId = Long.parseLong(tenantIdObj.toString());
            } catch (NumberFormatException e) {
                return R.fail("租户ID格式错误");
            }
        }

        // 更新Token中的租户ID
        userMap.put("tenantId", targetTenantId);
        
        // 重新生成Token
        String newToken = tokenService.createToken(userMap);

        Map<String, Object> result = new HashMap<>();
        result.put("token", newToken);
        result.put("tenantId", targetTenantId);
        result.put("message", "租户切换成功");

        return R.ok(result);
    }

    /**
     * 计算用户的数据权限信息（登录时一次性算好存入 Redis）
     * 下游服务通过 RedisDataScopeHandle 从 UserContext 读取，无需查 auth 库
     * 
     * @param userId 用户ID
     * @param deptId 用户部门ID
     * @return dsType（权限类型）和 dsDeptIds（可访问部门列表）
     */
    private Map<String, Object> calcDataScopeInfo(Long userId, Long deptId) {
        Map<String, Object> result = new HashMap<>();
        
        try {
            // 1. 查询用户角色关联
            LambdaQueryWrapper<com.cloudflow.auth.domain.SysUserRole> urWrapper = new LambdaQueryWrapper<>();
            urWrapper.eq(com.cloudflow.auth.domain.SysUserRole::getUserId, userId);
            List<com.cloudflow.auth.domain.SysUserRole> userRoles = sysUserRoleMapper.selectList(urWrapper);
            
            if (userRoles == null || userRoles.isEmpty()) {
                // 无角色，默认仅本人权限
                result.put("dsType", 4);
                result.put("dsDeptIds", Collections.emptyList());
                return result;
            }
            
            // 2. 查询角色信息
            List<Long> roleIds = userRoles.stream()
                .map(com.cloudflow.auth.domain.SysUserRole::getRoleId)
                .collect(Collectors.toList());
            List<com.cloudflow.auth.domain.SysRole> roles = sysRoleMapper.selectBatchIds(roleIds);
            
            if (roles == null || roles.isEmpty()) {
                result.put("dsType", 4);
                result.put("dsDeptIds", Collections.emptyList());
                return result;
            }
            
            // 3. 取权限最大的角色（数值最小 = 权限最大：0全部 < 1自定义 < 2本级及下级 < 3本级 < 4本人）
            int dsType = roles.stream()
                .map(com.cloudflow.auth.domain.SysRole::getDsType)
                .filter(Objects::nonNull)
                .min(Integer::compareTo)
                .orElse(4);
            
            result.put("dsType", dsType);
            
            // 4. 根据权限类型计算可访问的部门ID列表
            List<Long> dsDeptIds = new ArrayList<>();
            
            switch (dsType) {
                case 0: // 全部数据权限，不需要部门列表
                    break;
                case 1: // 自定义权限，合并所有角色的 ds_scope
                    String dsScope = roles.stream()
                        .map(com.cloudflow.auth.domain.SysRole::getDsScope)
                        .filter(s -> s != null && !s.trim().isEmpty())
                        .collect(Collectors.joining(","));
                    if (!dsScope.isEmpty()) {
                        dsDeptIds = Arrays.stream(dsScope.split(","))
                            .map(String::trim)
                            .filter(s -> !s.isEmpty())
                            .map(Long::parseLong)
                            .distinct()
                            .collect(Collectors.toList());
                    }
                    break;
                case 2: // 本级及下级
                    if (deptId != null) {
                        dsDeptIds.add(deptId);
                        dsDeptIds.addAll(getDescendantDeptIds(deptId));
                    }
                    break;
                case 3: // 本级
                    if (deptId != null) {
                        dsDeptIds.add(deptId);
                    }
                    break;
                case 4: // 本人，不需要部门列表（通过 username 过滤）
                    break;
            }
            
            result.put("dsDeptIds", dsDeptIds);
            
        } catch (Exception e) {
            // 计算失败时默认仅本人权限，保证安全
            result.put("dsType", 4);
            result.put("dsDeptIds", Collections.emptyList());
        }
        
        return result;
    }
    
    /**
     * 获取指定部门的所有下级部门ID（通过 ancestors 字段快速查询）
     */
    private List<Long> getDescendantDeptIds(Long deptId) {
        List<com.cloudflow.auth.domain.SysDept> allDepts = sysDeptMapper.selectList(null);
        if (allDepts == null || allDepts.isEmpty()) {
            return Collections.emptyList();
        }
        return allDepts.stream()
            .filter(dept -> dept.getAncestors() != null &&
                           (dept.getAncestors().contains("," + deptId + ",") ||
                            dept.getAncestors().endsWith("," + deptId)))
            .map(com.cloudflow.auth.domain.SysDept::getDeptId)
            .collect(Collectors.toList());
    }
}
