package com.cloudflow.workflow.service.impl;

import com.baomidou.mybatisplus.core.conditions.Wrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.domain.monitor.TimeoutAlert;
import com.cloudflow.workflow.domain.monitor.TimeoutAlertHandleResult;
import com.cloudflow.workflow.domain.system.SysDept;
import com.cloudflow.workflow.domain.system.SysRole;
import com.cloudflow.workflow.domain.system.SysUser;
import com.cloudflow.workflow.domain.system.SysUserRole;
import com.cloudflow.workflow.exception.BusinessException;
import com.cloudflow.workflow.exception.PermissionDeniedException;
import com.cloudflow.workflow.mapper.AnomalyAlertMapper;
import com.cloudflow.workflow.mapper.PerformanceStatsMapper;
import com.cloudflow.workflow.mapper.ProcessMonitorMapper;
import com.cloudflow.workflow.mapper.TaskMonitorMapper;
import com.cloudflow.workflow.mapper.TimeoutAlertMapper;
import com.cloudflow.workflow.mapper.WfProcessInstanceMapper;
import com.cloudflow.workflow.mapper.WfTaskMapper;
import com.cloudflow.workflow.mapper.system.SysDeptMapper;
import com.cloudflow.workflow.mapper.system.SysRoleMapper;
import com.cloudflow.workflow.mapper.system.SysUserMapper;
import com.cloudflow.workflow.mapper.system.SysUserRoleMapper;
import com.cloudflow.workflow.service.INotificationService;
import com.cloudflow.workflow.service.monitor.impl.PerformanceStatsRefreshService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class WorkflowMonitorServiceImplTest {

    private static final Long TENANT_ID = 100000L;

    @Mock
    private ProcessMonitorMapper processMonitorMapper;
    @Mock
    private TimeoutAlertMapper timeoutAlertMapper;
    @Mock
    private AnomalyAlertMapper anomalyAlertMapper;
    @Mock
    private PerformanceStatsMapper performanceStatsMapper;
    @Mock
    private TaskMonitorMapper taskMonitorMapper;
    @Mock
    private WfTaskMapper wfTaskMapper;
    @Mock
    private WfProcessInstanceMapper processInstanceMapper;
    @Mock
    private SysUserMapper sysUserMapper;
    @Mock
    private SysDeptMapper sysDeptMapper;
    @Mock
    private SysRoleMapper sysRoleMapper;
    @Mock
    private SysUserRoleMapper sysUserRoleMapper;
    @Mock
    private INotificationService notificationService;
    @Mock
    private PerformanceStatsRefreshService performanceStatsRefreshService;

    private WorkflowMonitorServiceImpl service;

    @BeforeEach
    void setUp() {
        UserContext.clear();
        UserContext.setUserId(1L);
        UserContext.setUserName("admin");
        UserContext.setTenantId(TENANT_ID);
        UserContext.setRoles(Set.of("admin"));

        service = new WorkflowMonitorServiceImpl(
                processMonitorMapper,
                timeoutAlertMapper,
                anomalyAlertMapper,
                performanceStatsMapper,
                taskMonitorMapper,
                wfTaskMapper,
                processInstanceMapper,
                sysUserMapper,
                sysDeptMapper,
                sysRoleMapper,
                sysUserRoleMapper,
                notificationService,
                performanceStatsRefreshService
        );
    }

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    @Test
    void escalateTaskAlertAssignsDepartmentLeaderAndSendsNotification() {
        TimeoutAlert alert = timeoutAlert(10L, "TASK", "task-1", "N", "N");
        alert.setAssigneeId(20L);
        when(timeoutAlertMapper.selectById(10L)).thenReturn(alert);
        when(sysUserMapper.selectOne(any(Wrapper.class)))
                .thenReturn(user(20L, "assignee", "经办人", 200L))
                .thenReturn(user(30L, "leader", "负责人", 200L));
        when(sysDeptMapper.selectById(200L)).thenReturn(dept(200L, 0L, "30"));

        TimeoutAlertHandleResult result = service.handleTimeoutAlert(10L, "escalate");

        assertEquals(30L, result.getEscalatedToId());
        assertEquals("负责人", result.getEscalatedToName());
        assertEquals("已升级给 负责人", result.getMessage());
        assertEquals("Y", alert.getEscalated());
        assertEquals(30L, alert.getEscalatedToId());
        assertNotNull(alert.getEscalatedTime());
        verify(timeoutAlertMapper).updateById(alert);
        verify(notificationService).sendNotification(
                eq(30L),
                eq("超时告警升级待办"),
                any(String.class),
                eq("TIMEOUT_ALERT_ESCALATED")
        );
    }

    @Test
    void escalateProcessAlertUsesStarterDepartmentLeader() {
        TimeoutAlert alert = timeoutAlert(11L, "PROCESS", "instance-1", "N", "N");
        when(timeoutAlertMapper.selectById(11L)).thenReturn(alert);
        WfProcessInstance instance = new WfProcessInstance();
        instance.setTenantId(TENANT_ID);
        instance.setStartUserId(21L);
        when(processInstanceMapper.selectById("instance-1")).thenReturn(instance);
        when(sysUserMapper.selectOne(any(Wrapper.class)))
                .thenReturn(user(21L, "starter", "发起人", 201L))
                .thenReturn(user(31L, "leader31", "流程负责人", 201L));
        when(sysDeptMapper.selectById(201L)).thenReturn(dept(201L, 0L, "31"));

        TimeoutAlertHandleResult result = service.handleTimeoutAlert(11L, "escalate");

        assertEquals(31L, result.getEscalatedToId());
        assertEquals("流程负责人", result.getEscalatedToName());
    }

    @Test
    void repeatedEscalationReturnsExistingRecipientWithoutNotification() {
        TimeoutAlert alert = timeoutAlert(12L, "TASK", "task-1", "Y", "N");
        alert.setEscalatedToId(30L);
        alert.setEscalatedToName("负责人");
        when(timeoutAlertMapper.selectById(12L)).thenReturn(alert);

        TimeoutAlertHandleResult result = service.handleTimeoutAlert(12L, "escalate");

        assertEquals(30L, result.getEscalatedToId());
        assertEquals("告警已升级", result.getMessage());
        verify(timeoutAlertMapper, never()).updateById(any(TimeoutAlert.class));
        verify(notificationService, never()).sendNotification(any(), any(), any(), any());
    }

    @Test
    void resolvedAlertCannotEscalate() {
        TimeoutAlert alert = timeoutAlert(13L, "TASK", "task-1", "N", "Y");
        when(timeoutAlertMapper.selectById(13L)).thenReturn(alert);

        BusinessException exception = assertThrows(
                BusinessException.class,
                () -> service.handleTimeoutAlert(13L, "escalate")
        );

        assertEquals("ALERT_ALREADY_RESOLVED", exception.getCode());
    }

    @Test
    void escalationFallsBackToManagerInSameDepartment() {
        TimeoutAlert alert = timeoutAlert(14L, "TASK", "task-1", "N", "N");
        alert.setAssigneeId(20L);
        when(timeoutAlertMapper.selectById(14L)).thenReturn(alert);
        when(sysUserMapper.selectOne(any(Wrapper.class)))
                .thenReturn(user(20L, "assignee", "经办人", 200L))
                .thenReturn(user(40L, "manager", "部门经理", 200L));
        when(sysDeptMapper.selectById(200L)).thenReturn(dept(200L, 0L, ""));
        when(sysRoleMapper.selectOne(any(Wrapper.class))).thenReturn(role(2L, "manager"));
        when(sysUserRoleMapper.selectList(any(Wrapper.class))).thenReturn(List.of(userRole(40L, 2L), userRole(41L, 2L)));

        TimeoutAlertHandleResult result = service.handleTimeoutAlert(14L, "escalate");

        assertEquals(40L, result.getEscalatedToId());
        assertEquals("部门经理", result.getEscalatedToName());
    }

    @Test
    void resolveAllowsRecipientAndWritesFields() {
        UserContext.setUserId(30L);
        UserContext.setUserName("leader");
        UserContext.setRoles(Set.of("employee"));
        TimeoutAlert alert = timeoutAlert(15L, "TASK", "task-1", "Y", "N");
        alert.setEscalatedToId(30L);
        alert.setEscalatedToName("负责人");
        when(timeoutAlertMapper.selectById(15L)).thenReturn(alert);

        TimeoutAlert result = service.resolveTimeoutAlert(15L, " 已处理 ");

        assertEquals("Y", result.getResolved());
        assertEquals(30L, result.getResolvedById());
        assertEquals("leader", result.getResolvedByName());
        assertEquals("已处理", result.getResolveNote());
        assertNotNull(result.getResolveTime());
        verify(timeoutAlertMapper).updateById(alert);
    }

    @Test
    void resolveRejectsNonRecipient() {
        UserContext.setUserId(31L);
        UserContext.setRoles(Set.of("employee"));
        TimeoutAlert alert = timeoutAlert(16L, "TASK", "task-1", "Y", "N");
        alert.setEscalatedToId(30L);
        when(timeoutAlertMapper.selectById(16L)).thenReturn(alert);

        assertThrows(PermissionDeniedException.class, () -> service.resolveTimeoutAlert(16L, "处理完成"));
    }

    @Test
    void resolveAllowsAdminForAnyEscalatedAlert() {
        TimeoutAlert alert = timeoutAlert(17L, "TASK", "task-1", "Y", "N");
        alert.setEscalatedToId(30L);
        when(timeoutAlertMapper.selectById(17L)).thenReturn(alert);

        TimeoutAlert result = service.resolveTimeoutAlert(17L, "管理员关闭");

        assertEquals("Y", result.getResolved());
        assertEquals(1L, result.getResolvedById());
    }

    @Test
    void resolveRejectsUnescalatedAlert() {
        TimeoutAlert alert = timeoutAlert(18L, "TASK", "task-1", "N", "N");
        when(timeoutAlertMapper.selectById(18L)).thenReturn(alert);

        BusinessException exception = assertThrows(
                BusinessException.class,
                () -> service.resolveTimeoutAlert(18L, "处理完成")
        );

        assertEquals("ALERT_NOT_ESCALATED", exception.getCode());
    }

    @Test
    void escalationTaskListIsScopedToCurrentUserWhenNotAdmin() {
        UserContext.setUserId(30L);
        UserContext.setRoles(Set.of("employee"));
        when(timeoutAlertMapper.selectPage(any(IPage.class), any(Wrapper.class))).thenAnswer(invocation -> invocation.getArgument(0));

        service.getTimeoutEscalationTasks(1, 10);

        verify(timeoutAlertMapper).selectPage(any(IPage.class), any(Wrapper.class));
    }

    private TimeoutAlert timeoutAlert(Long id, String alertType, String targetId, String escalated, String resolved) {
        TimeoutAlert alert = new TimeoutAlert();
        alert.setId(id);
        alert.setTenantId(TENANT_ID);
        alert.setAlertType(alertType);
        alert.setTargetId(targetId);
        alert.setTargetName("超时告警");
        alert.setTimeoutLevel("CRITICAL");
        alert.setTimeoutDuration(7200000L);
        alert.setNotificationSent("N");
        alert.setEscalated(escalated);
        alert.setResolved(resolved);
        return alert;
    }

    private SysUser user(Long userId, String userName, String nickName, Long deptId) {
        SysUser user = new SysUser();
        user.setUserId(userId);
        user.setTenantId(TENANT_ID);
        user.setUserName(userName);
        user.setNickName(nickName);
        user.setDeptId(deptId);
        user.setStatus("0");
        user.setDelFlag("0");
        return user;
    }

    private SysDept dept(Long deptId, Long parentId, String leader) {
        SysDept dept = new SysDept();
        dept.setDeptId(deptId);
        dept.setTenantId(TENANT_ID);
        dept.setParentId(parentId);
        dept.setLeader(leader);
        dept.setStatus("0");
        dept.setDelFlag("0");
        return dept;
    }

    private SysRole role(Long roleId, String roleKey) {
        SysRole role = new SysRole();
        role.setRoleId(roleId);
        role.setTenantId(TENANT_ID);
        role.setRoleKey(roleKey);
        role.setStatus("0");
        role.setDelFlag("0");
        return role;
    }

    private SysUserRole userRole(Long userId, Long roleId) {
        SysUserRole userRole = new SysUserRole();
        userRole.setUserId(userId);
        userRole.setRoleId(roleId);
        userRole.setTenantId(TENANT_ID);
        return userRole;
    }
}
