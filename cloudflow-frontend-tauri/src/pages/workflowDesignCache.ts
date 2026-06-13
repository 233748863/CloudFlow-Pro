import type { FormDefinition, User } from '../types';

export type WorkflowDesignContextPayload = {
  forms: FormDefinition[];
  roles: any[];
  users: User[];
};

export const workflowDesignCache: {
  context: WorkflowDesignContextPayload | null;
  contextPromise: Promise<WorkflowDesignContextPayload> | null;
  processDefinitionPromises: Map<string, Promise<any | null>>;
  processDefinitionsListPromise: Promise<any[]> | null;
} = {
  context: null,
  contextPromise: null,
  processDefinitionPromises: new Map(),
  processDefinitionsListPromise: null,
};

export const resetWorkflowDesignCaches = () => {
  workflowDesignCache.context = null;
  workflowDesignCache.contextPromise = null;
  workflowDesignCache.processDefinitionPromises.clear();
  workflowDesignCache.processDefinitionsListPromise = null;
};
