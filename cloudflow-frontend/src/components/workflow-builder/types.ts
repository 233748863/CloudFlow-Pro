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
  branchStrategy?: WorkflowGraphNode["branchStrategy"];
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
  signType?: "ALL" | "ANY" | "PERCENT" | "SEQUENTIAL" | "WEIGHT";
  passPercent?: number;
  description?: string;
  icon?: string;
  approverType?:
    | "ROLE"
    | "USER"
    | "USERS"
    | "USER_LIST"
    | "INITIATOR_SELECTED"
    | "MULTI_LEVEL_MANAGER"
    | "INITIATOR"
    | "DEPT_MANAGER"
    | "DIRECT_LEADER"
    | "VARIABLE_USER"
    | "DEPT";
  approverValue?: string;
  allowEdit?: boolean;
};

export interface QuickAddOption {
  type: NodeType;
  icon: React.FC<{ size?: number; className?: string }>;
  label: string;
  isBranch?: boolean;
  isGateway?: boolean;
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
