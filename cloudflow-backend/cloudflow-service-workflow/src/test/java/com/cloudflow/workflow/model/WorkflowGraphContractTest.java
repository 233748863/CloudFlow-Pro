package com.cloudflow.workflow.model;

import com.cloudflow.workflow.exception.WorkflowException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class WorkflowGraphContractTest {
    private final WorkflowGraphModelResolver resolver = new WorkflowGraphModelResolver();
    private final ObjectMapper json = new ObjectMapper();
    private static final String GRAPH = """
            {"nodes":[{"id":"start","type":"START","title":"开始"},
                      {"id":"end","type":"END","title":"结束"}],
             "edges":[{"source":"start","target":"end","condition":"approved == true"}]}
            """;

    @Test
    void standardNamesPreserveRuntimeTitlesAndConditions() {
        WorkflowRuntimeGraph graph = resolver.parseRuntimeGraph(GRAPH);
        assertEquals("开始", resolver.parseRuntimeRoot(GRAPH).getTitle());
        assertEquals("approved == true", graph.getOutgoingEdges("start").get(0).getCondition());
    }

    @Test
    void refusesAliasesEvenAlongsideValidStandardFields() throws Exception {
        for (String alias : new String[]{"name", "label"}) {
            ObjectNode graph = (ObjectNode) json.readTree(GRAPH);
            ((ObjectNode) graph.path("nodes").get(0)).put(alias, "旧字段");
            assertThrows(WorkflowException.class, () -> resolver.parseRuntimeGraph(graph.toString()), alias);
        }
        for (String alias : new String[]{"from", "to", "expression", "expr", "label"}) {
            ObjectNode graph = (ObjectNode) json.readTree(GRAPH);
            ((ObjectNode) graph.path("edges").get(0)).put(alias, "旧字段");
            assertThrows(WorkflowException.class, () -> resolver.parseRuntimeGraph(graph.toString()), alias);
        }
        assertThrows(WorkflowException.class, () -> resolver.parseRuntimeGraph(GRAPH.replace("\"title\":\"开始\"", "\"name\":\"开始\"")));
    }
}
