package com.cloudflow.oa.service.impl;

import com.cloudflow.oa.domain.OaSeal;
import com.cloudflow.oa.domain.OaLicense;
import com.cloudflow.oa.mapper.OaSealApplicationMapper;
import com.cloudflow.oa.mapper.OaLicenseBorrowMapper;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class OaLedgerDeletionTest {
    @Test
    void sealDeletionKeepsAuditFieldsAndChecksActiveBorrowOnly() {
        OaSealApplicationMapper applications = mock(OaSealApplicationMapper.class);
        OaSealServiceImpl service = spy(new OaSealServiceImpl(applications, null, null, null));
        OaSeal seal = new OaSeal(); seal.setSealId(1L); seal.setDeleted(0);
        doReturn(seal).when(service).getById(1L);
        doReturn(true).when(service).updateById(any(OaSeal.class));
        when(applications.selectCount(any())).thenReturn(0L);
        assertTrue(service.removeSeals(List.of(1L)));
        ArgumentCaptor<OaSeal> update = ArgumentCaptor.forClass(OaSeal.class);
        verify(service).updateById(update.capture());
        assertEquals(1, update.getValue().getDeleted());
        assertNotNull(update.getValue().getUpdateTime());
        verify(applications).selectCount(any());
        when(applications.selectCount(any())).thenReturn(1L);
        assertThrows(IllegalArgumentException.class, () -> service.removeSeals(List.of(1L)));
        verify(service, times(1)).updateById(any(OaSeal.class));
        verify(service, never()).removeById(1L);
    }

    @Test
    void licenseDeletionKeepsAuditFieldsAndChecksActiveBorrowOnly() {
        OaLicenseBorrowMapper borrows = mock(OaLicenseBorrowMapper.class);
        OaLicenseServiceImpl service = spy(new OaLicenseServiceImpl(borrows, null, null, null));
        OaLicense license = new OaLicense(); license.setLicenseId(1L); license.setDeleted(0);
        doReturn(license).when(service).getById(1L);
        doReturn(true).when(service).updateById(any(OaLicense.class));
        when(borrows.selectCount(any())).thenReturn(0L);
        assertTrue(service.removeLicenses(List.of(1L)));
        ArgumentCaptor<OaLicense> update = ArgumentCaptor.forClass(OaLicense.class);
        verify(service).updateById(update.capture());
        assertEquals(1, update.getValue().getDeleted());
        assertNotNull(update.getValue().getUpdateTime());
        verify(borrows).selectCount(any());
        when(borrows.selectCount(any())).thenReturn(1L);
        assertThrows(IllegalArgumentException.class, () -> service.removeLicenses(List.of(1L)));
        verify(service, times(1)).updateById(any(OaLicense.class));
        verify(service, never()).removeById(1L);
    }
}
