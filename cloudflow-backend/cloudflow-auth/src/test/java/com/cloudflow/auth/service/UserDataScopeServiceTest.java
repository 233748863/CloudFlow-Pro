package com.cloudflow.auth.service;

import com.baomidou.mybatisplus.core.conditions.Wrapper;
import com.cloudflow.auth.domain.SysDept;
import com.cloudflow.auth.domain.SysUser;
import com.cloudflow.auth.mapper.SysDeptMapper;
import com.cloudflow.auth.mapper.SysUserMapper;
import org.junit.jupiter.api.Test;
import java.util.List;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class UserDataScopeServiceTest {
    @Test
    void overlappingDepartmentsRefreshEachUserOnce() {
        SysUserMapper users = mock(SysUserMapper.class);
        SysDeptMapper departments = mock(SysDeptMapper.class);
        UserDataScopeService service = spy(new UserDataScopeService(users, null, null, departments, null));
        SysDept child = new SysDept();
        child.setDeptId(3L); child.setAncestors("0,1,2");
        when(departments.selectList((Wrapper<SysDept>) null)).thenReturn(List.of(child));
        SysUser user = new SysUser(); user.setUserId(7L);
        when(users.selectList(any())).thenReturn(List.of(user, user));
        doReturn(null).when(service).refresh(7L);
        service.refreshByDeptIds(List.of(1L, 2L));
        verify(service).refresh(7L);
        verify(departments).selectList((Wrapper<SysDept>) null);
        verify(users).selectList(any());
        verifyNoMoreInteractions(users, departments);
    }
}
