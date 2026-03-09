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
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
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
  pageHighlight: "\u4f18\u5148\u4f7f\u7528\u7edf\u4e00\u8bbe\u8ba1\u7cfb\u7edf\u7ec4\u4ef6\uff0c\u907f\u514d\u51fa\u73b0\u72ec\u7acb\u9875\u9762\u98ce\u683c\u3002",
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
  previewStructure: "\u6d41\u7a0b\u7ed3\u6784\u9884\u89c8",
  previewStructureDesc: "\u5c06\u6d41\u7a0b\u8282\u70b9\u4e0e\u51fa\u8fb9\u7ed3\u6784\u76f4\u63a5\u5c55\u793a\u7ed9\u8bbe\u8ba1\u4eba\u3002",
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
    const condition = typeof item.condition === "string" && item.condition.trim().length > 0 ? item.condition.trim() : undefined;
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
      const data = await request.post<CreateWorkflowResponse>(`/workflow/templates/${createTemplateId}/create-workflow`, {
        workflowName: trimmedName,
        description: workflowDescription.trim(),
      });
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
        <div key={node.id} className="space-y-2">
          <Button
            type="button"
            variant={active ? "secondary" : "ghost"}
            onClick={() => {
              setSelectedCategory(node.id);
              setCurrentPage(1);
            }}
            className={cn(
              "h-auto w-full justify-start rounded-xl px-3 py-3 text-left text-sm font-medium",
              active ? "bg-pink-50 text-pink-700 shadow-sm shadow-pink-100" : "text-slate-700 hover:bg-slate-100/80",
            )}
            style={{ paddingLeft: `${level * 16 + 12}px` }}
          >
            <FolderOpen className="mr-2 h-4 w-4 shrink-0" />
            <span className="flex-1 truncate">{node.name}</span>
            {Number(node.templateCount || 0) > 0 ? (
              <span className="ml-2 rounded-full bg-white/80 px-2 py-0.5 text-xs text-slate-500 ring-1 ring-slate-200/80">
                {node.templateCount}
              </span>
            ) : null}
          </Button>
          {Array.isArray(node.children) && node.children.length > 0 ? renderCategoryTree(node.children, level + 1) : null}
        </div>
      );
    });
  };

  const renderTemplateCard = (template: TemplateItem) => {
    const graph = templateInsights.get(template.id) || EMPTY_GRAPH;
    const metrics = getTemplateMetrics(template, graph);
    const tags = normalizeTags(template.tags);

    return (
      <Card
        key={template.id}
        className="group overflow-hidden border-slate-200/80 bg-white/95 shadow-sm shadow-slate-200/60 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-pink-100/60"
      >
        <CardHeader className="pb-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-3">
              <div className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500 ring-1 ring-slate-200/80">
                <Layers3 className="mr-1.5 h-3.5 w-3.5" />
                {template.categoryName || TEXT.uncategorized}
              </div>
              <div>
                <CardTitle className="text-xl text-slate-900">{template.name}</CardTitle>
                <CardDescription className="mt-2 min-h-[2.75rem] leading-6">{template.description || TEXT.noDescription}</CardDescription>
              </div>
            </div>
            {template.isSystem ? (
              <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100">
                {TEXT.systemTemplate}
              </span>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {metrics.map((metric) => (
              <div key={metric.label} className="rounded-xl bg-slate-50 px-3 py-2 ring-1 ring-slate-200/70">
                <div className="text-xs font-medium uppercase tracking-[0.12em] text-slate-400">{metric.label}</div>
                <div className="mt-1 truncate text-sm font-semibold text-slate-700" title={metric.value}>{metric.value}</div>
              </div>
            ))}
          </div>
          <div className="flex min-h-[2rem] flex-wrap gap-2">
            {tags.length > 0 ? (
              tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center rounded-full bg-pink-50 px-2.5 py-1 text-xs font-medium text-pink-700 ring-1 ring-pink-100"
                >
                  {tag}
                </span>
              ))
            ) : (
              <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-400 ring-1 ring-slate-200/80">-</span>
            )}
          </div>
          <div className="flex items-center justify-between rounded-xl bg-gradient-to-r from-slate-50 to-pink-50/60 px-4 py-3 ring-1 ring-slate-200/70">
            <div>
              <div className="text-xs uppercase tracking-[0.14em] text-slate-400">{TEXT.templateUsage}</div>
              <div className="mt-1 text-base font-semibold text-slate-800">{template.usageCount || 0}</div>
            </div>
            <Workflow className="h-5 w-5 text-pink-400" />
          </div>
        </CardContent>
        <CardFooter className="gap-3">
          <Button variant="outline" className="flex-1" onClick={() => handlePreview(template)}>
            <Eye className="mr-2 h-4 w-4" />
            {TEXT.preview}
          </Button>
          <Button
            className="flex-1"
            disabled={!user}
            onClick={() => handleCreateFromTemplate(template.id)}
            title={!user ? TEXT.loginRequired : TEXT.useTemplateTitle}
          >
            <Plus className="mr-2 h-4 w-4" />
            {TEXT.useTemplate}
          </Button>
        </CardFooter>
      </Card>
    );
  };

  const renderTemplateRow = (template: TemplateItem) => {
    const graph = templateInsights.get(template.id) || EMPTY_GRAPH;
    const tags = normalizeTags(template.tags);

    return (
      <Card key={template.id} className="overflow-hidden border-slate-200/80 bg-white/95 shadow-sm shadow-slate-200/50">
        <CardContent className="flex flex-col gap-5 p-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 flex-1 space-y-4">
            <div className="flex flex-wrap items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-3">
                  <h3 className="truncate text-xl font-semibold text-slate-900">{template.name}</h3>
                  {template.isSystem ? (
                    <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100">
                      {TEXT.systemTemplate}
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-500">{template.description || TEXT.noDescription}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {tags.length > 0 ? tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center rounded-full bg-pink-50 px-2.5 py-1 text-xs font-medium text-pink-700 ring-1 ring-pink-100"
                >
                  {tag}
                </span>
              )) : <span className="text-sm text-slate-400">-</span>}
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <div className="rounded-xl bg-slate-50 px-3 py-2 ring-1 ring-slate-200/70">
                <div className="text-xs uppercase tracking-[0.12em] text-slate-400">{TEXT.category}</div>
                <div className="mt-1 truncate text-sm font-semibold text-slate-700">{template.categoryName || TEXT.uncategorized}</div>
              </div>
              <div className="rounded-xl bg-slate-50 px-3 py-2 ring-1 ring-slate-200/70">
                <div className="text-xs uppercase tracking-[0.12em] text-slate-400">{TEXT.templateUsage}</div>
                <div className="mt-1 text-sm font-semibold text-slate-700">{template.usageCount || 0}</div>
              </div>
              <div className="rounded-xl bg-slate-50 px-3 py-2 ring-1 ring-slate-200/70">
                <div className="text-xs uppercase tracking-[0.12em] text-slate-400">{TEXT.nodeCount}</div>
                <div className="mt-1 text-sm font-semibold text-slate-700">{graph.nodes.length}</div>
              </div>
              <div className="rounded-xl bg-slate-50 px-3 py-2 ring-1 ring-slate-200/70">
                <div className="text-xs uppercase tracking-[0.12em] text-slate-400">{TEXT.edgeCount}</div>
                <div className="mt-1 text-sm font-semibold text-slate-700">{graph.edges.length}</div>
              </div>
            </div>
          </div>
          <div className="flex shrink-0 flex-col gap-3 sm:flex-row lg:flex-col xl:flex-row">
            <Button variant="outline" onClick={() => handlePreview(template)}>
              <Eye className="mr-2 h-4 w-4" />
              {TEXT.preview}
            </Button>
            <Button
              disabled={!user}
              onClick={() => handleCreateFromTemplate(template.id)}
              title={!user ? TEXT.loginRequired : TEXT.useTemplateTitle}
            >
              <Plus className="mr-2 h-4 w-4" />
              {TEXT.useTemplate}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  };

  const renderLoadingState = () => {
    return (
      <div className={cn(viewMode === "grid" ? "grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3" : "space-y-4")}>
        {Array.from({ length: viewMode === "grid" ? 6 : 4 }).map((_, index) => (
          <SkeletonCard key={index} className={viewMode === "list" ? "p-6" : ""} />
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top_left,_rgba(236,72,153,0.14),_transparent_26%),linear-gradient(180deg,_#fff_0%,_#f8fafc_100%)]">
      <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-6 p-6 xl:flex-row">
        <aside className="w-full shrink-0 space-y-6 xl:sticky xl:top-6 xl:w-[320px] xl:self-start">
          <Card className="overflow-hidden border-none shadow-xl shadow-pink-100/70">
            <div className="bg-gradient-to-br from-pink-600 via-pink-500 to-rose-400 p-6 text-white">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="inline-flex items-center rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-white/90">
                    <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                    {TEXT.pageTitle}
                  </div>
                  <h1 className="mt-4 text-3xl font-semibold tracking-tight">{TEXT.pageTitle}</h1>
                  <p className="mt-3 max-w-sm text-sm leading-6 text-white/85">{TEXT.pageDescription}</p>
                </div>
                <div className="hidden rounded-3xl bg-white/15 p-4 backdrop-blur xl:block">
                  <Workflow className="h-10 w-10 text-white" />
                </div>
              </div>
              <p className="mt-6 text-sm text-white/80">{TEXT.pageHighlight}</p>
            </div>
            <CardContent className="grid grid-cols-2 gap-3 bg-white/90 p-5">
              <div className="rounded-2xl bg-slate-50 px-4 py-3 ring-1 ring-slate-200/70">
                <div className="text-xs uppercase tracking-[0.14em] text-slate-400">{TEXT.currentResults}</div>
                <div className="mt-2 text-2xl font-semibold text-slate-900">{total}</div>
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3 ring-1 ring-slate-200/70">
                <div className="text-xs uppercase tracking-[0.14em] text-slate-400">{TEXT.categoryCount}</div>
                <div className="mt-2 text-2xl font-semibold text-slate-900">{categoryCount}</div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200/80 bg-white/90 shadow-lg shadow-slate-200/50">
            <CardHeader className="pb-4">
              <CardTitle className="text-xl text-slate-900">{TEXT.categoryNavigation}</CardTitle>
              <CardDescription>{TEXT.categoryNavigationDesc}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button
                type="button"
                variant={!selectedCategory ? "secondary" : "ghost"}
                onClick={() => {
                  setSelectedCategory("");
                  setCurrentPage(1);
                }}
                className={cn(
                  "h-auto w-full justify-start rounded-xl px-3 py-3 text-left text-sm font-medium",
                  !selectedCategory ? "bg-pink-50 text-pink-700 shadow-sm shadow-pink-100" : "text-slate-700 hover:bg-slate-100/80",
                )}
              >
                <Layers3 className="mr-2 h-4 w-4 shrink-0" />
                <span className="flex-1 truncate">{TEXT.allTemplates}</span>
                <span className="ml-2 rounded-full bg-white/80 px-2 py-0.5 text-xs text-slate-500 ring-1 ring-slate-200/80">{total}</span>
              </Button>
              {categories.length > 0 ? (
                <div className="space-y-2">{renderCategoryTree(categories)}</div>
              ) : (
                <EmptyState
                  icon={<FolderOpen className="h-10 w-10" />}
                  title={TEXT.noCategory}
                  description={TEXT.noCategoryDesc}
                  className="rounded-2xl bg-slate-50 py-10 ring-1 ring-slate-200/70"
                />
              )}
            </CardContent>
          </Card>

          <Card className="border-slate-200/80 bg-white/90 shadow-lg shadow-slate-200/50">
            <CardHeader className="pb-4">
              <CardTitle className="text-xl text-slate-900">{TEXT.commonTags}</CardTitle>
              <CardDescription>{TEXT.commonTagsDesc}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {COMMON_TAGS.map((tag) => {
                const active = selectedTags.includes(tag);
                return (
                  <Button
                    key={tag}
                    type="button"
                    size="sm"
                    variant={active ? "default" : "secondary"}
                    onClick={() => toggleTag(tag)}
                    className={cn(active ? "shadow-sm shadow-pink-200/60" : "text-slate-700")}
                  >
                    {tag}
                  </Button>
                );
              })}
            </CardContent>
          </Card>
        </aside>

        <section className="min-w-0 flex-1 space-y-6">
          <Card className="overflow-hidden border-none bg-white/90 shadow-xl shadow-slate-200/60">
            <CardContent className="space-y-5 p-6">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div className="relative w-full max-w-2xl">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    value={searchTerm}
                    onChange={(event) => {
                      setSearchTerm(event.target.value);
                      setCurrentPage(1);
                    }}
                    placeholder={TEXT.searchPlaceholder}
                    className="h-12 rounded-2xl border-slate-200 bg-slate-50/80 pl-11 pr-4 text-sm shadow-inner shadow-slate-100/50"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2 self-end xl:self-auto">
                  <Button
                    type="button"
                    variant={viewMode === "grid" ? "secondary" : "ghost"}
                    size="icon"
                    onClick={() => setViewMode("grid")}
                    title={TEXT.gridView}
                    className={viewMode === "grid" ? "shadow-sm shadow-pink-100" : ""}
                  >
                    <Grid className="h-5 w-5" />
                  </Button>
                  <Button
                    type="button"
                    variant={viewMode === "list" ? "secondary" : "ghost"}
                    size="icon"
                    onClick={() => setViewMode("list")}
                    title={TEXT.listView}
                    className={viewMode === "list" ? "shadow-sm shadow-pink-100" : ""}
                  >
                    <List className="h-5 w-5" />
                  </Button>
                  {hasActiveFilters ? (
                    <Button type="button" variant="outline" onClick={clearFilters}>
                      <X className="mr-2 h-4 w-4" />
                      {TEXT.clearFilters}
                    </Button>
                  ) : null}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                <div className="rounded-2xl bg-slate-50 px-4 py-3 ring-1 ring-slate-200/70">
                  <div className="text-xs uppercase tracking-[0.14em] text-slate-400">{TEXT.currentResults}</div>
                  <div className="mt-2 text-2xl font-semibold text-slate-900">{total}</div>
                </div>
                <div className="rounded-2xl bg-slate-50 px-4 py-3 ring-1 ring-slate-200/70">
                  <div className="text-xs uppercase tracking-[0.14em] text-slate-400">{TEXT.category}</div>
                  <div className="mt-2 truncate text-base font-semibold text-slate-900">{selectedCategoryName}</div>
                </div>
                <div className="rounded-2xl bg-slate-50 px-4 py-3 ring-1 ring-slate-200/70">
                  <div className="text-xs uppercase tracking-[0.14em] text-slate-400">{TEXT.activeFilters}</div>
                  <div className="mt-2 text-2xl font-semibold text-slate-900">{(selectedCategory ? 1 : 0) + selectedTags.length + (searchTerm.trim() ? 1 : 0)}</div>
                </div>
                <div className="rounded-2xl bg-slate-50 px-4 py-3 ring-1 ring-slate-200/70">
                  <div className="text-xs uppercase tracking-[0.14em] text-slate-400">{TEXT.currentView}</div>
                  <div className="mt-2 text-base font-semibold text-slate-900">{viewMode === "grid" ? TEXT.gridView : TEXT.listView}</div>
                </div>
              </div>

              {hasActiveFilters ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">{TEXT.filterSummary}</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selectedCategory ? (
                      <Button variant="outline" size="sm"
                        type="button"
                        onClick={() => {
                          setSelectedCategory("");
                          setCurrentPage(1);
                        }}
                        className="inline-flex items-center rounded-full bg-white px-3 py-1 text-sm text-slate-700 ring-1 ring-slate-200 transition-colors hover:bg-pink-50 hover:text-pink-700"
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
                        className="inline-flex items-center rounded-full bg-white px-3 py-1 text-sm text-slate-700 ring-1 ring-slate-200 transition-colors hover:bg-pink-50 hover:text-pink-700"
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
                        className="inline-flex items-center rounded-full bg-white px-3 py-1 text-sm text-slate-700 ring-1 ring-slate-200 transition-colors hover:bg-pink-50 hover:text-pink-700"
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
            <Card className="border-slate-200/80 bg-white/90 shadow-lg shadow-slate-200/50">
              <CardContent className="p-8">
                <EmptyState
                  icon={<Workflow className="h-12 w-12" />}
                  title={TEXT.loadTemplatesFailed}
                  description={TEXT.emptyDescription}
                  action={{ label: TEXT.retry, onClick: () => void loadTemplates() }}
                />
              </CardContent>
            </Card>
          ) : templates.length === 0 ? (
            <Card className="border-slate-200/80 bg-white/90 shadow-lg shadow-slate-200/50">
              <CardContent className="p-8">
                <EmptyState
                  icon={<Search className="h-12 w-12" />}
                  title={TEXT.emptyTitle}
                  description={TEXT.emptyDescription}
                  action={hasActiveFilters ? { label: TEXT.clearFilters, onClick: clearFilters } : undefined}
                />
              </CardContent>
            </Card>
          ) : viewMode === "grid" ? (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 2xl:grid-cols-3">{templates.map(renderTemplateCard)}</div>
          ) : (
            <div className="space-y-4">{templates.map(renderTemplateRow)}</div>
          )}

          {total > pageSize ? (
            <Card className="border-slate-200/80 bg-white/90 shadow-lg shadow-slate-200/50">
              <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-slate-500">{TEXT.pageLabel} {currentPage} / {totalPages} {TEXT.pageSuffix}</div>
                <div className="flex items-center gap-3">
                  <Button type="button" variant="outline" disabled={currentPage === 1} onClick={() => setCurrentPage((value) => Math.max(1, value - 1))}>{TEXT.previousPage}</Button>
                  <Button type="button" disabled={currentPage >= totalPages} onClick={() => setCurrentPage((value) => Math.min(totalPages, value + 1))}>{TEXT.nextPage}</Button>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </section>
      </div>

      <Dialog open={showPreview} onOpenChange={handlePreviewOpenChange}>
        <DialogContent className="sm:max-w-5xl">
          {previewTemplate ? (
            <>
              <DialogHeader>
                <DialogTitle>{`${previewTemplate.name} ${TEXT.previewTitleSuffix}`}</DialogTitle>
                <DialogDescription>{previewTemplate.description || TEXT.noDescription}</DialogDescription>
              </DialogHeader>

              {!!previewTemplate.previewImage ? (
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                  <img src={previewTemplate.previewImage} alt={`${previewTemplate.name} preview`} className="max-h-64 w-full object-contain" />
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                <div className="rounded-2xl bg-slate-50 px-4 py-3 ring-1 ring-slate-200/70">
                  <div className="text-xs uppercase tracking-[0.14em] text-slate-400">{TEXT.nodeCount}</div>
                  <div className="mt-2 text-2xl font-semibold text-slate-900">{previewGraph.nodes.length}</div>
                </div>
                <div className="rounded-2xl bg-slate-50 px-4 py-3 ring-1 ring-slate-200/70">
                  <div className="text-xs uppercase tracking-[0.14em] text-slate-400">{TEXT.edgeCount}</div>
                  <div className="mt-2 text-2xl font-semibold text-slate-900">{previewGraph.edges.length}</div>
                </div>
                <div className="rounded-2xl bg-slate-50 px-4 py-3 ring-1 ring-slate-200/70">
                  <div className="text-xs uppercase tracking-[0.14em] text-slate-400">{TEXT.category}</div>
                  <div className="mt-2 truncate text-sm font-semibold text-slate-900">{previewTemplate.categoryName || TEXT.uncategorized}</div>
                </div>
                <div className="rounded-2xl bg-slate-50 px-4 py-3 ring-1 ring-slate-200/70">
                  <div className="text-xs uppercase tracking-[0.14em] text-slate-400">{TEXT.tags}</div>
                  <div className="mt-2 truncate text-sm font-semibold text-slate-900">{normalizeTags(previewTemplate.tags).join(" / ") || "-"}</div>
                </div>
              </div>

              {previewGraph.nodes.length > 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-pink-50/60 p-5">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{TEXT.previewStructure}</div>
                    <div className="mt-1 text-sm text-slate-500">{TEXT.previewStructureDesc}</div>
                  </div>
                  <div className="mt-5 flex items-center gap-2 overflow-x-auto pb-2">
                    {previewGraph.nodes.slice(0, 8).map((node, index) => (
                      <React.Fragment key={node.id}>
                        <div className="min-w-[152px] rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm shadow-slate-100/70">
                          <div className="text-xs font-medium uppercase tracking-[0.12em] text-slate-400">{formatNodeType(node.type)}</div>
                          <div className="mt-2 truncate text-sm font-semibold text-slate-800" title={node.name}>{node.name}</div>
                        </div>
                        {index < Math.min(previewGraph.nodes.length - 1, 7) ? <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" /> : null}
                      </React.Fragment>
                    ))}
                  </div>
                  <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-2">
                    <Card className="border-slate-200/80 bg-white/90 shadow-sm shadow-slate-100/70">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-lg">{TEXT.nodeList}</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <div className="max-h-52 space-y-2 overflow-y-auto pr-1">
                          {previewGraph.nodes.map((node) => (
                            <div key={node.id} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                              <div className="font-semibold text-slate-800">{node.name}</div>
                              <div className="mt-1 text-xs uppercase tracking-[0.12em] text-slate-400">{formatNodeType(node.type)}</div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                    <Card className="border-slate-200/80 bg-white/90 shadow-sm shadow-slate-100/70">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-lg">{TEXT.edgeList}</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <div className="max-h-52 space-y-2 overflow-y-auto pr-1">
                          {previewGraph.edges.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-6 text-sm text-slate-400">{TEXT.edgeNotFound}</div>
                          ) : previewGraph.edges.map((edge, index) => (
                            <div key={`${edge.source}-${edge.target}-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                              <div className="font-semibold text-slate-800">{`${edge.source} -> ${edge.target}`}</div>
                              {edge.condition ? <div className="mt-1 text-xs text-slate-400">{edge.condition}</div> : null}
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-sm text-slate-500">{TEXT.invalidDefinition}</div>
              )}

              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => handlePreviewOpenChange(false)}>{TEXT.close}</Button>
                <Button
                  disabled={!user}
                  onClick={() => {
                    handlePreviewOpenChange(false);
                    handleCreateFromTemplate(previewTemplate.id);
                  }}
                  title={!user ? TEXT.loginRequired : TEXT.useTemplateTitle}
                >
                  {TEXT.useTemplate}
                </Button>
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
              <Input id="workflow-name" value={workflowName} onChange={(event) => setWorkflowName(event.target.value)} placeholder={TEXT.workflowNamePlaceholder} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="workflow-description">{TEXT.workflowDescriptionLabel}</Label>
              <Textarea id="workflow-description" value={workflowDescription} onChange={(event) => setWorkflowDescription(event.target.value)} placeholder={TEXT.workflowDescriptionPlaceholder} rows={4} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => handleCreateModalOpenChange(false)}>{TEXT.cancel}</Button>
            <Button onClick={submitCreateWorkflow}>{TEXT.create}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TemplateLibrary;
