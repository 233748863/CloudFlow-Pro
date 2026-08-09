package com.cloudflow.auth.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.auth.domain.LoginBody;
import com.cloudflow.auth.domain.RegisterBody;
import com.cloudflow.auth.domain.SysMenu;
import com.cloudflow.auth.domain.SysTenant;
import com.cloudflow.auth.domain.SysUser;
import com.cloudflow.auth.domain.dto.ChangePasswordDTO;
import com.cloudflow.auth.domain.dto.ProfileUpdateDTO;
import com.cloudflow.auth.domain.dto.SwitchTenantDTO;
import com.cloudflow.auth.domain.dto.TotpDisableDTO;
import com.cloudflow.auth.domain.dto.TotpEnableDTO;
import com.cloudflow.auth.domain.dto.TotpLoginDTO;
import com.cloudflow.auth.domain.dto.TotpSetupDTO;
import com.cloudflow.auth.domain.dto.UserInfo;
import com.cloudflow.auth.domain.vo.DynamicMapVO;
import com.cloudflow.auth.domain.vo.TotpSetupVO;
import com.cloudflow.auth.domain.vo.TotpStatusVO;
import com.cloudflow.auth.mapper.SysTenantMapper;
import com.cloudflow.auth.mapper.SysUserMapper;
import com.cloudflow.auth.service.ISysMenuService;
import com.cloudflow.auth.service.ISysUserService;
import com.cloudflow.auth.service.PasswordService;
import com.cloudflow.auth.service.PasswordPolicyService;
import com.cloudflow.auth.service.ILoginLogService;
import com.cloudflow.auth.service.ISysTenantService;
import com.cloudflow.auth.service.ILegalAgreementService;
import com.cloudflow.auth.service.ForcePasswordChangeService;
import com.cloudflow.auth.service.LoginRiskNoticeService;
import com.cloudflow.auth.service.UserLoginHistoryService;
import com.cloudflow.auth.service.UserDataScopeService;
import com.cloudflow.auth.service.TotpService;
import com.cloudflow.common.core.context.UserDataScopeSnapshot;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.exception.ErrorCodeConstants;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.ratelimiter.annotation.RateLimiter;
import com.cloudflow.common.ratelimiter.enums.LimitType;
import com.cloudflow.common.tenant.TenantBroker;
import com.cloudflow.common.tenant.TenantConfigProperties;
import com.cloudflow.common.core.utils.IpUtils;
import com.cloudflow.common.security.cookie.AuthCookieSupport;
import com.cloudflow.common.security.core.TokenService;
import cn.dev33.satoken.annotation.SaCheckPermission;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.util.StringUtils;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

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
    private PasswordPolicyService passwordPolicyService;

    @Autowired
    private ForcePasswordChangeService forcePasswordChangeService;

    @Autowired
    private UserDataScopeService userDataScopeService;

    @Autowired
    private LoginRiskNoticeService loginRiskNoticeService;

    @Autowired
    private UserLoginHistoryService userLoginHistoryService;

    @Autowired
    private com.cloudflow.common.redis.core.SysConfigHelper sysConfigHelper;

    @Autowired
    private ILegalAgreementService legalAgreementService;

    @Autowired
    private TotpService totpService;

    @PostMapping("/login")
    @RepeatSubmit.Disabled
    @RateLimiter(key = "auth:login", time = 60, count = 10, limitType = LimitType.IP, message = "登录尝试过于频繁，请稍后再试")
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

        try {
            legalAgreementService.assertCurrentReleaseAccepted(tenant, form.getLegalReleaseCode());
        } catch (ServiceException ex) {
            loginLogService.recordLoginFailure(
                username,
                tenant.getTenantId(),
                request,
                ex.getMessage(),
                System.currentTimeMillis() - startAt
            );
            return R.fail(ex.getMessage());
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

        if (passwordMatchResult.legacyPlaintextMatch()) {
            SysUser passwordUpgrade = new SysUser();
            passwordUpgrade.setUserId(user.getUserId());
            passwordUpgrade.setPassword(passwordService.encodePassword(form.getPassword()));
            sysUserMapper.updateById(passwordUpgrade);
        }

        if (totpService.isEnabled(user.getUserId(), user.getTenantId())) {
            String tempToken = totpService.issueLoginChallenge(user, form.getLegalReleaseCode(), startAt);
            Map<String, Object> challenge = new HashMap<>();
            challenge.put("requiresTotp", true);
            challenge.put("tempToken", tempToken);
            challenge.put("userEmailMasked", maskAccount(user));
            return R.ok(DynamicMapVO.from(challenge));
        }

        return completeLogin(user, tenant, form.getLegalReleaseCode(), request, response, startAt);
    }

    @PostMapping("/login/totp")
    @RepeatSubmit.Disabled
    @RateLimiter(key = "auth:login:totp", time = 60, count = 10, limitType = LimitType.IP, message = "验证码尝试过于频繁，请稍后再试")
    public R<DynamicMapVO> verifyLoginTotp(
            @RequestBody @Validated TotpLoginDTO form,
            HttpServletRequest request,
            HttpServletResponse response
    ) {
        TotpService.PendingLoginChallenge challenge = totpService.requireLoginChallenge(trimValue(form.getTempToken()));
        TotpService.LoginChallengePayload payload = challenge.payload();
        SysUser user = TenantBroker.applyWithoutTenant(ignored -> sysUserMapper.selectOne(
                new LambdaQueryWrapper<SysUser>()
                        .eq(SysUser::getUserId, payload.userId())
                        .eq(SysUser::getTenantId, payload.tenantId())
        ));
        SysTenant tenant = resolveTenantById(payload.tenantId());
        String tenantError = validateTenantAvailable(tenant, false);
        if (user == null || Integer.valueOf(1).equals(user.getDeleted()) || !"0".equals(user.getStatus()) || tenantError != null) {
            throw new ServiceException("账号状态已变更，请重新登录", ErrorCodeConstants.BAD_REQUEST);
        }
        if (userBlacklistService.isBanned(user.getUserId())) {
            throw new ServiceException("账号已被限制登录,请联系管理员", ErrorCodeConstants.FORBIDDEN);
        }
        if (!totpService.verifyLoginCode(user.getUserId(), user.getTenantId(), form.getCode())) {
            // 失败也消费掉临时凭证：否则单个凭证可在 TTL 内被反复用来枚举 6 位码
            totpService.discardLoginChallenge(challenge);
            // 接入账号级锁定，与密码错误路径保持一致的防护强度
            loginLockService.recordFailure(user.getUserName(), user.getTenantId());
            loginLogService.recordLoginFailure(
                    user.getUserName(),
                    user.getTenantId(),
                    request,
                    "动态验证码错误",
                    System.currentTimeMillis() - payload.startedAt()
            );
            return R.fail("验证码错误，请重新登录后重试");
        }

        totpService.consumeLoginChallenge(challenge);
        return completeLogin(user, tenant, payload.legalReleaseCode(), request, response, payload.startedAt());
    }

    @PostMapping("/register")
    @RepeatSubmit.Disabled
    @RateLimiter(key = "auth:register", time = 60, count = 5, limitType = LimitType.IP, message = "注册请求过于频繁，请稍后再试")
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

        try {
            legalAgreementService.assertCurrentReleaseAccepted(tenant, registerBody.getLegalReleaseCode());
        } catch (ServiceException ex) {
            return R.fail(ex.getMessage());
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
        passwordPolicyService.validateOrThrow(registerBody.getPassword(), user);
        user.setPassword(registerBody.getPassword());
        user.setEmail(registerBody.getEmail());
        user.setStatus("0");
        user.setDeleted(0);
        user.setTenantId(tenant.getTenantId());

        try {
            sysUserService.insertUser(user);
            legalAgreementService.recordConsent(user, registerBody.getLegalReleaseCode(), request, "REGISTER");
        } catch (IllegalStateException ex) {
            return R.fail(ex.getMessage());
        }

        return R.ok("注册成功");
    }

    @GetMapping("/tenant/options")
    @RateLimiter(key = "auth:tenant-options", time = 60, count = 120, limitType = LimitType.IP)
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
    public R<DynamicMapVO> info(HttpServletRequest request, HttpServletResponse response) {
        String rawToken = resolveRawToken(request);
        Map<String, Object> userMap = requireLoginUser(rawToken);

        Long userId = toLong(userMap.get("userId"));
        String username = extractUsername(userMap, userId);
        Long tokenTenantId = toLong(userMap.get("tenantId"));

        UserInfo userInfo = TenantBroker.applyWithoutTenant(ignored ->
                StringUtils.hasText(username) && tokenTenantId != null
                        ? sysUserService.findUserInfo(username, tokenTenantId)
                        : null
        );
        if (userInfo == null) {
            throw new ServiceException("用户信息不存在", ErrorCodeConstants.UNAUTHORIZED);
        }

        SysUser cachedUser = userInfo.getSysUser();
        SysUser latestUser = TenantBroker.applyWithoutTenant(ignored -> sysUserMapper.selectById(cachedUser.getUserId()));
        if (latestUser == null) {
            throw new ServiceException("用户信息不存在", ErrorCodeConstants.UNAUTHORIZED);
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

        setAuthCookie(request, response, rawToken);

        return R.ok(DynamicMapVO.from(data));
    }

    @PutMapping("/profile")
    @SaCheckPermission("system:user:profile:edit")
    public R<?> updateProfile(@RequestBody ProfileUpdateDTO dto, HttpServletRequest request) {
        Map<String, Object> userMap = requireLoginUser(request);
        Long userId = requireUserId(userMap);

        String nickName = trimValue(dto.getNickName());
        if (!StringUtils.hasText(nickName)) {
            throw new ServiceException("显示名称不能为空", ErrorCodeConstants.BAD_REQUEST);
        }

        SysUser existing = requireExistingUser(userId);

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
        Map<String, Object> userMap = requireLoginUser(request);
        Long userId = requireUserId(userMap);

        String oldPassword = trimValue(dto.getOldPassword());
        String newPassword = trimValue(dto.getNewPassword());
        if (!StringUtils.hasText(oldPassword) || !StringUtils.hasText(newPassword)) {
            throw new ServiceException("密码不能为空", ErrorCodeConstants.BAD_REQUEST);
        }
        if (oldPassword.equals(newPassword)) {
            throw new ServiceException("新密码不能与当前密码相同", ErrorCodeConstants.BAD_REQUEST);
        }

        SysUser existing = requireExistingUser(userId);

        if (!passwordService.matchesPassword(oldPassword, existing.getPassword()).matched()) {
            throw new ServiceException("当前密码错误", ErrorCodeConstants.BAD_REQUEST);
        }
        passwordPolicyService.validateOrThrow(newPassword, existing);

        SysUser update = new SysUser();
        update.setUserId(userId);
        update.setPassword(passwordService.encodePassword(newPassword));
        update.setPwdResetRequired(ForcePasswordChangeService.NOT_REQUIRED);

        TenantBroker.applyWithoutTenant(ignored -> sysUserMapper.updateById(update));
        sysUserService.evictUserInfoCache(existing.getUserName(), existing.getTenantId());

        return R.ok("密码修改成功");
    }

    @GetMapping("/profile/totp/status")
    @SaCheckPermission("system:user:profile:password")
    public R<TotpStatusVO> getTotpStatus(HttpServletRequest request) {
        Map<String, Object> userMap = requireLoginUser(request);
        SysUser user = requireExistingUser(requireUserId(userMap));
        return R.ok(totpService.getStatus(user.getUserId(), user.getTenantId()));
    }

    @PostMapping("/profile/totp/setup")
    @SaCheckPermission("system:user:profile:password")
    @RateLimiter(key = "auth:profile:totp:setup", time = 60, count = 5, limitType = LimitType.USER)
    public R<TotpSetupVO> setupTotp(@RequestBody @Validated TotpSetupDTO dto, HttpServletRequest request) {
        Map<String, Object> userMap = requireLoginUser(request);
        SysUser user = requireExistingUser(requireUserId(userMap));
        verifyCurrentPassword(user, dto.getPassword());
        return R.ok(totpService.beginSetup(user));
    }

    @PostMapping("/profile/totp/enable")
    @SaCheckPermission("system:user:profile:password")
    @RateLimiter(key = "auth:profile:totp:enable", time = 60, count = 10, limitType = LimitType.USER)
    public R<TotpStatusVO> enableTotp(@RequestBody @Validated TotpEnableDTO dto, HttpServletRequest request) {
        Map<String, Object> userMap = requireLoginUser(request);
        SysUser user = requireExistingUser(requireUserId(userMap));
        verifyCurrentPassword(user, dto.getPassword());
        LocalDateTime enabledAt = totpService.enable(user, dto.getCode());
        return R.ok(new TotpStatusVO(true, true, enabledAt));
    }

    @PostMapping("/profile/totp/disable")
    @SaCheckPermission("system:user:profile:password")
    @RateLimiter(key = "auth:profile:totp:disable", time = 60, count = 5, limitType = LimitType.USER)
    public R<TotpStatusVO> disableTotp(@RequestBody @Validated TotpDisableDTO dto, HttpServletRequest request) {
        Map<String, Object> userMap = requireLoginUser(request);
        SysUser user = requireExistingUser(requireUserId(userMap));
        verifyCurrentPassword(user, dto.getPassword());
        totpService.disable(user);
        return R.ok(new TotpStatusVO(true, false, null));
    }

    /**
     * 获取路由信息（菜单树）- 通过 Spring Cache 自动缓存
     */
    @GetMapping("/getRouters")
    @SaCheckPermission("system:auth:router")
    public R<?> getRouters(HttpServletRequest request) {
        Map<String, Object> userMap = requireLoginUser(request);
        Long userId = requireUserId(userMap);

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
    @RepeatSubmit.Disabled
    @SaCheckPermission("system:auth:logout")
    @RateLimiter(key = "auth:logout", time = 60, count = 30, limitType = LimitType.IP)
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
                userDataScopeService.clear(tenantId, userId);
            }
        }

        if (StringUtils.hasText(rawToken)) {
            tokenService.deleteToken(rawToken);
        }

        clearAuthCookie(request, response);

        return R.ok("退出成功");
    }

    private R<DynamicMapVO> completeLogin(
            SysUser user,
            SysTenant tenant,
            String legalReleaseCode,
            HttpServletRequest request,
            HttpServletResponse response,
            long startAt
    ) {
        UserInfo userInfo = sysUserService.findUserInfo(user.getUserName(), tenant.getTenantId());
        if (userInfo == null) {
            loginLogService.recordLoginFailure(
                    user.getUserName(),
                    user.getTenantId(),
                    request,
                    "用户信息异常",
                    System.currentTimeMillis() - startAt
            );
            return R.fail("用户信息异常");
        }

        String loginIp = getClientIp(request);
        LocalDateTime loginTime = LocalDateTime.now();
        UserLoginHistoryService.LoginRiskContext loginRiskContext = userLoginHistoryService.recordLogin(user, loginIp, loginTime);
        user.setLoginIp(loginIp);
        user.setLoginDate(loginTime);
        sysUserMapper.updateById(user);
        loginRiskNoticeService.notifyIfLocationChanged(user, loginRiskContext);
        loginLockService.clearFailures(user.getUserName(), tenant.getTenantId());

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

        UserDataScopeSnapshot dataScopeSnapshot = userDataScopeService.refresh(user.getUserId());
        if (dataScopeSnapshot != null) {
            loginUser.put("dsType", dataScopeSnapshot.getDsType());
            loginUser.put("dsDeptIds", dataScopeSnapshot.getDsDeptIds());
        }

        String token = tokenService.createToken(loginUser);
        loginLogService.recordLoginSuccess(
                user.getUserName(),
                user.getTenantId(),
                request,
                System.currentTimeMillis() - startAt
        );
        setAuthCookie(request, response, token);
        legalAgreementService.recordConsent(user, legalReleaseCode, request, "LOGIN");

        Map<String, Object> result = new HashMap<>();
        result.put("token", token);
        result.put("forcePasswordChange", forcePasswordChange);
        return R.ok(DynamicMapVO.from(result));
    }

    private void verifyCurrentPassword(SysUser user, String password) {
        if (!StringUtils.hasText(password)
                || !passwordService.matchesPassword(password, user.getPassword()).matched()) {
            throw new ServiceException("当前密码错误", ErrorCodeConstants.BAD_REQUEST);
        }
    }

    private String maskAccount(SysUser user) {
        String email = trimValue(user.getEmail());
        int at = email.indexOf('@');
        if (at > 0 && at < email.length() - 1) {
            return email.substring(0, 1) + "***" + email.substring(at);
        }
        String username = trimValue(user.getUserName());
        return username.isEmpty() ? "" : username.substring(0, 1) + "***";
    }

    private Map<String, Object> resolveLoginUser(HttpServletRequest request) {
        return tokenService.verifyToken(resolveRawToken(request));
    }

    private Map<String, Object> requireLoginUser(HttpServletRequest request) {
        return requireLoginUser(resolveRawToken(request));
    }

    private Map<String, Object> requireLoginUser(String rawToken) {
        Map<String, Object> userMap = tokenService.verifyToken(rawToken);
        if (userMap == null) {
            throw new ServiceException("Token已过期或无效", ErrorCodeConstants.UNAUTHORIZED);
        }
        return userMap;
    }

    private Long requireUserId(Map<String, Object> userMap) {
        Long userId = toLong(userMap.get("userId"));
        if (userId == null) {
            throw new ServiceException("登录用户信息异常", ErrorCodeConstants.UNAUTHORIZED);
        }
        return userId;
    }

    private SysUser requireExistingUser(Long userId) {
        SysUser existing = TenantBroker.applyWithoutTenant(ignored -> sysUserMapper.selectById(userId));
        if (existing == null) {
            throw new ServiceException("用户不存在", ErrorCodeConstants.NOT_FOUND);
        }
        return existing;
    }

    private String resolveRawToken(HttpServletRequest request) {
        return AuthCookieSupport.resolveRawToken(request);
    }

    private void setAuthCookie(HttpServletRequest request, HttpServletResponse response, String token) {
        AuthCookieSupport.addAuthCookies(request, response, token, tokenService.getExpirationSeconds());
    }

    private void clearAuthCookie(HttpServletRequest request, HttpServletResponse response) {
        AuthCookieSupport.clearAuthCookies(request, response);
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
                sysTenantMapper.selectPage(new Page<>(1, 1, false),
                        new LambdaQueryWrapper<SysTenant>()
                                .eq(SysTenant::getTenantCode, normalizedCode))
                        .getRecords().stream().findFirst().orElse(null)
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
    @RepeatSubmit.Disabled
    @SaCheckPermission("system:tenant:switch")
    @RateLimiter(key = "auth:switch-tenant", time = 60, count = 20, limitType = LimitType.USER)
    public R<DynamicMapVO> switchTenant(@RequestBody SwitchTenantDTO dto, HttpServletRequest request, HttpServletResponse response) {
        String rawToken = resolveRawToken(request);
        Map<String, Object> userMap = tokenService.verifyToken(rawToken);
        if (userMap == null) {
            throw new ServiceException("Token已过期或无效", ErrorCodeConstants.UNAUTHORIZED);
        }

        if (!hasAdminRole(userMap.get("roles"))) {
            throw new ServiceException("只有超级管理员才能切换租户", ErrorCodeConstants.FORBIDDEN);
        }

        Long targetTenantId = dto.getTenantId();
        if (targetTenantId == null) {
            throw new ServiceException("租户ID不能为空", ErrorCodeConstants.BAD_REQUEST);
        }

        SysTenant targetTenant = resolveTenantById(targetTenantId);
        String tenantError = validateTenantAvailable(targetTenant, false);
        if (tenantError != null) {
            throw new ServiceException(tenantError, ErrorCodeConstants.BAD_REQUEST);
        }

        userMap.put("tenantId", targetTenant.getTenantId());
        userMap.put("tenantCode", targetTenant.getTenantCode());
        userMap.put("tenantName", targetTenant.getTenantName());
        userMap.put("dsType", 0);
        userMap.put("dsDeptIds", List.of());
        userMap.put("deptId", null);
        userMap.put("deptName", null);

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

}
