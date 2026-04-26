import { parseWorkflowGraphDefinition } from "@/utils/workflowGraph";
import { NODE_TYPE_LABELS } from "./config";
import type {
  CategoryNode,
  ParsedTemplateGraph,
  PreviewEdge,
  PreviewNode,
  TemplateItem,
} from "./types";

export const EMPTY_GRAPH: ParsedTemplateGraph = {
  nodes: [],
  edges: [],
};

export const normalizeTags = (rawTags: unknown): string[] => {
  if (Array.isArray(rawTags)) {
    return rawTags.filter((item): item is string => typeof item === "string");
  }

  if (typeof rawTags !== "string" || !rawTags.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawTags);
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === "string");
    }
  } catch {
    return rawTags
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
};

export const parseTemplateDefinition = (definition: unknown): ParsedTemplateGraph => {
  const graph = parseWorkflowGraphDefinition(definition);
  if (!graph) {
    return EMPTY_GRAPH;
  }

  const nodes: PreviewNode[] = graph.nodes.map((item, index) => {
    const source = (item || {}) as Record<string, unknown>;
    return {
      id: String(source.id ?? `node-${index + 1}`),
      name: String(source.title ?? `节点 ${index + 1}`),
      type: String(source.type ?? "TASK"),
    };
  });

  const edges: PreviewEdge[] = graph.edges
    .map((item) => {
      if (!item?.source || !item?.target) {
        return null;
      }

      return {
        source: String(item.source),
        target: String(item.target),
        condition:
          typeof item.condition === "string" && item.condition.trim()
            ? item.condition.trim()
            : undefined,
      } satisfies PreviewEdge;
    })
    .filter((item): item is PreviewEdge => Boolean(item));

  return { nodes, edges };
};

export const countCategories = (nodes: CategoryNode[]): number =>
  nodes.reduce(
    (total, node) => total + 1 + countCategories(node.children || []),
    0,
  );

export const findCategoryName = (
  nodes: CategoryNode[],
  categoryId: string,
): string | undefined => {
  for (const node of nodes) {
    if (node.id === categoryId) {
      return node.name;
    }

    if (node.children?.length) {
      const childName = findCategoryName(node.children, categoryId);
      if (childName) {
        return childName;
      }
    }
  }

  return undefined;
};

export const formatNodeType = (type: string): string => {
  const key = String(type || "").toUpperCase();
  return NODE_TYPE_LABELS[key] || type;
};

export const getTemplateMetrics = (
  template: TemplateItem,
  graph: ParsedTemplateGraph,
  uncategorizedLabel: string,
  tagsLabel: string,
  categoryLabel: string,
  nodeCountLabel: string,
  edgeCountLabel: string,
) => [
  { label: categoryLabel, value: template.categoryName || uncategorizedLabel },
  {
    label: tagsLabel,
    value: normalizeTags(template.tags).slice(0, 2).join(" / ") || "-",
  },
  { label: nodeCountLabel, value: String(graph.nodes.length) },
  { label: edgeCountLabel, value: String(graph.edges.length) },
];
