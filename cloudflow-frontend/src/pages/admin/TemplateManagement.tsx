import React, { useEffect, useMemo, useState } from "react";
import {
  Edit,
  FolderOpen,
  FolderPlus,
  Plus,
  Save,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import request from "../../services/api/request";
import { useWorkflowPermission } from "../../hooks/useWorkflowPermission";
import {
  Button,
  Input,
  PermissionGuard,
  TableActionHead,
  TableHead,
  TableHeader,
  Textarea,
} from "@/components/ui";
import { TableRowActions } from "@/components/ui/table-row-actions";
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
  WorkspaceWorkbenchCard,
} from "@/components/workspace/WorkspacePanels";

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

const PAGE_SIZE = 10;
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

  if (!isAdmin || !canManageTemplates) {
    return (
      <PermissionGuard permissions={[]} roles={[]} hidden={false}>
        <div />
      </PermissionGuard>
    );
  }

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
    if (!window.confirm("确定要删除此模板吗？此操作不可恢复。")) return;
    try {
      await request.delete(`/workflow/templates/${id}`);
      toast.success("模板删除成功");
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
    if (!window.confirm(`确定要删除分类“${category.name}”吗？`)) return;
    try {
      await request.delete(`/workflow/templates/categories/${category.id}`);
      toast.success("分类删除成功");
      if (selectedCategory === category.id) setSelectedCategory("");
      await Promise.all([loadCategories(), loadTemplates()]);
    } catch (error) {
      console.error("删除分类失败:", error);
      toast.error("删除分类失败");
    }
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

  return (
    <div className="relative min-h-screen pb-6">
      <WorkspaceBackdrop />
      <WorkspacePageContent>
        <WorkspaceHeroCard
          badge={
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-slate-500">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-pink-50 px-2.5 py-1 text-pink-600 ring-1 ring-pink-100">
                <FolderPlus className="h-3.5 w-3.5" />
                {todayLabel}
              </span>
              <span className="rounded-full bg-white/80 px-2.5 py-1 ring-1 ring-slate-200/80">
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
              aside={<Plus className="h-[18px] w-[18px] text-pink-500" />}
            />
            <WorkspaceMetricCard
              label="当前页"
              value={templates.length}
              hint="当前分页已加载模板数"
              aside={<Search className="h-[18px] w-[18px] text-sky-500" />}
            />
            <WorkspaceMetricCard
              label="分类数"
              value={flatCategories.length}
              hint="分类树中的可用分类节点数"
              aside={
                <FolderOpen className="h-[18px] w-[18px] text-amber-500" />
              }
            />
            <WorkspaceMetricCard
              label="启用模板"
              value={activeTemplateCount}
              hint={`累计使用 ${totalUsageCount} 次`}
              aside={<Save className="h-[18px] w-[18px] text-emerald-500" />}
            />
          </div>
        </WorkspaceHeroCard>

        <WorkspaceWorkbenchCard
          title="模板工作台"
          total={total}
          hasActiveFilters={hasActiveFilters}
          overviewItems={overviewItems}
          quickFilterAside={
            hasActiveFilters ? (
              <Button variant="outline" size="sm" onClick={clearFilters}>
                清空筛选
              </Button>
            ) : (
              <span className="rounded-full bg-white/82 px-3 py-1.5 text-[11px] font-medium text-slate-400 ring-1 ring-white/80 shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
                当前显示默认视图
              </span>
            )
          }
          filterBar={
            <div className="grid grid-cols-1 gap-2.5 xl:grid-cols-[minmax(0,1fr)_220px_220px]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
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
                className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-3.5 text-sm text-slate-700 outline-none transition focus:border-slate-300"
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
                className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-3.5 text-sm text-slate-700 outline-none transition focus:border-slate-300"
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
          <div className="overflow-x-auto">
            {flatCategories.length === 0 ? (
              <WorkspaceInlineState
                icon={<FolderPlus size={22} />}
                title="暂无分类"
                description="可以先创建分类，再为流程模板建立分组。"
                className="py-10"
              />
            ) : (
              <table className="w-full min-w-[760px]">
                <TableHeader>
                  <tr>
                    <TableHead>分类名称</TableHead>
                    <TableHead>描述</TableHead>
                    <TableHead>模板数</TableHead>
                    <TableHead>排序</TableHead>
                    <TableActionHead className="w-48">操作</TableActionHead>
                  </tr>
                </TableHeader>
                <tbody className="divide-y divide-slate-100">
                  {flatCategories.map((category) => (
                    <tr
                      key={category.id}
                      className="border-b border-slate-100 transition-colors hover:bg-slate-50/70"
                    >
                      <td className="px-4 py-3 text-sm text-slate-700">
                        <span
                          style={{ paddingLeft: `${category.depth * 16}px` }}
                        >
                          {category.name}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-500">
                        {category.description || "-"}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {category.templateCount ?? 0}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {category.orderNum ?? 0}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right">
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
                              onClick: () => deleteCategory(category),
                              tone: "danger",
                            },
                          ]}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
          <div className="overflow-x-auto">
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
              <table className="w-full min-w-[980px]">
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
                <tbody className="divide-y divide-slate-100">
                  {templates.map((template) => (
                    <tr
                      key={template.id}
                      className="border-b border-slate-100 transition-colors hover:bg-slate-50/70"
                    >
                      <td className="px-4 py-4">
                        <div>
                          <div className="font-medium text-slate-900">
                            {template.name}
                          </div>
                          <div className="mt-1 text-sm text-slate-500">
                            {template.description || "-"}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-sm text-slate-600">
                        {template.categoryName || "-"}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-wrap gap-1">
                          {template.tags?.slice(0, 3).map((tag) => (
                            <span
                              key={tag}
                              className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600"
                            >
                              {tag}
                            </span>
                          ))}
                          {(template.tags?.length || 0) > 3 ? (
                            <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-500">
                              +{(template.tags?.length || 0) - 3}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-sm text-slate-600">
                        {template.usageCount ?? 0}
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${template.status === "active" ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100" : "bg-slate-100 text-slate-600 ring-1 ring-slate-200/80"}`}
                        >
                          {template.status === "active" ? "启用" : "禁用"}
                        </span>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-right">
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
                              onClick: () => deleteTemplate(template.id),
                              tone: "danger",
                            },
                          ]}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </WorkspaceResultCard>

        {showTemplateModal ? (
          <WorkspaceDialogShell
            title={editingTemplate ? "编辑模板" : "新建模板"}
            description="统一维护模板名称、分类、标签与流程定义。"
            onClose={closeTemplateModal}
            maxWidthClassName="max-w-4xl"
          >
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
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
                  <label className="mb-2 block text-sm font-medium text-slate-700">
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
                    className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-3.5 text-sm text-slate-700 outline-none transition focus:border-slate-300"
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
                <label className="mb-2 block text-sm font-medium text-slate-700">
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
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
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
                      className="inline-flex items-center gap-2 rounded-full bg-pink-50 px-3 py-1 text-xs font-medium text-pink-600 ring-1 ring-pink-100"
                    >
                      {tag}
                      <button type="button" onClick={() => removeTag(tag)}>
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
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
                  <label className="mb-2 block text-sm font-medium text-slate-700">
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
                  <label className="mb-2 block text-sm font-medium text-slate-700">
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
                    className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-3.5 text-sm text-slate-700 outline-none transition focus:border-slate-300"
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
          >
            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
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
                  className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-3.5 text-sm text-slate-700 outline-none transition focus:border-slate-300"
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
                <label className="mb-2 block text-sm font-medium text-slate-700">
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
                <label className="mb-2 block text-sm font-medium text-slate-700">
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
                <label className="mb-2 block text-sm font-medium text-slate-700">
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
      </WorkspacePageContent>
    </div>
  );
};

export default TemplateManagement;
