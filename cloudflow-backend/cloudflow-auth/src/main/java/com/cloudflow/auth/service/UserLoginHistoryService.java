package com.cloudflow.auth.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.auth.domain.SysUser;
import com.cloudflow.auth.domain.SysUserLoginHistory;
import com.cloudflow.auth.mapper.SysUserLoginHistoryMapper;
import com.cloudflow.common.core.utils.IpUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;

@Service
@RequiredArgsConstructor
public class UserLoginHistoryService {

    private final SysUserLoginHistoryMapper loginHistoryMapper;
    private final IpLocationResolver ipLocationResolver;

    public LoginRiskContext recordLogin(SysUser user, String loginIp, LocalDateTime loginTime) {
        String currentIp = normalizeIp(loginIp);
        String currentSegment = resolveNetworkSegment(currentIp);
        IpLocationResolver.ResolvedLocation currentLocation = ipLocationResolver.resolve(currentIp);
        if (user == null || user.getUserId() == null) {
            return new LoginRiskContext(null, currentIp, null, currentLocation.label(), null, currentLocation.province(), loginTime);
        }

        SysUserLoginHistory previous = loginHistoryMapper.selectOne(new LambdaQueryWrapper<SysUserLoginHistory>()
                .eq(SysUserLoginHistory::getUserId, user.getUserId())
                .eq(user.getTenantId() != null, SysUserLoginHistory::getTenantId, user.getTenantId())
                .orderByDesc(SysUserLoginHistory::getLoginTime)
                .last("LIMIT 1"));

        SysUserLoginHistory history = new SysUserLoginHistory();
        history.setTenantId(user.getTenantId());
        history.setUserId(user.getUserId());
        history.setLoginIp(currentIp);
        history.setNetworkSegment(currentSegment);
        history.setLocationLabel(currentLocation.label());
        history.setLoginTime(loginTime);
        history.setCreateBy(StringUtils.hasText(user.getUserName()) ? user.getUserName() : "system");
        history.setCreateTime(loginTime);
        loginHistoryMapper.insert(history);

        String previousLocationLabel = previous == null ? null : previous.getLocationLabel();
        return new LoginRiskContext(
                previous == null ? null : previous.getLoginIp(),
                currentIp,
                previousLocationLabel,
                currentLocation.label(),
                previousLocationLabel == null ? null : ipLocationResolver.extractProvince(previousLocationLabel),
                currentLocation.province(),
                loginTime
        );
    }

    private String normalizeIp(String loginIp) {
        String normalized = IpUtils.normalizeIpAddress(loginIp);
        return StringUtils.hasText(normalized) ? normalized : "unknown";
    }

    private String resolveNetworkSegment(String ip) {
        if (!StringUtils.hasText(ip) || "unknown".equalsIgnoreCase(ip)) {
            return "unknown";
        }
        if (ip.contains(".")) {
            String[] parts = ip.split("\\.");
            return parts.length >= 2 ? parts[0] + "." + parts[1] : ip;
        }
        if (ip.contains(":")) {
            String[] parts = ip.split(":");
            int len = Math.min(parts.length, 4);
            StringBuilder builder = new StringBuilder();
            for (int i = 0; i < len; i++) {
                if (i > 0) {
                    builder.append(':');
                }
                builder.append(parts[i]);
            }
            return builder.toString();
        }
        return ip;
    }

    public record LoginRiskContext(
            String previousIp,
            String currentIp,
            String previousLocation,
            String currentLocation,
            String previousProvince,
            String currentProvince,
            LocalDateTime loginTime
    ) {
    }
}
