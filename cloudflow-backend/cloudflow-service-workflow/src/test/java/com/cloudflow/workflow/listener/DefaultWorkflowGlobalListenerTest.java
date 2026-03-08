package com.cloudflow.workflow.listener;

import com.cloudflow.workflow.domain.WfProcessInstance;
import org.junit.jupiter.api.Test;

import java.util.HashMap;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;

class DefaultWorkflowGlobalListenerTest {

    @Test
    void onFinishShouldAllowNullNodeForProcessEndCallback() {
        DefaultWorkflowGlobalListener listener = new DefaultWorkflowGlobalListener();
        WfProcessInstance instance = new WfProcessInstance();
        instance.setInstanceId("instance-1");
        instance.setProcessDefKey("demo_process");

        assertDoesNotThrow(() -> listener.onFinish(instance, null, new HashMap<>()));
    }
}
