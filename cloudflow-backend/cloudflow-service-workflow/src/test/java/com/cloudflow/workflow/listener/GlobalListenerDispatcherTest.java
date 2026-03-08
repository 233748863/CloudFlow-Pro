package com.cloudflow.workflow.listener;

import com.cloudflow.workflow.domain.WfNodeConfig;
import com.cloudflow.workflow.domain.WfProcessInstance;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;

class GlobalListenerDispatcherTest {

    @Test
    void fireFinishShouldNotDereferenceNullNodeWhenListenerFails() {
        GlobalListenerDispatcher dispatcher = new GlobalListenerDispatcher();
        injectField(dispatcher, "listeners", List.of(new FailingListener()));
        dispatcher.init();

        WfProcessInstance instance = new WfProcessInstance();
        instance.setInstanceId("instance-1");

        assertDoesNotThrow(() -> dispatcher.fireFinish(instance, null, Map.of()));
    }

    private void injectField(Object target, String fieldName, Object value) {
        try {
            Field field = target.getClass().getDeclaredField(fieldName);
            field.setAccessible(true);
            field.set(target, value);
        } catch (Exception e) {
            throw new IllegalStateException("测试注入字段失败: " + fieldName, e);
        }
    }

    private static final class FailingListener implements WorkflowGlobalListener {
        @Override
        public void onFinish(WfProcessInstance instance, WfNodeConfig node, Map<String, Object> variables) {
            throw new IllegalStateException("boom");
        }
    }
}
