package com.cloudflow.common.audit.handle;

import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.audit.domain.SysAuditLogEntity;
import com.cloudflow.common.audit.mapper.SysAuditLogMapper;
import com.cloudflow.common.audit.support.AuditBizModuleResolver;
import com.cloudflow.common.audit.support.DataAuditor;
import com.cloudflow.common.core.context.UserContext;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import java.util.Map;
import java.util.stream.Collectors;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class DefaultAuditLogHandleTest {
    static class Snapshot {
        private final Map<String, Object> data;
        Snapshot(Map<String, Object> data) { this.data = data; }
        public Map<String, Object> getData() { return data; }
    }

    @Audit(name = "HR记录变更", highRisk = true, diff = true)
    public void operation() {}

    @AfterEach void clearContext() { UserContext.clear(); }

    @Test
    void recordsMapAddRemoveAndUpdateUsingActualJaversChanges() throws Exception {
        UserContext.setUserName("operator");
        UserContext.setTenantId(100000L);
        SysAuditLogMapper mapper = mock(SysAuditLogMapper.class);
        ObjectMapper json = spy(new ObjectMapper());
        DefaultAuditLogHandle handler = new DefaultAuditLogHandle(mapper, json, new AuditBizModuleResolver());
        Snapshot before = new Snapshot(Map.of("name", "old", "removed", "value"));
        Snapshot after = new Snapshot(Map.of("name", "new", "added", "value"));
        Audit audit = getClass().getMethod("operation").getAnnotation(Audit.class);
        handler.handle(audit, DataAuditor.compare(before, after), before, after, getClass());
        ArgumentCaptor<SysAuditLogEntity> entries = ArgumentCaptor.forClass(SysAuditLogEntity.class);
        verify(mapper, times(3)).insert(entries.capture());
        Map<String, SysAuditLogEntity> byField = entries.getAllValues().stream()
                .collect(Collectors.toMap(SysAuditLogEntity::getAuditField, entry -> entry));
        assertEquals("old", byField.get("data.name").getBeforeVal());
        assertEquals("new", byField.get("data.name").getAfterVal());
        assertNull(byField.get("data.added").getBeforeVal());
        assertEquals("value", byField.get("data.added").getAfterVal());
        assertEquals("value", byField.get("data.removed").getBeforeVal());
        assertNull(byField.get("data.removed").getAfterVal());
        for (SysAuditLogEntity entry : entries.getAllValues()) {
            assertEquals("operator", entry.getCreateBy());
            assertEquals(100000L, entry.getTenantId());
            assertEquals(1, entry.getHighRisk());
            assertNotNull(entry.getDiffJson());
        }
        verify(json).writeValueAsString(before);
        verify(json).writeValueAsString(after);
    }
}
