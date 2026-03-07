import type { NodeType } from '../types';

export interface RetryConfig {
  maxRetries: number;
  delayMs: number;
}

/**
 * 编辑器内部树结构节点（仅用于前端编辑态，不作为持久化主模型）。
 */
export interface WorkflowTreeNode {
  id: string;
  type: NodeType | string;
  title: string;
  next?: WorkflowTreeNode;
  branches?: WorkflowTreeNode[];
  branchStrategy?: 'PARALLEL' | 'RACE' | 'EXCLUSIVE';
  condition?: string;
  inputs?: Record<string, string>;
  outputs?: Record<string, string>;
  slaHours?: number;
  slaAction?: 'AUTO_PASS' | 'AUTO_REJECT';
  retry?: RetryConfig;
  props?: Record<string, any>;
  signType?: 'ALL' | 'ANY' | 'PERCENT' | 'SEQUENTIAL';
  passPercent?: number;
  description?: string;
  icon?: string;
  approverType?: 'ROLE' | 'USER' | 'USERS' | 'DEPT_MANAGER' | 'DIRECT_LEADER' | 'DEPT';
  approverValue?: string;
  allowEdit?: boolean;
}
