/**
 * 执行器类型定义
 */
import { Node, ExecutionOptions } from './node';
import { InputParams, Params } from './utils';

/**
 * 节点执行结果接口
 */
export interface NodeExecutionResponse {
  nodeId: string;
  type: string;
  result: any;
  timestamp: number;
  tokens?: number;
}

/**
 * 代码节点参数接口
 */
export interface CodeNodeParams {
  code: string;
}

/**
 * 数据库节点参数接口
 */
export interface DbNodeParams {
  dbId: string | number;
  sql: string;
}

/**
 * HTTP节点参数接口
 */
export interface HttpNodeParams {
  url: string;
  method: string;
  contentType: string;
  jsonBody?: string;
  headerParams?: Array<{
    name: string;
    type: string;
  }>;
  bodyParams?: Array<{
    name: string;
    type: string;
  }>;
  paramsParams?: Array<{
    name: string;
    type: string;
  }>;
}

/**
 * LLM节点参数接口
 */
export interface LLMNodeParams {
  modelConfig: Record<string, any>;
  messages: Array<{
    role: string;
    content: string;
  }>;
}

/**
 * 通知节点参数接口
 */
export interface NoticeNodeParams {
  templateCode: string;
}

/**
 * 问题节点参数接口
 */
export interface QuestionNodeParams {
  question: string;
}

/**
 * Switch节点参数接口
 */
export interface SwitchNodeParams {
  cases: Array<{
    value: any;
  }>;
}

/**
 * 代码节点接口
 */
export interface CodeNode extends Node {
  codeParams: CodeNodeParams;
}

/**
 * 数据库节点接口
 */
export interface DbNode extends Node {
  dbParams: DbNodeParams;
}

/**
 * HTTP节点接口
 */
export interface HttpNode extends Node {
  httpParams: HttpNodeParams;
}

/**
 * LLM节点接口
 */
export interface LLMNode extends Node {
  llmParams: LLMNodeParams;
}

/**
 * 通知节点接口
 */
export interface NoticeNode extends Node {
  noticeParams: NoticeNodeParams;
}

/**
 * 问题节点接口
 */
export interface QuestionNode extends Node {
  questionParams: QuestionNodeParams;
}

/**
 * Switch节点接口
 */
export interface SwitchNode extends Node {
  switchParams: SwitchNodeParams;
  code?: string;
}

/**
 * 执行器函数类型
 */
export type ExecutorFunction<T extends Node> = (
  node: T,
  inputParams: InputParams,
  nodes: Node[],
  options?: ExecutionOptions
) => Promise<NodeExecutionResponse>; 