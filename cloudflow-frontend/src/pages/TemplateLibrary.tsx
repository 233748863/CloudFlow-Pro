import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
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
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Button,
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
import {
  WorkspaceBackdrop,
  WorkspaceInlineState,
  WorkspacePageContent,
} from "@/components/workspace/WorkspacePrimitives";
import {
  WorkspaceDialogShell,
  WorkspaceHeroCard,
  WorkspaceMetricCard,
  WorkspacePaginationBar,
  WorkspaceResultCard,
  WorkspaceSectionCard,
  WorkspaceWorkbenchCard,
} from "@/components/workspace/WorkspacePanels";
import { useWorkflowPermission } from "@/hooks/useWorkflowPermission";
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
  pageTitle: "模板库",
  pageDescription:
    "从系统模板快速创建流程，让流程设计与发布体验保持在同一套工作台视觉语言下。",
  allTemplates: "全部模板",
  categoryNavigation: "分类导航",
  categoryNavigationDesc: "按业务域缩小模板范围，让流程设计入口更集中。",
  commonTags: "常用标签",
  commonTagsDesc: "直接点选常见业务标签，快速筛选当前模板。",
  searchPlaceholder: "搜索模板名称、描述或分类...",
  clearFilters: "清空筛选",
  gridView: "卡片视图",
  listView: "列表视图",
  currentResults: "当前结果",
  categoryCount: "分类数",
  activeFilters: "已生效筛选",
  currentView: "当前视图",
  filterSummary: "筛选摘要",
  noDescription: "暂无描述",
  systemTemplate: "系统",
  preview: "预览",
  useTemplate: "使用模板",
  templateUsage: "使用次数",
  nodeCount: "节点数",
  edgeCount: "连线数",
  category: "分类",
  tags: "标签",
  uncategorized: "未分类",
  loadTemplatesFailed: "加载模板列表失败",
  loadCategoriesFailed: "加载模板分类失败",
  emptyTitle: "暂无匹配模板",
  emptyDescription: "可以尝试清除筛选条件，或切换到其它分类查找流程模板。",
  retry: "重试",
  previousPage: "上一页",
  nextPage: "下一页",
  previewTitleSuffix: "模板预览",
  previewOverview: "模板概览",
  previewStructure: "流程结构预览",
  previewStructureDesc: "将流程节点与出边结构直接展示给设计人，减少跳转。",
  templateInfo: "模板信息",
  nodeTypes: "节点类型",
  nodeList: "节点清单",
  edgeList: "连线清单",
  edgeNotFound: "未解析到连线信息",
  invalidDefinition:
    "未解析到流程定义节点，请检查模板 definition 字段是否为标准 JSON 结构。",
  close: "关闭",
  createWorkflowFromTemplate: "从模板创建流程",
  createWorkflowDesc:
    "使用当前模板创建新流程，系统会自动带入已选模板的 nodes + edges 定义。",
  workflowName: "流程名称",
  workflowNameRequired: "请输入流程名称",
  workflowNamePlaceholder: "请输入流程名称",
  workflowDescriptionLabel: "流程描述",
  workflowDescriptionPlaceholder: "请输入流程描述（可选）",
  cancel: "取消",
  create: "创建",
  createSuccess: "流程创建成功",
  createFailed: "从模板创建流程失败",
  loginRequired: "请先登录后再使用模板创建流程",
  useTemplateTitle: "使用模板创建流程",
  noCategory: "暂无分类",
  noCategoryDesc: "系统还没有配置模板分类，仍可以通过关键词和标签查找模板。",
};

const DEFAULT_COMMON_TAGS = [
  "审批",
  "请假",
  "报销",
  "采购",
  "合同",
  "财务",
  "人事",
];
const EMPTY_GRAPH = { nodes: [], edges: [] } as {
  nodes: PreviewNode[];
  edges: PreviewEdge[];
};

const FILTER_CHIP_CLASS_NAME =
  "inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-sm text-slate-700 shadow-sm transition-colors hover:border-teal-200 hover:bg-teal-50 hover:text-teal-700";
