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
  X,
  Loader2,
} from "lucide-react";
import {
  getArchivedWorkflows,
  restoreWorkflows,
  permanentDeleteWorkflows,
  BatchOperationResult,
} from "../../services/api/workflow";
import { toast } from "sonner";
import { useWorkflowPermission } from "../../hooks/useWorkflowPermission";
import { Button, Input, PermissionGuard } from "@/components/ui";
import {
  WorkspaceBackdrop,
  WorkspaceInlineState,
} from "@/components/workspace/WorkspacePrimitives";
import {
  WorkspaceDialogShell,
  WorkspaceHeroCard,
  WorkspaceMetricCard,
  WorkspacePaginationBar,
  WorkspaceResultCard,
  WorkspaceWorkbenchCard,
} from "@/components/workspace/WorkspacePanels";

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

  // 如果不是管理员，显示无权限提示
  if (!isAdmin || !canAccessArchiveManagement) {
    return (
      <PermissionGuard permissions={[]} roles={[]} hidden={false}>
        <div />
      </PermissionGuard>
    );
  }

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
    if (selectedIds.length === workflows.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(workflows.map((w) => w.workflowId));
    }
  };

  /**
   * 选择单个流程
   */
  const handleSelectOne = (workflowId: string) => {
    if (selectedIds.includes(workflowId)) {
      setSelectedIds(selectedIds.filter((id) => id !== workflowId));
    } else {
      setSelectedIds([...selectedIds, workflowId]);
    }
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
  const selectedCount = selectedIds.length;
  const now = new Date();
  const todayLabel = `${now.getMonth() + 1}/${now.getDate()}`;
  const timeLabel = now.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const allSelected =
    workflows.length > 0 && selectedIds.length === workflows.length;
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

  return (
    <div className="relative min-h-screen pb-6">
      <WorkspaceBackdrop />
      <div className="relative z-10 space-y-6 p-6">
        <WorkspaceHeroCard
          badge={
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-slate-500">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-pink-50 px-2.5 py-1 text-pink-600 ring-1 ring-pink-100">
                <FileText size={14} />
                {todayLabel}
              </span>
              <span className="rounded-full bg-white/80 px-2.5 py-1 ring-1 ring-slate-200/80">
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
                <Loader2
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
              aside={<FileText className="h-[18px] w-[18px] text-pink-500" />}
            />
            <WorkspaceMetricCard
              label="当前页"
              value={workflows.length}
              hint={`可恢复 ${restorableCount} 条`}
              aside={<RotateCcw className="h-[18px] w-[18px] text-sky-500" />}
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
              aside={<Filter className="h-[18px] w-[18px] text-amber-500" />}
            />
          </div>
        </WorkspaceHeroCard>

        <WorkspaceWorkbenchCard
          title="归档流程工作台"
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
                当前显示全部归档流程
              </span>
            )
          }
          filterBar={
            <div className="space-y-4">
              <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto_auto]">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
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
                  <Loader2
                    className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
                  />
                  重新加载
                </Button>
              </div>
              {showFilters ? (
                <div className="grid gap-4 rounded-[22px] border border-white/80 bg-white/60 p-4 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      归档开始日期
                    </label>
                    <input
                      type="date"
                      value={dateRange.start}
                      onChange={(event) =>
                        setDateRange((prev) => ({
                          ...prev,
                          start: event.target.value,
                        }))
                      }
                      className="cf-glass-input h-11 w-full rounded-2xl px-3.5 text-sm text-slate-700"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      归档结束日期
                    </label>
                    <input
                      type="date"
                      value={dateRange.end}
                      onChange={(event) =>
                        setDateRange((prev) => ({
                          ...prev,
                          end: event.target.value,
                        }))
                      }
                      className="cf-glass-input h-11 w-full rounded-2xl px-3.5 text-sm text-slate-700"
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
              <div className="flex flex-col gap-3 rounded-[24px] border border-blue-200 bg-blue-50/90 p-4 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex items-center gap-2 text-blue-700">
                  <CheckCircle2 size={18} />
                  <span className="font-medium">
                    已选中 {selectedIds.length} 个流程
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() => void handleRestore(selectedIds)}
                    disabled={restoring || !canBatchRestore}
                    className="bg-green-500 text-white hover:bg-green-600 [background-image:none]"
                  >
                    <RotateCcw size={16} />
                    批量恢复
                  </Button>
                  <Button
                    onClick={() => showDeleteDialog(selectedIds)}
                    disabled={deleting || !canPermanentDelete}
                    className="bg-red-500 text-white hover:bg-red-600 [background-image:none]"
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
                icon={<FileText size={28} />}
                title="暂无归档流程"
                description="可以调整筛选条件，或等待新的流程归档记录出现。"
                className="py-12"
              />
            ) : (
              <>
                <div className="flex items-center gap-4 rounded-[20px] border border-white/80 bg-white/72 px-4 py-3 text-sm text-slate-600 shadow-[0_10px_20px_rgba(15,23,42,0.04)]">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={handleSelectAll}
                    className="h-4 w-4 rounded text-pink-500 focus:ring-pink-500"
                  />
                  <span>
                    共 <span className="font-bold text-slate-800">{total}</span>{" "}
                    个归档流程
                  </span>
                </div>

                <div className="space-y-3">
                  {workflows.map((workflow) => (
                    <div
                      key={workflow.id}
                      className={`rounded-[24px] border p-4 transition-colors ${selectedIds.includes(workflow.workflowId) ? "border-blue-200 bg-blue-50/80" : "border-white/75 bg-white/80 hover:bg-white"}`}
                    >
                      <div className="flex items-start gap-4">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(workflow.workflowId)}
                          onChange={() => handleSelectOne(workflow.workflowId)}
                          className="mt-1 h-4 w-4 rounded text-pink-500 focus:ring-pink-500"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            <h3 className="truncate text-base font-semibold text-slate-800">
                              {workflow.workflowName}
                            </h3>
                            {!workflow.canRestore ? (
                              <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-600">
                                不可恢复
                              </span>
                            ) : null}
                          </div>
                          <div className="grid gap-3 text-sm text-slate-600 xl:grid-cols-3">
                            <div className="flex items-center gap-2">
                              <Calendar size={14} className="text-slate-400" />
                              <span>
                                归档时间：{formatDateTime(workflow.archivedAt)}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <User size={14} className="text-slate-400" />
                              <span>
                                操作人：
                                {workflow.archivedByName || workflow.archivedBy}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <FileText size={14} className="text-slate-400" />
                              <span
                                className="truncate"
                                title={workflow.archiveReason}
                              >
                                原因：{workflow.archiveReason}
                              </span>
                            </div>
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
                            className="bg-green-500 text-white hover:bg-green-600 [background-image:none]"
                          >
                            <RotateCcw size={14} />
                            恢复
                          </Button>
                          <Button
                            onClick={() =>
                              showDeleteDialog([workflow.workflowId])
                            }
                            disabled={deleting || !canPermanentDelete}
                            className="bg-red-500 text-white hover:bg-red-600 [background-image:none]"
                          >
                            <Trash2 size={14} />
                            删除
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
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
            onClose={() => {
              if (deleting) return;
              setShowDeleteConfirm(false);
              setDeleteTarget([]);
            }}
            maxWidthClassName="max-w-md"
          >
            <div className="space-y-5">
              <WorkspaceInlineState
                type="info"
                icon={<AlertTriangle size={18} className="text-red-500" />}
                title="此操作不可恢复"
                description="永久删除会清空流程的版本历史和关联记录。请确认这些归档流程已不再需要保留。"
                className="py-10"
              />

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setDeleteTarget([]);
                  }}
                  disabled={deleting}
                  className="rounded-2xl border border-white/85 bg-white/76 px-4 py-2 text-sm text-slate-600 shadow-[0_10px_20px_rgba(15,23,42,0.04)] transition hover:bg-white disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  onClick={handlePermanentDelete}
                  disabled={deleting}
                  className="inline-flex items-center gap-2 rounded-2xl bg-red-500 px-4 py-2 text-sm font-medium text-white shadow-[0_12px_24px_rgba(239,68,68,0.24)] transition hover:bg-red-600 disabled:opacity-50"
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
                </button>
              </div>
            </div>
          </WorkspaceDialogShell>
        )}
      </div>
    </div>
  );
};

export default ArchivedWorkflows;
