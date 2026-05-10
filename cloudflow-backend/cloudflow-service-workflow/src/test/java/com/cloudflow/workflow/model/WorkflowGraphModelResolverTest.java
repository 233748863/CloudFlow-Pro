package com.cloudflow.workflow.model;

import com.cloudflow.workflow.exception.WorkflowException;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

class WorkflowGraphModelResolverTest {

    private final WorkflowGraphModelResolver resolver = new WorkflowGraphModelResolver();

    @Test
    void acceptsMultipleIncomingEdgesToEnd() {
        WorkflowRuntimeGraph graph = resolver.parseRuntimeGraph("""
            {
              "nodes": [
                {"id":"root","type":"START","title":"开始"},
                {"id":"gw1","type":"CONDITION","title":"金额校验"},
                {"id":"b1","type":"APPROVAL","title":"财务审批","condition":"amount < 50000"},
                {"id":"b2","type":"APPROVAL","title":"总经理审批","condition":"amount >= 50000"},
                {"id":"end","type":"END","title":"流程结束"}
              ],
              "edges": [
                {"id":"root->gw1","source":"root","target":"gw1"},
                {"id":"gw1->b1","source":"gw1","target":"b1"},
                {"id":"gw1->b2","source":"gw1","target":"b2"},
                {"id":"b1->end","source":"b1","target":"end"},
                {"id":"b2->end","source":"b2","target":"end"}
              ]
            }
            """);

        assertEquals("gw1", graph.getFirstExecutableNodeId());
        assertNotNull(graph.getNode("end"));
        assertEquals(2, graph.getIncomingEdges("end").size());
    }

    @Test
    void rejectsMultipleIncomingEdgesToNonEndNode() {
        WorkflowException exception = assertThrows(WorkflowException.class, () -> resolver.parseRuntimeGraph("""
            {
              "nodes": [
                {"id":"root","type":"START","title":"开始"},
                {"id":"gw1","type":"CONDITION","title":"金额校验"},
                {"id":"b1","type":"APPROVAL","title":"财务审批","condition":"amount < 50000"},
                {"id":"b2","type":"APPROVAL","title":"总经理审批","condition":"amount >= 50000"},
                {"id":"n3","type":"APPROVAL","title":"归档审批"},
                {"id":"end","type":"END","title":"流程结束"}
              ],
              "edges": [
                {"id":"root->gw1","source":"root","target":"gw1"},
                {"id":"gw1->b1","source":"gw1","target":"b1"},
                {"id":"gw1->b2","source":"gw1","target":"b2"},
                {"id":"b1->n3","source":"b1","target":"n3"},
                {"id":"b2->n3","source":"b2","target":"n3"},
                {"id":"n3->end","source":"n3","target":"end"}
              ]
            }
            """));

        assertEquals("VALIDATION_ERROR", exception.getCode());
    }

    @Test
    void rejectsOutgoingEdgeFromEndNode() {
        WorkflowException exception = assertThrows(WorkflowException.class, () -> resolver.parseRuntimeGraph("""
            {
              "nodes": [
                {"id":"root","type":"START","title":"开始"},
                {"id":"n1","type":"APPROVAL","title":"审批"},
                {"id":"end","type":"END","title":"流程结束"},
                {"id":"n2","type":"APPROVAL","title":"结束后审批"}
              ],
              "edges": [
                {"id":"root->n1","source":"root","target":"n1"},
                {"id":"n1->end","source":"n1","target":"end"},
                {"id":"end->n2","source":"end","target":"n2"}
              ]
            }
            """));

        assertEquals("VALIDATION_ERROR", exception.getCode());
    }
}
