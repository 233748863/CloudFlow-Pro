package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.cloudflow.common.redis.core.RedisStreamUtil;
import com.cloudflow.common.workflow.callback.domain.ApprovalResultDTO;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.lang.reflect.Constructor;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.math.BigDecimal;
import java.util.Collection;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ContractApprovalHandlerTest {

    private static final String CRM_EVENTS_STREAM_KEY = "crm:stream:events";
    private static final String EVENT_CONTRACT_APPROVED = "ContractApproved";
    private static final String EVENT_CONTRACT_REJECTED = "ContractRejected";
    private static final String CONTRACT_STATUS_APPROVED = "APPROVED";
    private static final String CONTRACT_STATUS_REJECTED = "REJECTED";
    private static final String BUSINESS_TYPE_CONTRACT = "CONTRACT";
    private static final String BUSINESS_TYPE_APPROVAL = "APPROVAL";

    @Mock
    private RedisStreamUtil redisStreamUtil;

    private Class<?> oaContractClass;
    private Class<?> contractMapperClass;
    private Class<?> traceServiceClass;
    private Object contractMapper;
    private Object oaTraceEventService;
    private Object handler;
    private ContractMapperRecorder contractMapperRecorder;
    private TraceRecorder traceRecorder;

    @BeforeEach
    void setUp() throws Exception {
        oaContractClass = Class.forName("com.cloudflow.oa.domain.OaContract");
        contractMapperClass = Class.forName("com.cloudflow.oa.mapper.OaContractMapper");
        traceServiceClass = Class.forName("com.cloudflow.oa.service.IOaTraceEventService");
        Class<?> handlerClass = Class.forName("com.cloudflow.oa.service.impl.ContractApprovalHandler");

        MybatisConfiguration configuration = new MybatisConfiguration();
        MapperBuilderAssistant assistant = new MapperBuilderAssistant(configuration, "");
        assistant.setCurrentNamespace("oaContractApprovalTest");
        TableInfoHelper.initTableInfo(assistant, oaContractClass);

        contractMapperRecorder = new ContractMapperRecorder();
        traceRecorder = new TraceRecorder();
        contractMapper = Proxy.newProxyInstance(
                contractMapperClass.getClassLoader(),
                new Class<?>[]{contractMapperClass},
                contractMapperRecorder
        );
        oaTraceEventService = Proxy.newProxyInstance(
                traceServiceClass.getClassLoader(),
                new Class<?>[]{traceServiceClass},
                traceRecorder
        );

        Constructor<?> constructor = handlerClass.getConstructor(contractMapperClass, traceServiceClass, RedisStreamUtil.class);
        handler = constructor.newInstance(contractMapper, oaTraceEventService, redisStreamUtil);
    }

    @Test
    void handleApproved_updatesStatusAndPublishesCrmEventForCrmSource() throws Exception {
        Object contract = buildContract();
        contractMapperRecorder.selectByIdResult = contract;
        contractMapperRecorder.updateResult = 1;
        when(redisStreamUtil.publishGlobal(any(), any())).thenReturn("1748930000000-0");

        ApprovalResultDTO dto = approvalDto(8801L, "wf-inst-001", "通过", 3001L, "审批人");

        invokeHandler("handleApproved", dto);

        Collection<Object> values = contractMapperRecorder.lastUpdateWrapper.getParamNameValuePairs().values();
        assertTrue(values.contains("wf-inst-001"));
        assertTrue(values.contains(CONTRACT_STATUS_APPROVED));

        assertEquals(100000L, traceRecorder.lastArgs[0]);
        assertEquals(BUSINESS_TYPE_CONTRACT, traceRecorder.lastArgs[1]);
        assertEquals(8801L, traceRecorder.lastArgs[2]);
        assertEquals(BUSINESS_TYPE_APPROVAL, traceRecorder.lastArgs[3]);
        assertEquals(8801L, traceRecorder.lastArgs[4]);
        assertEquals("APPROVAL_APPROVED", traceRecorder.lastArgs[5]);
        assertEquals("合同审批通过", traceRecorder.lastArgs[6]);
        assertEquals("通过", traceRecorder.lastArgs[7]);
        assertEquals(3001L, traceRecorder.lastArgs[8]);
        assertEquals("审批人", traceRecorder.lastArgs[9]);

        ArgumentCaptor<Map<String, Object>> payloadCaptor = ArgumentCaptor.forClass(Map.class);
        verify(redisStreamUtil).publishGlobal(org.mockito.ArgumentMatchers.eq(CRM_EVENTS_STREAM_KEY), payloadCaptor.capture());
        Map<String, Object> payload = payloadCaptor.getValue();
        assertEquals(EVENT_CONTRACT_APPROVED, payload.get("eventType"));
        assertEquals("8801", payload.get("contractId"));
        assertEquals("CRM_QUOTE", payload.get("sourceType"));
        assertEquals("8101", payload.get("sourceId"));
    }

    @Test
    void handleApproved_skipsCrmEventWhenSourceIsNotCrm() throws Exception {
        Object contract = buildContract();
        invokeSetter(contract, "setSourceType", String.class, "OA_MANUAL");
        contractMapperRecorder.selectByIdResult = contract;
        contractMapperRecorder.updateResult = 1;

        invokeHandler("handleApproved", approvalDto(8801L, "wf-inst-002", "通过", null, null));

        verify(redisStreamUtil, never()).publishGlobal(any(), any());
    }

    @Test
    void handleRejected_updatesStatusAndPublishesCrmEventForCrmSource() throws Exception {
        Object contract = buildContract();
        contractMapperRecorder.selectByIdResult = contract;
        contractMapperRecorder.updateResult = 1;
        when(redisStreamUtil.publishGlobal(any(), any())).thenReturn("1748930000001-0");

        ApprovalResultDTO dto = approvalDto(8801L, "wf-inst-003", "驳回", 3002L, "复核人");

        invokeHandler("handleRejected", dto);

        Collection<Object> values = contractMapperRecorder.lastUpdateWrapper.getParamNameValuePairs().values();
        assertTrue(values.contains("wf-inst-003"));
        assertTrue(values.contains(CONTRACT_STATUS_REJECTED));

        assertEquals(100000L, traceRecorder.lastArgs[0]);
        assertEquals(BUSINESS_TYPE_CONTRACT, traceRecorder.lastArgs[1]);
        assertEquals(8801L, traceRecorder.lastArgs[2]);
        assertEquals(BUSINESS_TYPE_APPROVAL, traceRecorder.lastArgs[3]);
        assertEquals(8801L, traceRecorder.lastArgs[4]);
        assertEquals("APPROVAL_REJECTED", traceRecorder.lastArgs[5]);
        assertEquals("合同审批驳回", traceRecorder.lastArgs[6]);
        assertEquals("驳回", traceRecorder.lastArgs[7]);
        assertEquals(3002L, traceRecorder.lastArgs[8]);
        assertEquals("复核人", traceRecorder.lastArgs[9]);

        ArgumentCaptor<Map<String, Object>> payloadCaptor = ArgumentCaptor.forClass(Map.class);
        verify(redisStreamUtil).publishGlobal(org.mockito.ArgumentMatchers.eq(CRM_EVENTS_STREAM_KEY), payloadCaptor.capture());
        Map<String, Object> payload = payloadCaptor.getValue();
        assertEquals(EVENT_CONTRACT_REJECTED, payload.get("eventType"));
        assertEquals("8801", payload.get("contractId"));
        assertEquals("CRM_QUOTE", payload.get("sourceType"));
    }

    private void invokeHandler(String methodName, ApprovalResultDTO dto) throws Exception {
        Method method = handler.getClass().getMethod(methodName, ApprovalResultDTO.class);
        method.invoke(handler, dto);
    }

    private Object buildContract() throws Exception {
        Object contract = oaContractClass.getConstructor().newInstance();
        invokeSetter(contract, "setContractId", Long.class, 8801L);
        invokeSetter(contract, "setTenantId", Long.class, 100000L);
        invokeSetter(contract, "setDeleted", Integer.class, 0);
        invokeSetter(contract, "setContractNo", String.class, "HT-2026-001");
        invokeSetter(contract, "setContractName", String.class, "景曜科技年度框架合同");
        invokeSetter(contract, "setAmount", BigDecimal.class, new BigDecimal("250000"));
        invokeSetter(contract, "setCustomerId", Long.class, 6001L);
        invokeSetter(contract, "setCustomerName", String.class, "景曜科技");
        invokeSetter(contract, "setOwnerId", Long.class, 2001L);
        invokeSetter(contract, "setOwnerName", String.class, "张三");
        invokeSetter(contract, "setDeptId", Long.class, 3001L);
        invokeSetter(contract, "setDeptName", String.class, "销售一部");
        invokeSetter(contract, "setSourceType", String.class, "CRM_QUOTE");
        invokeSetter(contract, "setSourceId", Long.class, 8101L);
        return contract;
    }

    private void invokeSetter(Object target, String methodName, Class<?> parameterType, Object value) throws Exception {
        Method method = target.getClass().getMethod(methodName, parameterType);
        method.invoke(target, value);
    }

    private ApprovalResultDTO approvalDto(Long businessId, String instanceId, String comment, Long approverId, String approverName) {
        ApprovalResultDTO dto = new ApprovalResultDTO();
        dto.setBusinessId(businessId);
        dto.setProcessInstanceId(instanceId);
        dto.setApprovalComment(comment);
        dto.setApproverId(approverId);
        dto.setApproverName(approverName);
        return dto;
    }

    private static final class ContractMapperRecorder implements InvocationHandler {
        private Object selectByIdResult;
        private int updateResult;
        private LambdaUpdateWrapper<?> lastUpdateWrapper;

        @Override
        public Object invoke(Object proxy, Method method, Object[] args) {
            String name = method.getName();
            if ("selectById".equals(name)) {
                return selectByIdResult;
            }
            if ("update".equals(name)) {
                lastUpdateWrapper = (LambdaUpdateWrapper<?>) args[1];
                return updateResult;
            }
            if ("toString".equals(name)) {
                return "ContractMapperRecorder";
            }
            return defaultValue(method.getReturnType());
        }
    }

    private static final class TraceRecorder implements InvocationHandler {
        private Object[] lastArgs;

        @Override
        public Object invoke(Object proxy, Method method, Object[] args) {
            if ("record".equals(method.getName())) {
                lastArgs = args;
            }
            if ("toString".equals(method.getName())) {
                return "TraceRecorder";
            }
            return defaultValue(method.getReturnType());
        }
    }

    private static Object defaultValue(Class<?> returnType) {
        if (returnType == Void.TYPE) {
            return null;
        }
        if (returnType == Boolean.TYPE) {
            return false;
        }
        if (returnType == Integer.TYPE) {
            return 0;
        }
        if (returnType == Long.TYPE) {
            return 0L;
        }
        if (returnType == Double.TYPE) {
            return 0D;
        }
        if (returnType == Float.TYPE) {
            return 0F;
        }
        if (returnType == Short.TYPE) {
            return (short) 0;
        }
        if (returnType == Byte.TYPE) {
            return (byte) 0;
        }
        if (returnType == Character.TYPE) {
            return '\0';
        }
        return null;
    }
}
