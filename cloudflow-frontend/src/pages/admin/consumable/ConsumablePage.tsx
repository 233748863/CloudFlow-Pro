import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  Loader2,
  Package,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { consumableApi, Consumable } from "@/services/api/consumable";
import { TableRowActions } from "@/components/ui/table-row-actions";
import {
  Button,
  Input,
  TableActionHead,
  TableHead,
  TableHeader,
} from "@/components/ui";
import {
  WorkspaceBackdrop,
  WorkspaceTableStateRow,
} from "@/components/workspace/WorkspacePrimitives";
import {
  WorkspaceDialogShell,
  WorkspaceHeroCard,
  WorkspaceMetricCard,
  WorkspacePaginationBar,
  WorkspaceResultCard,
  WorkspaceWorkbenchCard,
} from "@/components/workspace/WorkspacePanels";
import { getErrorMessage } from "@/utils/errorMessage";

/** 耗材管理页面 */
const ConsumablePage: React.FC = () => {
  const [list, setList] = useState<Consumable[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [pageNum, setPageNum] = useState(1);
  const [pageSize] = useState(10);
  const [searchName, setSearchName] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [showStockModal, setShowStockModal] = useState(false);
  const [stockAction, setStockAction] = useState<"add" | "reduce">("add");
  const [stockQuantity, setStockQuantity] = useState(1);
  const [currentItem, setCurrentItem] = useState<Consumable | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState<Consumable>({
    name: "",
    model: "",
    unit: "个",
    quantity: 0,
    lowStockThreshold: 10,
  });

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const data: any = await consumableApi.list({
        pageNum,
        pageSize,
        name: searchName || undefined,
      });
      setList(data?.records || []);
      setTotal(data?.total || 0);
    } catch (error) {
      toast.error(getErrorMessage(error, "加载耗材列表失败"));
    } finally {
      setLoading(false);
    }
  }, [pageNum, pageSize, searchName]);

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  const handleSearch = () => {
    setPageNum(1);
    void fetchList();
  };

  const handleReset = () => {
    setSearchName("");
    setPageNum(1);
    setTimeout(() => {
      void fetchList();
    }, 0);
  };

  const handleAdd = () => {
    setFormData({
      name: "",
      model: "",
      unit: "个",
      quantity: 0,
      lowStockThreshold: 10,
    });
    setCurrentItem(null);
    setShowForm(true);
  };

  const handleEdit = (item: Consumable) => {
    setFormData({ ...item });
    setCurrentItem(item);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error("请输入耗材名称");
      return;
    }

    setSubmitting(true);
    try {
      if (currentItem?.consumableId) {
        await consumableApi.edit(formData);
        toast.success("修改成功");
      } else {
        await consumableApi.add(formData);
        toast.success("新增成功");
      }
      setShowForm(false);
      void fetchList();
    } catch (error) {
      toast.error(getErrorMessage(error, "保存失败"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (item: Consumable) => {
    if (!item.consumableId) return;
    if (!window.confirm(`确定删除耗材「${item.name}」吗？`)) return;
    try {
      await consumableApi.remove([item.consumableId]);
      toast.success("删除成功");
      void fetchList();
    } catch (error) {
      toast.error(getErrorMessage(error, "删除失败"));
    }
  };

  const openStockModal = (item: Consumable, action: "add" | "reduce") => {
    setCurrentItem(item);
    setStockAction(action);
    setStockQuantity(1);
    setShowStockModal(true);
  };

  const handleStock = async () => {
    if (!currentItem?.consumableId || stockQuantity <= 0) return;
    setSubmitting(true);
    try {
      if (stockAction === "add") {
        await consumableApi.addStock(currentItem.consumableId, stockQuantity);
        toast.success(`入库成功，数量: ${stockQuantity}`);
      } else {
        await consumableApi.reduceStock(
          currentItem.consumableId,
          stockQuantity,
        );
        toast.success(`出库成功，数量: ${stockQuantity}`);
      }
      setShowStockModal(false);
      void fetchList();
    } catch (error) {
      toast.error(
        getErrorMessage(
          error,
          stockAction === "add" ? "入库失败" : "出库失败，可能库存不足",
        ),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const isLowStock = (item: Consumable) =>
    (item.quantity || 0) <= (item.lowStockThreshold || 0);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const lowStockCount = useMemo(
    () => list.filter((item) => isLowStock(item)).length,
    [list],
  );
  const totalQuantity = useMemo(
    () => list.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
    [list],
  );
  const hasActiveFilters = Boolean(searchName.trim());
  const now = new Date();
  const todayLabel = `${now.getMonth() + 1}/${now.getDate()}`;
  const timeLabel = now.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const overviewItems = [
    { label: "当前结果", value: `${list.length} 项耗材` },
    { label: "库存总量", value: `${totalQuantity}` },
    { label: "低库存", value: `${lowStockCount} 项` },
    { label: "搜索状态", value: hasActiveFilters ? "已启用" : "默认" },
  ];

  return (
    <div className="relative min-h-screen pb-6">
      <WorkspaceBackdrop />
      <div className="relative z-10 space-y-3">
        <WorkspaceHeroCard
          badge={
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-slate-500">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-pink-50 px-2.5 py-1 text-pink-600 ring-1 ring-pink-100">
                <Package className="h-3.5 w-3.5" />
                {todayLabel}
              </span>
              <span className="rounded-full bg-white/80 px-2.5 py-1 ring-1 ring-slate-200/80">
                {timeLabel}
              </span>
            </div>
          }
          title="耗材管理"
          description="统一管理办公耗材的基础信息、库存变化和预警状态，让出入库操作也回到工作台结构。"
          actions={
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={handleReset}>
                重置筛选
              </Button>
              <Button onClick={handleAdd} className="gap-2">
                <Plus size={16} />
                新增耗材
              </Button>
            </div>
          }
          contentClassName="p-4 sm:p-5"
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <WorkspaceMetricCard
              label="耗材总量"
              value={total}
              hint="接口返回的耗材总记录数"
              aside={<Package className="h-[18px] w-[18px] text-pink-500" />}
            />
            <WorkspaceMetricCard
              label="当前页"
              value={list.length}
              hint={`库存总量 ${totalQuantity}`}
              aside={<Search className="h-[18px] w-[18px] text-sky-500" />}
            />
            <WorkspaceMetricCard
              label="低库存"
              value={lowStockCount}
              hint="达到或低于预警阈值"
              aside={
                <AlertTriangle className="h-[18px] w-[18px] text-amber-500" />
              }
            />
            <WorkspaceMetricCard
              label="筛选状态"
              value={hasActiveFilters ? "已启用" : "默认"}
              hint={
                hasActiveFilters ? `关键词：${searchName}` : "当前显示全部耗材"
              }
              aside={<Search className="h-[18px] w-[18px] text-emerald-500" />}
            />
          </div>
        </WorkspaceHeroCard>

        <WorkspaceWorkbenchCard
          title="耗材工作台"
          total={total}
          hasActiveFilters={hasActiveFilters}
          overviewItems={overviewItems}
          quickFilterAside={
            hasActiveFilters ? (
              <Button variant="outline" size="sm" onClick={handleReset}>
                清空筛选
              </Button>
            ) : (
              <span className="rounded-full bg-white/82 px-3 py-1.5 text-[11px] font-medium text-slate-400 ring-1 ring-white/80 shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
                当前显示全部耗材
              </span>
            )
          }
          filterBar={
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Search
                  size={18}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <Input
                  type="text"
                  value={searchName}
                  onChange={(event) => setSearchName(event.target.value)}
                  onKeyDown={(event) => event.key === "Enter" && handleSearch()}
                  placeholder="搜索耗材名称..."
                  className="pl-10"
                />
              </div>
              <Button variant="outline" onClick={handleSearch}>
                搜索
              </Button>
            </div>
          }
        />

        <WorkspaceResultCard
          total={total}
          title="耗材列表"
          description="统一展示耗材基础信息、库存状态和入出库操作。"
          footer={
            total > pageSize ? (
              <WorkspacePaginationBar
                total={total}
                pageNum={pageNum}
                totalPages={totalPages}
                onPrev={() => setPageNum((page) => Math.max(1, page - 1))}
                onNext={() =>
                  setPageNum((page) => Math.min(totalPages, page + 1))
                }
                prevDisabled={pageNum <= 1}
                nextDisabled={pageNum >= totalPages}
              />
            ) : null
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full">
              <TableHeader>
                <tr>
                  <TableHead className="px-4 py-3 text-left">名称</TableHead>
                  <TableHead className="px-4 py-3 text-left">型号</TableHead>
                  <TableHead className="px-4 py-3 text-left">单位</TableHead>
                  <TableHead className="px-4 py-3 text-center">库存</TableHead>
                  <TableHead className="px-4 py-3 text-center">
                    预警阈值
                  </TableHead>
                  <TableHead className="px-4 py-3 text-center">状态</TableHead>
                  <TableActionHead className="w-72 px-4 py-3">
                    操作
                  </TableActionHead>
                </tr>
              </TableHeader>
              <tbody>
                {loading ? (
                  <WorkspaceTableStateRow
                    colSpan={7}
                    type="loading"
                    title="正在加载耗材数据..."
                  />
                ) : list.length === 0 ? (
                  <WorkspaceTableStateRow
                    colSpan={7}
                    title="暂无耗材数据"
                    icon={<Package size={24} />}
                  />
                ) : (
                  list.map((item) => (
                    <tr
                      key={item.consumableId}
                      className="border-b border-slate-100 hover:bg-white/70"
                    >
                      <td className="px-4 py-3 text-sm font-medium text-slate-900">
                        {item.name}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {item.model || "-"}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {item.unit || "-"}
                      </td>
                      <td className="px-4 py-3 text-center text-sm">
                        <span
                          className={`font-semibold ${isLowStock(item) ? "text-red-600" : "text-slate-900"}`}
                        >
                          {item.quantity ?? 0}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-sm text-slate-600">
                        {item.lowStockThreshold ?? "-"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {isLowStock(item) ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-600">
                            <AlertTriangle size={12} />
                            库存不足
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-600">
                            正常
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <TableRowActions
                          align="center"
                          actions={[
                            {
                              label: "入库",
                              icon: <ArrowUpCircle size={14} />,
                              onClick: () => openStockModal(item, "add"),
                              tone: "success",
                            },
                            {
                              label: "出库",
                              icon: <ArrowDownCircle size={14} />,
                              onClick: () => openStockModal(item, "reduce"),
                              tone: "warning",
                            },
                            {
                              label: "编辑",
                              icon: <Pencil size={14} />,
                              onClick: () => handleEdit(item),
                              tone: "primary",
                            },
                            {
                              label: "删除",
                              icon: <Trash2 size={14} />,
                              onClick: () => void handleDelete(item),
                              tone: "danger",
                            },
                          ]}
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </WorkspaceResultCard>

        {showForm ? (
          <WorkspaceDialogShell
            title={currentItem?.consumableId ? "编辑耗材" : "新增耗材"}
            description="维护耗材名称、型号、单位和库存预警信息。"
            onClose={() => setShowForm(false)}
            maxWidthClassName="max-w-md"
          >
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  名称 <span className="text-red-500">*</span>
                </label>
                <Input
                  type="text"
                  value={formData.name}
                  onChange={(event) =>
                    setFormData({ ...formData, name: event.target.value })
                  }
                  placeholder="请输入耗材名称"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    型号
                  </label>
                  <Input
                    type="text"
                    value={formData.model || ""}
                    onChange={(event) =>
                      setFormData({ ...formData, model: event.target.value })
                    }
                    placeholder="如 A4"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    单位
                  </label>
                  <Input
                    type="text"
                    value={formData.unit || ""}
                    onChange={(event) =>
                      setFormData({ ...formData, unit: event.target.value })
                    }
                    placeholder="如 个/箱/包"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    初始库存
                  </label>
                  <Input
                    type="number"
                    min={0}
                    value={formData.quantity ?? 0}
                    onChange={(event) =>
                      setFormData({
                        ...formData,
                        quantity: parseInt(event.target.value, 10) || 0,
                      })
                    }
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    低库存预警
                  </label>
                  <Input
                    type="number"
                    min={0}
                    value={formData.lowStockThreshold ?? 10}
                    onChange={(event) =>
                      setFormData({
                        ...formData,
                        lowStockThreshold:
                          parseInt(event.target.value, 10) || 0,
                      })
                    }
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <Button variant="outline" onClick={() => setShowForm(false)}>
                  取消
                </Button>
                <Button onClick={handleSave} disabled={submitting}>
                  {submitting ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : null}
                  保存
                </Button>
              </div>
            </div>
          </WorkspaceDialogShell>
        ) : null}

        {showStockModal && currentItem ? (
          <WorkspaceDialogShell
            title={`${stockAction === "add" ? "入库" : "出库"} - ${currentItem.name}`}
            description={`当前库存：${currentItem.quantity ?? 0} ${currentItem.unit || "个"}`}
            onClose={() => setShowStockModal(false)}
            maxWidthClassName="max-w-sm"
          >
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  {stockAction === "add" ? "入库" : "出库"}数量
                </label>
                <Input
                  type="number"
                  min={1}
                  max={
                    stockAction === "reduce" ? currentItem.quantity : undefined
                  }
                  value={stockQuantity}
                  onChange={(event) =>
                    setStockQuantity(parseInt(event.target.value, 10) || 0)
                  }
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <Button
                  variant="outline"
                  onClick={() => setShowStockModal(false)}
                >
                  取消
                </Button>
                <Button
                  onClick={handleStock}
                  disabled={submitting || stockQuantity <= 0}
                  className={
                    stockAction === "add"
                      ? "bg-green-600 text-white hover:bg-green-700 [background-image:none]"
                      : "bg-orange-600 text-white hover:bg-orange-700 [background-image:none]"
                  }
                >
                  {submitting ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : null}
                  确认{stockAction === "add" ? "入库" : "出库"}
                </Button>
              </div>
            </div>
          </WorkspaceDialogShell>
        ) : null}
      </div>
    </div>
  );
};

export default ConsumablePage;
