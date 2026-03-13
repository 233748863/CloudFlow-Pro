import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Eye,
  FolderOpen,
  Grid,
  Layers3,
  List,
  Plus,
  Search,
  Sparkles,
  Workflow,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  Button,
  Card,
  CardContent,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Input,
  Label,
  SkeletonCard,
  Textarea,
} from "@/components/ui";
import { cn } from "@/utils/cn";
import { useAuth } from "../context/AuthContext";
import request from "../services/api/request";
import { parseWorkflowGraphDefinition } from "../utils/workflowGraph";

interface TemplateItem {
  id: string;
  name: string;
  description?: string;
  categoryId?: string;
  categoryName?: string;
  tags?: string[];
  definition?: unknown;
  previewImage?: string;
  usageCount?: number;
  isSystem?: boolean;
  status?: string;
}

interface CategoryNode {
  id: string;
  name: string;
  templateCount?: number;
  children?: CategoryNode[];
}

interface TemplateListResult {
  records: TemplateItem[];
  total: number;
}

interface CreateWorkflowResponse {
  definitionId?: string;
}

interface PreviewNode {
  id: string;
  name: string;
  type: string;
}

interface PreviewEdge {
  source: string;
  target: string;
  condition?: string;
}

const TEXT = {
  pageTitle: "\u6a21\u677f\u5e93",
  pageDescription: "\u4ece\u7cfb\u7edf\u6a21\u677f\u5feb\u901f\u521b\u5efa\u6d41\u7a0b\uff0c\u8ba9\u6d41\u7a0b\u8bbe\u8ba1\u4e0e\u53d1\u5e03\u4f53\u9a8c\u4fdd\u6301\u5728\u540c\u4e00\u5957 UI \u8bed\u8a00\u4e0b\u3002",
  allTemplates: "\u5168\u90e8\u6a21\u677f",
  categoryNavigation: "\u5206\u7c7b\u5bfc\u822a",
  categoryNavigationDesc: "\u6309\u4e1a\u52a1\u57df\u7f29\u5c0f\u6a21\u677f\u8303\u56f4\uff0c\u8ba9\u6d41\u7a0b\u8bbe\u8ba1\u5165\u53e3\u66f4\u96c6\u4e2d\u3002",
  commonTags: "\u5e38\u7528\u6807\u7b7e",
  commonTagsDesc: "\u76f4\u63a5\u70b9\u9009\u5e38\u89c1\u4e1a\u52a1\u6807\u7b7e\uff0c\u5feb\u901f\u7b5b\u9009\u5f53\u524d\u6a21\u677f\u3002",
  searchPlaceholder: "\u641c\u7d22\u6a21\u677f\u540d\u79f0\u3001\u63cf\u8ff0\u6216\u5206\u7c7b...",
  clearFilters: "\u6e05\u7a7a\u7b5b\u9009",
  gridView: "\u5361\u7247\u89c6\u56fe",
  listView: "\u5217\u8868\u89c6\u56fe",
  currentResults: "\u5f53\u524d\u7ed3\u679c",
  categoryCount: "\u5206\u7c7b\u6570",
  activeFilters: "\u5df2\u751f\u6548\u7b5b\u9009",
  currentView: "\u5f53\u524d\u89c6\u56fe",
  filterSummary: "\u7b5b\u9009\u6458\u8981",
  noDescription: "\u6682\u65e0\u63cf\u8ff0",
  systemTemplate: "\u7cfb\u7edf",
  preview: "\u9884\u89c8",
  useTemplate: "\u4f7f\u7528\u6a21\u677f",
  templateUsage: "\u6b21\u4f7f\u7528",
  nodeCount: "\u8282\u70b9\u6570",
  edgeCount: "\u8fde\u7ebf\u6570",
  category: "\u5206\u7c7b",
  tags: "\u6807\u7b7e",
  uncategorized: "\u672a\u5206\u7c7b",
  loadTemplatesFailed: "\u52a0\u8f7d\u6a21\u677f\u5217\u8868\u5931\u8d25",
  loadCategoriesFailed: "\u52a0\u8f7d\u6a21\u677f\u5206\u7c7b\u5931\u8d25",
  emptyTitle: "\u6682\u65e0\u5339\u914d\u6a21\u677f",
  emptyDescription: "\u53ef\u4ee5\u5c1d\u8bd5\u6e05\u9664\u7b5b\u9009\u6761\u4ef6\uff0c\u6216\u5207\u6362\u5230\u5176\u4ed6\u5206\u7c7b\u67e5\u627e\u6d41\u7a0b\u6a21\u677f\u3002",
  retry: "\u91cd\u8bd5",
  previousPage: "\u4e0a\u4e00\u9875",
  nextPage: "\u4e0b\u4e00\u9875",
  pageLabel: "\u7b2c",
  pageSuffix: "\u9875",
  previewTitleSuffix: "\u6a21\u677f\u9884\u89c8",
  previewOverview: "\u6a21\u677f\u6982\u89c8",
  previewStructure: "\u6d41\u7a0b\u7ed3\u6784\u9884\u89c8",
  previewStructureDesc: "\u5c06\u6d41\u7a0b\u8282\u70b9\u4e0e\u51fa\u8fb9\u7ed3\u6784\u76f4\u63a5\u5c55\u793a\u7ed9\u8bbe\u8ba1\u4eba\u3002",
  templateInfo: "\u6a21\u677f\u4fe1\u606f",
  nodeTypes: "\u8282\u70b9\u7c7b\u578b",
  nodeList: "\u8282\u70b9\u6e05\u5355",
  edgeList: "\u8fde\u7ebf\u6e05\u5355",
  edgeNotFound: "\u672a\u89e3\u6790\u5230\u8fde\u7ebf\u4fe1\u606f",
  invalidDefinition: "\u672a\u89e3\u6790\u5230\u6d41\u7a0b\u5b9a\u4e49\u8282\u70b9\uff0c\u8bf7\u68c0\u67e5\u6a21\u677f definition \u5b57\u6bb5\u662f\u5426\u4e3a\u6807\u51c6 JSON \u7ed3\u6784\u3002",
  close: "\u5173\u95ed",
  createWorkflowFromTemplate: "\u4ece\u6a21\u677f\u521b\u5efa\u6d41\u7a0b",
  createWorkflowDesc: "\u4f7f\u7528\u5f53\u524d\u6a21\u677f\u521b\u5efa\u65b0\u6d41\u7a0b\uff0c\u7cfb\u7edf\u4f1a\u81ea\u52a8\u5e26\u5165\u5df2\u9009\u6a21\u677f\u7684 nodes + edges \u5b9a\u4e49\u3002",
  workflowName: "\u6d41\u7a0b\u540d\u79f0",
  workflowNameRequired: "\u8bf7\u8f93\u5165\u6d41\u7a0b\u540d\u79f0",
  workflowNamePlaceholder: "\u8bf7\u8f93\u5165\u6d41\u7a0b\u540d\u79f0",
  workflowDescriptionLabel: "\u6d41\u7a0b\u63cf\u8ff0",
  workflowDescriptionPlaceholder: "\u8bf7\u8f93\u5165\u6d41\u7a0b\u63cf\u8ff0\uff08\u53ef\u9009\uff09",
  cancel: "\u53d6\u6d88",
  create: "\u521b\u5efa",
  createSuccess: "\u6d41\u7a0b\u521b\u5efa\u6210\u529f",
  createFailed: "\u4ece\u6a21\u677f\u521b\u5efa\u6d41\u7a0b\u5931\u8d25",
  loginRequired: "\u8bf7\u5148\u767b\u5f55\u540e\u518d\u4f7f\u7528\u6a21\u677f\u521b\u5efa\u6d41\u7a0b",
  useTemplateTitle: "\u4f7f\u7528\u6a21\u677f\u521b\u5efa\u6d41\u7a0b",
  noCategory: "\u6682\u65e0\u5206\u7c7b",
  noCategoryDesc: "\u7cfb\u7edf\u8fd8\u6ca1\u6709\u914d\u7f6e\u6a21\u677f\u5206\u7c7b\uff0c\u4ecd\u53ef\u4ee5\u901a\u8fc7\u5173\u952e\u8bcd\u548c\u6807\u7b7e\u67e5\u627e\u6a21\u677f\u3002",
};

