package com.cloudflow.hr.listener;

import com.cloudflow.common.core.utils.RedisStreamUtil;
import com.cloudflow.hr.config.WorkflowCallbackStreamConstants;
import com.cloudflow.hr.domain.dto.ApprovalResultDTO;
import com.cloudflow.hr.service.WorkflowCallbackService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.connection.stream.MapRecord;
import org.springframework.data.redis.connection.stream.RecordId;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * workflow 审批结果 stream 消费测试。
 */
@ExtendWith(MockitoExtension.class)
class WorkflowApprovalCallbackStreamConsumerTest {

    @Mock
    private WorkflowCallbackService workflowCallbackService;

    @Mock
    private RedisStreamUtil redisStreamUtil;

    @Mock
    private MapRecord<String, String, String> message;

    @Mock
    private RecordId recordId;

    @Test
    void testOnMessageShouldParseBodyAndAckMessage() {
        when(message.getId()).thenReturn(recordId);
        when(recordId.getValue()).thenReturn("1-0");
        when(message.getValue()).thenReturn(Map.of(
                "tenantId", "\"2001\"",
                "processInstanceId", "\"proc-001\"",
                "businessType", "\"ONBOARDING\"",
                "businessId", "\"1011\"",
                "businessNo", "\"OB202603220001\"",
                "approvalResult", "\"APPROVED\"",
                "approvalComment", "\"同意\"",
                "approverId", "\"9001\"",
                "approverName", "\"审批人\"",
                "approvalTime", "\"1711111111111\""
        ));

        WorkflowApprovalCallbackStreamConsumer consumer =
                new WorkflowApprovalCallbackStreamConsumer(workflowCallbackService, redisStreamUtil);

        consumer.onMessage(message);

        ArgumentCaptor<ApprovalResultDTO> captor = ArgumentCaptor.forClass(ApprovalResultDTO.class);
        verify(workflowCallbackService, times(1)).handleApprovalResult(captor.capture());
        ApprovalResultDTO dto = captor.getValue();

        assertEquals(2001L, dto.getTenantId());
        assertEquals("proc-001", dto.getProcessInstanceId());
        assertEquals("ONBOARDING", dto.getBusinessType());
        assertEquals(1011L, dto.getBusinessId());
        assertEquals("OB202603220001", dto.getBusinessNo());
        assertEquals("APPROVED", dto.getApprovalResult());
        assertEquals("同意", dto.getApprovalComment());
        assertEquals(9001L, dto.getApproverId());
        assertEquals("审批人", dto.getApproverName());
        assertEquals(1711111111111L, dto.getApprovalTime());

        verify(redisStreamUtil, times(1)).ackGlobal(
                WorkflowCallbackStreamConstants.APPROVAL_CALLBACK_STREAM_KEY,
                WorkflowCallbackStreamConstants.APPROVAL_CALLBACK_GROUP,
                "1-0"
        );
        verify(redisStreamUtil, times(1)).deleteGlobal(
                WorkflowCallbackStreamConstants.APPROVAL_CALLBACK_STREAM_KEY,
                "1-0"
        );
    }
}
