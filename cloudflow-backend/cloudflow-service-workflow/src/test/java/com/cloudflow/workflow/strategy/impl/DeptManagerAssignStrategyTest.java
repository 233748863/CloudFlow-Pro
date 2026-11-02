package com.cloudflow.workflow.strategy.impl;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.conditions.Wrapper;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.domain.system.SysDept;
import com.cloudflow.workflow.domain.system.SysUser;
import com.cloudflow.workflow.mapper.system.SysDeptMapper;
import com.cloudflow.workflow.mapper.system.SysRoleMapper;
import com.cloudflow.workflow.mapper.system.SysUserMapper;
import com.cloudflow.workflow.mapper.system.SysUserRoleMapper;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.lang.reflect.Field;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class DeptManagerAssignStrategyTest {
    @Test
    void resolvesConfiguredUserIdOnceWithoutGuessingNamesOrQueryingRoles() throws Exception {
        TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), "test"), SysUser.class);
        SysUserMapper users = mock(SysUserMapper.class);
        SysDeptMapper depts = mock(SysDeptMapper.class);
        SysRoleMapper roles = mock(SysRoleMapper.class);
        SysUserRoleMapper bindings = mock(SysUserRoleMapper.class);
        DeptManagerAssignStrategy strategy = new DeptManagerAssignStrategy();
        inject(strategy, "sysUserMapper", users);
        inject(strategy, "sysDeptMapper", depts);
        inject(strategy, "sysRoleMapper", roles);
        inject(strategy, "sysUserRoleMapper", bindings);
        WfProcessInstance instance = new WfProcessInstance();
        instance.setStartUserId(3L);
        SysUser starter = new SysUser();
        starter.setDeptId(10L);
        SysDept dept = new SysDept();
        dept.setDeptId(10L);
        dept.setTenantId(100000L);
        dept.setLeaderUserId(7L);
        SysUser leader = new SysUser();
        leader.setUserId(7L);
        when(users.selectById(3L)).thenReturn(starter);
        when(depts.selectById(10L)).thenReturn(dept);
        when(users.selectOne(any())).thenReturn(leader);
        assertEquals(7L, strategy.resolve(null, instance));
        ArgumentCaptor<Wrapper<SysUser>> query = ArgumentCaptor.forClass(Wrapper.class);
        verify(users).selectOne(query.capture());
        String sql = query.getValue().getSqlSegment();
        assertTrue(sql.contains("user_id"));
        assertTrue(sql.contains("tenant_id"));
        assertTrue(sql.contains("status"));
        assertTrue(sql.contains("deleted"));
        assertFalse(sql.contains("user_name"));
        verifyNoInteractions(roles, bindings);
    }

    private void inject(Object target, String name, Object value) throws Exception {
        Field field = target.getClass().getDeclaredField(name);
        field.setAccessible(true);
        field.set(target, value);
    }
}
