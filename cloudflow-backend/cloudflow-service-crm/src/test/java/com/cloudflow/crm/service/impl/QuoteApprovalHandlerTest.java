package com.cloudflow.crm.service.impl;

import com.cloudflow.common.workflow.callback.domain.ApprovalResultDTO;
import com.cloudflow.crm.domain.CrmQuote;
import com.cloudflow.crm.mapper.CrmQuoteMapper;
import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.apache.ibatis.builder.MapperBuilderAssistant;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class QuoteApprovalHandlerTest {

    @Mock
    private CrmQuoteMapper quoteMapper;

    private QuoteApprovalHandler handler;

    @BeforeEach
    void setUp() {
        MybatisConfiguration configuration = new MybatisConfiguration();
        MapperBuilderAssistant assistant = new MapperBuilderAssistant(configuration, "");
        assistant.setCurrentNamespace("crmQuoteTest");
        TableInfoHelper.initTableInfo(assistant, CrmQuote.class);
        handler = new QuoteApprovalHandler(quoteMapper);
    }

    @Test
    void handleApproved_updatesQuoteStatusToApproved() {
        ApprovalResultDTO dto = new ApprovalResultDTO();
        dto.setBusinessId(8101L);
        dto.setProcessInstanceId("wf-inst-001");

        when(quoteMapper.update(isNull(), org.mockito.ArgumentMatchers.any())).thenReturn(1);

        handler.handleApproved(dto);

        ArgumentCaptor<com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper> captor =
                ArgumentCaptor.forClass(com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper.class);
        verify(quoteMapper).update(isNull(), captor.capture());
        String sqlSegment = captor.getValue().getSqlSet();
        assertEquals(true, sqlSegment.contains("status"));
        assertEquals(true, sqlSegment.contains("instance_id"));
    }

    @Test
    void handleRejected_throwsWhenQuoteMissing() {
        ApprovalResultDTO dto = new ApprovalResultDTO();
        dto.setBusinessId(8102L);
        dto.setProcessInstanceId("wf-inst-002");

        when(quoteMapper.update(isNull(), org.mockito.ArgumentMatchers.any())).thenReturn(0);

        IllegalStateException ex = assertThrows(IllegalStateException.class, () -> handler.handleRejected(dto));
        assertEquals("未找到报价记录，businessId=8102", ex.getMessage());
    }
}
