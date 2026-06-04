package com.cloudflow.auth.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.auth.domain.SysRole;
import com.cloudflow.auth.domain.SysRoleMutex;
import com.cloudflow.auth.domain.dto.RoleMutexRequest;
import com.cloudflow.auth.mapper.SysRoleMapper;
import com.cloudflow.auth.mapper.SysRoleMutexMapper;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.exception.ErrorCodeConstants;
import com.cloudflow.common.core.exception.ServiceException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class RoleMutexService {

    private final SysRoleMutexMapper roleMutexMapper;
    private final SysRoleMapper roleMapper;

    public List<SysRoleMutex> listRules() {
        LambdaQueryWrapper<SysRoleMutex> wrapper = new LambdaQueryWrapper<SysRoleMutex>()
                .orderByAsc(SysRoleMutex::getId);
        Long tenantId = UserContext.getTenantId();
        if (tenantId != null) {
            wrapper.eq(SysRoleMutex::getTenantId, tenantId);
        }
        return roleMutexMapper.selectList(wrapper);
    }

    @Audit(name = "新增角色互斥规则", highRisk = true)
    @Transactional(rollbackFor = Exception.class)
    public Long addRule(RoleMutexRequest request) {
        NormalizedPair pair = normalizePair(request.getRoleId1(), request.getRoleId2());
        Long tenantId = UserContext.getTenantId();
        validateRoleExists(pair.left(), tenantId);
        validateRoleExists(pair.right(), tenantId);

        Long existing = roleMutexMapper.selectCount(new LambdaQueryWrapper<SysRoleMutex>()
                .eq(tenantId != null, SysRoleMutex::getTenantId, tenantId)
                .eq(SysRoleMutex::getRoleId1, pair.left())
                .eq(SysRoleMutex::getRoleId2, pair.right()));
        if (existing != null && existing > 0) {
            throw new ServiceException("角色互斥规则已存在", ErrorCodeConstants.CONCURRENT_MODIFICATION);
        }

        SysRoleMutex rule = new SysRoleMutex();
        rule.setTenantId(tenantId);
        rule.setRoleId1(pair.left());
        rule.setRoleId2(pair.right());
        roleMutexMapper.insert(rule);
        return rule.getId();
    }

    @Audit(name = "删除角色互斥规则", highRisk = true)
    @Transactional(rollbackFor = Exception.class)
    public int removeRule(Long id) {
        if (id == null) {
            return 0;
        }
        LambdaQueryWrapper<SysRoleMutex> wrapper = new LambdaQueryWrapper<SysRoleMutex>()
                .eq(SysRoleMutex::getId, id);
        Long tenantId = UserContext.getTenantId();
        if (tenantId != null) {
            wrapper.eq(SysRoleMutex::getTenantId, tenantId);
        }
        return roleMutexMapper.delete(wrapper);
    }

    @Audit(name = "按角色批量删除互斥规则", highRisk = true)
    @Transactional(rollbackFor = Exception.class)
    public void removeRulesByRoleIds(Long[] roleIds) {
        if (roleIds == null || roleIds.length == 0) {
            return;
        }
        List<Long> ids = Arrays.stream(roleIds)
                .filter(Objects::nonNull)
                .distinct()
                .collect(Collectors.toList());
        if (ids.isEmpty()) {
            return;
        }
        LambdaQueryWrapper<SysRoleMutex> wrapper = new LambdaQueryWrapper<SysRoleMutex>()
                .and(query -> query.in(SysRoleMutex::getRoleId1, ids).or().in(SysRoleMutex::getRoleId2, ids));
        Long tenantId = UserContext.getTenantId();
        if (tenantId != null) {
            wrapper.eq(SysRoleMutex::getTenantId, tenantId);
        }
        roleMutexMapper.delete(wrapper);
    }

    public void assertNoConflict(Long[] roleIds, Long tenantId) {
        if (roleIds == null || roleIds.length < 2) {
            return;
        }
        Set<Long> normalized = Arrays.stream(roleIds)
                .filter(Objects::nonNull)
                .collect(Collectors.toCollection(HashSet::new));
        if (normalized.size() < 2) {
            return;
        }

        List<SysRoleMutex> rules = roleMutexMapper.selectList(new LambdaQueryWrapper<SysRoleMutex>()
                .eq(tenantId != null, SysRoleMutex::getTenantId, tenantId));
        for (SysRoleMutex rule : rules) {
            if (normalized.contains(rule.getRoleId1()) && normalized.contains(rule.getRoleId2())) {
                String left = resolveRoleDisplayName(rule.getRoleId1());
                String right = resolveRoleDisplayName(rule.getRoleId2());
                throw new ServiceException("角色互斥冲突: " + left + " 与 " + right + " 不能同时授予",
                        ErrorCodeConstants.CONCURRENT_MODIFICATION);
            }
        }
    }

    private void validateRoleExists(Long roleId, Long tenantId) {
        SysRole role = roleMapper.selectOne(new LambdaQueryWrapper<SysRole>()
                .eq(SysRole::getRoleId, roleId)
                .eq(tenantId != null, SysRole::getTenantId, tenantId));
        if (role == null) {
            throw new ServiceException("角色不存在: " + roleId, ErrorCodeConstants.BAD_REQUEST);
        }
    }

    private String resolveRoleDisplayName(Long roleId) {
        if (roleId == null) {
            return "UNKNOWN";
        }
        SysRole role = roleMapper.selectById(roleId);
        if (role == null) {
            return String.valueOf(roleId);
        }
        return role.getRoleName() + "(" + role.getRoleKey() + ")";
    }

    private NormalizedPair normalizePair(Long roleId1, Long roleId2) {
        if (roleId1 == null || roleId2 == null) {
            throw new ServiceException("角色互斥规则的两个角色都不能为空", ErrorCodeConstants.BAD_REQUEST);
        }
        if (Objects.equals(roleId1, roleId2)) {
            throw new ServiceException("角色互斥规则不能引用同一角色", ErrorCodeConstants.BAD_REQUEST);
        }
        return roleId1 < roleId2
                ? new NormalizedPair(roleId1, roleId2)
                : new NormalizedPair(roleId2, roleId1);
    }

    private record NormalizedPair(Long left, Long right) {
    }
}
