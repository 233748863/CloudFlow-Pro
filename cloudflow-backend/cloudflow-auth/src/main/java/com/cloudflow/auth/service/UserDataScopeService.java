package com.cloudflow.auth.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.auth.domain.SysDept;
import com.cloudflow.auth.domain.SysRole;
import com.cloudflow.auth.domain.SysUser;
import com.cloudflow.auth.domain.SysUserRole;
import com.cloudflow.auth.mapper.SysDeptMapper;
import com.cloudflow.auth.mapper.SysRoleMapper;
import com.cloudflow.auth.mapper.SysUserMapper;
import com.cloudflow.auth.mapper.SysUserRoleMapper;
import com.cloudflow.common.core.context.UserDataScopeSnapshot;
import com.cloudflow.common.redis.core.UserDataScopeStore;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class UserDataScopeService {

    private final SysUserMapper sysUserMapper;
    private final SysUserRoleMapper sysUserRoleMapper;
    private final SysRoleMapper sysRoleMapper;
    private final SysDeptMapper sysDeptMapper;
    private final UserDataScopeStore userDataScopeStore;

    public UserDataScopeSnapshot calculateSnapshot(Long userId, Long deptId) {
        UserDataScopeSnapshot snapshot = new UserDataScopeSnapshot();
        snapshot.setUserId(userId);
        snapshot.setDsType(4);
        snapshot.setDsDeptIds(Collections.emptyList());
        snapshot.setRefreshedAt(LocalDateTime.now());

        if (userId == null) {
            return snapshot;
        }

        try {
            List<SysUserRole> userRoles = sysUserRoleMapper.selectList(
                    new LambdaQueryWrapper<SysUserRole>().eq(SysUserRole::getUserId, userId));
            if (userRoles == null || userRoles.isEmpty()) {
                return snapshot;
            }

            List<Long> roleIds = userRoles.stream()
                    .map(SysUserRole::getRoleId)
                    .filter(Objects::nonNull)
                    .distinct()
                    .collect(Collectors.toList());
            if (roleIds.isEmpty()) {
                return snapshot;
            }

            List<SysRole> roles = sysRoleMapper.selectBatchIds(roleIds);
            if (roles == null || roles.isEmpty()) {
                return snapshot;
            }

            Integer dsType = roles.stream()
                    .map(SysRole::getDsType)
                    .filter(Objects::nonNull)
                    .min(Integer::compareTo)
                    .orElse(4);
            snapshot.setDsType(dsType);
            snapshot.setDsDeptIds(resolveDeptIds(dsType, roles, deptId));
        } catch (Exception e) {
            log.warn("计算用户数据权限失败, userId={}", userId, e);
        }
        return snapshot;
    }

    public UserDataScopeSnapshot refresh(Long userId) {
        if (userId == null) {
            return null;
        }
        SysUser user = sysUserMapper.selectById(userId);
        if (user == null) {
            return null;
        }
        UserDataScopeSnapshot snapshot = calculateSnapshot(userId, user.getDeptId());
        snapshot.setTenantId(user.getTenantId());
        userDataScopeStore.save(snapshot);
        return snapshot;
    }

    public void clear(Long tenantId, Long userId) {
        userDataScopeStore.delete(tenantId, userId);
    }

    public void refreshByRoleId(Long roleId) {
        if (roleId == null) {
            return;
        }
        List<SysUserRole> bindings = sysUserRoleMapper.selectList(
                new LambdaQueryWrapper<SysUserRole>().eq(SysUserRole::getRoleId, roleId));
        bindings.stream()
                .map(SysUserRole::getUserId)
                .filter(Objects::nonNull)
                .distinct()
                .forEach(this::refresh);
    }

    public void refreshByDeptId(Long deptId) {
        if (deptId == null) {
            return;
        }
        Set<Long> deptIds = collectDeptAndDescendants(deptId).stream().collect(Collectors.toSet());
        if (deptIds.isEmpty()) {
            return;
        }
        sysUserMapper.selectList(new LambdaQueryWrapper<SysUser>()
                        .in(SysUser::getDeptId, deptIds))
                .stream()
                .map(SysUser::getUserId)
                .filter(Objects::nonNull)
                .forEach(this::refresh);
    }

    private List<Long> resolveDeptIds(Integer dsType, List<SysRole> roles, Long deptId) {
        if (dsType == null) {
            return Collections.emptyList();
        }
        switch (dsType) {
            case 0:
            case 4:
                return Collections.emptyList();
            case 1:
                return roles.stream()
                        .map(SysRole::getDsScope)
                        .filter(scope -> scope != null && !scope.trim().isEmpty())
                        .flatMap(scope -> Arrays.stream(scope.split(",")))
                        .map(String::trim)
                        .filter(value -> !value.isEmpty())
                        .map(Long::valueOf)
                        .distinct()
                        .collect(Collectors.toList());
            case 2:
                return collectDeptAndDescendants(deptId);
            case 3:
                return deptId == null ? Collections.emptyList() : List.of(deptId);
            default:
                return Collections.emptyList();
        }
    }

    private List<Long> collectDeptAndDescendants(Long deptId) {
        if (deptId == null) {
            return Collections.emptyList();
        }
        List<Long> deptIds = new ArrayList<>();
        deptIds.add(deptId);
        List<SysDept> allDepts = sysDeptMapper.selectList(null);
        if (allDepts == null || allDepts.isEmpty()) {
            return deptIds;
        }
        deptIds.addAll(allDepts.stream()
                .filter(dept -> dept.getAncestors() != null &&
                        (dept.getAncestors().contains("," + deptId + ",") || dept.getAncestors().endsWith("," + deptId)))
                .map(SysDept::getDeptId)
                .collect(Collectors.toList()));
        return deptIds.stream().distinct().collect(Collectors.toList());
    }
}
