/**
 * 节点执行器类型定义
 */

import { Node } from './node';
import { InputParams } from './utils';
import { NodeExecutionResponse } from './executor';

/**
 * Debug函数类型定义
 */
export type DebugFunction = (
	templateCode: string,
	params: string
) => Promise<{
	data: {
		success: boolean;
		message: string;
		params: any;
		[key: string]: any;
	};
}>;

/**
 * Mock问题处理函数类型定义
 */
export type MockQuestionProcessingFunction = (input: string) => {
	data: {
		success: boolean;
		message: string;
		result: {
			answer: string;
			[key: string]: any;
		};
		[key: string]: any;
	};
};