const PANEL_STAT_LABEL_CLASS_NAME =
  "text-xs font-bold uppercase tracking-[0.14em] text-slate-400";
const PREVIEW_META_LABEL_CLASS_NAME =
  "text-[10px] font-bold uppercase tracking-wider text-slate-400";
const PREVIEW_SECTION_HEADER_CLASS_NAME =
  "border-b border-slate-100 px-5 py-3 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500";

const NODE_TYPE_LABELS: Record<string, string> = {
  START: "开始",
  APPROVAL: "审批",
  END: "结束",
  CC: "抄送",
  CONDITION: "条件",
  PARALLEL: "并行",
  TIMER: "定时",
  SUB_PROCESS: "子流程",
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
    return rawTags
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
};

const parseTemplateDefinition = (
  definition: unknown,
): { nodes: PreviewNode[]; edges: PreviewEdge[] } => {
  const graph = parseWorkflowGraphDefinition(definition);
  if (!graph) {
    return EMPTY_GRAPH;
  }

  const nodes = graph.nodes.map((item, index) => {
    const source = (item || {}) as Record<string, unknown>;
    return {
      id: String(source.id ?? `node-${index + 1}`),
      name: String(source.title ?? `节点 ${index + 1}`),
      type: String(source.type ?? "TASK"),
    };
  });

  const edges = graph.edges
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
      } as PreviewEdge;
    })
    .filter((item): item is PreviewEdge => Boolean(item));

  return { nodes, edges };
};

const countCategories = (nodes: CategoryNode[]): number =>
  nodes.reduce(
    (total, node) => total + 1 + countCategories(node.children || []),
    0,
  );

