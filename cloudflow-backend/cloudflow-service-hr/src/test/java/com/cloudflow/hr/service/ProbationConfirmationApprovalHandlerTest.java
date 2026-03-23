package com.cloudflow.hr.service;

import com.cloudflow.hr.domain.dto.ApprovalResultDTO;
import com.cloudflow.hr.service.impl.ProbationConfirmationApprovalHandler;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Map;

import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class ProbationConfirmationApprovalHandlerTest {

    @Mock
    private ProbationConfirmationService probationConfirmationService;

    @Test
    void testHandleRejectedParsesLongExtensionDays() {
        ProbationConfirmationApprovalHandler handler =
                new ProbationConfirmationApprovalHandler(probationConfirmationService);

        ApprovalResultDTO dto = new ApprovalResultDTO();
        dto.setBusinessId(10L);
        dto.setApprovalComment("继续观察");
        dto.setVariables(Map.of("extensionDays", 15L));

        handler.handleRejected(dto);

        verify(probationConfirmationService, times(1))
                .rejectProbationConfirmation(10L, "继续观察", 15);
    }
}
