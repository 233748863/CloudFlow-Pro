// Node types for AI Flow

// Basic node interface
export interface Node {
	id: string;
	type: string;
	name?: string;
	inputParams?: ParamItem[];
	outputParams?: ParamItem[];
	bodyParams?: ParamItem[];
	headerParams?: ParamItem[];
	_branchIndex?: number;
	[key: string]: any;
}

// Parameter item interface
export interface ParamItem {
	name?: string;
	type?: string;
	value?: any;
	key?: string;
	[key: string]: any;
}

// Connection between nodes
export interface Connection {
	id?: string;
	sourceId: string;
	targetId: string;
	portIndex?: number;
	[key: string]: any;
}

// Execution node with status
export interface ExecutionNode extends Node {
	status: 'pending' | 'running' | 'success' | 'error' | 'skipped';
	startTime?: number;
	duration?: number;
	tokens?: number;
	input?: any;
	output?: any;
	error?: string;
}

// Context for node execution
export interface ExecutionContext {
	variables: Record<string, any>;
	params: Record<string, any>;
	envs: Record<string, any>;
}

// Result of node execution
export interface NodeExecutionResult {
	result: Record<string, any>;
	tokens?: number;
}

// Options for node execution
export interface ExecutionOptions {
	appId?: string;
	conversationId?: string;
	[key: string]: any;
}

// Node mixin data interface
export interface NodeData {
	conversationId: string;
	isRunning: boolean;
	id: string | null;
	form: Record<string, any>;
	env: Array<{ name: string; value: any }>;
	nodes: Node[];
	connections: Connection[];
	executionNodes?: ExecutionNode[];
	executionResult?: any;
	executionTime?: string;
	totalTokens?: number;
	startNodeParams?: ParamItem[];
	showExecutionPanel?: boolean;
}
