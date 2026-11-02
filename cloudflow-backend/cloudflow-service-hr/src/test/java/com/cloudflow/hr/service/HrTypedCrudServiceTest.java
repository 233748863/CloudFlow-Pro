package com.cloudflow.hr.service;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.conditions.Wrapper;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.cloudflow.common.audit.support.AuditChangeScope;
import com.cloudflow.common.redis.core.SysConfigHelper;
import com.cloudflow.hr.domain.dto.HrAuditSnapshot;
import com.cloudflow.hr.domain.entity.HrPosition;
import com.cloudflow.hr.mapper.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.context.ApplicationContext;

import java.util.Map;
import java.util.LinkedHashMap;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class HrTypedCrudServiceTest {
    @Test
    void updateSharesTwoReadsBetweenBothAuditLogs() throws Throwable {
        TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), "test"), HrPosition.class);
        ApplicationContext context = mock(ApplicationContext.class);
        HrPositionMapper mapper = mock(HrPositionMapper.class);
        HrAuditLogMapper auditLog = mock(HrAuditLogMapper.class);
        ObjectMapper json = spy(new ObjectMapper());
        HrTypedCrudService service = new HrTypedCrudService(context, json, mock(HrEmployeeMapper.class),
                mapper, mock(HrCompGradeMapper.class), auditLog, mock(HrAppraisalGuard.class),
                mock(HrRecruitmentIdentityService.class), mock(HrReferralProgressService.class),
                mock(SysConfigHelper.class), mock(HrGrievanceAccessService.class));
        when(context.getBean("hrPositionMapper")).thenReturn(mapper);
        HrPosition before = new HrPosition();
        before.setId(7L);
        before.setPositionName("old");
        before.setRequirements("required");
        before.setTenantId(100000L);
        HrPosition after = new HrPosition();
        after.setId(7L);
        after.setPositionName("new");
        when(mapper.selectById(7L)).thenReturn(before, after);
        when(mapper.update(any(HrPosition.class), any(Wrapper.class))).thenReturn(1);
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("positionName", "new");
        payload.put("requirements", null);
        payload.put("levelId", "23");
        payload.put("id", 99);
        payload.put("tenantId", 200000);
        HrAuditSnapshot oldSnapshot;
        HrAuditSnapshot newSnapshot;
        try (AuditChangeScope scope = AuditChangeScope.open()) {
            service.update(HrPosition.class, 7L, payload);
            assertTrue(scope.captured());
            oldSnapshot = (HrAuditSnapshot) scope.before();
            newSnapshot = (HrAuditSnapshot) scope.after();
        }
        verify(mapper, times(2)).selectById(7L);
        ArgumentCaptor<Wrapper<HrPosition>> update = ArgumentCaptor.captor();
        verify(mapper).update(eq(before), update.capture());
        assertEquals(7L, before.getId());
        assertEquals(100000L, before.getTenantId());
        assertEquals(23L, before.getLevelId());
        assertNull(before.getRequirements());
        assertTrue(update.getValue().getSqlSet().contains("requirements="));
        assertTrue(update.getValue().getSqlSegment().contains("tenant_id"));
        verify(json, times(1)).convertValue(any(), any(Class.class));
        assertEquals("old", oldSnapshot.getData().get("positionName"));
        assertEquals("new", newSnapshot.getData().get("positionName"));
        String oldJson = json.writeValueAsString(oldSnapshot.getData());
        String newJson = json.writeValueAsString(newSnapshot.getData());
        verify(auditLog).insertLog(anyLong(), eq("hr_position"), eq(7L), eq("UPDATE"), any(), anyString(),
                eq(oldJson), eq(newJson));
    }
}
