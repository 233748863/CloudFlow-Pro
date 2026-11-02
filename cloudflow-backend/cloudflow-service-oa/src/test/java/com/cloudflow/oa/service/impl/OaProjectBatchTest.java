package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.oa.domain.OaProject;
import com.cloudflow.oa.domain.OaProjectTask;
import com.cloudflow.oa.domain.dto.ProjectWbsTreeNodeDTO;
import com.cloudflow.oa.mapper.OaIdentityReferenceMapper;
import com.cloudflow.oa.mapper.OaProjectDependencyMapper;
import com.cloudflow.oa.mapper.OaProjectMapper;
import com.cloudflow.oa.mapper.OaProjectTaskMapper;
import com.cloudflow.oa.mapper.OaTimesheetDetailMapper;
import com.cloudflow.oa.mapper.WorkTaskMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.apache.ibatis.builder.MapperBuilderAssistant;

import java.util.List;
import java.util.ArrayList;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;

class OaProjectBatchTest {
    private final OaProjectMapper projects = mock(OaProjectMapper.class);
    private final OaProjectTaskMapper tasks = mock(OaProjectTaskMapper.class);
    private final ProjectExecutionStateService execution = mock(ProjectExecutionStateService.class);
    private final OaProjectTaskService service = spy(new OaProjectTaskService(projects, tasks,
            mock(OaProjectDependencyMapper.class), mock(OaTimesheetDetailMapper.class),
            mock(WorkTaskMapper.class), mock(OaIdentityReferenceMapper.class), execution,
            mock(OaBusinessRuleService.class)));

    @BeforeEach
    void setup() {
        TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), ""), OaProjectTask.class);
        TenantContext.clear();
        UserContext.clear();
        UserContext.setTenantId(100001L);
        when(projects.selectForUpdate(anyLong(), eq(100001L))).thenAnswer(invocation -> {
            OaProject project = new OaProject();
            project.setProjectId(invocation.getArgument(0));
            project.setTenantId(100001L);
            project.setDeleted(0);
            project.setStatus("IN_PROGRESS");
            return project;
        });
    }

    @AfterEach
    void close() {
        TenantContext.clear();
        UserContext.clear();
    }

    private OaProjectTask task(long id, long projectId) {
        OaProjectTask task = new OaProjectTask();
        task.setTaskId(id);
        task.setProjectId(projectId);
        task.setTenantId(100001L);
        task.setDeleted(0);
        task.setVersion(1);
        task.setSortNo(0);
        return task;
    }

    @Test
    void treeUsesOneSnapshotAndRejectsForeignMissingOrStaleNodes() {
        doReturn(List.of(task(2, 1))).when(service).list(1L);
        ProjectWbsTreeNodeDTO node = new ProjectWbsTreeNodeDTO();
        node.setTaskId(2L);
        node.setVersion(1);
        node.setSortOrder(0);
        service.updateTree(1L, List.of(node));
        verify(service).list(1L);
        verifyNoInteractions(tasks, execution);

        node.setTaskId(3L);
        assertThrows(IllegalArgumentException.class, () -> service.updateTree(1L, List.of(node)));
        node.setTaskId(2L);
        node.setVersion(0);
        assertThrows(IllegalArgumentException.class, () -> service.updateTree(1L, List.of(node)));
        assertThrows(IllegalArgumentException.class, () -> service.updateTree(1L, List.of()));
        verifyNoInteractions(tasks, execution);
    }

    @Test
    void deletionRetainsChecksAndSynchronizesEachProjectOnce() {
        for (OaProjectTask task : List.of(task(1, 10), task(2, 10), task(3, 11))) {
            when(tasks.selectById(task.getTaskId())).thenReturn(task);
            when(tasks.selectForUpdate(task.getTaskId(), 100001L)).thenReturn(task);
        }
        when(tasks.update(isNull(), any())).thenReturn(1);
        doReturn(new ArrayList<OaProjectTask>()).when(service).list(10L);
        doReturn(new ArrayList<OaProjectTask>()).when(service).list(11L);
        service.removeTasks(List.of(1L, 2L, 3L));
        verify(tasks, times(3)).selectForUpdate(anyLong(), eq(100001L));
        verify(tasks, times(3)).update(isNull(), any());
        verify(service).list(10L);
        verify(service).list(11L);
        verify(execution).syncProjectStatus(eq(10L), anyString());
        verify(execution).syncProjectStatus(eq(11L), anyString());
        verifyNoMoreInteractions(execution);
    }

    @Test
    void referencedTaskCannotBeDeletedOrRefreshProject() {
        OaProjectTask task = task(1, 10);
        when(tasks.selectById(1L)).thenReturn(task);
        when(tasks.selectForUpdate(1L, 100001L)).thenReturn(task);
        when(tasks.selectCount(any())).thenReturn(1L);
        assertThrows(IllegalArgumentException.class, () -> service.removeTasks(List.of(1L)));
        verify(tasks, never()).update(isNull(), any());
        verifyNoInteractions(execution);
    }
}
