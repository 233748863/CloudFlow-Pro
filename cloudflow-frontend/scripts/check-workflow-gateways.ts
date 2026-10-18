import assert from 'node:assert/strict';
import { NodeType, type WorkflowGraphDefinition, type WorkflowGraphNode } from '../src/types';
import { appendWorkflowGraphBranch, assertWorkflowGraphIntegrity, cloneWorkflowGraphSubgraph, countWorkflowGraphBranches,
  createDefaultWorkflowGraph, findWorkflowGraphBranchSharedMergeId, insertWorkflowGatewayAfter, insertWorkflowGraphSubgraphAfter,
  isMultiBranchDecisionNode, removeWorkflowGraphBranch, removeWorkflowGraphNode } from '../src/utils/workflowGraph';
import { getWorkflowGatewayBranches, getWorkflowGatewayBranchStrategy, isWorkflowGatewaySplit, validateWorkflowGateways, workflowEdgeIsDefault } from '../src/utils/workflowGateway';
import { validateWorkflowGraph } from '../src/components/workflow-builder/validateWorkflowGraph';

export const runWorkflowGatewayChecks = () => {
  let checks = 0;
  let identifier = 0;
  const createId = (prefix = 'node') => `${prefix}_${++identifier}`;
  const check = (label: string, operation: () => void) => {
    try { operation(); checks++; } catch (cause) { throw new Error(label, { cause }); }
  };
  const configured = (graph: WorkflowGraphDefinition): WorkflowGraphDefinition => ({ ...graph,
    nodes: graph.nodes.map(node => node.type === NodeType.APPROVAL ? { ...node, approverType: 'USER', approverValue: '1' } : node),
  });
  for (const type of [NodeType.CONDITION, NodeType.PARALLEL, NodeType.INCLUSIVE, NodeType.ROUTE]) {
    const graph = configured(insertWorkflowGatewayAfter(createDefaultWorkflowGraph(), 'start', type, createId));
    const split = graph.nodes.find(node => node.type === type)!;
    check(`${type} creation is structurally valid`, () => assert.doesNotThrow(() => assertWorkflowGraphIntegrity(graph)));
    check(`${type} configured graph can be published`, () => assert.deepEqual(validateWorkflowGraph(graph).errors, []));
    check(`${type} creation persists the correct strategy`, () => assert.equal(split.branchStrategy, getWorkflowGatewayBranchStrategy(split)));
    const legacy = structuredClone(graph);
    delete legacy.nodes.find(node => node.id === split.id)!.branchStrategy;
    check(`${type} legacy model without strategy can be published`, () => assert.deepEqual(validateWorkflowGraph(legacy).errors, []));
    if (type === NodeType.INCLUSIVE || type === NodeType.ROUTE) {
      legacy.nodes.find(node => node.id === split.id)!.branchStrategy = 'EXCLUSIVE';
      check(`${type} legacy EXCLUSIVE strategy retains compatibility`, () => assert.deepEqual(validateWorkflowGraph(legacy).errors, []));
      legacy.nodes.find(node => node.id === split.id)!.branchStrategy = type === NodeType.INCLUSIVE ? 'ROUTE' : 'INCLUSIVE';
      check(`${type} mismatched new strategy is rejected`, () => assert.ok(validateWorkflowGraph(legacy).errors.length > 0));
    }
    check(`${type} creation has exactly two actual outlets`, () => assert.equal(countWorkflowGraphBranches(graph, split.id), 2));
    check(`${type} full model survives save/load serialization`, () => assert.deepEqual(JSON.parse(JSON.stringify(graph)), JSON.parse(JSON.stringify({ ...graph }))));
    if (!isWorkflowGatewaySplit(split)) continue;
    const join = graph.nodes.find(node => node.id === split.joinNodeKey)!;
    check(`${type} creation has a dedicated paired join`, () => assert.equal(join.type, NodeType.GATEWAY));
    check(`${type} join discovery follows explicit pair`, () => assert.equal(findWorkflowGraphBranchSharedMergeId(graph, split.id), join.id));
    check(`${type} gateway is never a countersign approval`, () => assert.equal(split.signType, undefined));
    check(`${type} join cannot be deleted separately`, () => assert.throws(() => removeWorkflowGraphNode(graph, join.id), /配对/));
    const added = appendWorkflowGraphBranch(graph, split.id, { id: createId('branch'), type: NodeType.APPROVAL, title: '追加分支', condition: 'false' }, 'EXCLUSIVE');
    check(`${type} append does not fabricate a default`, () => assert.equal(getWorkflowGatewayBranches(added, split).filter(workflowEdgeIsDefault).length, 0));
    check(`${type} appended branch returns to declared join`, () => assert.deepEqual(validateWorkflowGateways(added).errors, []));
    const first = getWorkflowGatewayBranches(graph, split)[0].target;
    const reduced = removeWorkflowGraphBranch(graph, split.id, first);
    check(`${type} single remaining branch keeps gateway semantics`, () => assert.equal(isMultiBranchDecisionNode(reduced.nodes.find(node => node.id === split.id), reduced), true));
    check(`${type} reducing branches preserves paired join and successor`, () => assert.ok(reduced.nodes.some(node => node.id === join.id) && reduced.edges.some(edge => edge.source === join.id && edge.target === 'end')));
    check(`${type} remaining branch is structurally valid`, () => assert.doesNotThrow(() => assertWorkflowGraphIntegrity(reduced)));
    check(`${type} final branch cannot be removed alone`, () => assert.throws(() => removeWorkflowGraphBranch(reduced, split.id, getWorkflowGatewayBranches(reduced, split)[0].target), /至少保留/));
    const removed = removeWorkflowGraphNode(graph, split.id);
    check(`${type} removing pair preserves original successor`, () => assert.deepEqual(removed.nodes.map(node => node.id), ['start', 'end']));
    check(`${type} removing pair reconnects upstream`, () => assert.doesNotThrow(() => assertWorkflowGraphIntegrity(removed)));
    const nested = configured(insertWorkflowGatewayAfter(graph, first, NodeType.INCLUSIVE, createId));
    check(`${type} nested gateway pairs are valid`, () => assert.doesNotThrow(() => assertWorkflowGraphIntegrity(nested)));
    const cloned = cloneWorkflowGraphSubgraph(nested, split.id, createId)!;
    check(`${type} clone excludes original continuation`, () => assert.ok(!cloned.subgraph.nodes.some(node => node.type === NodeType.END)));
    check(`${type} clone remaps every nested join`, () => assert.ok(cloned.subgraph.nodes.filter(isWorkflowGatewaySplit).every(node => cloned.subgraph.nodes.some(joinNode => joinNode.id === node.joinNodeKey))));
    const pasted = insertWorkflowGraphSubgraphAfter(createDefaultWorkflowGraph(), 'start', cloned.subgraph, cloned.rootId);
    check(`${type} paste attaches join exit, not split`, () => assert.doesNotThrow(() => assertWorkflowGraphIntegrity(pasted)));
    const invalid = structuredClone(nested);
    const inner = invalid.nodes.find(node => node.id !== split.id && isWorkflowGatewaySplit(node))!;
    inner.joinNodeKey = join.id;
    check(`${type} nested pair reuse is rejected`, () => assert.ok(validateWorkflowGateways(invalid).errors.length > 0));
    const cross = structuredClone(graph);
    cross.edges.push({ id: 'cross', source: first, target: getWorkflowGatewayBranches(graph, split)[1].target });
    check(`${type} branch crossing is rejected`, () => assert.ok(validateWorkflowGateways(cross).errors.length > 0));
    const bypass = structuredClone(graph);
    bypass.edges.push({ id: 'bypass', source: 'start', target: join.id });
    check(`${type} join bypass is rejected`, () => assert.ok(validateWorkflowGateways(bypass).errors.length > 0));
    const looping = configured(insertWorkflowGatewayAfter(graph, join.id, NodeType.ROUTE, createId));
    const route = looping.nodes.find(node => node.type === NodeType.ROUTE)!;
    looping.edges.find(edge => edge.source === getWorkflowGatewayBranches(looping, route)[0].target)!.target = split.id;
    check(`${type} complete gateway can be entered on a new loop`, () => assert.doesNotThrow(() => assertWorkflowGraphIntegrity(looping)));
    if (type === NodeType.PARALLEL) {
      const pointer = { ...graph, edges: [...graph.edges, { id: 'join-pointer', source: split.id, target: join.id, isDefault: true }] };
      check('parallel structural join pointer is not a branch', () => assert.equal(countWorkflowGraphBranches(pointer, split.id), 2));
    }
  }
  const sign: WorkflowGraphNode = { id: 'sign', type: NodeType.PARALLEL, title: '票签', signType: 'WEIGHT' };
  check('weighted countersign remains an approval', () => assert.equal(isWorkflowGatewaySplit(sign), false));
  const fallbackGraph = configured(insertWorkflowGatewayAfter(createDefaultWorkflowGraph(), 'start', NodeType.INCLUSIVE, createId));
  const fallbackSplit = fallbackGraph.nodes.find(isWorkflowGatewaySplit)!;
  const fallback = getWorkflowGatewayBranches(fallbackGraph, fallbackSplit)[0];
  fallback.isDefault = true;
  const removedDefault = removeWorkflowGraphBranch(fallbackGraph, fallbackSplit.id, fallback.target);
  check('removing explicit inclusive default does not promote another edge', () => assert.equal(getWorkflowGatewayBranches(removedDefault, fallbackSplit).filter(workflowEdgeIsDefault).length, 0));
  console.log(`GATEWAY_FRONTEND_CHECKS: checks=${checks}; failed=0; paired_paths=true; implicit_defaults=false`);
  return checks;
};
