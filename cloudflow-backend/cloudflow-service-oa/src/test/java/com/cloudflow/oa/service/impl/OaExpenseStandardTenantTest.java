package com.cloudflow.oa.service.impl;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.oa.domain.OaExpenseStandard;
import com.cloudflow.oa.mapper.OaExpenseStandardMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class OaExpenseStandardTenantTest {

    private final OaExpenseStandardMapper mapper = mock(OaExpenseStandardMapper.class);
    private final OaExpenseStandardServiceImpl service = new OaExpenseStandardServiceImpl(mapper);

    @BeforeEach
    void setUp() {
        UserContext.clear();
        UserContext.setTenantId(100001L);
    }

    @AfterEach
    void clearContext() {
        UserContext.clear();
    }

    @Test
    void createWithoutBodyTenantUsesCurrentNonDefaultTenant() {
        when(mapper.insert(any(OaExpenseStandard.class))).thenReturn(1);

        assertTrue(service.save(standard()));

        ArgumentCaptor<OaExpenseStandard> inserted = ArgumentCaptor.forClass(OaExpenseStandard.class);
        verify(mapper).insert(inserted.capture());
        assertEquals(100001L, inserted.getValue().getTenantId());
    }

    @Test
    void createCannotUseForgedBodyTenant() {
        OaExpenseStandard standard = standard();
        standard.setTenantId(100002L);
        when(mapper.insert(any(OaExpenseStandard.class))).thenReturn(1);

        assertTrue(service.save(standard));

        ArgumentCaptor<OaExpenseStandard> inserted = ArgumentCaptor.forClass(OaExpenseStandard.class);
        verify(mapper).insert(inserted.capture());
        assertEquals(100001L, inserted.getValue().getTenantId());
    }

    @Test
    void updateWithoutBodyTenantUsesCurrentNonDefaultTenant() {
        OaExpenseStandard standard = standard();
        standard.setStandardId(123L);
        when(mapper.updateById(any(OaExpenseStandard.class))).thenReturn(1);

        assertTrue(service.update(standard));

        ArgumentCaptor<OaExpenseStandard> updated = ArgumentCaptor.forClass(OaExpenseStandard.class);
        verify(mapper).updateById(updated.capture());
        assertEquals(100001L, updated.getValue().getTenantId());
    }

    @Test
    void updateCannotMoveRecordToForgedBodyTenant() {
        OaExpenseStandard standard = standard();
        standard.setStandardId(123L);
        standard.setTenantId(100002L);
        when(mapper.updateById(any(OaExpenseStandard.class))).thenReturn(1);

        assertTrue(service.update(standard));

        ArgumentCaptor<OaExpenseStandard> updated = ArgumentCaptor.forClass(OaExpenseStandard.class);
        verify(mapper).updateById(updated.capture());
        assertEquals(100001L, updated.getValue().getTenantId());
    }

    @Test
    void createWithoutContextRejectsEvenWhenBodyHasTenant() {
        UserContext.clear();
        OaExpenseStandard standard = standard();
        standard.setTenantId(100002L);

        IllegalArgumentException error = assertThrows(IllegalArgumentException.class, () -> service.save(standard));

        assertEquals("tenantId不能为空", error.getMessage());
        verifyNoInteractions(mapper);
    }

    @Test
    void updateWithoutContextRejectsEvenWhenBodyHasTenant() {
        UserContext.clear();
        OaExpenseStandard standard = standard();
        standard.setStandardId(123L);
        standard.setTenantId(100002L);

        IllegalArgumentException error = assertThrows(IllegalArgumentException.class, () -> service.update(standard));

        assertEquals("tenantId不能为空", error.getMessage());
        verifyNoInteractions(mapper);
    }

    private OaExpenseStandard standard() {
        OaExpenseStandard standard = new OaExpenseStandard();
        standard.setCategory("TRAVEL");
        standard.setLimitAmount(new BigDecimal("500.00"));
        return standard;
    }
}
