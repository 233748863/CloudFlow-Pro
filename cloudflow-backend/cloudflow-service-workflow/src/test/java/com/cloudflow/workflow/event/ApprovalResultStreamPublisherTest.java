package com.cloudflow.workflow.event;

import com.cloudflow.common.core.utils.RedisStreamUtil;
import com.cloudflow.workflow.config.WorkflowCallbackStreamConstants;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.mapper.WfProcessInstanceMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Proxy;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

class ApprovalResultStreamPublisherTest {

    @Test
    void onProcessCompletedShouldPublishApprovalCallbackMessage() {
        WfProcessInstance instance = new WfProcessInstance();
        instance.setInstanceId("instance-001");
        instance.setTenantId(2001L);
        instance.setBusinessKey("ONBOARDING:1011");
        instance.setVariables("{\"businessType\":\"ONBOARDING\",\"businessId\":\"1011\",\"businessNo\":\"OB202603220001\",\"callbackStreamKey\":\"workflow:stream:approval-callback\"}");

        CapturingRedisStreamUtil redisStreamUtil = new CapturingRedisStreamUtil();
        ApprovalResultStreamPublisher publisher = new ApprovalResultStreamPublisher(
                mapperReturning(instance),
                redisStreamUtil,
                new ObjectMapper()
        );

        publisher.onProcessCompleted(new ProcessCompletedEvent(this, "instance-001", "onboarding_approval", 9001L, "审批人"));

        assertEquals(WorkflowCallbackStreamConstants.APPROVAL_CALLBACK_STREAM_KEY, redisStreamUtil.streamKey);
        assertNotNull(redisStreamUtil.body);
        assertEquals("2001", redisStreamUtil.body.get("tenantId"));
        assertEquals("instance-001", redisStreamUtil.body.get("processInstanceId"));
        assertEquals("ONBOARDING", redisStreamUtil.body.get("businessType"));
        assertEquals("1011", redisStreamUtil.body.get("businessId"));
        assertEquals("OB202603220001", redisStreamUtil.body.get("businessNo"));
        assertEquals("APPROVED", redisStreamUtil.body.get("approvalResult"));
        assertEquals("9001", redisStreamUtil.body.get("approverId"));
        assertEquals("审批人", redisStreamUtil.body.get("approverName"));
    }

    @Test
    void onProcessRejectedShouldPublishRejectComment() {
        WfProcessInstance instance = new WfProcessInstance();
        instance.setInstanceId("instance-002");
        instance.setTenantId(2001L);
        instance.setBusinessKey("TRANSFER:2031");
        instance.setVariables("{\"businessType\":\"TRANSFER\",\"businessId\":\"2031\",\"businessNo\":\"TR202603220001\"}");

        CapturingRedisStreamUtil redisStreamUtil = new CapturingRedisStreamUtil();
        ApprovalResultStreamPublisher publisher = new ApprovalResultStreamPublisher(
                mapperReturning(instance),
                redisStreamUtil,
                new ObjectMapper()
        );

        publisher.onProcessRejected(new ProcessRejectedEvent(
                this, "instance-002", "transfer_approval", 9002L, "经理", "审批节点", "不同意"));

        assertEquals(WorkflowCallbackStreamConstants.APPROVAL_CALLBACK_STREAM_KEY, redisStreamUtil.streamKey);
        assertEquals("TRANSFER", redisStreamUtil.body.get("businessType"));
        assertEquals("2031", redisStreamUtil.body.get("businessId"));
        assertEquals("REJECTED", redisStreamUtil.body.get("approvalResult"));
        assertEquals("不同意", redisStreamUtil.body.get("approvalComment"));
    }

    private WfProcessInstanceMapper mapperReturning(WfProcessInstance instance) {
        return (WfProcessInstanceMapper) Proxy.newProxyInstance(
                WfProcessInstanceMapper.class.getClassLoader(),
                new Class<?>[]{WfProcessInstanceMapper.class},
                (proxy, method, args) -> {
                    if ("selectById".equals(method.getName())) {
                        return instance;
                    }
                    if ("toString".equals(method.getName())) {
                        return "MockWfProcessInstanceMapper";
                    }
                    if ("hashCode".equals(method.getName())) {
                        return System.identityHashCode(proxy);
                    }
                    if ("equals".equals(method.getName())) {
                        return proxy == args[0];
                    }
                    return null;
                }
        );
    }

    private static class CapturingRedisStreamUtil extends RedisStreamUtil {
        private String streamKey;
        private Map<String, Object> body;

        @Override
        public String publishGlobal(String key, Map<String, Object> content) {
            this.streamKey = key;
            this.body = content;
            return "1-0";
        }
    }
}
