package com.cloudflow.workflow.service;

import com.cloudflow.workflow.config.GroovySandboxConfig;
import com.cloudflow.workflow.config.properties.WorkflowProperties;
import com.cloudflow.workflow.exception.WorkflowException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class ScriptExecutionServiceTest {

    private ScriptExecutionService buildService(boolean enabled) {
        WorkflowProperties properties = new WorkflowProperties();
        WorkflowProperties.Script script = new WorkflowProperties.Script();
        script.setEnabled(enabled);
        script.setTimeoutMs(5000);
        properties.setScript(script);
        ScriptExecutionPolicy policy = new ScriptExecutionPolicy(properties, new ObjectMapper());
        GroovySandboxConfig sandboxConfig = new GroovySandboxConfig(properties);
        return new ScriptExecutionService(policy, sandboxConfig);
    }

    @Test
    void shouldRejectDisabledScriptExecution() {
        ScriptExecutionService service = buildService(false);
        assertThrows(WorkflowException.class, () -> service.executeGroovyScript("1 + 1", Map.of()));
    }

    @Test
    void shouldExecuteSimpleGroovyExpression() {
        ScriptExecutionService service = buildService(true);
        Object result = service.executeGroovyScript("amount + 2", Map.of("amount", 3));
        assertEquals(5, result);
    }

    @Test
    void shouldRejectSystemExit() {
        ScriptExecutionService service = buildService(true);
        assertThrows(Exception.class, () -> service.executeGroovyScript("System.exit(0)", Map.of()));
    }

    @Test
    void shouldRejectFileAccess() {
        ScriptExecutionService service = buildService(true);
        assertThrows(Exception.class, () -> service.executeGroovyScript("new File('/tmp/x').text", Map.of()));
    }
}
