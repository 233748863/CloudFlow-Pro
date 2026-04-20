import React, { useEffect, useMemo, useState } from "react";
import {
  Edit,
  FolderOpen,
  FolderPlus,
  Plus,
  Save,
  Search,
  ShieldOff,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import request from "../../services/api/request";
import { useWorkflowPermission } from "../../hooks/useWorkflowPermission";
import {
  Button,
  Input,
  Table,
  TableBody,
  TableCell,
  TableActionHead,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
} from "@/components/ui";
import { TableRowActions } from "@/components/ui/table-row-actions";
import { ConfirmDialog } from "@/components/common";
import {
  WorkspaceBackdrop,
  WorkspaceInlineState,
  WorkspacePageContent,
  WorkspaceStatusPage,
} from "@/components/workspace/WorkspacePrimitives";
import {
  WorkspaceDialogShell,
  WorkspaceHeroCard,
  WorkspaceMetricCard,
  WorkspacePaginationBar,
  WorkspaceResultCard,
  WorkspaceWorkbenchCard,
} from "@/components/workspace/WorkspacePanels";
import { cn } from "@/utils/cn";

type TemplateStatus = "active" | "inactive";
type StatusFilter = "all" | "active" | "inactive";

interface TemplateItem {
  id: string;
  name: string;
  description?: string;
  categoryId: string;
  categoryName?: string;
  tags?: string[];
  usageCount?: number;
  status: TemplateStatus;
  definition?: unknown;
  previewImage?: string;
}

interface CategoryNode {
  id: string;
  name: string;
  description?: string;
  parentId?: string;
  orderNum?: number;
  templateCount?: number;
  children?: CategoryNode[];
}

interface FlatCategoryNode extends CategoryNode {
  depth: number;
}

interface TemplateListResult {
  records: TemplateItem[];
  total: number;
}

interface TemplateFormState {
  name: string;
  description: string;
  categoryId: string;
  tags: string[];
  definition: string;
  previewImage: string;
  status: TemplateStatus;
}

interface CategoryFormState {
  name: string;
  description: string;
  parentId: string;
  orderNum: number;
}

type DeleteTarget =
  | { type: "template"; id: string; name: string }
  | { type: "category"; id: string; name: string };

const PAGE_SIZE = 10;
const nativeSelectClassName =
  "h-11 w-full rounded-2xl border border-slate-200 bg-white px-3.5 text-sm text-slate-700 outline-none transition focus:border-slate-300 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:focus:border-slate-600";
const fieldLabelClassName =
  "mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200";
const chipClassName =
  "rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300";
const infoPanelClassName =
  "rounded-2xl border border-slate-200 bg-slate-50/90 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70";
const DEFAULT_TEMPLATE_DEFINITION = {
  nodes: [
    { id: "start", type: "START", title: "开始" },
    { id: "end", type: "END", title: "流程结束" },
  ],
  edges: [{ id: "start->end", source: "start", target: "end" }],
};

const createTemplateForm = (): TemplateFormState => ({
  name: "",
  description: "",
  categoryId: "",
  tags: [],
  definition: JSON.stringify(DEFAULT_TEMPLATE_DEFINITION, null, 2),
  previewImage: "",
  status: "active",
});

const createCategoryForm = (): CategoryFormState => ({
  name: "",
  description: "",
  parentId: "",
  orderNum: 0,
});

const flattenCategoryTree = (
  nodes: CategoryNode[],
  depth = 0,
  result: FlatCategoryNode[] = [],
): FlatCategoryNode[] => {
  nodes.forEach((node) => {
    result.push({ ...node, depth });
    if (node.children?.length)
      flattenCategoryTree(node.children, depth + 1, result);
  });
  return result;
};

const collectDescendantIds = (node: CategoryNode): Set<string> => {
  const ids = new Set<string>();
  const walk = (current?: CategoryNode) =>
    current?.children?.forEach((child) => {
      ids.add(child.id);
      walk(child);
    });
  walk(node);
  return ids;
};

const formatDateCN = (date: Date) => {
  const weekdays = [
    "星期日",
    "星期一",
    "星期二",
    "星期三",
    "星期四",
    "星期五",
    "星期六",
  ];
  return `${date.getMonth() + 1}月${date.getDate()}日 ${weekdays[date.getDay()]}`;
};

export const TemplateManagement = () => {
  const { isAdmin, canManageTemplates } = useWorkflowPermission();

  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [categories, setCategories] = useState<CategoryNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<TemplateItem | null>(
    null,
  );
  const [templateForm, setTemplateForm] =
    useState<TemplateFormState>(createTemplateForm);
  const [tagInput, setTagInput] = useState("");
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CategoryNode | null>(
    null,
  );
  const [categoryForm, setCategoryForm] =
    useState<CategoryFormState>(createCategoryForm);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  const flatCategories = useMemo(
    () => flattenCategoryTree(categories),
    [categories],
  );
  const selectableParentCategories = useMemo(() => {
    if (!editingCategory) return flatCategories;
    const descendants = collectDescendantIds(editingCategory);
    return flatCategories.filter(
      (item) => item.id !== editingCategory.id && !descendants.has(item.id),
    );
  }, [editingCategory, flatCategories]);

  const loadCategories = async () => {
    try {
      const data = await request.get<CategoryNode[]>(
        "/workflow/templates/categories",
      );
      setCategories(data || []);
    } catch (error) {
      console.error("加载模板分类失败:", error);
      toast.error("加载模板分类失败");
    }
  };

  const loadTemplates = async () => {
    setLoading(true);
    try {
      // 统一从筛选状态生成查询参数，避免列表、分页和筛选互相打架。
      const params: Record<string, string | number> = {
        pageNum: currentPage,
        pageSize: PAGE_SIZE,
        status: statusFilter,
      };
      if (selectedCategory) params.categoryId = selectedCategory;
      if (searchTerm.trim()) params.keyword = searchTerm.trim();
      const data = await request.get<TemplateListResult>(
        "/workflow/templates",
        { params },
      );
      setTemplates(data?.records || []);
      setTotal(data?.total || 0);
    } catch (error) {
      console.error("加载模板列表失败:", error);
      toast.error("加载模板列表失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadCategories();
  }, []);
  useEffect(() => {
    void loadTemplates();
  }, [currentPage, searchTerm, selectedCategory, statusFilter]);

  const clearFilters = () => {
    setSearchTerm("");
    setSelectedCategory("");
    setStatusFilter("all");
    setCurrentPage(1);
  };

  const openTemplateModal = (template?: TemplateItem) => {
    if (template) {
      setEditingTemplate(template);
      setTemplateForm({
        name: template.name || "",
        description: template.description || "",
        categoryId: template.categoryId || "",
        tags: template.tags || [],
        definition: JSON.stringify(
          template.definition || DEFAULT_TEMPLATE_DEFINITION,
          null,
          2,
        ),
        previewImage: template.previewImage || "",
        status: template.status || "active",
      });
    } else {
      setEditingTemplate(null);
      setTemplateForm(createTemplateForm());
    }
    setTagInput("");
    setShowTemplateModal(true);
  };

  const closeTemplateModal = () => {
    setShowTemplateModal(false);
    setEditingTemplate(null);
    setTemplateForm(createTemplateForm());
    setTagInput("");
  };

  const openCategoryModal = (category?: CategoryNode) => {
    if (category) {
      setEditingCategory(category);
      setCategoryForm({
        name: category.name || "",
        description: category.description || "",
        parentId: category.parentId || "",
        orderNum: category.orderNum ?? 0,
      });
    } else {
      setEditingCategory(null);
      setCategoryForm(createCategoryForm());
    }
    setShowCategoryModal(true);
  };

  const closeCategoryModal = () => {
    setShowCategoryModal(false);
    setEditingCategory(null);
    setCategoryForm(createCategoryForm());
  };

  const addTag = () => {
    const tag = tagInput.trim();
    if (!tag) return;
    if (templateForm.tags.includes(tag)) {
      toast.error("标签已存在");
      return;
    }
    setTemplateForm((prev) => ({ ...prev, tags: [...prev.tags, tag] }));
    setTagInput("");
  };

  const removeTag = (tag: string) => {
    setTemplateForm((prev) => ({
      ...prev,
      tags: prev.tags.filter((item) => item !== tag),
    }));
  };

  const saveTemplate = async () => {
    const name = templateForm.name.trim();
    if (!name) return void toast.error("请输入模板名称");
    if (!templateForm.categoryId) return void toast.error("请选择模板分类");
    if (templateForm.tags.length === 0)
      return void toast.error("请至少添加一个标签");

    let definitionData: unknown;
    try {
      // 模板定义仍以 JSON 文本编辑，保存前必须先做一次显式解析校验。
      definitionData = JSON.parse(templateForm.definition);
    } catch (error) {
      console.error("模板定义 JSON 解析失败:", error);
      return void toast.error("流程定义 JSON 格式不正确");
    }

    const payload = {
      name,
      description: templateForm.description.trim(),
      categoryId: templateForm.categoryId,
      tags: templateForm.tags,
      definition: definitionData,
      previewImage: templateForm.previewImage.trim(),
      status: templateForm.status,
    };

    try {
      if (editingTemplate) {
        await request.put(`/workflow/templates/${editingTemplate.id}`, payload);
        toast.success("模板更新成功");
      } else {
        await request.post("/workflow/templates", payload);
        toast.success("模板创建成功");
      }
      closeTemplateModal();
      await Promise.all([loadTemplates(), loadCategories()]);
    } catch (error) {
      console.error("保存模板失败:", error);
      toast.error("保存模板失败");
    }
  };

  const deleteTemplate = async (id: string) => {
    try {
      await request.delete(`/workflow/templates/${id}`);
      toast.success("模板删除成功");
      setDeleteTarget(null);
      await Promise.all([loadTemplates(), loadCategories()]);
    } catch (error) {
      console.error("删除模板失败:", error);
      toast.error("删除模板失败");
    }
  };

  const saveCategory = async () => {
    const name = categoryForm.name.trim();
    if (!name) return void toast.error("请输入分类名称");

    // 父分类为空时回传 null，由后端按顶级分类处理。
    const payload = {
      name,
      description: categoryForm.description.trim(),
      parentId: categoryForm.parentId || null,
      orderNum: categoryForm.orderNum ?? 0,
    };

    try {
      if (editingCategory) {
        await request.put(
          `/workflow/templates/categories/${editingCategory.id}`,
          payload,
        );
        toast.success("分类更新成功");
      } else {
        await request.post("/workflow/templates/categories", payload);
        toast.success("分类创建成功");
      }
      closeCategoryModal();
      await Promise.all([loadCategories(), loadTemplates()]);
    } catch (error) {
      console.error("保存分类失败:", error);
      toast.error("保存分类失败");
    }
  };

  const deleteCategory = async (category: CategoryNode) => {
    try {
      await request.delete(`/workflow/templates/categories/${category.id}`);
      toast.success("分类删除成功");
      if (selectedCategory === category.id) setSelectedCategory("");
      setDeleteTarget(null);
      await Promise.all([loadCategories(), loadTemplates()]);
    } catch (error) {
      console.error("删除分类失败:", error);
      toast.error("删除分类失败");
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;

    if (deleteTarget.type === "template") {
      await deleteTemplate(deleteTarget.id);
      return;
    }

    const category = flatCategories.find((item) => item.id === deleteTarget.id);
    if (!category) {
      toast.error("分类不存在或已被删除");
      setDeleteTarget(null);
      return;
    }
    await deleteCategory(category);
  };

  const activeTemplateCount = templates.filter(
    (item) => item.status === "active",
  ).length;
  const totalUsageCount = templates.reduce(
    (sum, item) => sum + Number(item.usageCount || 0),
    0,
  );
  const hasActiveFilters = Boolean(
    searchTerm.trim() || selectedCategory || statusFilter !== "all",
  );
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const now = new Date();
  const todayLabel = formatDateCN(now);
  const timeLabel = now.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const overviewItems = [
    { label: "当前结果", value: `${templates.length} 个模板` },
    { label: "分类数", value: `${flatCategories.length} 个` },
    { label: "启用模板", value: `${activeTemplateCount} 个` },
    { label: "使用次数", value: `${totalUsageCount} 次` },
  ];

  if (!isAdmin || !canManageTemplates) {
    return (
      <WorkspaceStatusPage
        icon={<ShieldOff size={28} className="text-amber-500" />}
        title="当前账号没有模板管理权限"
        description="模板管理仅对具备治理权限的账号开放。你可以先返回模板库或流程管理页继续查看内容。"
        iconWrapClassName="bg-amber-50 text-amber-500 dark:bg-amber-950/30 dark:text-amber-300"
      />
    );
  }

  return (
    <div className="relative min-h-screen pb-6">
      <WorkspaceBackdrop />
      <WorkspacePageContent>
        <WorkspaceHeroCard
          badge={
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-cyan-700 dark:border-cyan-900/70 dark:bg-cyan-950/30 dark:text-cyan-200">
                <FolderPlus className="h-3.5 w-3.5" />
                {todayLabel}
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                {timeLabel}
              </span>
            </div>
          }
          title="模板管理"
          description="模板分类、模板内容和维护入口统一回到工作台结构，功能完整保留，同时恢复到可维护的完整代码形态。"
          actions={
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => openCategoryModal()}>
                <FolderPlus className="h-4 w-4" />
                新建分类
              </Button>
              <Button onClick={() => openTemplateModal()}>
                <Plus className="h-4 w-4" />
                新建模板
              </Button>
            </div>
          }
          contentClassName="p-4 sm:p-5"
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <WorkspaceMetricCard
              label="模板总量"
              value={total}
              hint="接口返回的模板总记录数"
              aside={<Plus className="h-[18px] w-[18px] text-cyan-600 dark:text-cyan-300" />}
            />
            <WorkspaceMetricCard
              label="当前页"
              value={templates.length}
              hint="当前分页已加载模板数"
              aside={<Search className="h-[18px] w-[18px] text-sky-500 dark:text-sky-300" />}
            />
            <WorkspaceMetricCard
              label="分类数"
              value={flatCategories.length}
              hint="分类树中的可用分类节点数"
              aside={
                <FolderOpen className="h-[18px] w-[18px] text-amber-500 dark:text-amber-300" />
              }
            />
            <WorkspaceMetricCard
              label="启用模板"
              value={activeTemplateCount}
              hint={`累计使用 ${totalUsageCount} 次`}
              aside={<Save className="h-[18px] w-[18px] text-emerald-500 dark:text-emerald-300" />}
            />
          </div>
        </WorkspaceHeroCard>

        <WorkspaceWorkbenchCard
          title="模板工作台"
          total={total}
          hasActiveFilters={hasActiveFilters}
          overviewItems={overviewItems}
          headerBadges={
            <div className="flex flex-wrap items-center gap-2 xl:justify-end">
              <span className={chipClassName}>
                {hasActiveFilters ? "已启用筛选" : "默认视图"}
              </span>
              <span className={chipClassName}>分类 {flatCategories.length} 个</span>
              <span className={chipClassName}>启用模板 {activeTemplateCount} 个</span>
            </div>
          }
          quickFilterAside={
            hasActiveFilters ? (
              <Button variant="outline" size="sm" onClick={clearFilters}>
                清空筛选
              </Button>
            ) : (
              <span className={chipClassName}>
                当前显示默认视图
              </span>
            )
          }
          filterBar={
            <div className="grid grid-cols-1 gap-2.5 xl:grid-cols-[minmax(0,1fr)_220px_220px]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                <Input
                  type="text"
                  placeholder="搜索模板名称"
                  value={searchTerm}
                  onChange={(event) => {
                    setSearchTerm(event.target.value);
                    setCurrentPage(1);
                  }}
                  className="pl-10"
                />
              </div>
              <select
                value={selectedCategory}
                onChange={(event) => {
                  setSelectedCategory(event.target.value);
                  setCurrentPage(1);
                }}
                className={nativeSelectClassName}
              >
                <option value="">全部分类</option>
                {flatCategories.map((item) => (
                  <option key={item.id} value={item.id}>
                    {"　".repeat(item.depth)}
                    {item.name}
                  </option>
                ))}
              </select>
              <select
                value={statusFilter}
                onChange={(event) => {
                  setStatusFilter(event.target.value as StatusFilter);
                  setCurrentPage(1);
                }}
                className={nativeSelectClassName}
              >
                <option value="all">全部状态</option>
                <option value="active">仅启用</option>
                <option value="inactive">仅禁用</option>
              </select>
            </div>
          }
        />

        <WorkspaceResultCard
          total={flatCategories.length}
          title="分类管理"
          description="分类树与模板归属关系统一在同一工作台中维护。"
        >
          <div className="space-y-4 px-4 py-4">
            {flatCategories.length === 0 ? (
              <WorkspaceInlineState
                icon={<FolderPlus size={22} />}
                title="暂无分类"
                description="可以先创建分类，再为流程模板建立分组。"
                className="py-10"
              />
            ) : (
              <>
                <div className={infoPanelClassName}>
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                    <div className="space-y-2">
                      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        分类树概况
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <span className={chipClassName}>共 {flatCategories.length} 个分类节点</span>
                        <span className={chipClassName}>当前筛选 {selectedCategory ? "已指定分类" : "全部分类"}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <Table className="min-w-[760px]">
                  <TableHeader>
                    <tr>
                      <TableHead>分类名称</TableHead>
                      <TableHead>描述</TableHead>
                      <TableHead>模板数</TableHead>
                      <TableHead>排序</TableHead>
                      <TableActionHead className="w-48">操作</TableActionHead>
                    </tr>
                  </TableHeader>
                  <TableBody>
                  {flatCategories.map((category) => (
                    <TableRow
                      key={category.id}
                    >
                      <TableCell className="py-3 text-sm">
                        <span
                          style={{ paddingLeft: `${category.depth * 16}px` }}
                          className="inline-flex items-center gap-2 text-slate-700 dark:text-slate-200"
                        >
                          <FolderOpen className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                          {category.name}
                        </span>
                      </TableCell>
                      <TableCell className="py-3 text-sm text-slate-500 dark:text-slate-400">
                        {category.description || "-"}
                      </TableCell>
                      <TableCell className="py-3 text-sm text-slate-600 dark:text-slate-300">
                        {category.templateCount ?? 0}
                      </TableCell>
                      <TableCell className="py-3 text-sm text-slate-600 dark:text-slate-300">
                        {category.orderNum ?? 0}
                      </TableCell>
                      <TableCell className="py-3 whitespace-nowrap text-right">
                        <TableRowActions
                          align="end"
                          actions={[
                            {
                              label: "编辑",
                              icon: <Edit className="h-4 w-4" />,
                              onClick: () => openCategoryModal(category),
                              tone: "primary",
                            },
                            {
                              label: "删除",
                              icon: <Trash2 className="h-4 w-4" />,
                              onClick: () =>
                                setDeleteTarget({
                                  type: "category",
                                  id: category.id,
                                  name: category.name,
                                }),
                              tone: "danger",
                            },
                          ]}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                  </TableBody>
                </Table>
              </>
            )}
          </div>
        </WorkspaceResultCard>

        <WorkspaceResultCard
          total={total}
          title="模板列表"
          description="统一展示模板分类、标签、使用次数和状态。"
          footer={
            <WorkspacePaginationBar
              total={total}
              pageNum={currentPage}
              totalPages={totalPages}
              onPrev={() => setCurrentPage((page) => Math.max(1, page - 1))}
              onNext={() =>
                setCurrentPage((page) => Math.min(totalPages, page + 1))
              }
              prevDisabled={currentPage === 1}
              nextDisabled={currentPage >= totalPages}
            />
          }
        >
          <div className="space-y-4 px-4 py-4">
            {loading ? (
              <WorkspaceInlineState
                type="loading"
                title="正在加载模板..."
                className="py-12"
              />
            ) : templates.length === 0 ? (
              <WorkspaceInlineState
                icon={<FolderPlus size={24} />}
                title="暂无模板"
                description="可以先新建模板，再逐步沉淀业务流程标准。"
                className="py-12"
              />
            ) : (
              <>
                <div className={infoPanelClassName}>
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                    <div className="space-y-2">
                      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        模板结果概况
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <span className={chipClassName}>共 {total} 个模板</span>
                        <span className={chipClassName}>当前页 {templates.length} 个</span>
                        <span className={chipClassName}>启用 {activeTemplateCount} 个</span>
                        <span className={chipClassName}>累计使用 {totalUsageCount} 次</span>
                      </div>
                    </div>
                  </div>
                </div>

                <Table className="min-w-[980px]">
                <TableHeader>
                  <tr>
                    <TableHead>模板名称</TableHead>
                    <TableHead>分类</TableHead>
                    <TableHead>标签</TableHead>
                    <TableHead>使用次数</TableHead>
                    <TableHead>状态</TableHead>
                    <TableActionHead className="w-52">操作</TableActionHead>
                  </tr>
                </TableHeader>
                <TableBody>
                  {templates.map((template) => (
                    <TableRow
                      key={template.id}
                    >
                      <TableCell className="py-4">
                        <div>
                          <div className="font-medium text-slate-900 dark:text-slate-100">
                            {template.name}
                          </div>
                          <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                            {template.description || "-"}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="py-4 text-sm text-slate-600 dark:text-slate-300">
                        {template.categoryName || "-"}
                      </TableCell>
                      <TableCell className="py-4">
                        <div className="flex flex-wrap gap-1">
                          {template.tags?.slice(0, 3).map((tag) => (
                            <span
                              key={tag}
                              className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                            >
                              {tag}
                            </span>
                          ))}
                          {(template.tags?.length || 0) > 3 ? (
                            <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                              +{(template.tags?.length || 0) - 3}
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="py-4 text-sm text-slate-600 dark:text-slate-300">
                        {template.usageCount ?? 0}
                      </TableCell>
                      <TableCell className="py-4">
                        <span
                          className={cn(
                            "rounded-full px-2.5 py-1 text-xs font-medium",
                            template.status === "active"
                              ? "border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-200"
                              : "border border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300",
                          )}
                        >
                          {template.status === "active" ? "启用" : "禁用"}
                        </span>
                      </TableCell>
                      <TableCell className="py-4 whitespace-nowrap text-right">
                        <TableRowActions
                          align="end"
                          actions={[
                            {
                              label: "编辑",
                              icon: <Edit className="h-4 w-4" />,
                              onClick: () => openTemplateModal(template),
                              tone: "primary",
                            },
                            {
                              label: "删除",
                              icon: <Trash2 className="h-4 w-4" />,
                              onClick: () =>
                                setDeleteTarget({
                                  type: "template",
                                  id: template.id,
                                  name: template.name,
                                }),
                              tone: "danger",
                            },
                          ]}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </>
            )}
          </div>
        </WorkspaceResultCard>

        {showTemplateModal ? (
          <WorkspaceDialogShell
            title={editingTemplate ? "编辑模板" : "新建模板"}
            description="统一维护模板名称、分类、标签与流程定义。"
            onClose={closeTemplateModal}
            maxWidthClassName="max-w-4xl"
            headerAside={<span className={chipClassName}>{editingTemplate ? "模板编辑" : "模板新建"}</span>}
          >
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className={fieldLabelClassName}>
                    模板名称 <span className="text-red-500">*</span>
                  </label>
                  <Input
                    value={templateForm.name}
                    onChange={(event) =>
                      setTemplateForm((prev) => ({
                        ...prev,
                        name: event.target.value,
                      }))
                    }
                    placeholder="请输入模板名称"
                  />
                </div>
                <div>
                  <label className={fieldLabelClassName}>
                    分类 <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={templateForm.categoryId}
                    onChange={(event) =>
                      setTemplateForm((prev) => ({
                        ...prev,
                        categoryId: event.target.value,
                      }))
                    }
                    className={nativeSelectClassName}
                  >
                    <option value="">请选择分类</option>
                    {flatCategories.map((item) => (
                      <option key={item.id} value={item.id}>
                        {"　".repeat(item.depth)}
                        {item.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className={fieldLabelClassName}>
                  模板描述
                </label>
                <Textarea
                  rows={3}
                  value={templateForm.description}
                  onChange={(event) =>
                    setTemplateForm((prev) => ({
                      ...prev,
                      description: event.target.value,
                    }))
                  }
                  placeholder="请输入模板描述"
                />
              </div>
              <div className={infoPanelClassName}>
                <label className={fieldLabelClassName}>
                  标签 <span className="text-red-500">*</span>
                </label>
                <div className="mb-2 flex gap-2">
                  <Input
                    value={tagInput}
                    onChange={(event) => setTagInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        addTag();
                      }
                    }}
                    placeholder="输入标签后按回车"
                  />
                  <Button type="button" variant="outline" onClick={addTag}>
                    添加
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {templateForm.tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-medium text-cyan-700 dark:border-cyan-900/70 dark:bg-cyan-950/30 dark:text-cyan-200"
                    >
                      {tag}
                      <button
                        type="button"
                        onClick={() => removeTag(tag)}
                        className="text-cyan-700 dark:text-cyan-200"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <label className={fieldLabelClassName}>
                  流程定义（JSON） <span className="text-red-500">*</span>
                </label>
                <Textarea
                  rows={8}
                  className="font-mono"
                  value={templateForm.definition}
                  onChange={(event) =>
                    setTemplateForm((prev) => ({
                      ...prev,
                      definition: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className={fieldLabelClassName}>
                    预览图 URL
                  </label>
                  <Input
                    value={templateForm.previewImage}
                    onChange={(event) =>
                      setTemplateForm((prev) => ({
                        ...prev,
                        previewImage: event.target.value,
                      }))
                    }
                    placeholder="可选"
                  />
                </div>
                <div>
                  <label className={fieldLabelClassName}>
                    状态
                  </label>
                  <select
                    value={templateForm.status}
                    onChange={(event) =>
                      setTemplateForm((prev) => ({
                        ...prev,
                        status: event.target.value as TemplateStatus,
                      }))
                    }
                    className={nativeSelectClassName}
                  >
                    <option value="active">启用</option>
                    <option value="inactive">禁用</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={closeTemplateModal}>
                  取消
                </Button>
                <Button onClick={saveTemplate}>
                  <Save className="h-4 w-4" />
                  保存
                </Button>
              </div>
            </div>
          </WorkspaceDialogShell>
        ) : null}

        {showCategoryModal ? (
          <WorkspaceDialogShell
            title={editingCategory ? "编辑分类" : "新建分类"}
            description="维护模板分类的层级、名称和排序。"
            onClose={closeCategoryModal}
            maxWidthClassName="max-w-2xl"
            headerAside={<span className={chipClassName}>{editingCategory ? "分类编辑" : "分类新建"}</span>}
          >
            <div className="space-y-4">
              <div>
                <label className={fieldLabelClassName}>
                  父分类
                </label>
                <select
                  value={categoryForm.parentId}
                  onChange={(event) =>
                    setCategoryForm((prev) => ({
                      ...prev,
                      parentId: event.target.value,
                    }))
                  }
                  className={nativeSelectClassName}
                >
                  <option value="">无（顶级分类）</option>
                  {selectableParentCategories.map((item) => (
                    <option key={item.id} value={item.id}>
                      {"　".repeat(item.depth)}
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={fieldLabelClassName}>
                  分类名称 <span className="text-red-500">*</span>
                </label>
                <Input
                  value={categoryForm.name}
                  onChange={(event) =>
                    setCategoryForm((prev) => ({
                      ...prev,
                      name: event.target.value,
                    }))
                  }
                  placeholder="请输入分类名称"
                />
              </div>
              <div>
                <label className={fieldLabelClassName}>
                  分类描述
                </label>
                <Textarea
                  rows={3}
                  value={categoryForm.description}
                  onChange={(event) =>
                    setCategoryForm((prev) => ({
                      ...prev,
                      description: event.target.value,
                    }))
                  }
                  placeholder="请输入分类描述（可选）"
                />
              </div>
              <div>
                <label className={fieldLabelClassName}>
                  排序号
                </label>
                <Input
                  type="number"
                  value={categoryForm.orderNum}
                  onChange={(event) =>
                    setCategoryForm((prev) => ({
                      ...prev,
                      orderNum: Number.parseInt(event.target.value, 10) || 0,
                    }))
                  }
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={closeCategoryModal}>
                  取消
                </Button>
                <Button onClick={saveCategory}>保存</Button>
              </div>
            </div>
          </WorkspaceDialogShell>
        ) : null}

        <ConfirmDialog
          open={Boolean(deleteTarget)}
          title={deleteTarget?.type === "template" ? "确认删除模板" : "确认删除分类"}
          message={
            deleteTarget?.type === "template"
              ? `确定要删除模板“${deleteTarget.name}”吗？此操作不可恢复。`
              : `确定要删除分类“${deleteTarget?.name || ""}”吗？`
          }
          confirmText="确认删除"
          cancelText="取消"
          danger={true}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => void confirmDelete()}
        />
      </WorkspacePageContent>
    </div>
  );
};

export default TemplateManagement;
