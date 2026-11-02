package com.cloudflow.auth.service;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.conditions.Wrapper;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.cloudflow.auth.domain.SysDept;
import com.cloudflow.auth.domain.SysUser;
import com.cloudflow.auth.mapper.SysUserMapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.exception.ServiceException;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class SysDeptLeaderServiceTest {
    @AfterEach
    void clear() { UserContext.clear(); }

    @Test
    void validatesTenantAndActiveUserWhileAllowingClearingLeader() {
        TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), "test"), SysUser.class);
        UserContext.setTenantId(100000L);
        SysUserMapper mapper = mock(SysUserMapper.class);
        SysDeptLeaderService service = new SysDeptLeaderService(mapper);
        SysDept dept = new SysDept();
        service.validate(dept);
        assertEquals(100000L, dept.getTenantId());
        verifyNoInteractions(mapper);
        dept.setLeaderUserId(7L);
        when(mapper.selectCount(any())).thenReturn(1L);
        service.validate(dept);
        ArgumentCaptor<Wrapper<SysUser>> query = ArgumentCaptor.forClass(Wrapper.class);
        verify(mapper).selectCount(query.capture());
        String sql = query.getValue().getSqlSegment();
        assertTrue(sql.contains("tenant_id"));
        assertTrue(sql.contains("status"));
        assertTrue(sql.contains("deleted"));
        when(mapper.selectCount(any())).thenReturn(0L);
        assertThrows(ServiceException.class, () -> service.validate(dept));
        dept.setTenantId(200000L);
        assertThrows(ServiceException.class, () -> service.validate(dept));
    }

    @Test
    void fillsSharedLeadersOnceAndDoesNotExposeOtherTenantsName() {
        SysUserMapper mapper = mock(SysUserMapper.class);
        SysDeptLeaderService service = new SysDeptLeaderService(mapper);
        SysUser leader = new SysUser();
        leader.setUserId(7L);
        leader.setTenantId(100000L);
        leader.setNickName("部门负责人");
        when(mapper.selectBatchIds(List.of(7L))).thenReturn(List.of(leader));
        SysDept first = new SysDept();
        first.setTenantId(100000L);
        first.setLeaderUserId(7L);
        SysDept second = new SysDept();
        second.setTenantId(200000L);
        second.setLeaderUserId(7L);
        service.fillNames(List.of(first, second));
        assertEquals("部门负责人", first.getLeaderName());
        assertNull(second.getLeaderName());
        verify(mapper).selectBatchIds(List.of(7L));
    }
}
