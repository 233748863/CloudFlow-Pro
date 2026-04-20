import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  RotateCcw,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  User,
  FileText,
  ArrowLeft,
  Filter,
  Loader2,
  ShieldOff,
  RefreshCw,
} from "lucide-react";
import {
  getArchivedWorkflows,
  restoreWorkflows,
  permanentDeleteWorkflows,
  BatchOperationResult,
} from "../../services/api/workflow";
import { toast } from "sonner";
import { useWorkflowPermission } from "../../hooks/useWorkflowPermission";
import { Button, DatePicker, Input } from "@/components/ui";
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
import { cn } from "@/utils/cn";

const elevatedPanelClassName =
  "rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/78";
const infoPanelClassName =
  "rounded-2xl border border-slate-200 bg-slate-50/90 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70";
const chipClassName =
  "rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300";

const getRestoreStatusMeta = (canRestore: boolean) =>
  canRestore
    ? {
        label: "可恢复",
        className:
          "border border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-200",
      }
    : {
        label: "不可恢复",
        className:
          "border border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-200",
      };

/**
 * 归档流程数据接口
 */
interface ArchivedWorkflow {
  id: string;
  workflowId: string;
  workflowName: string;
  archivedBy: string;
  archivedByName?: string;
  archivedAt: string;
  archiveReason: string;
  canRestore: boolean;
}

/**
 * 归档流程管理组件（管理员页面）
 * 显示归档流程列表，支持搜索、恢复和永久删除
 * 仅管理员可访问
 */
