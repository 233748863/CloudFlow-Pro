export interface TemplateItem {
  id: string;
  name: string;
  description?: string;
  categoryId?: string;
  categoryName?: string;
  tags?: string[] | string;
  definition?: unknown;
  previewImage?: string;
  usageCount?: number;
  isSystem?: boolean;
  status?: string;
}

export interface CategoryNode {
  id: string;
  name: string;
  templateCount?: number;
  children?: CategoryNode[];
}

export interface TemplateListResult {
  records: TemplateItem[];
  total: number;
}

export interface CreateWorkflowResponse {
  definitionId?: string;
}

export interface PreviewNode {
  id: string;
  name: string;
  type: string;
}

export interface PreviewEdge {
  source: string;
  target: string;
  condition?: string;
}

export interface ParsedTemplateGraph {
  nodes: PreviewNode[];
  edges: PreviewEdge[];
}
