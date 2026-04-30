package com.cloudflow.auth.controller;

import cn.hutool.crypto.digest.BCrypt;
import java.time.LocalDateTime;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.auth.domain.LoginBody;
import com.cloudflow.auth.domain.RegisterBody;
import com.cloudflow.auth.domain.SysMenu;
import com.cloudflow.auth.domain.SysTenant;
import com.cloudflow.auth.domain.SysUser;
import com.cloudflow.auth.domain.dto.ChangePasswordDTO;
import com.cloudflow.auth.domain.dto.ProfileUpdateDTO;
import com.cloudflow.auth.domain.dto.SwitchTenantDTO;
import com.cloudflow.auth.domain.dto.UserInfo;
import com.cloudflow.auth.domain.vo.DynamicMapVO;
import com.cloudflow.auth.mapper.SysTenantMapper;
import com.cloudflow.auth.mapper.SysUserMapper;
import com.cloudflow.auth.service.ISysMenuService;
import com.cloudflow.auth.service.ISysUserService;
import com.cloudflow.auth.service.LoginLogService;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.tenant.TenantBroker;
import com.cloudflow.common.tenant.TenantConfigProperties;
import com.cloudflow.common.core.utils.TokenService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.util.StringUtils;
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
    private SysTenantMapper sysTenantMapper;

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

    @Autowired
    private TenantConfigProperties tenantConfigProperties;

    @Autowired
    private LoginLogService loginLogService;

    @PostMapping("/login")
    public R<DynamicMapVO> login(@RequestBody @Validated LoginBody form, HttpServletRequest request) {
        long startAt = System.currentTimeMillis();

        // 先校验滑块验证码，避免未通过人机校验时继续执行登录流程。
        if (!captchaService.validatePassToken(form.getCaptchaToken())) {
            loginLogService.recordLoginFailure(
                form.getUsername(),
                tenantConfigProperties.getDefaultTenantId(),
                request,
                "验证码失效或错误，请重新验证",
                System.currentTimeMillis() - startAt
            );
            return R.fail("验证码失效或错误，请重新验证");
        }

        LambdaQueryWrapper<SysUser> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.eq(SysUser::getUserName, form.getUsername());
        SysUser user = sysUserMapper.selectOne(queryWrapper);

        if (user == null) {
            loginLogService.recordLoginFailure(
                form.getUsername(),
                tenantConfigProperties.getDefaultTenantId(),
                request,
                "用户不存在",
                System.currentTimeMillis() - startAt
            );
            return R.fail("用户不存在");
        }

        // 明确拦截停用/删除账号，避免继续进入后续流程后抛出模糊 500。
        if ("2".equals(user.getDelFlag())) {
            loginLogService.recordLoginFailure(
                form.getUsername(),
                user.getTenantId(),
                request,
                "账号不存在",
                System.currentTimeMillis() - startAt
            );
            return R.fail("账号不存在");
        }

        if (!"0".equals(user.getStatus())) {
            loginLogService.recordLoginFailure(
                form.getUsername(),
                user.getTenantId(),
                request,
                "账号已停用",
                System.currentTimeMillis() - startAt
            );
            return R.fail("账号已停用");
        }

        if (!BCrypt.checkpw(form.getPassword(), user.getPassword())) {
            loginLogService.recordLoginFailure(
                form.getUsername(),
                user.getTenantId(),
                request,
                "密码错误",
                System.currentTimeMillis() - startAt
            );
            return R.fail("密码错误");
        }

        String loginIp = getClientIp(request);
        user.setLoginIp(loginIp);
        user.setLoginDate(LocalDateTime.now());
        sysUserMapper.updateById(user);

        UserInfo userInfo = sysUserService.findUserInfo(form.getUsername());
        if (userInfo == null) {
            loginLogService.recordLoginFailure(
                form.getUsername(),
                user.getTenantId(),
                request,
                "用户信息异常",
                System.currentTimeMillis() - startAt
            );
            return R.fail("用户信息异常");
        }

        Map<String, Object> loginUser = new HashMap<>();
        loginUser.put("userId", user.getUserId());
        loginUser.put("username", user.getUserName());
        loginUser.put("nickName", user.getNickName());
        loginUser.put("deptId", user.getDeptId());
        if (user.getDeptId() != null) {
            com.cloudflow.auth.domain.SysDept dept = sysDeptMapper.selectById(user.getDeptId());
            loginUser.put("deptName", dept != null ? dept.getDeptName() : null);
        }
        loginUser.put("tenantId", user.getTenantId());
        loginUser.put("tenantName", resolveTenantName(user.getTenantId()));
        loginUser.put("avatar", user.getAvatar());
        loginUser.put("roles", userInfo.getRoles());
        loginUser.put("permissions", userInfo.getPermissions());

        Map<String, Object> dsInfo = calcDataScopeInfo(user.getUserId(), user.getDeptId());
        loginUser.put("dsType", dsInfo.get("dsType"));
        loginUser.put("dsDeptIds", dsInfo.get("dsDeptIds"));

        String token = tokenService.createToken(loginUser);
        loginLogService.recordLoginSuccess(
            user.getUserName(),
            user.getTenantId(),
            request,
            System.currentTimeMillis() - startAt
        );

        Map<String, String> result = new HashMap<>();
        result.put("token", token);
        return R.ok(DynamicMapVO.from(result));
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
        // 注册时使用系统配置中的默认租户ID，避免写入不存在的租户主键
        user.setTenantId(tenantConfigProperties.getDefaultTenantId());

        try {
            sysUserService.insertUser(user);
        } catch (IllegalStateException ex) {
            return R.fail(ex.getMessage());
        }

        return R.ok("注册成功");
    }

    @GetMapping("/info")
    public R<DynamicMapVO> info(HttpServletRequest request) {
        Map<String, Object> userMap = resolveLoginUser(request);
        if (userMap == null) {
            return R.fail(401, "Token已过期或无效");
        }

        Long userId = toLong(userMap.get("userId"));
        String username = extractUsername(userMap, userId);

        UserInfo userInfo = TenantBroker.applyWithoutTenant(ignored ->
                StringUtils.hasText(username) ? sysUserService.findUserInfo(username) : null
        );
        if (userInfo == null) {
            return R.fail(401, "用户信息不存在");
        }

        SysUser cachedUser = userInfo.getSysUser();

        // 构建返回对象
        SysUser user = new SysUser();
        user.setUserId(cachedUser.getUserId());
        user.setUserName(cachedUser.getUserName());
        user.setNickName(cachedUser.getNickName());
        user.setEmail(cachedUser.getEmail());
        user.setPhonenumber(cachedUser.getPhonenumber());
        user.setStatus(cachedUser.getStatus());
        user.setCreateTime(cachedUser.getCreateTime());
        user.setAvatar(cachedUser.getAvatar());
        Long tenantId = resolveTenantId(userMap, cachedUser);
        user.setTenantId(tenantId);
        user.setDeptId(resolveDeptId(userMap, cachedUser));
        user.setTenantName(resolveTenantName(userMap, tenantId));

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
        data.put("roles", resolveStringCollection(userMap.get("roles"), userInfo.getRoles()));
        data.put("permissions", resolveStringCollection(userMap.get("permissions"), userInfo.getPermissions()));

        return R.ok(DynamicMapVO.from(data));
    }

    @PutMapping("/profile")
    public R<?> updateProfile(@RequestBody ProfileUpdateDTO dto, HttpServletRequest request) {
        Map<String, Object> userMap = resolveLoginUser(request);
        if (userMap == null) {
            return R.fail(401, "Token已过期或无效");
        }

        Long userId = toLong(userMap.get("userId"));
        if (userId == null) {
            return R.fail(401, "登录用户信息异常");
        }

        String nickName = trimValue(dto.getNickName());
        if (!StringUtils.hasText(nickName)) {
            return R.fail("显示名称不能为空");
        }

        SysUser existing = TenantBroker.applyWithoutTenant(ignored -> sysUserMapper.selectById(userId));
        if (existing == null) {
            return R.fail(404, "用户不存在");
        }

        SysUser update = new SysUser();
        update.setUserId(userId);
        update.setNickName(nickName);
        update.setEmail(trimValue(dto.getEmail()));
        String phone = trimValue(dto.getPhonenumber());
        update.setPhonenumber(StringUtils.hasText(phone) ? phone : trimValue(dto.getPhone()));

        TenantBroker.applyWithoutTenant(ignored -> sysUserMapper.updateById(update));
        sysUserService.evictUserInfoCache(existing.getUserName());

        return R.ok("保存成功");
    }

    @PutMapping("/profile/password")
    public R<?> changeProfilePassword(@RequestBody ChangePasswordDTO dto, HttpServletRequest request) {
        Map<String, Object> userMap = resolveLoginUser(request);
        if (userMap == null) {
            return R.fail(401, "Token已过期或无效");
        }

        Long userId = toLong(userMap.get("userId"));
        if (userId == null) {
            return R.fail(401, "登录用户信息异常");
        }

        String oldPassword = trimValue(dto.getOldPassword());
        String newPassword = trimValue(dto.getNewPassword());
        if (!StringUtils.hasText(oldPassword) || !StringUtils.hasText(newPassword)) {
            return R.fail("密码不能为空");
        }

        SysUser existing = TenantBroker.applyWithoutTenant(ignored -> sysUserMapper.selectById(userId));
        if (existing == null) {
            return R.fail(404, "用户不存在");
        }

        if (!BCrypt.checkpw(oldPassword, existing.getPassword())) {
            return R.fail("当前密码错误");
        }

        SysUser update = new SysUser();
        update.setUserId(userId);
        update.setPassword(BCrypt.hashpw(newPassword, BCrypt.gensalt()));

        TenantBroker.applyWithoutTenant(ignored -> sysUserMapper.updateById(update));
        sysUserService.evictUserInfoCache(existing.getUserName());

        return R.ok("密码修改成功");
    }

    /**
     * 获取路由信息（菜单树）- 通过 Spring Cache 自动缓存
     */
    @GetMapping("/getRouters")
    public R<?> getRouters(HttpServletRequest request) {
        Map<String, Object> userMap = resolveLoginUser(request);
        if (userMap == null) {
            return R.fail(401, "Token已过期或无效");
        }

        Long userId = toLong(userMap.get("userId"));
        if (userId == null) {
            return R.fail(401, "登录用户信息异常");
        }

        List<SysMenu> menus = TenantBroker.applyWithoutTenant(ignored ->
                menuService.selectMenuTreeByUserId(userId)
        );
        return R.ok(menus);
    }

    /**
     * 退出登录
     * 清除 Token 和用户相关的所有缓存
     */
    @PostMapping("/logout")
    public R<?> logout(HttpServletRequest request) {
        String rawToken = resolveRawToken(request);

        Map<String, Object> userMap = tokenService.verifyToken(rawToken);
        if (userMap != null) {
            String username = (String) userMap.get("username");
            Long userId = toLong(userMap.get("userId"));

            if (username != null) {
                sysUserService.evictUserInfoCache(username);
            }

            if (userId != null) {
                menuService.evictUserMenuCache(userId);
            }
        }

        if (StringUtils.hasText(rawToken)) {
            tokenService.deleteToken(rawToken);
        }

        return R.ok("退出成功");
    }

    private Map<String, Object> resolveLoginUser(HttpServletRequest request) {
        return tokenService.verifyToken(resolveRawToken(request));
    }

    private String resolveRawToken(HttpServletRequest request) {
        String token = request.getHeader("Authorization");
        if (!StringUtils.hasText(token)) {
            return null;
        }
        return token.startsWith("Bearer ") ? token.substring(7) : token;
    }

    private Long toLong(Object value) {
        if (value instanceof Long longValue) {
            return longValue;
        }
        if (value instanceof Number number) {
            return number.longValue();
        }
        if (value == null) {
            return null;
        }
        try {
            return Long.parseLong(String.valueOf(value));
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private String trimValue(Object value) {
        return value == null ? "" : String.valueOf(value).trim();
    }

    private String extractUsername(Map<String, Object> userMap, Long userId) {
        Object usernameValue = userMap.get("username");
        if (usernameValue != null && StringUtils.hasText(String.valueOf(usernameValue))) {
            return String.valueOf(usernameValue);
        }
        if (userId == null) {
            return null;
        }
        SysUser dbUser = TenantBroker.applyWithoutTenant(ignored -> sysUserMapper.selectById(userId));
        return dbUser != null ? dbUser.getUserName() : null;
    }

    private Long resolveTenantId(Map<String, Object> userMap, SysUser cachedUser) {
        Long tenantId = toLong(userMap.get("tenantId"));
        return tenantId != null ? tenantId : cachedUser.getTenantId();
    }

    private Long resolveDeptId(Map<String, Object> userMap, SysUser cachedUser) {
        Long deptId = toLong(userMap.get("deptId"));
        return deptId != null ? deptId : cachedUser.getDeptId();
    }

    private String resolveTenantName(Map<String, Object> userMap, Long tenantId) {
        Object tenantName = userMap.get("tenantName");
        if (tenantName != null && StringUtils.hasText(String.valueOf(tenantName))) {
            return String.valueOf(tenantName);
        }
        return resolveTenantName(tenantId);
    }

    private String resolveTenantName(Long tenantId) {
        if (tenantId == null) {
            return null;
        }

        SysTenant tenant = TenantBroker.applyWithoutTenant(ignored -> sysTenantMapper.selectById(tenantId));
        return tenant != null ? tenant.getTenantName() : null;
    }

    private Collection<String> resolveStringCollection(Object tokenValue, Collection<String> fallback) {
        if (tokenValue instanceof Collection<?> collection) {
            List<String> values = new ArrayList<>();
            for (Object item : collection) {
                if (item != null && StringUtils.hasText(String.valueOf(item))) {
                    values.add(String.valueOf(item));
                }
            }
            if (!values.isEmpty()) {
                return values;
            }
        }
        return fallback;
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
    public R<DynamicMapVO> switchTenant(@RequestBody SwitchTenantDTO dto, HttpServletRequest request) {
        String rawToken = resolveRawToken(request);
        Map<String, Object> userMap = tokenService.verifyToken(rawToken);
        if (userMap == null) {
            return R.fail(401, "Token已过期或无效");
        }

        if (!hasAdminRole(userMap.get("roles"))) {
            return R.fail(403, "只有超级管理员才能切换租户");
        }

        Long targetTenantId = dto.getTenantId();
        if (targetTenantId == null) {
            return R.fail("租户ID不能为空");
        }

        userMap.put("tenantId", targetTenantId);
        userMap.put("tenantName", resolveTenantName(targetTenantId));

        if (StringUtils.hasText(rawToken)) {
            tokenService.deleteToken(rawToken);
        }

        String newToken = tokenService.createToken(userMap);

        Map<String, Object> result = new HashMap<>();
        result.put("token", newToken);
        result.put("tenantId", targetTenantId);
        result.put("message", "租户切换成功");

        return R.ok(DynamicMapVO.from(result));
    }

    private boolean hasAdminRole(Object rolesObj) {
        if (rolesObj instanceof Collection<?> roles) {
            for (Object role : roles) {
                if (role != null && "ADMIN".equalsIgnoreCase(String.valueOf(role))) {
                    return true;
                }
            }
            return false;
        }
        return rolesObj != null && "ADMIN".equalsIgnoreCase(String.valueOf(rolesObj));
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
