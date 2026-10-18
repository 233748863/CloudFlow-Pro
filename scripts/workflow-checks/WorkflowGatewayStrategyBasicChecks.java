import com.cloudflow.workflow.exception.WorkflowException;
import com.cloudflow.workflow.model.WorkflowGatewayRouting;
import com.cloudflow.workflow.model.WorkflowGraphModelResolver;
import com.cloudflow.workflow.model.WorkflowRuntimeGraph;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.List;
import java.util.Objects;

/** H1 WF-10 FR-2 only: strategy fields and directly affected gateway routing. */
public final class WorkflowGatewayStrategyBasicChecks {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final WorkflowGraphModelResolver GRAPHS = new WorkflowGraphModelResolver();
    private static int assertions;

    public static void main(String[] args) {
        for (String type : List.of("INCLUSIVE", "ROUTE")) {
            ObjectNode model = model(type);
            ObjectNode gateway = (ObjectNode) model.withArray("nodes").get(1);
            gateway.put("branchStrategy", type);
            equal(type, parse(model).getNode("split").getBranchStrategy(), "explicit strategy");
            gateway.remove("branchStrategy");
            equal(type, parse(model).getNode("split").getBranchStrategy(), "legacy missing strategy");
            gateway.put("branchStrategy", "EXCLUSIVE");
            equal(type, parse(model).getNode("split").getBranchStrategy(), "legacy exclusive strategy");
            gateway.put("branchStrategy", type.equals("INCLUSIVE") ? "ROUTE" : "INCLUSIVE");
            try {
                parse(model);
                throw new AssertionError("mismatched strategy accepted");
            } catch (WorkflowException expected) {
                assertions++;
            }
            gateway.put("branchStrategy", type);
            WorkflowRuntimeGraph graph = parse(model);
            equal(type.equals("INCLUSIVE") ? 2 : 1,
                    WorkflowGatewayRouting.select(graph, graph.getNode("split"), "true"::equals).size(),
                    "inclusive activates matching outlets; route picks first");
            ((ObjectNode) model.withArray("edges").get(5)).put("isDefault", true);
            graph = parse(model);
            equal(List.of("split-third"), WorkflowGatewayRouting.select(graph, graph.getNode("split"), condition -> false)
                    .stream().map(WorkflowRuntimeGraph.EdgeLink::getId).toList(), "explicit fallback");
            ((ObjectNode) model.withArray("edges").get(5)).put("isDefault", false);
            graph = parse(model);
            equal(0, WorkflowGatewayRouting.select(graph, graph.getNode("split"), condition -> false).size(),
                    "no match stays visible to existing failure handler");
        }
        ObjectNode parallel = model("PARALLEL");
        ((ObjectNode) parallel.withArray("nodes").get(1)).put("branchStrategy", "PARALLEL");
        WorkflowRuntimeGraph graph = parse(parallel);
        equal("PARALLEL", graph.getNode("split").getBranchStrategy(), "parallel strategy preserved");
        equal(3, WorkflowGatewayRouting.select(graph, graph.getNode("split"), condition -> false).size(),
                "parallel still activates every outlet");
        System.out.println("H1_GATEWAY_STRATEGY_BASIC: assertions=" + assertions + "; failed=0; formal_resolver=true; formal_routing=true; database=false; http=false");
    }

    private static WorkflowRuntimeGraph parse(ObjectNode model) {
        return GRAPHS.parseRuntimeGraph(model.toString());
    }

    private static ObjectNode model(String type) {
        ObjectNode model = JSON.createObjectNode();
        ArrayNode nodes = model.putArray("nodes");
        nodes.addObject().put("id", "start").put("type", "START").put("title", "Start");
        nodes.addObject().put("id", "split").put("type", type).put("title", "Gateway").put("joinNodeKey", "join");
        for (String id : List.of("first", "second", "third")) {
            nodes.addObject().put("id", id).put("type", "APPROVAL").put("title", id);
        }
        nodes.addObject().put("id", "join").put("type", type.equals("ROUTE") ? "APPROVAL" : "GATEWAY").put("title", "Join");
        nodes.addObject().put("id", "end").put("type", "END").put("title", "End");
        ArrayNode edges = model.putArray("edges");
        edges.addObject().put("id", "start-split").put("source", "start").put("target", "split");
        for (String id : List.of("first", "second", "third")) {
            edges.addObject().put("id", "split-" + id).put("source", "split").put("target", id)
                    .put("condition", id.equals("third") ? "false" : "true");
            edges.addObject().put("id", id + "-join").put("source", id).put("target", "join");
        }
        edges.addObject().put("id", "join-end").put("source", "join").put("target", "end");
        return model;
    }

    private static void equal(Object expected, Object actual, String label) {
        if (!Objects.equals(expected, actual)) throw new AssertionError(label + ": " + actual);
        assertions++;
    }
}