const COMMON_TAGS = [
  "\u5ba1\u6279",
  "\u8bf7\u5047",
  "\u62a5\u9500",
  "\u91c7\u8d2d",
  "\u5408\u540c",
  "\u8d22\u52a1",
  "\u4eba\u4e8b",
];

const EMPTY_GRAPH = { nodes: [], edges: [] } as { nodes: PreviewNode[]; edges: PreviewEdge[] };

const FILTER_CHIP_CLASS_NAME =
  "inline-flex items-center rounded-full bg-white px-3 py-1 text-sm text-slate-700 ring-1 ring-slate-200 transition-colors hover:bg-pink-50 hover:text-pink-700 hover:ring-pink-200 shadow-sm";

const PANEL_STAT_LABEL_CLASS_NAME =
  "text-xs font-bold uppercase tracking-[0.14em] text-slate-400";

const PREVIEW_META_LABEL_CLASS_NAME =
  "text-[10px] font-bold uppercase tracking-wider text-slate-400";

const PREVIEW_SECTION_HEADER_CLASS_NAME =
  "border-b border-slate-100 px-5 py-3 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500";

const PREVIEW_SCROLL_AREA_CLASS_NAME =
  "max-h-40 overflow-y-auto p-2 space-y-1.5 scrollbar-thin scrollbar-thumb-slate-200";

const NODE_TYPE_LABELS: Record<string, string> = {
  START: "\u5f00\u59cb",
  APPROVAL: "\u5ba1\u6279",
  END: "\u7ed3\u675f",
  CC: "\u6284\u9001",
  CONDITION: "\u6761\u4ef6",
  PARALLEL: "\u5e76\u884c",
  TIMER: "\u5b9a\u65f6",
  SUB_PROCESS: "\u5b50\u6d41\u7a0b",
};

const normalizeTags = (rawTags: unknown): string[] => {
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
    return rawTags.split(",").map((item) => item.trim()).filter(Boolean);
  }
  return [];
};

