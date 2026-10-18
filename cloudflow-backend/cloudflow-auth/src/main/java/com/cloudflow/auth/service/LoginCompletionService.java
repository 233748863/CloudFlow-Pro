package com.cloudflow.auth.service;

import com.cloudflow.auth.domain.SysTenant;
import com.cloudflow.auth.domain.SysUser;
import com.cloudflow.auth.domain.dto.UserInfo;
import com.cloudflow.auth.domain.vo.DynamicMapVO;
import com.cloudflow.auth.mapper.SysDeptMapper;
import com.cloudflow.auth.mapper.SysUserMapper;
import com.cloudflow.common.core.context.UserDataScopeSnapshot;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.exception.ErrorCodeConstants;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.core.utils.IpUtils;
import com.cloudflow.common.security.cookie.AuthCookieSupport;
import com.cloudflow.common.security.core.TokenService;
import com.cloudflow.common.tenant.TenantBroker;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class LoginCompletionService {
    private final ISysUserService sysUserService;
    private final ILoginLogService loginLogService;
    private final SysUserMapper sysUserMapper;
    private final UserLoginHistoryService userLoginHistoryService;
    private final LoginRiskNoticeService loginRiskNoticeService;
    private final LoginLockService loginLockService;
    private final SysDeptMapper sysDeptMapper;
    private final ForcePasswordChangeService forcePasswordChangeService;
    private final UserDataScopeService userDataScopeService;
    private final TokenService tokenService;
    private final ILegalAgreementService legalAgreementService;

    public R<DynamicMapVO> completeLogin(
            SysUser user,
            SysTenant tenant,
            String legalReleaseCode,
            HttpServletRequest request,
            HttpServletResponse response,
            long startAt
    ) {
        return completeLogin(user, tenant, legalReleaseCode, request, response, startAt, false);
    }

    public R<DynamicMapVO> completeDetachedLogin(SysUser user, SysTenant tenant, String legalReleaseCode,
            HttpServletRequest request, long startAt) {
        return completeLogin(user, tenant, legalReleaseCode, request, null, startAt, true);
    }

    private R<DynamicMapVO> completeLogin(SysUser user, SysTenant tenant, String legalReleaseCode,
            HttpServletRequest request, HttpServletResponse response, long startAt, boolean detached) {
        UserInfo userInfo = TenantBroker.applyAs(tenant.getTenantId(), tenantId -> sysUserService.findUserInfo(user.getUserName(), tenantId));
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

        String loginIp = IpUtils.getIpAddr(request);
        LocalDateTime loginTime = LocalDateTime.now();
        if (user.getVersion() == null || sysUserMapper.recordLogin(user.getUserId(), user.getTenantId(), user.getVersion(), loginIp, loginTime) != 1) {
            throw new ServiceException("账号或组织信息已变化，请重新登录", ErrorCodeConstants.UNAUTHORIZED);
        }
        UserLoginHistoryService.LoginRiskContext loginRiskContext = userLoginHistoryService.recordLogin(user, loginIp, loginTime);
        user.setLoginIp(loginIp);
        user.setLoginDate(loginTime);
        loginRiskNoticeService.notifyIfLocationChanged(user, loginRiskContext);
        loginLockService.clearFailures(user.getUserName(), tenant.getTenantId());

        Map<String, Object> loginUser = new HashMap<>();
        loginUser.put("userId", user.getUserId());
        loginUser.put("ownerTenantId", user.getTenantId());
        loginUser.put("userVersion", user.getVersion());
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

        String token = detached ? tokenService.createDetachedToken(loginUser) : tokenService.createToken(loginUser);
        try {
            loginLogService.recordLoginSuccess(
                    user.getUserName(),
                    user.getTenantId(),
                    request,
                    System.currentTimeMillis() - startAt
            );
            if (!detached) AuthCookieSupport.addAuthCookies(request, response, token, tokenService.getExpirationSeconds());
            legalAgreementService.recordConsent(user, legalReleaseCode, request, "LOGIN");

            Map<String, Object> result = new HashMap<>();
            result.put("token", token);
            result.put("forcePasswordChange", forcePasswordChange);
            return R.ok(DynamicMapVO.from(result));
        } catch (RuntimeException failure) {
            if (detached) tokenService.deleteToken(token);
            throw failure;
        }
    }
}
