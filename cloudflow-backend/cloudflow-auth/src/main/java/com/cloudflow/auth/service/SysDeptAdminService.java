package com.cloudflow.auth.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.auth.domain.SysDept;
import com.cloudflow.auth.domain.SysUser;
import com.cloudflow.auth.mapper.SysDeptMapper;
import com.cloudflow.auth.mapper.SysUserMapper;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.exception.ErrorCodeConstants;
import com.cloudflow.common.core.exception.ServiceException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Objects;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class SysDeptAdminService {

    private final SysDeptMapper sysDeptMapper;
    private final SysUserMapper sysUserMapper;
    private final UserDataScopeService userDataScopeService;

    @Audit(name = "部门迁移", highRisk = true)
    @Transactional(rollbackFor = Exception.class)
    public int migrateUsers(Long sourceDeptId, Long targetDeptId) {
        if (sourceDeptId == null || targetDeptId == null) {
            throw new ServiceException("源部门和目标部门不能为空", ErrorCodeConstants.BAD_REQUEST);
        }
        if (Objects.equals(sourceDeptId, targetDeptId)) {
            throw new ServiceException("源部门和目标部门不能相同", ErrorCodeConstants.BAD_REQUEST);
        }

        SysDept source = requireDept(sourceDeptId);
        SysDept target = requireDept(targetDeptId);
        if (!Objects.equals(source.getTenantId(), target.getTenantId())) {
            throw new ServiceException("不允许跨租户迁移部门成员", ErrorCodeConstants.BAD_REQUEST);
        }

        List<SysUser> users = sysUserMapper.selectList(new LambdaQueryWrapper<SysUser>()
                .eq(SysUser::getDeptId, sourceDeptId)
                .eq(SysUser::getTenantId, source.getTenantId()));
        if (users.isEmpty()) {
            return 0;
        }

        List<Long> userIds = users.stream()
                .map(SysUser::getUserId)
                .filter(Objects::nonNull)
                .collect(Collectors.toList());
        for (SysUser user : users) {
            SysUser update = new SysUser();
            update.setUserId(user.getUserId());
            update.setDeptId(targetDeptId);
            sysUserMapper.updateById(update);
        }
        userIds.forEach(userDataScopeService::refresh);
        userDataScopeService.refreshByDeptId(sourceDeptId);
        userDataScopeService.refreshByDeptId(targetDeptId);
        return users.size();
    }

    public void assertDeptRemovable(Long deptId) {
        SysDept dept = requireDept(deptId);

        Long childCount = sysDeptMapper.selectCount(new LambdaQueryWrapper<SysDept>()
                .eq(SysDept::getParentId, deptId)
                .eq(SysDept::getTenantId, dept.getTenantId()));
        if (childCount != null && childCount > 0) {
            throw new ServiceException("存在子部门，不允许删除", ErrorCodeConstants.CONCURRENT_MODIFICATION);
        }

        Long userCount = sysUserMapper.selectCount(new LambdaQueryWrapper<SysUser>()
                .eq(SysUser::getDeptId, deptId)
                .eq(SysUser::getTenantId, dept.getTenantId()));
        if (userCount != null && userCount > 0) {
            throw new ServiceException("部门下仍有 " + userCount + " 个用户，请先迁移", ErrorCodeConstants.CONCURRENT_MODIFICATION);
        }
    }

    @Audit(name = "删除部门", highRisk = true)
    @Transactional(rollbackFor = Exception.class)
    public boolean removeDept(Long deptId) {
        assertDeptRemovable(deptId);
        boolean success = sysDeptMapper.deleteById(deptId) > 0;
        if (success) {
            userDataScopeService.refreshByDeptId(deptId);
        }
        return success;
    }

    private SysDept requireDept(Long deptId) {
        Long tenantId = UserContext.getTenantId();
        SysDept dept = sysDeptMapper.selectOne(new LambdaQueryWrapper<SysDept>()
                .eq(SysDept::getDeptId, deptId)
                .eq(tenantId != null, SysDept::getTenantId, tenantId));
        if (dept == null) {
            throw new ServiceException("部门不存在: " + deptId, ErrorCodeConstants.BAD_REQUEST);
        }
        return dept;
    }
}
