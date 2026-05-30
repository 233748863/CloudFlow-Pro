package com.cloudflow.auth.controller;

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
import com.cloudflow.auth.service.PasswordService;
import com.cloudflow.auth.service.ILoginLogService;
import com.cloudflow.auth.service.ISysTenantService;
import com.cloudflow.auth.service.ForcePasswordChangeService;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.tenant.TenantBroker;
import com.cloudflow.common.tenant.TenantConfigProperties;
import com.cloudflow.common.core.utils.IpUtils;
import com.cloudflow.common.security.core.TokenService;
import cn.dev33.satoken.annotation.SaCheckPermission;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.util.StringUtils;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.time.LocalDateTime;
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
    private ISysMenuService sysMenuService;

    @Autowired
    private ISysUserService sysUserService;

    @Autowired
    private ISysTenantService sysTenantService;

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
    private ILoginLogService loginLogService;

    @Autowired
    private com.cloudflow.auth.service.LoginLockService loginLockService;

    @Autowired
    private com.cloudflow.auth.service.ISysUserBlacklistService userBlacklistService;

    @Autowired
    private PasswordService passwordService;

    @Autowired
    private ForcePasswordChangeService forcePasswordChangeService;

    @Autowired
    private com.cloudflow.common.redis.core.SysConfigHelper sysConfigHelper;

    @PostMapping("/login")
    public R<DynamicMapVO> login(@RequestBody @Validated LoginBody form, HttpServletRequest request, HttpServletResponse response) {
        long startAt = System.currentTimeMillis();
        String username = trimValue(form.getUsername());

        // 先校验滑块验证码，避免未通过人机校验时继续执行登录流程。
        if (!captchaService.validatePassToken(form.getCaptchaToken(), getClientIp(request))) {
            loginLogService.recordLoginFailure(
                username,
                tenantConfigProperties.getDefaultTenantId(),
                request,
                "验证码失效或错误，请重新验证",
                System.currentTimeMillis() - startAt
            );
            return R.fail("验证码失效或错误，请重新验证");
        }

        SysTenant tenant = resolveTenantByCode(form.getTenantCode());
        String tenantError = validateTenantAvailable(tenant, false);
        if (tenantError != null) {
            loginLogService.recordLoginFailure(
                username,
                tenantConfigProperties.getDefaultTenantId(),
                request,
                tenantError,
                System.currentTimeMillis() - startAt
            );
            return R.fail(tenantError);
        }

        if (loginLockService.isLocked(username, tenant.getTenantId())) {
            loginLogService.recordLoginFailure(
                username,
                tenant.getTenantId(),
                request,
                "账号已锁定",
                System.currentTimeMillis() - startAt
            );
            int lockMinutes = sysConfigHelper.getConfigInt("sys.user.login.lockTime", 15);
            return R.fail("登录失败次数过多，账号已锁定 " + lockMinutes + " 分钟，请稍后再试");
        }

        LambdaQueryWrapper<SysUser> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.eq(SysUser::getUserName, username);
        queryWrapper.eq(SysUser::getTenantId, tenant.getTenantId());
        SysUser user = sysUserMapper.selectOne(queryWrapper);

        if (user == null) {
            loginLogService.recordLoginFailure(
                username,
                tenant.getTenantId(),
                request,
                "用户不存在",
                System.currentTimeMillis() - startAt
            );
            return R.fail("用户名或密码错误");
        }

        if (Integer.valueOf(1).equals(user.getDeleted())) {
            loginLogService.recordLoginFailure(
                username,
                user.getTenantId(),
                request,
                "账号已删除",
                System.currentTimeMillis() - startAt
            );
            return R.fail("用户名或密码错误");
        }

        if (!"0".equals(user.getStatus())) {
            loginLogService.recordLoginFailure(
                username,
                user.getTenantId(),
                request,
                "账号已停用",
                System.currentTimeMillis() - startAt
            );
            return R.fail("用户名或密码错误");
        }

        PasswordService.PasswordMatchResult passwordMatchResult = passwordService.matchesPassword(form.getPassword(), user.getPassword());
        if (!passwordMatchResult.matched()) {
            loginLockService.recordFailure(username, user.getTenantId());
            loginLogService.recordLoginFailure(
                username,
                user.getTenantId(),
                request,
                "密码错误",
                System.currentTimeMillis() - startAt
            );
            return R.fail("用户名或密码错误");
        }

        if (userBlacklistService.isBanned(user.getUserId())) {
            loginLogService.recordLoginFailure(
                username,
                user.getTenantId(),
                request,
                "用户已被拉黑",
                System.currentTimeMillis() - startAt
            );
            return R.fail("账号已被限制登录,请联系管理员");
        }

        String loginIp = getClientIp(request);
        user.setLoginIp(loginIp);
        user.setLoginDate(LocalDateTime.now());
        sysUserMapper.updateById(user);
        if (passwordMatchResult.legacyPlaintextMatch()) {
            SysUser passwordUpgrade = new SysUser();
            passwordUpgrade.setUserId(user.getUserId());
            passwordUpgrade.setPassword(passwordService.encodePassword(form.getPassword()));
            sysUserMapper.updateById(passwordUpgrade);
        }

        loginLockService.clearFailures(username, tenant.getTenantId());

        UserInfo userInfo = sysUserService.findUserInfo(username, tenant.getTenantId());
        if (userInfo == null) {
            loginLogService.recordLoginFailure(
                username,
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
        loginUser.put("tenantCode", tenant.getTenantCode());
        loginUser.put("tenantName", tenant.getTenantName());
        loginUser.put("avatar", user.getAvatar());
        loginUser.put("roles", userInfo.getRoles());
        loginUser.put("permissions", userInfo.getPermissions());
        boolean forcePasswordChange = forcePasswordChangeService.isRequired(user);
        loginUser.put("forcePasswordChange", forcePasswordChange);

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

        setAuthCookie(request, response, token);

        Map<String, Object> result = new HashMap<>();
        result.put("token", token);
        result.put("forcePasswordChange", forcePasswordChange);
        return R.ok(DynamicMapVO.from(result));
    }

    @PostMapping("/register")
    public R<?> register(@RequestBody @Validated RegisterBody registerBody, HttpServletRequest request) {
        if (!captchaService.validatePassToken(registerBody.getCaptchaToken(), getClientIp(request))) {
            return R.fail("验证码失效或错误，请重新验证");
        }

        if (!registerBody.getPassword().equals(registerBody.getConfirmPassword())) {
            return R.fail("两次输入的密码不一致");
        }

        String username = trimValue(registerBody.getUsername());
        SysTenant tenant = resolveTenantByCode(registerBody.getTenantCode());
        String tenantError = validateTenantAvailable(tenant, true);
        if (tenantError != null) {
            return R.fail(tenantError);
        }

        String emailDomainError = validateEmailDomainAllowed(tenant, registerBody.getEmail());
        if (emailDomainError != null) {
            return R.fail(emailDomainError);
        }

        LambdaQueryWrapper<SysUser> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.eq(SysUser::getUserName, username);
        queryWrapper.eq(SysUser::getTenantId, tenant.getTenantId());
        if (sysUserMapper.selectCount(queryWrapper) > 0) {
            return R.fail("用户 '" + username + "' 已存在");
        }

        SysUser user = new SysUser();
        user.setUserName(username);
        user.setNickName(username);
        user.setPassword(registerBody.getPassword());
        user.setEmail(registerBody.getEmail());
        user.setStatus("0");
        user.setDeleted(0);
        user.setTenantId(tenant.getTenantId());

        try {
            sysUserService.insertUser(user);
        } catch (IllegalStateException ex) {
            return R.fail(ex.getMessage());
        }

        return R.ok("注册成功");
    }

    @GetMapping("/tenant/options")
    public R<List<TenantOption>> tenantOptions() {
        List<SysTenant> tenants = TenantBroker.applyWithoutTenant(ignored ->
                sysTenantService.list(
                        new LambdaQueryWrapper<SysTenant>()
                                .eq(SysTenant::getStatus, "0")
                                .isNotNull(SysTenant::getTenantCode)
                                .ne(SysTenant::getTenantCode, "")
                                .and(wrapper -> wrapper.isNull(SysTenant::getExpireTime)
                                        .or()
                                        .gt(SysTenant::getExpireTime, LocalDateTime.now()))
                                .orderByAsc(SysTenant::getTenantName)
                )
        );

        return R.ok(tenants.stream()
                .filter(tenant -> StringUtils.hasText(tenant.getTenantCode()))
                .map(tenant -> new TenantOption(tenant.getTenantCode(), tenant.getTenantName()))
                .collect(Collectors.toList()));
    }

    @GetMapping("/info")
    @SaCheckPermission("system:auth:info")
    public R<DynamicMapVO> info(HttpServletRequest request) {
        Map<String, Object> userMap = resolveLoginUser(request);
        if (userMap == null) {
            return R.fail(401, "Token已过期或无效");
        }

        Long userId = toLong(userMap.get("userId"));
        String username = extractUsername(userMap, userId);
        Long tokenTenantId = toLong(userMap.get("tenantId"));

        UserInfo userInfo = TenantBroker.applyWithoutTenant(ignored ->
                StringUtils.hasText(username) && tokenTenantId != null
                        ? sysUserService.findUserInfo(username, tokenTenantId)
                        : null
        );
        if (userInfo == null) {
            return R.fail(401, "用户信息不存在");
        }

        SysUser cachedUser = userInfo.getSysUser();
        SysUser latestUser = TenantBroker.applyWithoutTenant(ignored -> sysUserMapper.selectById(cachedUser.getUserId()));
        if (latestUser == null) {
            return R.fail(401, "用户信息不存在");
        }
        boolean forcePasswordChange = forcePasswordChangeService.isRequired(latestUser);

        // 构建返回对象
        SysUser user = new SysUser();
        user.setUserId(latestUser.getUserId());
        user.setUserName(latestUser.getUserName());
        user.setNickName(latestUser.getNickName());
        user.setEmail(latestUser.getEmail());
        user.setPhonenumber(latestUser.getPhonenumber());
        user.setStatus(latestUser.getStatus());
        user.setCreateTime(latestUser.getCreateTime());
        user.setAvatar(latestUser.getAvatar());
        user.setPwdResetRequired(latestUser.getPwdResetRequired());
        Long tenantId = resolveTenantId(userMap, latestUser);
        user.setTenantId(tenantId);
        user.setDeptId(resolveDeptId(userMap, latestUser));
        user.setTenantName(resolveTenantName(userMap, tenantId));

        if (user.getAvatar() == null) {
            String avatarApi = sysConfigHelper.getConfigValue("sys.auth.avatar.apiUrl",
                    "https://api.dicebear.com/7.x/avataaars/svg");
            user.setAvatar(avatarApi + "?seed=" + user.getUserName());
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
        data.put("forcePasswordChange", forcePasswordChange);

        return R.ok(DynamicMapVO.from(data));
    }

    @PutMapping("/profile")
    @SaCheckPermission("system:user:profile:edit")
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
        sysUserService.evictUserInfoCache(existing.getUserName(), existing.getTenantId());

        return R.ok("保存成功");
    }

    @PutMapping("/profile/password")
    @SaCheckPermission("system:user:profile:password")
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
        if (oldPassword.equals(newPassword)) {
            return R.fail("新密码不能与当前密码相同");
        }

        SysUser existing = TenantBroker.applyWithoutTenant(ignored -> sysUserMapper.selectById(userId));
        if (existing == null) {
            return R.fail(404, "用户不存在");
        }

        if (!passwordService.matchesPassword(oldPassword, existing.getPassword()).matched()) {
            return R.fail("当前密码错误");
        }

        SysUser update = new SysUser();
        update.setUserId(userId);
        update.setPassword(passwordService.encodePassword(newPassword));
        update.setPwdResetRequired(ForcePasswordChangeService.NOT_REQUIRED);

        TenantBroker.applyWithoutTenant(ignored -> sysUserMapper.updateById(update));
        sysUserService.evictUserInfoCache(existing.getUserName(), existing.getTenantId());

        return R.ok("密码修改成功");
    }

    /**
     * 获取路由信息（菜单树）- 通过 Spring Cache 自动缓存
     */
    @GetMapping("/getRouters")
    @SaCheckPermission("system:auth:router")
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
                sysMenuService.selectMenuTreeByUserId(userId)
        );
        return R.ok(menus);
    }

    /**
     * 退出登录
     * 清除 Token 和用户相关的所有缓存
     */
    @PostMapping("/logout")
    @SaCheckPermission("system:auth:logout")
    public R<?> logout(HttpServletRequest request, HttpServletResponse response) {
        String rawToken = resolveRawToken(request);

        Map<String, Object> userMap = tokenService.verifyToken(rawToken);
        if (userMap != null) {
            String username = (String) userMap.get("username");
            Long userId = toLong(userMap.get("userId"));
            Long tenantId = toLong(userMap.get("tenantId"));

            if (username != null) {
                if (tenantId != null) {
                    sysUserService.evictUserInfoCache(username, tenantId);
                } else {
                    sysUserService.evictUserInfoCache(username);
                }
            }

            if (userId != null) {
                sysMenuService.evictUserMenuCache(userId);
            }
        }

        if (StringUtils.hasText(rawToken)) {
            tokenService.deleteToken(rawToken);
        }

        clearAuthCookie(request, response);

        return R.ok("退出成功");
    }

    private Map<String, Object> resolveLoginUser(HttpServletRequest request) {
        return tokenService.verifyToken(resolveRawToken(request));
    }

    private String resolveRawToken(HttpServletRequest request) {
        String token = request.getHeader("Authorization");
        if (!StringUtils.hasText(token)) {
            token = resolveCookieToken(request);
        }
        return unwrapBearerToken(token);
    }

    private static final String AUTH_COOKIE_NAME = "Authorization";

    private void setAuthCookie(HttpServletRequest request, HttpServletResponse response, String token) {
        Cookie cookie = new Cookie(AUTH_COOKIE_NAME, unwrapBearerToken(token));
        cookie.setHttpOnly(true);
        cookie.setSecure(isSecureRequest(request));
        cookie.setPath("/");
        cookie.setAttribute("SameSite", "Lax");
        cookie.setMaxAge(7 * 24 * 60 * 60);
        response.addCookie(cookie);
    }

    private void clearAuthCookie(HttpServletRequest request, HttpServletResponse response) {
        Cookie cookie = new Cookie(AUTH_COOKIE_NAME, "");
        cookie.setHttpOnly(true);
        cookie.setSecure(isSecureRequest(request));
        cookie.setPath("/");
        cookie.setAttribute("SameSite", "Lax");
        cookie.setMaxAge(0);
        response.addCookie(cookie);
    }

    private boolean isSecureRequest(HttpServletRequest request) {
        if (request == null) {
            return false;
        }
        if (request.isSecure()) {
            return true;
        }
        String forwardedProto = request.getHeader("X-Forwarded-Proto");
        if (StringUtils.hasText(forwardedProto) && "https".equalsIgnoreCase(forwardedProto)) {
            return true;
        }
        String forwardedSsl = request.getHeader("X-Forwarded-Ssl");
        return StringUtils.hasText(forwardedSsl) && "on".equalsIgnoreCase(forwardedSsl);
    }

    private String unwrapBearerToken(String token) {
        if (!StringUtils.hasText(token)) {
            return null;
        }
        if (token.startsWith("Bearer ")) {
            return token.substring("Bearer ".length());
        }
        return token;
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

    private SysTenant resolveTenantByCode(String tenantCode) {
        String normalizedCode = trimValue(tenantCode);
        if (!StringUtils.hasText(normalizedCode)) {
            return null;
        }

        return TenantBroker.applyWithoutTenant(ignored ->
                sysTenantMapper.selectOne(
                        new LambdaQueryWrapper<SysTenant>()
                                .eq(SysTenant::getTenantCode, normalizedCode)
                                .last("LIMIT 1")
                )
        );
    }

    private SysTenant resolveTenantById(Long tenantId) {
        if (tenantId == null) {
            return null;
        }
        return TenantBroker.applyWithoutTenant(ignored -> sysTenantMapper.selectById(tenantId));
    }

    private String validateTenantAvailable(SysTenant tenant, boolean checkUserLimit) {
        if (tenant == null) {
            return "租户不存在";
        }
        if (!"0".equals(tenant.getStatus())) {
            return "租户已停用";
        }
        if (tenant.getExpireTime() != null && LocalDateTime.now().isAfter(tenant.getExpireTime())) {
            return "租户已过期";
        }
        if (checkUserLimit && sysTenantService.isUserLimitReached(tenant.getTenantId())) {
            return "租户用户数量已达上限";
        }
        return null;
    }

    private String validateEmailDomainAllowed(SysTenant tenant, String email) {
        if (tenant == null) {
            return null;
        }
        String allowedDomainsConfig = tenant.getAllowedEmailDomains();
        if (!StringUtils.hasText(allowedDomainsConfig)) {
            return null;
        }
        if (!StringUtils.hasText(email)) {
            return "当前租户限制注册邮箱域名，邮箱不能为空";
        }
        int atIndex = email.lastIndexOf('@');
        if (atIndex < 0 || atIndex == email.length() - 1) {
            return "邮箱格式不正确";
        }
        String domain = email.substring(atIndex + 1).trim().toLowerCase(Locale.ROOT);
        if (domain.isEmpty()) {
            return "邮箱格式不正确";
        }
        Set<String> allowedDomains = Arrays.stream(allowedDomainsConfig.split(","))
                .map(String::trim)
                .filter(StringUtils::hasText)
                .map(value -> value.toLowerCase(Locale.ROOT))
                .collect(Collectors.toSet());
        if (allowedDomains.isEmpty()) {
            return null;
        }
        if (!allowedDomains.contains(domain)) {
            return "当前租户不允许使用该邮箱域名注册";
        }
        return null;
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
        return IpUtils.getIpAddr(request);
    }

    /**
     * 租户切换接口（仅超级管理员可用）
     * 允许超级管理员切换到指定租户，以便查看和管理该租户的数据
     */
    @PostMapping("/switchTenant")
    @SaCheckPermission("system:tenant:switch")
    public R<DynamicMapVO> switchTenant(@RequestBody SwitchTenantDTO dto, HttpServletRequest request, HttpServletResponse response) {
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

        SysTenant targetTenant = resolveTenantById(targetTenantId);
        String tenantError = validateTenantAvailable(targetTenant, false);
        if (tenantError != null) {
            return R.fail(tenantError);
        }

        userMap.put("tenantId", targetTenant.getTenantId());
        userMap.put("tenantCode", targetTenant.getTenantCode());
        userMap.put("tenantName", targetTenant.getTenantName());

        if (StringUtils.hasText(rawToken)) {
            tokenService.deleteToken(rawToken);
        }

        String newToken = tokenService.createToken(userMap);

        setAuthCookie(request, response, newToken);

        Map<String, Object> result = new HashMap<>();
        result.put("token", newToken);
        result.put("tenantId", targetTenant.getTenantId());
        result.put("tenantCode", targetTenant.getTenantCode());
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

    public static String resolveCookieToken(HttpServletRequest request) {
        Cookie[] cookies = request.getCookies();
        if (cookies == null) {
            return null;
        }
        for (Cookie cookie : cookies) {
            if (AUTH_COOKIE_NAME.equals(cookie.getName()) && StringUtils.hasText(cookie.getValue())) {
                return cookie.getValue();
            }
        }
        return null;
    }

    public static class TenantOption {
        private final String tenantCode;
        private final String tenantName;

        private TenantOption(String tenantCode, String tenantName) {
            this.tenantCode = tenantCode;
            this.tenantName = tenantName;
        }

        public String getTenantCode() {
            return tenantCode;
        }

        public String getTenantName() {
            return tenantName;
        }
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