const parseTemplateDefinition = (definition: unknown): { nodes: PreviewNode[]; edges: PreviewEdge[] } => {
  const graph = parseWorkflowGraphDefinition(definition);
  if (!graph) {
    return EMPTY_GRAPH;
  }

  const nodes = graph.nodes.map((item, index) => {
    const source = (item || {}) as Record<string, unknown>;
    const id = String(source.id ?? `node-${index + 1}`);
    const name = String(source.title ?? (`\u8282\u70b9 ${index + 1}`));
    const type = String(source.type ?? "TASK");
    return { id, name, type };
  });

  const edges = graph.edges.map((item) => {
    const source = item?.source;
    const target = item?.target;
    if (!source || !target) {
      return null;
    }
    const condition =
      typeof item.condition === "string" && item.condition.trim().length > 0
        ? item.condition.trim()
        : undefined;
    return { source: String(source), target: String(target), condition } as PreviewEdge;
  }).filter((item): item is PreviewEdge => Boolean(item));

  return { nodes, edges };
};

const countCategories = (nodes: CategoryNode[]): number => {
  return nodes.reduce((total, node) => total + 1 + countCategories(node.children || []), 0);
};

const findCategoryName = (nodes: CategoryNode[], categoryId: string): string | undefined => {
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

const formatNodeType = (type: string): string => {
  const key = String(type || "").toUpperCase();
  return NODE_TYPE_LABELS[key] || type;
};

const getTemplateMetrics = (template: TemplateItem, graph: { nodes: PreviewNode[]; edges: PreviewEdge[] }) => {
  return [
    { label: TEXT.category, value: template.categoryName || TEXT.uncategorized },
    { label: TEXT.tags, value: normalizeTags(template.tags).slice(0, 2).join(" / ") || "-" },
    { label: TEXT.nodeCount, value: String(graph.nodes.length) },
    { label: TEXT.edgeCount, value: String(graph.edges.length) },
  ];
};

export const TemplateLibrary: React.FC = () => {
  const { user } = useAuth();

  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [categories, setCategories] = useState<CategoryNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 12;
  const [total, setTotal] = useState(0);

  const [showPreview, setShowPreview] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<TemplateItem | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createTemplateId, setCreateTemplateId] = useState("");
  const [workflowName, setWorkflowName] = useState("");
  const [workflowDescription, setWorkflowDescription] = useState("");

  const previewGraph = useMemo(() => {
    if (!previewTemplate) {
      return EMPTY_GRAPH;
    }
    return parseTemplateDefinition(previewTemplate.definition);
  }, [previewTemplate]);

  const previewTags = useMemo(() => normalizeTags(previewTemplate?.tags), [previewTemplate]);

  const previewOverviewStats = useMemo(
    () => [
      { label: TEXT.nodeCount, value: String(previewGraph.nodes.length) },
      { label: TEXT.edgeCount, value: String(previewGraph.edges.length) },
      { label: TEXT.category, value: previewTemplate?.categoryName || TEXT.uncategorized },
      { label: TEXT.templateUsage, value: String(previewTemplate?.usageCount || 0) },
    ],
    [previewGraph, previewTemplate]
  );

  const previewNodeTypes = useMemo(
    () => Array.from(new Set(previewGraph.nodes.map((node) => formatNodeType(node.type)))).slice(0, 8),
    [previewGraph]
  );

  // \u7edf\u4e00\u7f13\u5b58\u5f53\u524d\u9875\u6a21\u677f\u7684\u56fe\u7ed3\u6784\uff0c\u907f\u514d\u5217\u8868\u6e32\u67d3\u65f6\u91cd\u590d\u89e3\u6790 JSON \u5b9a\u4e49\u3002
  const templateInsights = useMemo(() => {
    return new Map(templates.map((template) => [template.id, parseTemplateDefinition(template.definition)]));
  }, [templates]);

  const categoryCount = useMemo(() => countCategories(categories), [categories]);
  const selectedCategoryName = useMemo(() => {
    if (!selectedCategory) {
      return TEXT.allTemplates;
    }
    return findCategoryName(categories, selectedCategory) || TEXT.allTemplates;
  }, [categories, selectedCategory]);
  const hasActiveFilters = Boolean(searchTerm.trim()) || Boolean(selectedCategory) || selectedTags.length > 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const loadCategories = useCallback(async () => {
    try {
      const data = await request.get<CategoryNode[]>("/workflow/templates/categories");
      setCategories(data || []);
    } catch (error) {
      console.error(TEXT.loadCategoriesFailed, error);
      toast.error(TEXT.loadCategoriesFailed);
    }
  }, []);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const params: Record<string, string | number> = { pageNum: currentPage, pageSize };
      if (selectedCategory) {
        params.categoryId = selectedCategory;
      }
      if (selectedTags.length > 0) {
        params.tags = selectedTags.join(",");
      }
      if (searchTerm.trim()) {
        params.keyword = searchTerm.trim();
      }

      const data = await request.get<TemplateListResult>("/workflow/templates", { params });
      setTemplates(data?.records || []);
      setTotal(data?.total || 0);
    } catch (error) {
      console.error(TEXT.loadTemplatesFailed, error);
      setLoadError(TEXT.loadTemplatesFailed);
      toast.error(TEXT.loadTemplatesFailed);
    } finally {
      setLoading(false);
    }
  }, [currentPage, pageSize, searchTerm, selectedCategory, selectedTags]);

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) => (prev.includes(tag) ? prev.filter((item) => item !== tag) : [...prev, tag]));
    setCurrentPage(1);
  };

  const clearFilters = () => {
    setSearchTerm("");
    setSelectedCategory("");
    setSelectedTags([]);
    setCurrentPage(1);
  };

  const handlePreview = (template: TemplateItem) => {
    setPreviewTemplate(template);
    setShowPreview(true);
  };

  const handlePreviewOpenChange = (open: boolean) => {
    setShowPreview(open);
    if (!open) {
      setPreviewTemplate(null);
    }
  };

  const handleCreateFromTemplate = (templateId: string) => {
    if (!user) {
      toast.error(TEXT.loginRequired);
      return;
    }
    setCreateTemplateId(templateId);
    setWorkflowName("");
    setWorkflowDescription("");
    setShowCreateModal(true);
  };

  const handleCreateModalOpenChange = (open: boolean) => {
    setShowCreateModal(open);
    if (!open) {
      setCreateTemplateId("");
      setWorkflowName("");
      setWorkflowDescription("");
    }
  };

  const submitCreateWorkflow = async () => {
    const trimmedName = workflowName.trim();
    if (!trimmedName) {
      toast.error(TEXT.workflowNameRequired);
      return;
    }

    try {
      const data = await request.post<CreateWorkflowResponse>(
        `/workflow/templates/${createTemplateId}/create-workflow`,
        {
          workflowName: trimmedName,
          description: workflowDescription.trim(),
        }
      );
      toast.success(TEXT.createSuccess);
      handleCreateModalOpenChange(false);

      const definitionId = data?.definitionId;
      if (definitionId) {
        window.location.assign(`/workflow/design?id=${definitionId}`);
      } else {
        window.location.assign("/workflow/design");
      }
    } catch (error) {
      console.error(TEXT.createFailed, error);
      toast.error(TEXT.createFailed);
    }
  };
  const renderCategoryTree = (nodes: CategoryNode[], level = 0): React.ReactNode => {
    return nodes.map((node) => {
      const active = selectedCategory === node.id;
      return (
        <div key={node.id} className="space-y-1">
          <Button
            type="button"
            variant={active ? "secondary" : "ghost"}
            onClick={() => {
              setSelectedCategory(node.id);
              setCurrentPage(1);
            }}
            className={cn(
              "w-full justify-start text-left font-medium text-sm h-9",
              active ? "bg-pink-50 text-pink-600 hover:bg-pink-100" : "text-slate-600 hover:bg-slate-100"
            )}
            style={{ paddingLeft: `${level * 16 + 12}px` }}
          >
            <FolderOpen className="mr-2 h-4 w-4 shrink-0 text-slate-400" />
            <span className="flex-1 truncate">{node.name}</span>
            {Number(node.templateCount || 0) > 0 && (
              <span className="ml-2 bg-slate-100 px-1.5 py-0.5 rounded text-[10px] text-slate-500">
                {node.templateCount}
              </span>
            )}
          </Button>
          {Array.isArray(node.children) && node.children.length > 0
            ? renderCategoryTree(node.children, level + 1)
            : null}
        </div>
      );
    });
  };

  const renderTemplateCard = (template: TemplateItem) => {
    const graph = templateInsights.get(template.id) || EMPTY_GRAPH;
    const metrics = getTemplateMetrics(template, graph);
    const tags = normalizeTags(template.tags);

    return (
      <div
        key={template.id}
        className="group bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden hover:shadow-md transition-all flex flex-col"
      >
        <div className="p-5 flex-1">
          <div className="flex items-start justify-between gap-4 mb-3">
            <div className="inline-flex items-center text-xs font-medium text-slate-500 bg-slate-50 px-2 py-1 rounded">
              <Layers3 className="mr-1.5 h-3.5 w-3.5 text-slate-400" />
              {template.categoryName || TEXT.uncategorized}
            </div>
            {template.isSystem ? (
              <span className="inline-flex items-center text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded">
                {TEXT.systemTemplate}
              </span>
            ) : null}
          </div>
          <div>
            <h3 className="text-lg text-slate-800 font-bold tracking-tight line-clamp-1">{template.name}</h3>
            <p className="mt-2 text-slate-500 line-clamp-2 text-sm leading-relaxed min-h-[40px]">{template.description || TEXT.noDescription}</p>
          </div>

          <div className="grid grid-cols-2 gap-3 mt-5">
            {metrics.map((metric) => (
              <div key={metric.label}>
                <div className="text-xs text-slate-400 mb-0.5">{metric.label}</div>
                <div className="text-sm font-medium text-slate-700 truncate" title={metric.value}>{metric.value}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="px-5 py-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-xs text-slate-400">{TEXT.templateUsage}</span>
            <span className="text-sm font-bold text-slate-700">{template.usageCount || 0}</span>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => handlePreview(template)}>
              <Eye className="mr-1.5 h-3.5 w-3.5" />
              {TEXT.preview}
            </Button>
            <Button
              size="sm"
              disabled={!user}
              onClick={() => handleCreateFromTemplate(template.id)}
              title={!user ? TEXT.loginRequired : TEXT.useTemplateTitle}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              {TEXT.useTemplate}
            </Button>
          </div>
        </div>
      </div>
    );
  };

  const renderTemplateRow = (template: TemplateItem) => {
    const graph = templateInsights.get(template.id) || EMPTY_GRAPH;
    const tags = normalizeTags(template.tags);

    return (
      <div key={template.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden hover:shadow-md transition-all">
        <div className="flex flex-col lg:flex-row lg:items-center gap-4 p-5">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2">
              <h3 className="text-lg font-bold text-slate-800 truncate">{template.name}</h3>
              {template.isSystem ? (
                <span className="inline-flex items-center text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded">
                  {TEXT.systemTemplate}
                </span>
              ) : null}
            </div>
            <p className="text-sm text-slate-500 mb-3">{template.description || TEXT.noDescription}</p>

            <div className="flex flex-wrap items-center gap-4 text-sm text-slate-600">
              <div className="flex items-center gap-1.5">
                <Layers3 className="h-4 w-4 text-slate-400" />
                {template.categoryName || TEXT.uncategorized}
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400">{TEXT.templateUsage}:</span>
                <span className="font-medium">{template.usageCount || 0}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400">{TEXT.nodeCount}:</span>
                <span className="font-medium">{graph.nodes.length}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400">{TEXT.edgeCount}:</span>
                <span className="font-medium">{graph.edges.length}</span>
              </div>
              {tags.length > 0 && (
                <div className="flex items-center gap-1.5 ml-auto">
                  {tags.map((tag) => (
                    <span key={tag} className="inline-flex items-center text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 lg:flex-col xl:flex-row shrink-0 border-t lg:border-t-0 pt-4 lg:pt-0 lg:pl-4 lg:border-l border-slate-100">
            <Button variant="outline" onClick={() => handlePreview(template)}>
              <Eye className="mr-2 h-4 w-4" />
              {TEXT.preview}
            </Button>
            <Button
              disabled={!user}
              onClick={() => handleCreateFromTemplate(template.id)}
              title={!user ? TEXT.loginRequired : TEXT.useTemplateTitle}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              {TEXT.useTemplate}
            </Button>
          </div>
        </div>
      </div>
    );
  };

  const renderLoadingState = () => {
    return (
      <div className={cn(viewMode === "grid" ? "grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3" : "space-y-4")}>
        {Array.from({ length: viewMode === "grid" ? 6 : 4 }).map((_, index) => (
          <SkeletonCard key={index} className={viewMode === "list" ? "p-5" : ""} />
        ))}
      </div>
    );
  };

  return (
    <div className="p-6 h-full flex flex-col bg-slate-50 overflow-y-auto">
      <div className="mb-6 shrink-0 space-y-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-800">
          <Workflow className="text-pink-500" />
          {TEXT.pageTitle}
        </h1>
        <p className="max-w-3xl text-sm leading-6 text-slate-500">{TEXT.pageDescription}</p>
      </div>

      <div className="flex flex-col xl:flex-row gap-6 flex-1 min-h-0">
        <aside className="w-full xl:w-64 shrink-0 flex flex-col gap-6">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
            <div className="mb-4 space-y-1">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-base font-bold text-slate-800">{TEXT.categoryNavigation}</h2>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                  {TEXT.categoryCount} {categoryCount}
                </span>
              </div>
              <p className="text-xs leading-5 text-slate-500">{TEXT.categoryNavigationDesc}</p>
            </div>
            <div className="space-y-1">
              <Button
                type="button"
                variant={!selectedCategory ? "secondary" : "ghost"}
                onClick={() => {
                  setSelectedCategory("");
                  setCurrentPage(1);
                }}
                className={cn(
                  "w-full justify-start text-sm",
                  !selectedCategory ? "font-medium" : "text-slate-600"
                )}
              >
                <Layers3 className="mr-2 h-4 w-4 shrink-0 text-slate-400" />
                <span className="flex-1 text-left">{TEXT.allTemplates}</span>
                <span className="ml-2 text-xs text-slate-400">{total}</span>
              </Button>
              {categories.length > 0 ? (
                renderCategoryTree(categories)
              ) : (
                <div className="py-4 text-center text-slate-400 text-sm">{TEXT.noCategory}</div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
            <div className="mb-4 space-y-1">
              <h2 className="text-base font-bold text-slate-800">{TEXT.commonTags}</h2>
              <p className="text-xs leading-5 text-slate-500">{TEXT.commonTagsDesc}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {COMMON_TAGS.map((tag) => {
                const active = selectedTags.includes(tag);
                return (
                  <Button
                    key={tag}
                    type="button"
                    size="sm"
                    variant={active ? "default" : "outline"}
                    onClick={() => toggleTag(tag)}
                    className="h-7 text-xs rounded-md"
                  >
                    {tag}
                  </Button>
                );
              })}
            </div>
          </div>
        </aside>

        <section className="flex-1 flex flex-col min-w-0 space-y-5 pt-2">
          <Card className="bg-white rounded-xl shadow-sm border border-slate-200 shrink-0">
            <CardContent className="px-6 py-6 space-y-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                <div className="relative min-w-0 flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 h-4 w-4" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setCurrentPage(1);
                    }}
                    placeholder={TEXT.searchPlaceholder}
                    className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-pink-400 outline-none text-sm"
                  />
                </div>

                <div className="flex w-full flex-wrap items-center justify-end gap-2 lg:w-auto lg:flex-nowrap lg:shrink-0">
                  <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
                    <button
                      onClick={() => setViewMode("grid")}
                      className={`p-1.5 rounded-md transition-colors ${viewMode === "grid" ? "bg-white shadow-sm text-pink-600" : "text-slate-500 hover:text-slate-700"}`}
                    >
                      <Grid className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setViewMode("list")}
                      className={`p-1.5 rounded-md transition-colors ${viewMode === "list" ? "bg-white shadow-sm text-pink-600" : "text-slate-500 hover:text-slate-700"}`}
                    >
                      <List className="h-4 w-4" />
                    </button>
                  </div>
                  {hasActiveFilters && (
                    <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 text-slate-500">
                      <X className="mr-2 h-4 w-4" />
                      {TEXT.clearFilters}
                    </Button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                <div className="rounded-2xl bg-slate-50/50 px-4 py-3 ring-1 ring-slate-200/50 backdrop-blur-sm">
                  <div className={PANEL_STAT_LABEL_CLASS_NAME}>{TEXT.currentResults}</div>
                  <div className="mt-2 text-2xl font-bold text-slate-800">{total}</div>
                </div>
                <div className="rounded-2xl bg-slate-50/50 px-4 py-3 ring-1 ring-slate-200/50 backdrop-blur-sm">
                  <div className={PANEL_STAT_LABEL_CLASS_NAME}>{TEXT.category}</div>
                  <div className="mt-2 truncate text-base font-bold text-slate-800">{selectedCategoryName}</div>
                </div>
                <div className="rounded-2xl bg-slate-50/50 px-4 py-3 ring-1 ring-slate-200/50 backdrop-blur-sm">
                  <div className={PANEL_STAT_LABEL_CLASS_NAME}>{TEXT.activeFilters}</div>
                  <div className="mt-2 text-2xl font-bold text-slate-800">{(selectedCategory ? 1 : 0) + selectedTags.length + (searchTerm.trim() ? 1 : 0)}</div>
                </div>
                <div className="rounded-2xl bg-slate-50/50 px-4 py-3 ring-1 ring-slate-200/50 backdrop-blur-sm">
                  <div className={PANEL_STAT_LABEL_CLASS_NAME}>{TEXT.currentView}</div>
                  <div className="mt-2 text-base font-bold text-slate-800">{viewMode === "grid" ? TEXT.gridView : TEXT.listView}</div>
                </div>
              </div>

              {hasActiveFilters ? (
                <div className="rounded-2xl border border-dashed border-slate-300/60 bg-slate-50/50 px-4 py-3 backdrop-blur-sm">
                  <div className={PANEL_STAT_LABEL_CLASS_NAME}>{TEXT.filterSummary}</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selectedCategory ? (
                      <Button variant="outline" size="sm"
                        type="button"
                        onClick={() => {
                          setSelectedCategory("");
                          setCurrentPage(1);
                        }}
                        className={FILTER_CHIP_CLASS_NAME}
                      >
                        {selectedCategoryName}
                        <X className="ml-2 h-3.5 w-3.5" />
                      </Button>
                    ) : null}
                    {searchTerm.trim() ? (
                      <Button variant="outline" size="sm"
                        type="button"
                        onClick={() => {
                          setSearchTerm("");
                          setCurrentPage(1);
                        }}
                        className={FILTER_CHIP_CLASS_NAME}
                      >
                        {searchTerm.trim()}
                        <X className="ml-2 h-3.5 w-3.5" />
                      </Button>
                    ) : null}
                    {selectedTags.map((tag) => (
                      <Button variant="outline" size="sm"
                        key={tag}
                        type="button"
                        onClick={() => toggleTag(tag)}
                        className={FILTER_CHIP_CLASS_NAME}
                      >
                        {tag}
                        <X className="ml-2 h-3.5 w-3.5" />
                      </Button>
                    ))}
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {loading ? renderLoadingState() : loadError ? (
            <div className="bg-white rounded-xl border border-slate-200 p-12 shadow-sm">
              <EmptyState
                icon={<Workflow className="h-12 w-12 text-slate-300" />}
                title={TEXT.loadTemplatesFailed}
                description={TEXT.emptyDescription}
                action={{ label: TEXT.retry, onClick: () => void loadTemplates() }}
              />
            </div>
          ) : templates.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-12 shadow-sm">
              <EmptyState
                icon={<Search className="h-12 w-12 text-slate-300" />}
                title={TEXT.emptyTitle}
                description={TEXT.emptyDescription}
                action={
                  hasActiveFilters
                    ? { label: TEXT.clearFilters, onClick: clearFilters }
                    : undefined
                }
              />
            </div>
          ) : viewMode === "grid" ? (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
              {templates.map(renderTemplateCard)}
            </div>
          ) : (
            <div className="space-y-4">{templates.map(renderTemplateRow)}</div>
          )}

          {/* Pagination */}
          {total > pageSize && (
            <div className="flex items-center justify-between bg-white px-4 py-3 rounded-lg shadow-sm border border-slate-200 shrink-0">
              <span className="text-sm text-slate-500">
                {TEXT.pageLabel} <span className="font-medium text-slate-900">{currentPage}</span> / {totalPages} {TEXT.pageSuffix}
              </span>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  disabled={currentPage <= 1}
                  title={TEXT.previousPage}
                  aria-label={TEXT.previousPage}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                >
                  <ArrowRight className="rotate-180" size={18} />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  disabled={currentPage >= totalPages}
                  title={TEXT.nextPage}
                  aria-label={TEXT.nextPage}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                >
                  <ArrowRight size={18} />
                </Button>
              </div>
            </div>
          )}
        </section>
      </div>

      <Dialog open={showPreview} onOpenChange={handlePreviewOpenChange}>
        <DialogContent
          disableDefaultMaxWidth
          className="flex h-[min(92vh,860px)] w-[min(96vw,1220px)] max-h-[92vh] max-w-none flex-col overflow-hidden gap-0 p-0 sm:max-w-[min(96vw,1220px)]"
        >
          {previewTemplate ? (
            <>
              <DialogHeader className="shrink-0 border-b border-slate-200 bg-white px-6 py-5 pr-14 lg:px-6">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <DialogTitle className="flex items-center gap-2 text-2xl font-bold text-slate-900">
                      <Workflow className="h-5 w-5 text-pink-500" />
                      {previewTemplate.name}
                    </DialogTitle>
                    <span className="rounded-full bg-pink-50 px-3 py-1 text-xs font-medium text-pink-600">
                      {TEXT.previewTitleSuffix}
                    </span>
                    {previewTemplate.isSystem ? (
                      <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-600">
                        {TEXT.systemTemplate}
                      </span>
                    ) : null}
                  </div>
                  <DialogDescription className="max-w-4xl text-sm leading-6 text-slate-500">
                    {previewTemplate.description || TEXT.noDescription}
                  </DialogDescription>
                </div>
              </DialogHeader>

              <div className="flex-1 overflow-hidden bg-slate-50/70">
                <div className="h-full overflow-y-auto p-6">
                  <div className="space-y-6">
                    {!!previewTemplate.previewImage ? (
                      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                        <img
                          src={previewTemplate.previewImage}
                          alt={`${previewTemplate.name} preview`}
                          className="max-h-[240px] w-full object-cover"
                        />
                      </div>
                    ) : null}

                    {/* é¢è§æ¦è§åºä½¿ç¨ç»ä¸çç½ï¼é¿ååºç°éå¤ç»è®¡ä¿¡æ¯ */}
                    <section className="space-y-5">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                            <Sparkles className="h-4 w-4 text-pink-500" />
                            {TEXT.previewOverview}
                          </div>
                          <div className="mt-1 text-sm leading-6 text-slate-500">{TEXT.previewStructureDesc}</div>
                        </div>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                        {previewOverviewStats.map((item) => (
                          <div key={item.label} className="rounded-2xl bg-white px-5 py-4 ring-1 ring-slate-200/70">
                            <div className={PREVIEW_META_LABEL_CLASS_NAME}>{item.label}</div>
                            <div className="mt-2 truncate text-2xl font-bold text-slate-800" title={item.value}>
                              {item.value}
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,0.9fr)_minmax(0,0.95fr)]">
                        <div className="rounded-2xl bg-white/90 px-5 py-4 ring-1 ring-slate-200/70">
                          <div className={PREVIEW_META_LABEL_CLASS_NAME}>{TEXT.templateInfo}</div>
                          <p className="mt-2 text-sm leading-6 text-slate-500">
                            {previewTemplate.description || TEXT.noDescription}
                          </p>
                        </div>

                        <div className="rounded-2xl bg-white/90 px-5 py-4 ring-1 ring-slate-200/70">
                          <div className={PREVIEW_META_LABEL_CLASS_NAME}>{TEXT.tags}</div>
                          {previewTags.length > 0 ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {previewTags.map((tag) => (
                                <span
                                  key={tag}
                                  className="inline-flex items-center rounded-full bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200/70"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <div className="mt-2 text-sm text-slate-400">-</div>
                          )}
                        </div>

                        <div className="rounded-2xl bg-white/90 px-5 py-4 ring-1 ring-slate-200/70">
                          <div className={PREVIEW_META_LABEL_CLASS_NAME}>{TEXT.nodeTypes}</div>
                          {previewNodeTypes.length > 0 ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {previewNodeTypes.map((type) => (
                                <span
                                  key={type}
                                  className="inline-flex items-center rounded-full bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-500 ring-1 ring-slate-200/70"
                                >
                                  {type}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <div className="mt-2 text-sm text-slate-400">-</div>
                          )}
                        </div>
                      </div>
                    </section>

                    {/* ????????????????????? */}
                    <section className="space-y-4 px-1">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                        <div>
                          <div className="text-lg font-bold text-slate-900">{TEXT.previewStructure}</div>
                          <div className="mt-1 text-sm leading-6 text-slate-500">{TEXT.previewStructureDesc}</div>
                        </div>
                      </div>

                      {previewGraph.nodes.length > 0 ? (
                        <div className="rounded-[26px] bg-slate-100/80 p-5 lg:p-6">
                          <div className="flex items-center gap-4 overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
                            {previewGraph.nodes.slice(0, 8).map((node, index) => (
                              <React.Fragment key={node.id}>
                                <div className="min-w-[220px] rounded-2xl bg-white px-5 py-4 ring-1 ring-slate-200/70">
                                  <div className={`${PREVIEW_META_LABEL_CLASS_NAME} mb-2`}>
                                    {formatNodeType(node.type)}
                                  </div>
                                  <div className="truncate text-lg font-bold text-slate-800" title={node.name}>
                                    {node.name}
                                  </div>
                                </div>
                                {index < Math.min(previewGraph.nodes.length - 1, 7) ? (
                                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-slate-300 ring-1 ring-slate-200/70">
                                    <ArrowRight className="h-4 w-4" />
                                  </div>
                                ) : null}
                              </React.Fragment>
                            ))}
                            {previewGraph.nodes.length > 8 ? (
                              <div className="flex h-[76px] min-w-[76px] items-center justify-center rounded-2xl bg-white text-base font-semibold text-slate-400 ring-1 ring-dashed ring-slate-200">
                                +{previewGraph.nodes.length - 8}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-[24px] border border-dashed border-slate-200 bg-white px-6 py-16 text-center">
                          <Workflow className="mx-auto mb-4 h-12 w-12 text-slate-200" />
                          <p className="text-sm leading-6 text-slate-500">{TEXT.invalidDefinition}</p>
                        </div>
                      )}
                    </section>

                    <div className="grid gap-5 xl:grid-cols-2">
                      <section className="overflow-hidden rounded-[28px] bg-white ring-1 ring-slate-200/70">
                        <div className={PREVIEW_SECTION_HEADER_CLASS_NAME}>{TEXT.nodeList}</div>
                        <div className="max-h-[320px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200">
                          {previewGraph.nodes.length === 0 ? (
                            <div className="flex items-center justify-center px-4 py-14 text-sm text-slate-400">
                              {TEXT.invalidDefinition}
                            </div>
                          ) : (
                            <div className="divide-y divide-slate-100">
                              {previewGraph.nodes.map((node) => (
                                <div key={node.id} className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-slate-50/80">
                                  <span className="truncate text-sm font-semibold text-slate-800">{node.name}</span>
                                  <span className="shrink-0 rounded-full bg-slate-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 ring-1 ring-slate-200/70">
                                    {formatNodeType(node.type)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </section>

                      <section className="overflow-hidden rounded-[28px] bg-white ring-1 ring-slate-200/70">
                        <div className={PREVIEW_SECTION_HEADER_CLASS_NAME}>{TEXT.edgeList}</div>
                        <div className="max-h-[320px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200">
                          {previewGraph.edges.length === 0 ? (
                            <div className="flex items-center justify-center px-4 py-14 text-sm text-slate-400">
                              {TEXT.edgeNotFound}
                            </div>
                          ) : (
                            <div className="divide-y divide-slate-100">
                              {previewGraph.edges.map((edge, index) => (
                                <div
                                  key={`${edge.source}-${edge.target}-${index}`}
                                  className="px-4 py-3 transition-colors hover:bg-slate-50/80"
                                >
                                  <div className="flex items-center gap-2 text-sm text-slate-700">
                                    <span className="min-w-0 flex-1 truncate font-semibold">{edge.source}</span>
                                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-300" />
                                    <span className="min-w-0 flex-1 truncate font-semibold">{edge.target}</span>
                                  </div>
                                  {edge.condition ? (
                                    <div className="mt-2 text-xs leading-5 text-slate-500">{edge.condition}</div>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </section>
                    </div>

                  </div>
                </div>
              </div>

              <DialogFooter className="shrink-0 border-t border-slate-200 bg-white px-6 py-4 gap-3 sm:flex-row sm:items-center sm:justify-end">
                <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row">
                  <Button variant="outline" onClick={() => handlePreviewOpenChange(false)}>
                    {TEXT.close}
                  </Button>
                  <Button
                    disabled={!user}
                    onClick={() => {
                      handlePreviewOpenChange(false);
                      handleCreateFromTemplate(previewTemplate.id);
                    }}
                    title={!user ? TEXT.loginRequired : TEXT.useTemplateTitle}
                  >
                    <Plus className="mr-1.5 h-4 w-4" />
                    {TEXT.useTemplate}
                  </Button>
                </div>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={showCreateModal} onOpenChange={handleCreateModalOpenChange}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{TEXT.createWorkflowFromTemplate}</DialogTitle>
            <DialogDescription>{TEXT.createWorkflowDesc}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="workflow-name">{`${TEXT.workflowName} *`}</Label>
              <Input
                id="workflow-name"
                value={workflowName}
                onChange={(event) => setWorkflowName(event.target.value)}
                placeholder={TEXT.workflowNamePlaceholder}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="workflow-description">{TEXT.workflowDescriptionLabel}</Label>
              <Textarea
                id="workflow-description"
                value={workflowDescription}
                onChange={(event) => setWorkflowDescription(event.target.value)}
                placeholder={TEXT.workflowDescriptionPlaceholder}
                rows={4}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => handleCreateModalOpenChange(false)}>
              {TEXT.cancel}
            </Button>
            <Button onClick={submitCreateWorkflow}>{TEXT.create}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TemplateLibrary;
