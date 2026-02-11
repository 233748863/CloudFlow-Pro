// Panel types for AI Flow

import { Node, Connection, ParamItem } from './node';

// Panel component interface
export interface PanelComponent {
  parent: {
    nodes: Node[];
    connections: Connection[];
    env?: Array<{ name: string; value: any }>;
  };
  node: Node;
  $emit: (event: string, ...args: any[]) => void;
}

// Node with params
export interface NodeWithParams extends Node {
  inputParams: ParamItem[];
  outputParams: ParamItem[];
}

// Previous node output structure
export interface PreviousNodeOutput {
  id: string;
  name: string;
  list: ParamItem[];
} 