const findCategoryName = (
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

const formatNodeType = (type: string): string => {
  const key = String(type || "").toUpperCase();
  return NODE_TYPE_LABELS[key] || type;
};

const getTemplateMetrics = (
  template: TemplateItem,
  graph: { nodes: PreviewNode[]; edges: PreviewEdge[] },
) => [
  { label: TEXT.category, value: template.categoryName || TEXT.uncategorized },
  {
    label: TEXT.tags,
    value: normalizeTags(template.tags).slice(0, 2).join(" / ") || "-",
  },
  { label: TEXT.nodeCount, value: String(graph.nodes.length) },
  { label: TEXT.edgeCount, value: String(graph.edges.length) },
];

export const TemplateLibrary: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { canManageTemplates } = useWorkflowPermission();
  const entrySource = (searchParams.get("entry") || "").trim().toLowerCase();
  const fromCreateFlow = entrySource === "create";

  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [categories, setCategories] = useState<CategoryNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [recommendedTags, setRecommendedTags] =
    useState<string[]>(DEFAULT_COMMON_TAGS);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 12;
  const [total, setTotal] = useState(0);
  const [showPreview, setShowPreview] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<TemplateItem | null>(
    null,
  );
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

  const previewTags = useMemo(
    () => normalizeTags(previewTemplate?.tags),
    [previewTemplate],
  );

  const previewOverviewStats = useMemo(
    () => [
      { label: TEXT.nodeCount, value: String(previewGraph.nodes.length) },
      { label: TEXT.edgeCount, value: String(previewGraph.edges.length) },
      {
        label: TEXT.category,
        value: previewTemplate?.categoryName || TEXT.uncategorized,
      },
      {
        label: TEXT.templateUsage,
        value: String(previewTemplate?.usageCount || 0),
      },
    ],
    [previewGraph, previewTemplate],
  );

  const previewNodeTypes = useMemo(
    () =>
      Array.from(
        new Set(previewGraph.nodes.map((node) => formatNodeType(node.type))),
      ).slice(0, 8),
    [previewGraph],
  );

  const templateInsights = useMemo(
    () =>
      new Map(
        templates.map((template) => [
          template.id,
          parseTemplateDefinition(template.definition),
        ]),
      ),
    [templates],
  );

  const categoryCount = useMemo(
    () => countCategories(categories),
    [categories],
  );
  const selectedCategoryName = useMemo(() => {
    if (!selectedCategory) {
      return TEXT.allTemplates;
    }
    return findCategoryName(categories, selectedCategory) || TEXT.allTemplates;
  }, [categories, selectedCategory]);
  const hasActiveFilters =
    Boolean(searchTerm.trim()) ||
    Boolean(selectedCategory) ||
    selectedTags.length > 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const activeFilterCount =
    (selectedCategory ? 1 : 0) +
    selectedTags.length +
    (searchTerm.trim() ? 1 : 0);
  const heroTitle = fromCreateFlow ? "从模板创建流程" : TEXT.pageTitle;
  const heroDescription = fromCreateFlow
    ? "这是创建流程的第二步。先挑选合适模板，再生成流程草稿进入设计器；如果没有合适模板，也可以随时回到空白创建。"
    : TEXT.pageDescription;
  const viewModeLabel = viewMode === "grid" ? TEXT.gridView : TEXT.listView;
  const now = new Date();
  const todayLabel = `${now.getMonth() + 1}/${now.getDate()}`;
  const timeLabel = now.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const overviewItems = [
    { label: TEXT.currentResults, value: `${total} 个模板` },
    { label: TEXT.category, value: selectedCategoryName },
    { label: TEXT.activeFilters, value: `${activeFilterCount} 项` },
    { label: TEXT.currentView, value: viewModeLabel },
  ];

  const loadCategories = useCallback(async () => {
    try {
      const data = await request.get<CategoryNode[]>(
        "/workflow/templates/categories",
      );
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
      const params: Record<string, string | number> = {
        pageNum: currentPage,
        pageSize,
      };
      if (selectedCategory) {
        params.categoryId = selectedCategory;
      }
      if (selectedTags.length > 0) {
        params.tags = selectedTags.join(",");
      }
      if (searchTerm.trim()) {
        params.keyword = searchTerm.trim();
      }

      const data = await request.get<TemplateListResult>(
        "/workflow/templates",
        {
          params,
        },
      );
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

  const loadRecommendedTags = useCallback(async () => {
    try {
      const data = await request.get<string[]>("/workflow/templates/tags", {
        params: { limit: 12 },
      });
      if (Array.isArray(data) && data.length > 0) {
        setRecommendedTags(data);
        return;
      }
    } catch (error) {
      console.error("加载模板推荐标签失败", error);
    }
    setRecommendedTags(DEFAULT_COMMON_TAGS);
  }, []);

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

  useEffect(() => {
    void loadRecommendedTags();
  }, [loadRecommendedTags]);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((item) => item !== tag) : [...prev, tag],
    );
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
        },
      );
      toast.success(TEXT.createSuccess);
      handleCreateModalOpenChange(false);

      const definitionId = data?.definitionId;
      if (definitionId) {
        navigate(`/workflow/design?id=${definitionId}`);
      } else {
        navigate("/workflow/create");
      }
    } catch (error) {
      console.error(TEXT.createFailed, error);
      toast.error(TEXT.createFailed);
    }
  };

  const handleStartBlankWorkflow = () => {
    navigate("/workflow/design?mode=blank&entry=create");
  };

  const handleBackToCreateFlow = () => {
    navigate("/workflow/create");
  };

  const renderCategoryTree = (
    nodes: CategoryNode[],
    level = 0,
  ): React.ReactNode =>
    nodes.map((node) => {
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
              "h-9 w-full justify-start text-left text-sm font-medium",
              active
                ? "bg-teal-50 text-teal-700 hover:bg-teal-100"
                : "text-slate-600 hover:bg-slate-100",
            )}
            style={{ paddingLeft: `${level * 16 + 12}px` }}
          >
            <FolderOpen className="mr-2 h-4 w-4 shrink-0 text-slate-400" />
            <span className="flex-1 truncate">{node.name}</span>
            {Number(node.templateCount || 0) > 0 ? (
              <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
                {node.templateCount}
              </span>
            ) : null}
          </Button>
          {Array.isArray(node.children) && node.children.length > 0
            ? renderCategoryTree(node.children, level + 1)
            : null}
        </div>
      );
    });

  const renderTemplateCard = (template: TemplateItem) => {
    const graph = templateInsights.get(template.id) || EMPTY_GRAPH;
    const metrics = getTemplateMetrics(template, graph);

    return (
      <div
        key={template.id}
        className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
      >
        <div className="flex-1 p-5">
          <div className="mb-3 flex items-start justify-between gap-4">
            <div className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-500">
              <Layers3 className="mr-1.5 h-3.5 w-3.5 text-slate-400" />
              {template.categoryName || TEXT.uncategorized}
            </div>
            {template.isSystem ? (
              <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-600 ring-1 ring-emerald-100">
                {TEXT.systemTemplate}
              </span>
            ) : null}
          </div>

          <div>
            <h3 className="line-clamp-1 text-lg font-bold tracking-tight text-slate-800">
              {template.name}
            </h3>
            <p className="mt-2 min-h-[40px] line-clamp-2 text-sm leading-relaxed text-slate-500">
              {template.description || TEXT.noDescription}
            </p>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3">
            {metrics.map((metric) => (
              <div key={metric.label}>
                <div className="mb-0.5 text-xs text-slate-400">
                  {metric.label}
                </div>
                <div
                  className="truncate text-sm font-medium text-slate-700"
                  title={metric.value}
                >
                  {metric.value}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50/70 px-5 py-4">
          <div className="flex flex-col">
            <span className="text-xs text-slate-400">{TEXT.templateUsage}</span>
            <span className="text-sm font-bold text-slate-700">
              {template.usageCount || 0}
            </span>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePreview(template)}
            >
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
      <div
        key={template.id}
        className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
      >
        <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center">
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex items-center gap-3">
              <h3 className="truncate text-lg font-bold text-slate-800">
                {template.name}
              </h3>
              {template.isSystem ? (
                <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-600 ring-1 ring-emerald-100">
                  {TEXT.systemTemplate}
                </span>
              ) : null}
            </div>
            <p className="mb-3 text-sm text-slate-500">
              {template.description || TEXT.noDescription}
            </p>

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
              {tags.length > 0 ? (
                <div className="ml-auto flex items-center gap-1.5">
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-3 border-t border-slate-200 pt-4 lg:flex-col lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0 xl:flex-row">
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

  const renderLoadingState = () => (
    <div
      className={cn(
        viewMode === "grid"
          ? "grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3"
          : "space-y-4",
      )}
    >
      {Array.from({ length: viewMode === "grid" ? 6 : 4 }).map((_, index) => (
        <SkeletonCard
          key={index}
          className={viewMode === "list" ? "p-5" : ""}
        />
      ))}
    </div>
  );

  return (
    <div className="relative min-h-screen pb-6">
      <WorkspaceBackdrop />
      <WorkspacePageContent>
        <WorkspaceHeroCard
          badge={
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-slate-500">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-100 bg-teal-50 px-2.5 py-1 text-teal-700">
                <Workflow className="h-3.5 w-3.5" />
                {todayLabel}
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1">
                {timeLabel}
              </span>
            </div>
          }
          title={heroTitle}
          description={heroDescription}
          actions={
            <div className="flex flex-wrap gap-2">
              {fromCreateFlow ? (
                <>
                  <Button
                    variant="outline"
                    onClick={handleBackToCreateFlow}
                    className="gap-2"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    返回创建方式
                  </Button>
                  <Button onClick={handleStartBlankWorkflow} className="gap-2">
                    <Plus className="h-4 w-4" />
                    直接空白创建
                  </Button>
                </>
              ) : null}
              {canManageTemplates ? (
                <Button
                  variant="outline"
                  onClick={() => navigate("/templates/manage")}
                  className="gap-2"
                >
                  <FolderOpen className="h-4 w-4" />
                  管理模板
                </Button>
              ) : null}
            </div>
          }
          contentClassName="p-4 sm:p-5"
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <WorkspaceMetricCard
              label={TEXT.currentResults}
              value={total}
              hint="当前分页接口返回的模板总量"
              aside={<Layers3 className="h-[18px] w-[18px] text-teal-600" />}
            />
            <WorkspaceMetricCard
              label={TEXT.categoryCount}
              value={categoryCount}
              hint="按业务分类收拢模板入口"
              aside={
                <FolderOpen className="h-[18px] w-[18px] text-amber-500" />
              }
            />
            <WorkspaceMetricCard
              label={TEXT.activeFilters}
              value={activeFilterCount}
              hint="搜索词、分类与标签共同生效"
              aside={<Sparkles className="h-[18px] w-[18px] text-sky-500" />}
            />
            <WorkspaceMetricCard
              label={TEXT.currentView}
              value={viewModeLabel}
              hint="支持卡片浏览与列表对比"
              aside={
                viewMode === "grid" ? (
                  <Grid className="h-[18px] w-[18px] text-emerald-500" />
                ) : (
                  <List className="h-[18px] w-[18px] text-emerald-500" />
                )
              }
            />
          </div>
        </WorkspaceHeroCard>

        <WorkspaceWorkbenchCard
          title="模板筛选工作台"
          total={total}
          hasActiveFilters={hasActiveFilters}
          overviewItems={overviewItems}
          quickFilterAside={
            hasActiveFilters ? (
              <Button variant="outline" size="sm" onClick={clearFilters}>
                <X className="h-4 w-4" />
                {TEXT.clearFilters}
              </Button>
            ) : (
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-medium text-slate-400">
                当前显示默认视图
              </span>
            )
          }
          filterBar={
            <div className="space-y-4">
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    value={searchTerm}
                    onChange={(event) => {
                      setSearchTerm(event.target.value);
                      setCurrentPage(1);
                    }}
                    placeholder={TEXT.searchPlaceholder}
                    className="pl-10"
                  />
                </div>
                <div className="flex w-full flex-wrap items-center justify-end gap-2 lg:w-auto lg:flex-nowrap">
                  <div className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
                    <button
                      type="button"
                      onClick={() => setViewMode("grid")}
                      className={cn(
                        "rounded-lg px-3 py-1.5 text-[11px] font-medium transition",
                        viewMode === "grid"
                          ? "bg-slate-50 text-teal-700 shadow-sm"
                          : "text-slate-600 hover:bg-slate-50 hover:text-slate-700",
                      )}
                    >
                      <Grid className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode("list")}
                      className={cn(
                        "rounded-lg px-3 py-1.5 text-[11px] font-medium transition",
                        viewMode === "list"
                          ? "bg-slate-50 text-teal-700 shadow-sm"
                          : "text-slate-600 hover:bg-slate-50 hover:text-slate-700",
                      )}
                    >
                      <List className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>

              {hasActiveFilters ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-3">
                  <div className={PANEL_STAT_LABEL_CLASS_NAME}>
                    {TEXT.filterSummary}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selectedCategory ? (
                      <Button
                        variant="outline"
                        size="sm"
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
                      <Button
                        variant="outline"
                        size="sm"
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
                      <Button
                        variant="outline"
                        size="sm"
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
            </div>
          }
        />

        <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
          <div className="space-y-6">
            <WorkspaceSectionCard
              eyebrow="Navigation"
              title={TEXT.categoryNavigation}
              description={TEXT.categoryNavigationDesc}
            >
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
                    !selectedCategory ? "font-medium" : "text-slate-600",
                  )}
                >
                  <Layers3 className="mr-2 h-4 w-4 shrink-0 text-slate-400" />
                  <span className="flex-1 text-left">{TEXT.allTemplates}</span>
                  <span className="ml-2 text-xs text-slate-400">{total}</span>
                </Button>
                {categories.length > 0 ? (
                  renderCategoryTree(categories)
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-6 text-center text-sm text-slate-400">
                    {TEXT.noCategoryDesc}
                  </div>
                )}
              </div>
            </WorkspaceSectionCard>

            <WorkspaceSectionCard
              eyebrow="Tags"
              title={TEXT.commonTags}
              description={TEXT.commonTagsDesc}
            >
              <div className="flex flex-wrap gap-2">
                {recommendedTags.map((tag) => {
                  const active = selectedTags.includes(tag);
                  return (
                    <Button
                      key={tag}
                      type="button"
                      size="sm"
                      variant={active ? "default" : "outline"}
                      onClick={() => toggleTag(tag)}
                      className="h-8 text-xs"
                    >
                      {tag}
                    </Button>
                  );
                })}
              </div>
            </WorkspaceSectionCard>
          </div>

          <WorkspaceResultCard
            total={total}
            title={viewModeLabel}
            description={
              viewMode === "grid"
                ? "按卡片浏览模板摘要、分类和使用入口。"
                : "按列表横向比较模板结构、标签与使用频次。"
            }
            footer={
              total > pageSize ? (
                <WorkspacePaginationBar
                  total={total}
                  pageNum={currentPage}
                  totalPages={totalPages}
                  onPrev={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  onNext={() =>
                    setCurrentPage((page) => Math.min(totalPages, page + 1))
                  }
                  prevDisabled={currentPage <= 1}
                  nextDisabled={currentPage >= totalPages}
                />
              ) : null
            }
          >
            <div className="px-4 py-4">
              {loading ? (
                renderLoadingState()
              ) : loadError ? (
                <div className="py-4">
                  <EmptyState
                    icon={<Workflow className="h-12 w-12 text-slate-300" />}
                    title={TEXT.loadTemplatesFailed}
                    description={TEXT.emptyDescription}
                    action={{
                      label: TEXT.retry,
                      onClick: () => void loadTemplates(),
                    }}
                  />
                </div>
              ) : templates.length === 0 ? (
                <div className="py-4">
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
                <div className="space-y-4">
                  {templates.map(renderTemplateRow)}
                </div>
              )}
            </div>
          </WorkspaceResultCard>
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
                        <Workflow className="h-5 w-5 text-teal-600" />
                        {previewTemplate.name}
                      </DialogTitle>
                      <span className="rounded-full border border-teal-100 bg-teal-50 px-3 py-1 text-xs font-medium text-teal-700">
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
                      {previewTemplate.previewImage ? (
                        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                          <img
                            src={previewTemplate.previewImage}
                            alt={`${previewTemplate.name} preview`}
                            className="max-h-[240px] w-full object-cover"
                          />
                        </div>
                      ) : null}

                      <section className="space-y-5">
                        <div>
                          <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                            <Sparkles className="h-4 w-4 text-teal-600" />
                            {TEXT.previewOverview}
                          </div>
                          <div className="mt-1 text-sm leading-6 text-slate-500">
                            {TEXT.previewStructureDesc}
                          </div>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                          {previewOverviewStats.map((item) => (
                            <div
                              key={item.label}
                              className="rounded-2xl bg-white px-5 py-4 ring-1 ring-slate-200/70"
                            >
                              <div className={PREVIEW_META_LABEL_CLASS_NAME}>
                                {item.label}
                              </div>
                              <div
                                className="mt-2 truncate text-2xl font-bold text-slate-800"
                                title={item.value}
                              >
                                {item.value}
                              </div>
                            </div>
                          ))}
                        </div>

                        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,0.9fr)_minmax(0,0.95fr)]">
                          <div className="rounded-2xl bg-white/90 px-5 py-4 ring-1 ring-slate-200/70">
                            <div className={PREVIEW_META_LABEL_CLASS_NAME}>
                              {TEXT.templateInfo}
                            </div>
                            <p className="mt-2 text-sm leading-6 text-slate-500">
                              {previewTemplate.description ||
                                TEXT.noDescription}
                            </p>
                          </div>

                          <div className="rounded-2xl bg-white/90 px-5 py-4 ring-1 ring-slate-200/70">
                            <div className={PREVIEW_META_LABEL_CLASS_NAME}>
                              {TEXT.tags}
                            </div>
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
                              <div className="mt-2 text-sm text-slate-400">
                                -
                              </div>
                            )}
                          </div>

                          <div className="rounded-2xl bg-white/90 px-5 py-4 ring-1 ring-slate-200/70">
                            <div className={PREVIEW_META_LABEL_CLASS_NAME}>
                              {TEXT.nodeTypes}
                            </div>
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
                              <div className="mt-2 text-sm text-slate-400">
                                -
                              </div>
                            )}
                          </div>
                        </div>
                      </section>

                      <section className="space-y-4 px-1">
                        <div>
                          <div className="text-lg font-bold text-slate-900">
                            {TEXT.previewStructure}
                          </div>
                          <div className="mt-1 text-sm leading-6 text-slate-500">
                            {TEXT.previewStructureDesc}
                          </div>
                        </div>

                        {previewGraph.nodes.length > 0 ? (
                          <div className="rounded-[26px] bg-slate-100/80 p-5 lg:p-6">
                            <div className="flex items-center gap-4 overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
                              {previewGraph.nodes
                                .slice(0, 8)
                                .map((node, index) => (
                                  <React.Fragment key={node.id}>
                                    <div className="min-w-[220px] rounded-2xl bg-white px-5 py-4 ring-1 ring-slate-200/70">
                                      <div
                                        className={`${PREVIEW_META_LABEL_CLASS_NAME} mb-2`}
                                      >
                                        {formatNodeType(node.type)}
                                      </div>
                                      <div
                                        className="truncate text-lg font-bold text-slate-800"
                                        title={node.name}
                                      >
                                        {node.name}
                                      </div>
                                    </div>
                                    {index <
                                    Math.min(
                                      previewGraph.nodes.length - 1,
                                      7,
                                    ) ? (
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
                            <p className="text-sm leading-6 text-slate-500">
                              {TEXT.invalidDefinition}
                            </p>
                          </div>
                        )}
                      </section>

                      <div className="grid gap-5 xl:grid-cols-2">
                        <section className="overflow-hidden rounded-[28px] bg-white ring-1 ring-slate-200/70">
                          <div className={PREVIEW_SECTION_HEADER_CLASS_NAME}>
                            {TEXT.nodeList}
                          </div>
                          <div className="max-h-[320px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200">
                            {previewGraph.nodes.length === 0 ? (
                              <div className="flex items-center justify-center px-4 py-14 text-sm text-slate-400">
                                {TEXT.invalidDefinition}
                              </div>
                            ) : (
                              <div className="divide-y divide-slate-100">
                                {previewGraph.nodes.map((node) => (
                                  <div
                                    key={node.id}
                                    className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-slate-50/80"
                                  >
                                    <span className="truncate text-sm font-semibold text-slate-800">
                                      {node.name}
                                    </span>
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
                          <div className={PREVIEW_SECTION_HEADER_CLASS_NAME}>
                            {TEXT.edgeList}
                          </div>
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
                                      <span className="min-w-0 flex-1 truncate font-semibold">
                                        {edge.source}
                                      </span>
                                      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-300" />
                                      <span className="min-w-0 flex-1 truncate font-semibold">
                                        {edge.target}
                                      </span>
                                    </div>
                                    {edge.condition ? (
                                      <div className="mt-2 text-xs leading-5 text-slate-500">
                                        {edge.condition}
                                      </div>
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

                <DialogFooter className="gap-3 border-t border-slate-200 bg-white px-6 py-4 sm:flex-row sm:items-center sm:justify-end">
                  <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row">
                    <Button
                      variant="outline"
                      onClick={() => handlePreviewOpenChange(false)}
                    >
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

        {showCreateModal ? (
          <WorkspaceDialogShell
            title={TEXT.createWorkflowFromTemplate}
            description={TEXT.createWorkflowDesc}
            onClose={() => handleCreateModalOpenChange(false)}
            maxWidthClassName="max-w-2xl"
          >
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
                <Label htmlFor="workflow-description">
                  {TEXT.workflowDescriptionLabel}
                </Label>
                <Textarea
                  id="workflow-description"
                  value={workflowDescription}
                  onChange={(event) =>
                    setWorkflowDescription(event.target.value)
                  }
                  placeholder={TEXT.workflowDescriptionPlaceholder}
                  rows={4}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => handleCreateModalOpenChange(false)}
                >
                  {TEXT.cancel}
                </Button>
                <Button onClick={submitCreateWorkflow}>{TEXT.create}</Button>
              </div>
            </div>
          </WorkspaceDialogShell>
        ) : null}
      </WorkspacePageContent>
    </div>
  );
};

export default TemplateLibrary;
