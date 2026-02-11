/**
 * 工具类型定义
 */

// flow.ts 类型定义
export interface FlowClass {
	runUrl(type: string, id: string): string;
	getIcon(icon?: string): string;
}

// formatter.ts 类型定义
export interface FormatterClass {
	prettyCode(str: string): string;
}

// utils.ts 类型定义
export interface ProcessInputParamsNode {
	id: string;
	inputParams?: Array<{
		name: string;
		type: string;
	}>;
	outputParams?: Array<{
		name: string;
		type: string;
	}>;
}

export interface InputParams {
	[key: string]: any;
}

export interface Params {
	[key: string]: any;
}

// validate.ts 类型定义
export interface ValidationResult {
	valid: boolean;
	message: string;
}
