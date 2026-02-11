import { Node } from '../types/node';

interface NodeType extends Partial<Node> {
	type: string;
	name: string;
	canBeSource: boolean;
	canBeTarget: boolean;
	panel?: string;
	switchParams?: {
		code: string;
		cases: Array<{
			name: string;
			value: number;
		}>;
	};
	questionParams?: {
		modelConfig: {
			model: string;
			max_tokens: number;
			temperature: number;
			top_p: number;
			frequency_penalty: number;
			presence_penalty: number;
			stream: boolean;
		};
		categories: Array<{
			name: string;
			value: string;
		}>;
	};
	codeParams?: {
		code: string;
	};
	noticeParams?: {
		message: string;
	};
	httpParams?: {
		url: string;
		method: string;
		contentType: string;
		bodyParams: any[];
		paramsParams: any[];
		headerParams: any[];
	};
	dbParams?: {
		sql: string;
		dbId: string;
		dbName: string;
	};
	llmParams?: {
		messages: Array<{
			role: string;
			content: string;
		}>;
		modelConfig: {
			model: string;
			max_tokens: number;
			temperature: number;
			top_p: number;
			frequency_penalty: number;
			presence_penalty: number;
			stream: boolean;
		};
	};
}

export const nodeTypes: NodeType[] = [
	{
		type: 'start',
		name: '开始',
		canBeSource: true,
		canBeTarget: false,
		panel: 'StartPanel',
	},
	{
		type: 'switch',
		name: '分支节点',
		canBeSource: true,
		canBeTarget: true,
		switchParams: {
			code: 'function main(args){\n  // 返回事件值\n  return 0\n}',
			cases: [
				{
					name: '分支1',
					value: 0,
				},
				{
					name: '分支2',
					value: 1,
				},
				{
					name: '分支3',
					value: 2,
				},
			],
		},
		outputParams: [
			{
				name: 'index',
				type: 'String',
			},
		],
	},
	{
		type: 'question',
		name: '问题分类',
		canBeSource: true,
		canBeTarget: true,
		questionParams: {
			modelConfig: {
				model: '',
				max_tokens: 4096,
				temperature: 0.7,
				top_p: 1,
				frequency_penalty: 0,
				presence_penalty: 0,
				stream: true,
			},
			categories: [
				{
					name: '分类1',
					value: '',
				},
				{
					name: '分类2',
					value: '',
				},
			],
		},
		outputParams: [
			{
				name: 'index',
				type: 'String',
			},
		],
	},
	{
		type: 'code',
		name: '执行代码',
		canBeSource: true,
		canBeTarget: true,
		codeParams: {
			code: 'function main(args){\n  return {\n    arg1:args.arg1,\n    arg2:args.arg2\n   }\n}',
		},
	},
	{
		type: 'notice',
		name: '消息通知',
		canBeSource: true,
		canBeTarget: true,
		noticeParams: {
			message: '',
		},
		outputParams: [
			{
				name: 'result',
				type: 'Boolean',
			},
		],
	},
	{
		type: 'http',
		name: 'HTTP请求',
		canBeSource: true,
		canBeTarget: true,
		httpParams: {
			url: '',
			method: '',
			contentType: 'form-data',
			bodyParams: [],
			paramsParams: [],
			headerParams: [],
		},
		outputParams: [
			{
				name: 'body',
				type: 'Object',
			},
			{
				name: 'status_code',
				type: 'Number',
			},
			{
				name: 'headers',
				type: 'Object',
			},
		],
	},
	{
		type: 'rag',
		name: 'RAG知识库',
		canBeSource: true,
		canBeTarget: true,
		ragParams: {
			datasetId: 0,
			datasetName: '',
			prompt: '',
		},
		outputParams: [
			{
				name: 'result',
				type: 'String',
			},
		],
	},
	{
		type: 'db',
		name: 'DB数据库',
		canBeSource: true,
		canBeTarget: true,
		dbParams: {
			sql: '',
			dbId: '',
			dbName: '',
		},
		outputParams: [
			{
				name: 'result',
				type: 'String',
			},
		],
	},
	{
		type: 'llm',
		name: 'LLM大模型',
		canBeSource: true,
		canBeTarget: true,
		llmParams: {
			messages: [
				{
					role: 'system',
					content: '',
				},
			],
			modelConfig: {
				model: '',
				max_tokens: 4096,
				temperature: 0.7,
				top_p: 1,
				frequency_penalty: 0,
				presence_penalty: 0,
				stream: true,
			},
		},
		outputParams: [
			{
				name: 'content',
				type: 'String',
			},
		],
	},
	{
		type: 'end',
		name: '结束',
		canBeSource: false,
		canBeTarget: true,
	},
];

export const getNodeConfig = (type: string): NodeType => {
	return nodeTypes.find((node) => node.type === type) || nodeTypes[0];
};
