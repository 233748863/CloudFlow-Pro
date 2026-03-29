package com.cloudflow.workflow.service.impl;

import com.cloudflow.workflow.domain.WfNodeRecord;
import com.cloudflow.workflow.domain.WfTask;
import com.cloudflow.workflow.domain.WfTaskHistory;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;
import java.time.LocalDateTime;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class WfInstanceServiceImplTest {

    private final WfInstanceServiceImpl service = new WfInstanceServiceImpl();

    @Test
    void collectFinishedNodeKeysShouldMergeAutomaticCompletedAndTerminalRunningRecords() {
        WfTaskHistory history = new WfTaskHistory();
        history.setNodeKey("approval_1");

        WfNodeRecord notificationRecord = new WfNodeRecord();
        notificationRecord.setNodeKey("notice_1");
        notificationRecord.setNodeType("NOTIFICATION");
        notificationRecord.setStatus("COMPLETED");

        WfNodeRecord timerRecord = new WfNodeRecord();
        timerRecord.setNodeKey("timer_1");
        timerRecord.setNodeType("TIMER");
        timerRecord.setStatus("RUNNING");

        @SuppressWarnings("unchecked")
        Set<String> finished = (Set<String>) invoke(
            "collectFinishedNodeKeys",
            new Class<?>[]{String.class, List.class, List.class},
            "COMPLETED",
            List.of(history),
            List.of(notificationRecord, timerRecord)
        );

        assertEquals(new LinkedHashSet<>(List.of("approval_1", "notice_1", "timer_1")), finished);
    }

    @Test
    void collectActiveNodeKeysShouldOnlyExposeRunningRecordsForActiveProcesses() {
        WfTask activeTask = new WfTask();
        activeTask.setNodeKey("approval_1");

        WfNodeRecord timerRecord = new WfNodeRecord();
        timerRecord.setNodeKey("timer_1");
        timerRecord.setNodeType("TIMER");
        timerRecord.setStatus("RUNNING");

        @SuppressWarnings("unchecked")
        Set<String> runningKeys = (Set<String>) invoke(
            "collectActiveNodeKeys",
            new Class<?>[]{String.class, List.class, List.class},
            "RUNNING",
            List.of(activeTask),
            List.of(timerRecord)
        );
        @SuppressWarnings("unchecked")
        Set<String> completedKeys = (Set<String>) invoke(
            "collectActiveNodeKeys",
            new Class<?>[]{String.class, List.class, List.class},
            "COMPLETED",
            List.of(activeTask),
            List.of(timerRecord)
        );

        assertEquals(new LinkedHashSet<>(List.of("approval_1", "timer_1")), runningKeys);
        assertTrue(completedKeys.isEmpty());
    }

    @Test
    void buildTraceHistoryDetailsShouldAppendAutomaticNodeRecordsOnlyOnce() {
        WfTaskHistory history = new WfTaskHistory();
        history.setNodeKey("approval_1");
        history.setNodeName("部门审批");
        history.setAction("APPROVE");
        history.setOperatorName("张三");
        history.setCreateTime(LocalDateTime.of(2026, 3, 29, 10, 0));

        WfNodeRecord approvalRecord = new WfNodeRecord();
        approvalRecord.setNodeKey("approval_1");
        approvalRecord.setNodeName("部门审批");
        approvalRecord.setNodeType("APPROVAL");
        approvalRecord.setStatus("COMPLETED");
        approvalRecord.setStartTime(LocalDateTime.of(2026, 3, 29, 9, 55));
        approvalRecord.setEndTime(LocalDateTime.of(2026, 3, 29, 10, 0));

        WfNodeRecord scriptRecord = new WfNodeRecord();
        scriptRecord.setNodeKey("script_1");
        scriptRecord.setNodeName("构建脚本");
        scriptRecord.setNodeType("SCRIPT");
        scriptRecord.setStatus("COMPLETED");
        scriptRecord.setStartTime(LocalDateTime.of(2026, 3, 29, 10, 1));
        scriptRecord.setEndTime(LocalDateTime.of(2026, 3, 29, 10, 2));

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> historyDetails = (List<Map<String, Object>>) invoke(
            "buildTraceHistoryDetails",
            new Class<?>[]{List.class, List.class, String.class},
            List.of(history),
            List.of(approvalRecord, scriptRecord),
            "COMPLETED"
        );

        assertEquals(2, historyDetails.size());
        assertEquals("approval_1", historyDetails.get(0).get("nodeKey"));
        assertEquals("script_1", historyDetails.get(1).get("nodeKey"));
        assertEquals("系统脚本", historyDetails.get(1).get("operatorName"));
    }

    @Test
    void buildTraceActiveDetailsShouldMergeAutomaticRunningNodesWithoutDuplicatingTaskNodes() {
        WfTask activeTask = new WfTask();
        activeTask.setTaskId("task_1");
        activeTask.setNodeKey("approval_1");
        activeTask.setNodeName("部门审批");
        activeTask.setAssignee(100L);
        activeTask.setAssigneeName("李四");
        activeTask.setCreateTime(LocalDateTime.of(2026, 3, 29, 10, 0));

        WfNodeRecord approvalRecord = new WfNodeRecord();
        approvalRecord.setNodeKey("approval_1");
        approvalRecord.setNodeType("APPROVAL");
        approvalRecord.setStatus("RUNNING");

        WfNodeRecord timerRecord = new WfNodeRecord();
        timerRecord.setNodeKey("timer_1");
        timerRecord.setNodeName("定时等待");
        timerRecord.setNodeType("TIMER");
        timerRecord.setStatus("RUNNING");
        timerRecord.setStartTime(LocalDateTime.of(2026, 3, 29, 10, 5));

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> activeDetails = (List<Map<String, Object>>) invoke(
            "buildTraceActiveDetails",
            new Class<?>[]{List.class, List.class, String.class},
            List.of(activeTask),
            List.of(approvalRecord, timerRecord),
            "RUNNING"
        );

        assertEquals(2, activeDetails.size());
        assertEquals("approval_1", activeDetails.get(0).get("nodeKey"));
        assertEquals("timer_1", activeDetails.get(1).get("nodeKey"));
        assertEquals("系统定时器", activeDetails.get(1).get("assigneeName"));
    }

    private Object invoke(String methodName, Class<?>[] parameterTypes, Object... args) {
        try {
            Method method = WfInstanceServiceImpl.class.getDeclaredMethod(methodName, parameterTypes);
            method.setAccessible(true);
            return method.invoke(service, args);
        } catch (Exception e) {
            throw new IllegalStateException("调用私有方法失败: " + methodName, e);
        }
    }
}
