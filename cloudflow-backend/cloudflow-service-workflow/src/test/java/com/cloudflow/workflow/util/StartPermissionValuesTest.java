package com.cloudflow.workflow.util;

import com.cloudflow.workflow.exception.WorkflowException;
import com.cloudflow.workflow.service.WorkflowPermissionService;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.workflow.domain.WfTask;
import com.cloudflow.workflow.exception.PermissionDeniedException;
import org.junit.jupiter.api.Test;

import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

class StartPermissionValuesTest {
    @Test
    void supportsMultipleStringIdsAndChecksMembership() {
        assertEquals(Set.of("12", "37"), StartPermissionValues.parse("[\"12\",\"37\",\"12\"]"));
        WorkflowPermissionService permissions = new WorkflowPermissionService();
        assertTrue(permissions.canStartProcess(37L, "USER", "[\"12\",\"37\"]"));
        assertFalse(permissions.canStartProcess(9L, "USER", "[\"12\",\"37\"]"));
        assertFalse(permissions.canStartProcess(null, "ALL", "[]"));
    }

    @Test
    void rejectsOldFormatsAndMissingRestrictedSelection() {
        for (String value : new String[]{"12,37", "[12,37]", "[\"admin\"]", "[null]", "\"12\"", "[\" 12\"]"}) {
            assertThrows(WorkflowException.class, () -> StartPermissionValues.validate("ROLE", value), value);
        }
        assertThrows(WorkflowException.class, () -> StartPermissionValues.validate("USER", "[]"));
        assertThrows(WorkflowException.class, () -> StartPermissionValues.validate("ALL", "[\"12\"]"));
        assertDoesNotThrow(() -> StartPermissionValues.validate("ALL", "[]"));
    }

    @Test
    void taskPermissionStillRejectsAnotherTenantBeforeAssigneeCheck() {
        UserContext.setUserId(37L);
        UserContext.setTenantId(100000L);
        try {
            WfTask task = new WfTask();
            task.setTenantId(200000L);
            task.setAssignee(37L);
            assertThrows(PermissionDeniedException.class, () -> new WorkflowPermissionService().checkTaskPermission(task));
            task.setTenantId(100000L);
            assertDoesNotThrow(() -> new WorkflowPermissionService().checkTaskPermission(task));
        } finally {
            UserContext.clear();
        }
    }
}