export const ArchivedWorkflows: React.FC = () => {
  const navigate = useNavigate();

  // 权限控制
  const {
    isAdmin,
    canAccessArchiveManagement,
    canBatchRestore,
    canPermanentDelete,
  } = useWorkflowPermission();

  // 归档流程列表
  const [workflows, setWorkflows] = useState<ArchivedWorkflow[]>([]);
  const [loading, setLoading] = useState(false);

  // 搜索和筛选条件
  const [searchTerm, setSearchTerm] = useState("");
  const [dateRange, setDateRange] = useState<{
    start: string;
    end: string;
  }>({ start: "", end: "" });
  const [appliedDateRange, setAppliedDateRange] = useState<{
    start: string;
    end: string;
  }>({ start: "", end: "" });
  const [showFilters, setShowFilters] = useState(false);

  // 分页
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);

  // 选中的流程
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // 操作状态
  const [restoring, setRestoring] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // 确认对话框
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string[]>([]);

  /**
   * 加载归档流程列表
   */
  const loadArchivedWorkflows = async () => {
    setLoading(true);
    try {
      const params: any = {
        pageNum: currentPage,
        pageSize: pageSize,
      };

      if (searchTerm.trim()) {
        params.keyword = searchTerm.trim();
      }
      if (appliedDateRange.start) {
        params.archivedAfter = appliedDateRange.start;
      }
      if (appliedDateRange.end) {
        params.archivedBefore = appliedDateRange.end;
      }

      const response = await getArchivedWorkflows(params);

      // request 拦截器已解包返回 data，这里直接按分页对象读取
      setWorkflows(response?.records || []);
      setTotal(response?.total || 0);
    } catch (error) {
      console.error("加载归档流程失败:", error);
      toast.error("加载归档流程失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadArchivedWorkflows();
  }, [currentPage, searchTerm, appliedDateRange]);

  /**
   * 处理搜索
   */
  const handleSearch = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
  };

  /**
   * 应用日期筛选
   */
  const applyDateFilter = () => {
    setCurrentPage(1);
    setAppliedDateRange(dateRange);
    setShowFilters(false);
  };

  /**
   * 清除筛选条件
   */
  const clearFilters = () => {
    setDateRange({ start: "", end: "" });
    setAppliedDateRange({ start: "", end: "" });
    setSearchTerm("");
    setCurrentPage(1);
  };

  /**
   * 全选/取消全选
   */
  const handleSelectAll = () => {
    if (visibleWorkflowIds.length === 0) {
      return;
    }

    setSelectedIds((prev) => {
      if (allSelected) {
        return prev.filter((id) => !visibleWorkflowIds.includes(id));
      }

      return Array.from(new Set([...prev, ...visibleWorkflowIds]));
    });
  };

  /**
   * 选择单个流程
   */
  const handleSelectOne = (workflowId: string) => {
    setSelectedIds((prev) =>
      prev.includes(workflowId)
        ? prev.filter((id) => id !== workflowId)
        : [...prev, workflowId],
    );
  };

  /**
   * 恢复归档流程
   */
  const handleRestore = async (workflowIds: string[]) => {
    if (workflowIds.length === 0) {
      toast.error("请选择要恢复的流程");
      return;
    }

    setRestoring(true);
    try {
      const result: BatchOperationResult = await restoreWorkflows(workflowIds);

      if (result.successCount > 0) {
        toast.success(`成功恢复 ${result.successCount} 个流程`);
        setSelectedIds([]);
        loadArchivedWorkflows();
      }

      if (result.failedCount > 0) {
        toast.error(`${result.failedCount} 个流程恢复失败`);
      }
    } catch (error: any) {
      console.error("恢复流程失败:", error);
      toast.error(error.message || "恢复流程失败");
    } finally {
      setRestoring(false);
    }
  };

  /**
   * 显示永久删除确认对话框
   */
  const showDeleteDialog = (workflowIds: string[]) => {
    if (workflowIds.length === 0) {
      toast.error("请选择要删除的流程");
      return;
    }
    setDeleteTarget(workflowIds);
    setShowDeleteConfirm(true);
  };

  /**
   * 永久删除流程
   */
  const handlePermanentDelete = async () => {
    if (deleteTarget.length === 0) return;

    setDeleting(true);
    try {
      const result: BatchOperationResult =
        await permanentDeleteWorkflows(deleteTarget);

      if (result.successCount > 0) {
        toast.success(`成功删除 ${result.successCount} 个流程`);
        setSelectedIds([]);
        setShowDeleteConfirm(false);
        setDeleteTarget([]);
        loadArchivedWorkflows();
      }

      if (result.failedCount > 0) {
        toast.error(`${result.failedCount} 个流程删除失败`);
      }
    } catch (error: any) {
      console.error("删除流程失败:", error);
      toast.error(error.message || "删除流程失败");
    } finally {
      setDeleting(false);
    }
  };

  /**
   * 格式化日期时间
   */
  const formatDateTime = (dateStr: string) => {
    if (!dateStr) return "-";
    const date = new Date(dateStr);
    return date.toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const hasActiveFilters = Boolean(
    searchTerm.trim() || appliedDateRange.start || appliedDateRange.end,
  );
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const restorableCount = workflows.filter(
    (workflow) => workflow.canRestore,
  ).length;
  const visibleWorkflowIds = workflows.map((workflow) => workflow.workflowId);
  const selectedVisibleCount = visibleWorkflowIds.filter((id) =>
    selectedIds.includes(id),
  ).length;
  const allSelected =
    visibleWorkflowIds.length > 0 &&
    selectedVisibleCount === visibleWorkflowIds.length;
  const selectedCount = selectedIds.length;
  const selectedWorkflows = workflows.filter((workflow) =>
    selectedIds.includes(workflow.workflowId),
  );
  const selectedRestorableCount = selectedWorkflows.filter(
    (workflow) => workflow.canRestore,
  ).length;
  const now = new Date();
  const todayLabel = `${now.getMonth() + 1}/${now.getDate()}`;
  const timeLabel = now.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const overviewItems = [
    { label: "当前结果", value: `${workflows.length} 条` },
    { label: "可恢复", value: `${restorableCount} 条` },
    {
      label: "日期筛选",
      value:
        appliedDateRange.start || appliedDateRange.end
          ? `${appliedDateRange.start || "不限"} - ${appliedDateRange.end || "不限"}`
          : "未启用",
    },
    { label: "批量选择", value: `${selectedCount} 条` },
  ];

  if (!isAdmin || !canAccessArchiveManagement) {
    return (
      <WorkspaceStatusPage
        icon={<ShieldOff size={28} className="text-amber-500" />}
        title="当前账号没有归档管理权限"
        description="归档流程管理仅对具备治理权限的账号开放。你可以先返回流程管理页继续查看和维护流程。"
        actions={
          <Button size="lg" onClick={() => navigate("/workflow/management")}>
            <ArrowLeft size={16} className="mr-2" />
            返回流程管理
          </Button>
        }
        iconWrapClassName="bg-amber-50 text-amber-500 dark:bg-amber-950/30 dark:text-amber-300"
        panelClassName="py-14"
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
                <FileText size={14} />
                {todayLabel}
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                {timeLabel}
              </span>
            </div>
          }
          title="归档流程管理"
          description="统一查看归档流程、恢复资格和清理动作，让归档管理页也保持与申请页一致的工作台结构。"
          actions={
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => navigate("/admin")}
                className="gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                返回后台
              </Button>
              <Button
                variant="outline"
                onClick={() => void loadArchivedWorkflows()}
                className="gap-2"
              >
                <RefreshCw
                  className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
                />
                刷新
              </Button>
            </div>
          }
          contentClassName="p-4 sm:p-5"
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <WorkspaceMetricCard
              label="归档总量"
              value={total}
              hint="接口返回的归档流程总记录数"
              aside={<FileText className="h-[18px] w-[18px] text-cyan-600 dark:text-cyan-300" />}
            />
            <WorkspaceMetricCard
              label="当前页"
              value={workflows.length}
              hint={`可恢复 ${restorableCount} 条`}
              aside={<RotateCcw className="h-[18px] w-[18px] text-sky-500 dark:text-sky-300" />}
            />
            <WorkspaceMetricCard
              label="批量选择"
              value={selectedCount}
              hint="用于批量恢复或永久删除"
              aside={
                <CheckCircle2 className="h-[18px] w-[18px] text-emerald-500" />
              }
            />
            <WorkspaceMetricCard
              label="筛选状态"
              value={hasActiveFilters ? "已启用" : "默认"}
              hint={
                hasActiveFilters
                  ? "已应用关键词或日期区间"
                  : "当前展示全部归档流程"
              }
              aside={<Filter className="h-[18px] w-[18px] text-amber-500 dark:text-amber-300" />}
            />
          </div>
        </WorkspaceHeroCard>

        <WorkspaceWorkbenchCard
          title="归档流程工作台"
          total={total}
          hasActiveFilters={hasActiveFilters}
          overviewItems={overviewItems}
          headerBadges={
            <div className="flex flex-wrap items-center gap-2 xl:justify-end">
              <span className={chipClassName}>
                {hasActiveFilters ? "已启用筛选" : "默认视图"}
              </span>
              <span className={chipClassName}>可恢复 {restorableCount} 条</span>
              <span className={chipClassName}>已选择 {selectedCount} 条</span>
            </div>
          }
          quickFilterAside={
            hasActiveFilters ? (
              <Button variant="outline" size="sm" onClick={clearFilters}>
                清空筛选
              </Button>
            ) : (
              <span className={chipClassName}>
                当前显示全部归档流程
              </span>
            )
          }
          filterBar={
            <div className="space-y-4">
              <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto_auto]">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                  <Input
                    value={searchTerm}
                    onChange={(event) => handleSearch(event.target.value)}
                    placeholder="搜索流程名称或归档原因..."
                    className="pl-10"
                  />
                </div>
                <Button
                  variant={
                    showFilters ||
                    appliedDateRange.start ||
                    appliedDateRange.end
                      ? "default"
                      : "outline"
                  }
                  onClick={() => setShowFilters((prev) => !prev)}
                  className="gap-2"
                >
                  <Filter size={16} />
                  日期筛选
                </Button>
                <Button
                  variant="outline"
                  onClick={() => void loadArchivedWorkflows()}
                  className="gap-2"
                >
                  <RefreshCw
                    className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
                  />
                  重新加载
                </Button>
              </div>
              {showFilters ? (
                <div className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-2 dark:border-slate-800 dark:bg-slate-900/70">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">
                      归档开始日期
                    </label>
                    <DatePicker
                      type="date"
                      value={dateRange.start}
                      onChange={(event) =>
                        setDateRange((prev) => ({
                          ...prev,
                          start: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">
                      归档结束日期
                    </label>
                    <DatePicker
                      type="date"
                      value={dateRange.end}
                      onChange={(event) =>
                        setDateRange((prev) => ({
                          ...prev,
                          end: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="md:col-span-2 flex justify-end">
                    <Button onClick={applyDateFilter}>应用筛选</Button>
                  </div>
                </div>
              ) : null}
            </div>
          }
        />

        <WorkspaceResultCard
          total={total}
          title="归档流程列表"
          description="批量工具、恢复操作和永久删除统一收口到这里。"
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
                prevDisabled={currentPage === 1}
                nextDisabled={currentPage >= totalPages}
              />
            ) : null
          }
        >
          <div className="space-y-4 px-4 py-4">
            {selectedIds.length > 0 ? (
              <div className="flex flex-col gap-4 rounded-2xl border border-cyan-200 bg-cyan-50/80 p-4 shadow-sm xl:flex-row xl:items-start xl:justify-between dark:border-cyan-900/70 dark:bg-cyan-950/30">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-cyan-700 dark:text-cyan-200">
                    <CheckCircle2 size={18} />
                    <span className="font-medium">
                      已选中 {selectedIds.length} 个流程
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className={chipClassName}>
                      当前页已选 {selectedVisibleCount} / {workflows.length}
                    </span>
                    <span className={chipClassName}>
                      可恢复 {selectedRestorableCount} 条
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() => void handleRestore(selectedIds)}
                    disabled={restoring || !canBatchRestore}
                    variant="soft"
                    className="border-emerald-200 bg-emerald-50 text-emerald-700 shadow-none hover:border-emerald-300 hover:bg-emerald-100 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-200 dark:hover:border-emerald-800 dark:hover:bg-emerald-950/50"
                  >
                    <RotateCcw size={16} />
                    批量恢复
                  </Button>
                  <Button
                    onClick={() => showDeleteDialog(selectedIds)}
                    disabled={deleting || !canPermanentDelete}
                    variant="outline"
                    className="border-rose-200 bg-rose-50 text-rose-700 hover:border-rose-300 hover:bg-rose-100 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-200 dark:hover:border-rose-800 dark:hover:bg-rose-950/50"
                  >
                    <Trash2 size={16} />
                    批量删除
                  </Button>
                  <Button variant="outline" onClick={() => setSelectedIds([])}>
                    取消选择
                  </Button>
                </div>
              </div>
            ) : null}

            {loading ? (
              <WorkspaceInlineState
                type="loading"
                title="正在加载归档流程..."
                className="py-12"
              />
            ) : workflows.length === 0 ? (
              <WorkspaceInlineState
                icon={<FileText size={28} className="text-cyan-600 dark:text-cyan-200" />}
                title="暂无归档流程"
                description="可以调整筛选条件，或等待新的流程归档记录出现。"
                className="py-12"
              />
            ) : (
              <>
                <div className={elevatedPanelClassName}>
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 space-y-3">
                      <div className="flex items-center gap-2 text-slate-900 dark:text-slate-100">
                        <CheckCircle2 size={18} className="text-cyan-600 dark:text-cyan-200" />
                        <span className="font-medium">当前结果概况</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={handleSelectAll}
                          className="h-9 rounded-full px-3 text-slate-600 hover:bg-slate-100 hover:text-cyan-600 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-cyan-200"
                        >
                          {allSelected
                            ? "取消全选当前页"
                            : `全选当前页 (${selectedVisibleCount}/${workflows.length})`}
                        </Button>
                        <span className={chipClassName}>总计 {total} 条</span>
                        <span className={chipClassName}>当前页 {workflows.length} 条</span>
                        <span className={chipClassName}>可恢复 {restorableCount} 条</span>
                      </div>
                      <div className="text-xs leading-6 text-slate-500 dark:text-slate-400">
                        归档流程支持恢复和永久删除两类治理动作。删除为不可逆操作，建议先在这里确认归档原因和恢复资格。
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span className={chipClassName}>
                        第 {currentPage} / {totalPages} 页
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  {workflows.map((workflow) => {
                    const selected = selectedIds.includes(workflow.workflowId);
                    const restoreMeta = getRestoreStatusMeta(workflow.canRestore);

                    return (
                      <div
                        key={workflow.id}
                        className={cn(
                          "rounded-2xl border p-4 transition-all shadow-sm",
                          selected
                            ? "border-cyan-200 bg-cyan-50/80 dark:border-cyan-900/70 dark:bg-cyan-950/30"
                            : "border-slate-200 bg-white/95 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950/78 dark:hover:border-slate-700 dark:hover:bg-slate-900/60",
                        )}
                      >
                        <div className="flex items-start gap-4">
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => handleSelectOne(workflow.workflowId)}
                            className="mt-1 h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500 dark:border-slate-700 dark:bg-slate-950"
                          />
                          <div className="min-w-0 flex-1 space-y-4">
                            <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                              <div className="min-w-0">
                                <div className="mb-2 flex flex-wrap items-center gap-2">
                                  <h3 className="truncate text-base font-semibold text-slate-900 dark:text-slate-100">
                                    {workflow.workflowName}
                                  </h3>
                                  <span
                                    className={cn(
                                      "rounded-full px-2.5 py-1 text-xs font-medium",
                                      restoreMeta.className,
                                    )}
                                  >
                                    {restoreMeta.label}
                                  </span>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  <span className={chipClassName}>
                                    归档于 {formatDateTime(workflow.archivedAt)}
                                  </span>
                                  <span className={chipClassName}>
                                    操作人 {workflow.archivedByName || workflow.archivedBy}
                                  </span>
                                </div>
                              </div>

                              <div className="flex shrink-0 flex-wrap items-center gap-2">
                                <Button
                                  onClick={() =>
                                    void handleRestore([workflow.workflowId])
                                  }
                                  disabled={
                                    !workflow.canRestore ||
                                    restoring ||
                                    !canBatchRestore
                                  }
                                  variant="soft"
                                  className="border-emerald-200 bg-emerald-50 text-emerald-700 shadow-none hover:border-emerald-300 hover:bg-emerald-100 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-200 dark:hover:border-emerald-800 dark:hover:bg-emerald-950/50"
                                >
                                  <RotateCcw size={14} />
                                  恢复
                                </Button>
                                <Button
                                  onClick={() =>
                                    showDeleteDialog([workflow.workflowId])
                                  }
                                  disabled={deleting || !canPermanentDelete}
                                  variant="outline"
                                  className="border-rose-200 bg-rose-50 text-rose-700 hover:border-rose-300 hover:bg-rose-100 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-200 dark:hover:border-rose-800 dark:hover:bg-rose-950/50"
                                >
                                  <Trash2 size={14} />
                                  删除
                                </Button>
                              </div>
                            </div>

                            <div className="grid gap-3 xl:grid-cols-2">
                              <div className={infoPanelClassName}>
                                <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                                  <Calendar size={14} />
                                  归档信息
                                </div>
                                <div className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
                                  <div className="flex items-center gap-2">
                                    <Calendar size={14} className="text-slate-400 dark:text-slate-500" />
                                    <span>归档时间：{formatDateTime(workflow.archivedAt)}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <User size={14} className="text-slate-400 dark:text-slate-500" />
                                    <span>操作人：{workflow.archivedByName || workflow.archivedBy}</span>
                                  </div>
                                </div>
                              </div>

                              <div className={infoPanelClassName}>
                                <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                                  <FileText size={14} />
                                  归档原因
                                </div>
                                <div
                                  className="text-sm leading-6 text-slate-600 dark:text-slate-300"
                                  title={workflow.archiveReason}
                                >
                                  {workflow.archiveReason || "未填写归档原因"}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </WorkspaceResultCard>

        {/* 永久删除确认对话框 */}
        {showDeleteConfirm && (
          <WorkspaceDialogShell
            title="确认永久删除"
            description={`即将永久删除 ${deleteTarget.length} 个归档流程，请再次确认。`}
            headerAside={<span className={chipClassName}>{deleteTarget.length} 个流程</span>}
            onClose={() => {
              if (deleting) return;
              setShowDeleteConfirm(false);
              setDeleteTarget([]);
            }}
            maxWidthClassName="max-w-md"
          >
            <div className="space-y-5">
              <div className="rounded-2xl border border-rose-200 bg-rose-50/80 px-4 py-4 text-sm dark:border-rose-900/70 dark:bg-rose-950/30">
                <div className="flex items-start gap-3">
                  <div className="rounded-xl border border-rose-200 bg-white p-2 text-rose-600 dark:border-rose-900/70 dark:bg-slate-950 dark:text-rose-200">
                    <AlertTriangle size={18} />
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium text-slate-900 dark:text-slate-100">
                      此操作不可恢复
                    </div>
                    <div className="mt-1 text-xs leading-6 text-slate-500 dark:text-slate-400">
                      永久删除会清空流程的版本历史和关联记录。请确认这些归档流程已不再需要保留。
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setDeleteTarget([]);
                  }}
                  disabled={deleting}
                >
                  取消
                </Button>
                <Button
                  onClick={handlePermanentDelete}
                  disabled={deleting}
                  variant="outline"
                  className="border-rose-200 bg-rose-50 text-rose-700 hover:border-rose-300 hover:bg-rose-100 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-200 dark:hover:border-rose-800 dark:hover:bg-rose-950/50"
                >
                  {deleting ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      删除中...
                    </>
                  ) : (
                    <>
                      <Trash2 size={16} />
                      确认删除
                    </>
                  )}
                </Button>
              </div>
            </div>
          </WorkspaceDialogShell>
        )}
      </WorkspacePageContent>
    </div>
  );
};

export default ArchivedWorkflows;
