import type React from "react";
import {
  NodeType,
  WorkflowDefinition,
  FormDefinition,
  User,
  WorkflowGraphNode,
} from "../../types";

export type EditableWorkflowNode = WorkflowGraphNode & {
  title: string;
  branchStrategy?: "PARALLEL" | "RACE" | "EXCLUSIVE";
  condition?: string;
  inputs?: Record<string, string>;
  outputs?: Record<string, string>;
  slaHours?: number;
  slaAction?: "AUTO_PASS" | "AUTO_REJECT";
  retry?: {
    maxRetries: number;
    delayMs: number;
  };
  props?: Record<string, any>;
  signType?: "ALL" | "ANY" | "PERCENT" | "SEQUENTIAL";
  passPercent?: number;
  description?: string;
  icon?: string;
  approverType?:
    | "ROLE"
    | "USER"
    | "USERS"
    | "INITIATOR"
    | "DEPT_MANAGER"
    | "DIRECT_LEADER"
    | "DEPT";
  approverValue?: string;
  allowEdit?: boolean;
};

export interface QuickAddOption {
  type: NodeType;
  icon: React.FC<{ size?: number; className?: string }>;
  label: string;
  isBranch?: boolean;
}

export type ApproverCacheType = "ROLE" | "USER" | "DEPT";

export interface ApproverCacheEntry {
  data: any[];
  expiresAt: number;
}

export interface WorkflowBuilderProps {
  workflow?: WorkflowDefinition;
  onChange?: (wf: WorkflowDefinition) => void;
  onSave?: (
    wf: WorkflowDefinition,
  ) => Promise<{ id?: string } | void> | { id?: string } | void;
  availableForms?: FormDefinition[];
  availableRoles?: any[];
  availableUsers?: User[];
}
