package com.cloudflow.oa.service.impl;

import com.cloudflow.oa.domain.OaProject;
import com.cloudflow.oa.domain.WorkTask;
import com.cloudflow.oa.domain.dto.ProjectWbsTreeNodeDTO;
import com.cloudflow.oa.service.IWorkTaskService;
import org.junit.jupiter.api.*;
import org.mockito.*;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class OaProjectBatchTest {
    @Mock IWorkTaskService tasks;
    @Mock ProjectExecutionStateService execution;
    @Spy @InjectMocks OaProjectServiceImpl service;
    AutoCloseable mocks;

    @BeforeEach void setup() { mocks = MockitoAnnotations.openMocks(this); }
    @AfterEach void close() throws Exception { mocks.close(); }

    private WorkTask task(long id, long projectId, int deleted) {
        WorkTask task = new WorkTask();
        task.setTaskId(id);
        task.setProjectId(projectId);
        task.setDeleted(deleted);
        return task;
    }

    @Test
    void validatesBatchIncludingMissingForeignAndDeletedTasks() {
        OaProject project = new OaProject();
        project.setProjectId(1L);
        project.setDeleted(0);
        doReturn(project).when(service).getById(1L);
        ProjectWbsTreeNodeDTO node = new ProjectWbsTreeNodeDTO();
        node.setTaskId(2L);
        List<ProjectWbsTreeNodeDTO> nodes = List.of(node);
        when(tasks.listByIds(List.of(2L))).thenReturn(List.of(task(2, 1, 0)));
        when(tasks.batchUpdateTree(eq(nodes), anyString())).thenReturn(true);
        assertTrue(service.updateWbsTree(1L, nodes));
        verify(tasks).listByIds(List.of(2L));
        for (List<WorkTask> invalid : List.of(List.<WorkTask>of(), List.of(task(2, 3, 0)), List.of(task(2, 1, 1)))) {
            when(tasks.listByIds(List.of(2L))).thenReturn(invalid);
            assertThrows(IllegalArgumentException.class, () -> service.updateWbsTree(1L, nodes));
        }
        verify(tasks, times(1)).batchUpdateTree(eq(nodes), anyString());
        verify(tasks, never()).getById(any());
    }

    @Test
    void deletionReadsOnceAndSynchronizesEachProjectOnce() {
        List<Long> ids = List.of(1L, 2L, 3L);
        when(tasks.listByIds(ids)).thenReturn(List.of(task(1, 10, 0), task(2, 10, 0), task(3, 11, 0)));
        when(tasks.removeProjectTasks(ids)).thenReturn(true);
        assertTrue(service.removeWbsTasks(ids));
        verify(tasks).listByIds(ids);
        verify(tasks, never()).getById(any());
        verify(execution).syncProjectStatus(eq(10L), anyString());
        verify(execution).syncProjectStatus(eq(11L), anyString());
        verifyNoMoreInteractions(execution);
    }
}
