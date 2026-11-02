package com.cloudflow.auth.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.auth.domain.SysDept;
import com.cloudflow.auth.domain.SysUser;
import com.cloudflow.auth.mapper.SysUserMapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.exception.ErrorCodeConstants;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.tenant.TenantContext;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.function.Function;
import java.util.stream.Collectors;

/** 部门负责人使用用户编号关联，名称只在读取时补全。 */
@Service
@RequiredArgsConstructor
public class SysDeptLeaderService {
    private final SysUserMapper userMapper;

    public record LeaderOption(Long userId, String name) {}

    public List<LeaderOption> options() {
        Long tenantId = currentTenantId();
        return userMapper.selectList(new LambdaQueryWrapper<SysUser>()
                        .select(SysUser::getUserId, SysUser::getUserName, SysUser::getNickName)
                        .eq(SysUser::getTenantId, tenantId)
                        .eq(SysUser::getStatus, "0")
                        .eq(SysUser::getDeleted, 0)
                        .orderByAsc(SysUser::getUserId)).stream()
                .map(user -> new LeaderOption(user.getUserId(), displayName(user)))
                .toList();
    }

    public void validate(SysDept dept) {
        Long tenantId = currentTenantId();
        if (dept.getTenantId() != null && !Objects.equals(dept.getTenantId(), tenantId)) {
            throw new ServiceException("不允许跨租户设置部门负责人", ErrorCodeConstants.BAD_REQUEST);
        }
        dept.setTenantId(tenantId);
        if (dept.getLeaderUserId() == null) {
            return;
        }
        Long count = userMapper.selectCount(new LambdaQueryWrapper<SysUser>()
                .eq(SysUser::getUserId, dept.getLeaderUserId())
                .eq(SysUser::getTenantId, tenantId)
                .eq(SysUser::getStatus, "0")
                .eq(SysUser::getDeleted, 0));
        if (count == 0) {
            throw new ServiceException("请选择本租户的有效用户作为部门负责人", ErrorCodeConstants.BAD_REQUEST);
        }
    }

    public void fillNames(List<SysDept> depts) {
        List<Long> ids = depts.stream().map(SysDept::getLeaderUserId).filter(Objects::nonNull).distinct().toList();
        if (ids.isEmpty()) {
            return;
        }
        Map<Long, SysUser> users = userMapper.selectBatchIds(ids).stream()
                .collect(Collectors.toMap(SysUser::getUserId, Function.identity()));
        for (SysDept dept : depts) {
            SysUser user = users.get(dept.getLeaderUserId());
            dept.setLeaderName(user != null && Objects.equals(user.getTenantId(), dept.getTenantId())
                    ? displayName(user) : null);
        }
    }

    private Long currentTenantId() {
        Long tenantId = UserContext.getTenantId();
        if (tenantId == null) {
            tenantId = TenantContext.getTenantId();
        }
        if (tenantId == null) {
            throw new ServiceException("缺少租户信息", ErrorCodeConstants.BAD_REQUEST);
        }
        return tenantId;
    }

    private String displayName(SysUser user) {
        return StringUtils.hasText(user.getNickName()) ? user.getNickName() : user.getUserName();
    }
}
