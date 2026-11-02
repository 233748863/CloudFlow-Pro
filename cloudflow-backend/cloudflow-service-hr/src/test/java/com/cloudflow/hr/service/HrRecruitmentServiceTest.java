package com.cloudflow.hr.service;

import com.cloudflow.hr.domain.dto.HrLifecycleApplicationPayload;
import com.cloudflow.hr.domain.entity.HrOffer;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.LocalDate;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class HrRecruitmentServiceTest {
    @Test
    void offerArrivalDateCreatesOnboardingDateWithoutDisplayAlias() {
        HrTypedCrudService crud = mock(HrTypedCrudService.class);
        HrLifecycleService lifecycle = mock(HrLifecycleService.class);
        HrViewSupport support = mock(HrViewSupport.class);
        when(support.toLong(null)).thenReturn(null);
        when(crud.get(HrOffer.class, 9L)).thenReturn(Map.of("expectedArrivalDate", "2026-11-15"));
        when(lifecycle.createApplication(any())).thenReturn(12L);
        HrRecruitmentService service = new HrRecruitmentService(crud, lifecycle, support,
                new ObjectMapper().registerModule(new JavaTimeModule()));

        assertEquals(12L, service.convertOfferToOnboarding(9L));

        ArgumentCaptor<HrLifecycleApplicationPayload> payload = ArgumentCaptor.forClass(HrLifecycleApplicationPayload.class);
        verify(lifecycle).createApplication(payload.capture());
        assertEquals(LocalDate.of(2026, 11, 15), payload.getValue().getEffectiveDate());
        assertEquals("ONBOARDING", payload.getValue().getType());
    }
}
