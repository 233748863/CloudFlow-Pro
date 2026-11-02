package com.cloudflow.auth.service.impl;

import com.cloudflow.auth.domain.*;
import com.cloudflow.auth.mapper.*;
import org.junit.jupiter.api.Test;
import java.lang.reflect.Field;
import java.util.ArrayList;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.any;

class SysUserListTest {
    private void inject(Object target, String name, Object value) throws Exception {
        Field field = target.getClass().getDeclaredField(name);
        field.setAccessible(true);
        field.set(target, value);
    }

    @Test
    void loadsRelationsOnceForEntireList() throws Exception {
        SysUserMapper usersMapper = mock(SysUserMapper.class);
        SysUserRoleMapper bindingsMapper = mock(SysUserRoleMapper.class);
        SysRoleMapper rolesMapper = mock(SysRoleMapper.class);
        SysDeptMapper deptMapper = mock(SysDeptMapper.class);
        SysUserServiceImpl service = new SysUserServiceImpl();
        inject(service, "sysUserMapper", usersMapper);
        inject(service, "sysUserRoleMapper", bindingsMapper);
        inject(service, "sysRoleMapper", rolesMapper);
        inject(service, "sysDeptMapper", deptMapper);
        List<SysUser> users = new ArrayList<>();
        List<SysUserRole> bindings = new ArrayList<>();
        for (long i = 1; i <= 100; i++) {
            SysUser user = new SysUser();
            user.setUserId(i);
            user.setDeptId(i == 100 ? null : 20L);
            users.add(user);
            if (i < 100) {
                SysUserRole binding = new SysUserRole();
                binding.setUserId(i);
                binding.setRoleId(10L);
                bindings.add(binding);
            }
        }
        SysRole role = new SysRole();
        role.setRoleId(10L);
        role.setRoleName("staff");
        SysDept dept = new SysDept();
        dept.setDeptId(20L);
        dept.setDeptName("team");
        when(usersMapper.selectList(any())).thenReturn(users);
        when(bindingsMapper.selectList(any())).thenReturn(bindings);
        when(rolesMapper.selectBatchIds(any())).thenReturn(List.of(role));
        when(deptMapper.selectBatchIds(any())).thenReturn(List.of(dept));
        assertSame(users, service.selectUserList(new SysUser()));
        assertArrayEquals(new Long[]{10L}, users.get(0).getRoleIds());
        assertEquals("staff", users.get(0).getRole());
        assertEquals("team", users.get(0).getDeptName());
        assertNull(users.get(99).getDeptName());
        verify(usersMapper).selectList(any());
        verify(bindingsMapper).selectList(any());
        verify(rolesMapper).selectBatchIds(any());
        verify(deptMapper).selectBatchIds(any());
        verifyNoMoreInteractions(usersMapper, bindingsMapper, rolesMapper, deptMapper);
    }
}
