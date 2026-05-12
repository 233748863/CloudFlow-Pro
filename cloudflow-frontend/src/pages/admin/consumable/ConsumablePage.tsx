import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  Edit,
  History,
  Loader2,
  Package,
  ShoppingCart,
  Plus,
  RotateCcw,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { BaseDialog } from "@/components/common/BaseDialog";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Pagination } from "@/components/common/Pagination";
import { TablePageLayout, TableSurfaceCard } from "@/components/layout/TablePageLayout";
import {
  Button,
  DatePicker,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TableActionHead,
  TableHead,
  TableHeader,
  Textarea,
  Switch,
} from "@/components/common";
import { TableRowActions } from "@/components/common/table-row-actions";
import {
  consumableApi,
  Consumable,
  ConsumableReplenishmentSuggestion,
  ConsumableStockLog,
} from "@/services/api/consumable";
import { purchaseRequestApi, supplierApi, Supplier } from "@/services/api/purchase";
import { getErrorMessage } from "@/utils/errorMessage";

const createDefaultForm = (): Consumable => ({
  name: "",
  model: "",
  unit: "个",
  lowStockThreshold: 10,
  targetStock: 20,
  warnEnabled: 1,
});

const ConsumablePage: React.FC = () => {
  const [list, setList] = useState<Consumable[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [searchName, setSearchName] = useState("");
  const [searchParams, setSearchParams] = useState({
    name: "",
    pageNum: 1,
    pageSize: 10,
  });
  const [showForm, setShowForm] = useState(false);
  const [showStockModal, setShowStockModal] = useState(false);
  const [stockAction, setStockAction] = useState<"add" | "reduce">("add");
  const [stockOutType, setStockOutType] = useState<"ISSUE" | "LOSS">("ISSUE");
  const [stockQuantity, setStockQuantity] = useState(1);
  const [stockRemark, setStockRemark] = useState("");
  const [currentItem, setCurrentItem] = useState<Consumable | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Consumable | null>(null);
  const [logTarget, setLogTarget] = useState<Consumable | null>(null);
  const [stockLogs, setStockLogs] = useState<ConsumableStockLog[]>([]);
  const [suggestions, setSuggestions] = useState<ConsumableReplenishmentSuggestion[]>([]);
  const [logLoading, setLogLoading] = useState(false);
  const [suggestionLoading, setSuggestionLoading] = useState(false);
  const [showSuggestionModal, setShowSuggestionModal] = useState(false);
  const [suggestionSupplierId, setSuggestionSupplierId] = useState<number | undefined>();
  const [suggestionExpectedDate, setSuggestionExpectedDate] = useState("");
  const [suggestionReason, setSuggestionReason] = useState("低库存补货采购");
  const [suggestionTarget, setSuggestionTarget] = useState<ConsumableReplenishmentSuggestion | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState<Consumable>(createDefaultForm());

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const data: any = await consumableApi.list({
        pageNum: searchParams.pageNum,
        pageSize: searchParams.pageSize,
        name: searchParams.name || undefined,
      });
      setList(data?.records || data?.rows || []);
      setTotal(data?.total || 0);
    } catch (error) {
      toast.error(getErrorMessage(error, "加载耗材列表失败"));
    } finally {
      setLoading(false);
    }
  }, [searchParams]);

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  useEffect(() => {
    void fetchSuppliers();
  }, []);

  const fetchSuppliers = async () => {
    try {
      const result = await supplierApi.list({ pageNum: 1, pageSize: 200, status: "ACTIVE" });
      setSuppliers(result.records || result.rows || []);
    } catch (error) {
      toast.error(getErrorMessage(error, "加载供应商失败"));
    }
  };

  const isLowStock = (item: Consumable) =>
    Number(item.warnEnabled ?? 1) === 1 &&
    Number(item.quantity || 0) <= Number(item.lowStockThreshold || 0);

  const totalPages = Math.max(1, Math.ceil(total / searchParams.pageSize));
  const lowStockCount = useMemo(
    () => list.filter((item) => isLowStock(item)).length,
    [list],
  );
  const totalQuantity = useMemo(
    () => list.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
    [list],
  );

  const handleSearch = () => {
    setSearchParams((prev) => ({
      ...prev,
      name: searchName.trim(),
      pageNum: 1,
    }));
  };

  const handleReset = () => {
    setSearchName("");
    setSearchParams((prev) => ({ ...prev, name: "", pageNum: 1 }));
  };

  const handleAdd = () => {
    setFormData(createDefaultForm());
    setCurrentItem(null);
    setShowForm(true);
  };

  const handleEdit = (item: Consumable) => {
    setFormData({ ...createDefaultForm(), ...item });
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
      await fetchList();
    } catch (error) {
      toast.error(getErrorMessage(error, "保存失败"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget?.consumableId) return;
    try {
      await consumableApi.remove([deleteTarget.consumableId]);
      toast.success("删除成功");
      setDeleteTarget(null);
      await fetchList();
    } catch (error) {
      toast.error(getErrorMessage(error, "删除失败"));
    }
  };

  const openStockModal = (item: Consumable, action: "add" | "reduce") => {
    setCurrentItem(item);
    setStockAction(action);
    setStockOutType("ISSUE");
    setStockQuantity(1);
    setStockRemark("");
    setShowStockModal(true);
  };

  const openLogs = async (item: Consumable) => {
    if (!item.consumableId) return;
    setLogTarget(item);
    setLogLoading(true);
    try {
      const result = await consumableApi.logs(item.consumableId) as ConsumableStockLog[];
      setStockLogs(Array.isArray(result) ? result : []);
    } catch (error) {
      toast.error(getErrorMessage(error, "加载库存流水失败"));
    } finally {
      setLogLoading(false);
    }
  };

  const openSuggestion = async (item?: Consumable) => {
    setSuggestionLoading(true);
    setShowSuggestionModal(true);
    setSuggestionTarget(null);
    setSuggestionSupplierId(undefined);
    setSuggestionExpectedDate("");
    setSuggestionReason("低库存补货采购");
    try {
      const result = await consumableApi.getReplenishmentSuggestions();
      const rows = Array.isArray(result) ? result.filter((suggestion) => Number(suggestion.suggestedQuantity || 0) > 0) : [];
      const target = item?.consumableId
        ? rows.find((suggestion) => suggestion.consumableId === item.consumableId) || null
        : null;
      setSuggestions(target ? [target] : rows);
      setSuggestionTarget(target);
      setSuggestionSupplierId(target?.defaultSupplierId);
    } catch (error) {
      toast.error(getErrorMessage(error, "加载补货建议失败"));
    } finally {
      setSuggestionLoading(false);
    }
  };

  const handleCreateSuggestionPurchase = async () => {
    const source = suggestionTarget ? [suggestionTarget] : suggestions;
    const items = source
      .map((item) => ({
        consumableId: item.consumableId,
        quantity: Number(item.suggestedQuantity || 0),
      }))
      .filter((item) => item.quantity > 0);
    if (!items.length) {
      toast.error("暂无可采购的补货明细");
      return;
    }
    if (!suggestionSupplierId && source.some((item) => !item.defaultSupplierId)) {
      toast.error("请选择供应商");
      return;
    }
    setSubmitting(true);
    try {
      await purchaseRequestApi.createFromSuggestion({
        supplierId: suggestionSupplierId,
        expectedDate: suggestionExpectedDate || undefined,
        reason: suggestionReason.trim() || "低库存补货采购",
        items,
      });
      toast.success("采购草稿已生成");
      setShowSuggestionModal(false);
    } catch (error) {
      toast.error(getErrorMessage(error, "生成采购草稿失败"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleStock = async () => {
    if (!currentItem?.consumableId || stockQuantity <= 0) {
      toast.error("数量必须大于 0");
      return;
    }
    if (!stockRemark.trim()) {
      toast.error(`${stockAction === "add" ? "入库" : "出库"}原因不能为空`);
      return;
    }

    if (
      stockAction === "reduce" &&
      stockQuantity > Number(currentItem.quantity || 0)
    ) {
      toast.error("出库数量不能超过当前库存");
      return;
    }

    setSubmitting(true);
    try {
      if (stockAction === "add") {
        await consumableApi.addStock(
          currentItem.consumableId,
          stockQuantity,
          stockRemark.trim(),
        );
        toast.success(`入库成功，数量: ${stockQuantity}`);
      } else {
        await consumableApi.reduceStock(
          currentItem.consumableId,
          stockQuantity,
          stockOutType,
          stockRemark.trim(),
        );
        toast.success(`出库成功，数量: ${stockQuantity}`);
      }
      setShowStockModal(false);
      await fetchList();
    } catch (error) {
      toast.error(
        getErrorMessage(
          error,
          stockAction === "add" ? "入库失败" : "出库失败",
        ),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <TablePageLayout
        className="gap-4"
        filters={
          <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/88 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-1 flex-wrap items-center gap-3">
              <div className="relative w-full sm:w-[280px]">
                <Search
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <Input
                  className="h-10 pl-9"
                  value={searchName}
                  onChange={(event) => setSearchName(event.target.value)}
                  onKeyDown={(event) => event.key === "Enter" && handleSearch()}
                  placeholder="搜索耗材名称"
                />
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                <span>第 {searchParams.pageNum} / {totalPages} 页</span>
                <span>共 {total} 条</span>
                <span>当前页库存 {totalQuantity}</span>
                <span>低库存 {lowStockCount} 项</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
              <Button variant="outline" size="sm" onClick={handleSearch}>
                搜索
              </Button>
              <Button variant="outline" size="sm" onClick={handleReset}>
                <RotateCcw size={14} className="mr-1.5" />
                清空条件
              </Button>
              <Button variant="outline" size="sm" onClick={() => void openSuggestion()}>
                <ShoppingCart size={14} className="mr-1.5" />
                补货建议
              </Button>
          <Button size="sm" onClick={handleAdd}>
            <Plus size={14} className="mr-1.5" />
            新增耗材
              </Button>
            </div>
          </div>
        }
        table={(<TableSurfaceCard><div className="min-h-[38rem] overflow-x-auto">
            <table className="w-full min-w-[980px]">
              <TableHeader className="sticky top-0 z-10">
                <tr>
                  <TableHead className="px-4 py-3 text-left">耗材</TableHead>
                  <TableHead className="px-4 py-3 text-left">型号</TableHead>
                  <TableHead className="px-4 py-3 text-left">单位</TableHead>
                  <TableHead className="px-4 py-3 text-center">库存</TableHead>
                  <TableHead className="px-4 py-3 text-center">
                    预警阈值
                  </TableHead>
                  <TableHead className="px-4 py-3 text-center">
                    目标库存
                  </TableHead>
                  <TableHead className="px-4 py-3 text-left">
                    默认供应商
                  </TableHead>
                  <TableHead className="px-4 py-3 text-left">状态</TableHead>
                  <TableActionHead className="w-44 px-4 py-3 text-right">
                    操作
                  </TableActionHead>
                </tr>
              </TableHeader>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {loading ? (
                  <tr>
                    <td
                      colSpan={9}
                      className="px-4 py-16 text-center text-sm text-slate-500"
                    >
                      正在加载耗材...
                    </td>
                  </tr>
                ) : list.length === 0 ? (
                  <tr>
                    <td
                      colSpan={9}
                      className="px-4 py-16 text-center text-sm text-slate-500"
                    >
                      暂无耗材
                    </td>
                  </tr>
                ) : (
                  list.map((item) => (
                    <tr
                      key={item.consumableId}
                      className="transition hover:bg-slate-50 dark:hover:bg-slate-900/60"
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900 dark:text-slate-100">
                          {item.name}
                        </div>
                        <div className="mt-1 text-xs text-slate-400">
                          ID {item.consumableId || "-"}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                        {item.model || "-"}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                        {item.unit || "-"}
                      </td>
                      <td className="px-4 py-3 text-center text-sm">
                        <span
                          className={
                            isLowStock(item)
                              ? "font-semibold text-rose-600"
                              : "font-semibold text-slate-900 dark:text-slate-100"
                          }
                        >
                          {item.quantity ?? 0}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-sm text-slate-600 dark:text-slate-300">
                        {item.lowStockThreshold ?? "-"}
                      </td>
                      <td className="px-4 py-3 text-center text-sm text-slate-600 dark:text-slate-300">
                        {item.targetStock ?? "-"}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                        {suppliers.find((supplier) => supplier.supplierId === item.defaultSupplierId)?.supplierName || "-"}
                      </td>
                      <td className="px-4 py-3">
                        {Number(item.warnEnabled ?? 1) !== 1 ? (
                          <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                            未预警
                          </span>
                        ) : isLowStock(item) ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-600 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">
                            <AlertTriangle size={12} />
                            库存不足
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-600 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
                            正常
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <TableRowActions
                          align="end"
                          actions={[
                            {
                              label: "采购",
                              icon: <ShoppingCart size={14} />,
                              onClick: () => void openSuggestion(item),
                              tone: "primary",
                              hidden: !isLowStock(item),
                            },
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
                              label: "流水",
                              icon: <History size={14} />,
                              onClick: () => void openLogs(item),
                              tone: "info",
                            },
                            {
                              label: "编辑",
                              icon: <Edit size={14} />,
                              onClick: () => handleEdit(item),
                              tone: "primary",
                            },
                            {
                              label: "删除",
                              icon: <Trash2 size={14} />,
                              onClick: () => setDeleteTarget(item),
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
          </div></TableSurfaceCard>)}
        pagination={
          total > 0 ? (
            <Pagination
              total={total}
              page={searchParams.pageNum}
              pageSize={searchParams.pageSize}
              showPageSizeSelector={false}
              showJump={false}
              onPageChange={(page) =>
                setSearchParams((prev) => ({ ...prev, pageNum: page }))
              }
              onPageSizeChange={() => {}}
            />
          ) : null
        }
      />

      <BaseDialog
        open={showForm}
        title={currentItem?.consumableId ? "编辑耗材" : "新增耗材"}
        description={
          currentItem?.consumableId
            ? "库存数量只能通过入库或出库调整。"
            : "新增耗材后库存默认为 0，请通过入库录入初始库存。"
        }
        onClose={() => setShowForm(false)}
        width="wide"
        footer={
          <>
            <Button variant="outline" onClick={() => setShowForm(false)}>
              取消
            </Button>
            <Button onClick={() => void handleSave()} disabled={submitting}>
              {submitting ? (
                <Loader2 size={16} className="mr-1.5 animate-spin" />
              ) : null}
              保存
            </Button>
          </>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
              耗材名称
            </label>
            <Input
              value={formData.name}
              onChange={(event) =>
                setFormData((prev) => ({ ...prev, name: event.target.value }))
              }
              placeholder="请输入耗材名称"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
              型号
            </label>
            <Input
              value={formData.model || ""}
              onChange={(event) =>
                setFormData((prev) => ({ ...prev, model: event.target.value }))
              }
              placeholder="如 70g/500张"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
              单位
            </label>
            <Input
              value={formData.unit || ""}
              onChange={(event) =>
                setFormData((prev) => ({ ...prev, unit: event.target.value }))
              }
              placeholder="如 个/箱/包"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
              低库存预警
            </label>
            <Input
              type="number"
              min={0}
              value={formData.lowStockThreshold ?? 10}
              onChange={(event) =>
                setFormData((prev) => ({
                  ...prev,
                  lowStockThreshold:
                    Number.parseInt(event.target.value, 10) || 0,
                }))
              }
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
              目标库存
            </label>
            <Input
              type="number"
              min={0}
              value={formData.targetStock ?? 20}
              onChange={(event) =>
                setFormData((prev) => ({
                  ...prev,
                  targetStock: Number.parseInt(event.target.value, 10) || 0,
                }))
              }
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
              默认供应商
            </label>
            <Select
              value={formData.defaultSupplierId ? String(formData.defaultSupplierId) : "NONE"}
              onValueChange={(value) =>
                setFormData((prev) => ({
                  ...prev,
                  defaultSupplierId: value === "NONE" ? undefined : Number(value),
                }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">不设置</SelectItem>
                {suppliers.map((supplier) => (
                  <SelectItem key={supplier.supplierId} value={String(supplier.supplierId)}>
                    {supplier.supplierName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-800">
            <div>
              <div className="text-sm font-medium text-slate-700 dark:text-slate-300">
                启用库存预警
              </div>
              <div className="mt-1 text-xs text-slate-400">
                低于阈值后进入补货建议。
              </div>
            </div>
            <Switch
              checked={Number(formData.warnEnabled ?? 1) === 1}
              onCheckedChange={(checked) =>
                setFormData((prev) => ({ ...prev, warnEnabled: checked ? 1 : 0 }))
              }
            />
          </div>
        </div>
      </BaseDialog>

      <BaseDialog
        open={showSuggestionModal}
        title={suggestionTarget ? `补货采购 - ${suggestionTarget.name}` : "补货建议"}
        onClose={() => setShowSuggestionModal(false)}
        width="wide"
        footer={
          <>
            <Button variant="outline" onClick={() => setShowSuggestionModal(false)}>
              取消
            </Button>
            <Button onClick={() => void handleCreateSuggestionPurchase()} disabled={submitting || suggestionLoading}>
              {submitting ? <Loader2 size={16} className="mr-1.5 animate-spin" /> : null}
              生成采购草稿
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="md:col-span-2">
              <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                供应商
              </label>
              <Select
                value={suggestionSupplierId ? String(suggestionSupplierId) : "AUTO"}
                onValueChange={(value) => setSuggestionSupplierId(value === "AUTO" ? undefined : Number(value))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="AUTO">使用默认供应商</SelectItem>
                  {suppliers.map((supplier) => (
                    <SelectItem key={supplier.supplierId} value={String(supplier.supplierId)}>
                      {supplier.supplierName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                期望到货日期
              </label>
              <DatePicker
                type="date"
                value={suggestionExpectedDate}
                onChange={(event) => setSuggestionExpectedDate(event.target.value)}
                placeholder="选择日期"
              />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
              采购事由
            </label>
            <Textarea
              value={suggestionReason}
              onChange={(event) => setSuggestionReason(event.target.value)}
              rows={3}
            />
          </div>
          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
            <table className="w-full min-w-[760px]">
              <TableHeader>
                <tr>
                  <TableHead className="px-4 py-3 text-left">耗材</TableHead>
                  <TableHead className="px-4 py-3 text-center">库存</TableHead>
                  <TableHead className="px-4 py-3 text-center">阈值</TableHead>
                  <TableHead className="px-4 py-3 text-center">目标</TableHead>
                  <TableHead className="px-4 py-3 text-center">建议采购</TableHead>
                  <TableHead className="px-4 py-3 text-left">默认供应商</TableHead>
                </tr>
              </TableHeader>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {suggestionLoading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-sm text-slate-500">
                      正在加载补货建议...
                    </td>
                  </tr>
                ) : suggestions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-sm text-slate-500">
                      暂无补货建议
                    </td>
                  </tr>
                ) : suggestions.map((item) => (
                  <tr key={item.consumableId}>
                    <td className="px-4 py-3 text-sm text-slate-900 dark:text-slate-100">
                      {item.name}
                      <div className="mt-1 text-xs text-slate-400">{item.model || "-"} / {item.unit || "-"}</div>
                    </td>
                    <td className="px-4 py-3 text-center text-sm text-slate-600">{item.quantity ?? 0}</td>
                    <td className="px-4 py-3 text-center text-sm text-slate-600">{item.lowStockThreshold ?? 0}</td>
                    <td className="px-4 py-3 text-center text-sm text-slate-600">{item.targetStock ?? 0}</td>
                    <td className="px-4 py-3 text-center text-sm font-semibold text-cyan-700 dark:text-cyan-200">
                      {item.suggestedQuantity ?? 0}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">{item.defaultSupplierName || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </BaseDialog>

      <BaseDialog
        open={showStockModal && Boolean(currentItem)}
        title={`${stockAction === "add" ? "入库" : "出库"} - ${currentItem?.name || ""}`}
        description={`当前库存：${currentItem?.quantity ?? 0} ${currentItem?.unit || "个"}`}
        onClose={() => setShowStockModal(false)}
        width="narrow"
        footer={
          <>
            <Button variant="outline" onClick={() => setShowStockModal(false)}>
              取消
            </Button>
            <Button
              onClick={() => void handleStock()}
              disabled={submitting || stockQuantity <= 0}
            >
              {submitting ? (
                <Loader2 size={16} className="mr-1.5 animate-spin" />
              ) : null}
              确认{stockAction === "add" ? "入库" : "出库"}
            </Button>
          </>
        }
      >
        <div>
          <div className="space-y-4">
            {stockAction === "reduce" ? (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  出库类型
                </label>
                <Select value={stockOutType} onValueChange={(value) => setStockOutType(value as "ISSUE" | "LOSS")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ISSUE">领用出库</SelectItem>
                    <SelectItem value="LOSS">盘亏调整</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                {stockAction === "add" ? "入库" : "出库"}数量
              </label>
              <Input
                type="number"
                min={1}
                max={stockAction === "reduce" ? currentItem?.quantity : undefined}
                value={stockQuantity}
                onChange={(event) =>
                  setStockQuantity(Number.parseInt(event.target.value, 10) || 0)
                }
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                {stockAction === "add" ? "入库" : "出库"}原因
              </label>
              <Textarea
                value={stockRemark}
                onChange={(event) => setStockRemark(event.target.value)}
                placeholder={stockAction === "add" ? "如 初始库存、采购入库、盘盈调整" : "如 部门领用、盘点盘亏"}
                rows={3}
              />
            </div>
          </div>
        </div>
      </BaseDialog>

      <BaseDialog
        open={Boolean(logTarget)}
        title={`库存流水 - ${logTarget?.name || ""}`}
        onClose={() => setLogTarget(null)}
        width="wide"
      >
        <div className="min-h-64 overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <TableHeader>
              <tr>
                <TableHead className="px-4 py-3 text-left">类型</TableHead>
                <TableHead className="px-4 py-3 text-center">数量变动</TableHead>
                <TableHead className="px-4 py-3 text-left">原因</TableHead>
                <TableHead className="px-4 py-3 text-left">时间</TableHead>
              </tr>
            </TableHeader>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {logLoading ? (
                <tr>
                  <td colSpan={4} className="px-4 py-12 text-center text-sm text-slate-500">
                    正在加载库存流水...
                  </td>
                </tr>
              ) : stockLogs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-12 text-center text-sm text-slate-500">
                    暂无库存流水
                  </td>
                </tr>
              ) : (
                stockLogs.map((log) => (
                  <tr key={log.logId}>
                    <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300">
                      {log.type || "-"}
                    </td>
                    <td className="px-4 py-3 text-center text-sm">
                      <span className={Number(log.quantityChange || 0) >= 0 ? "font-semibold text-emerald-600" : "font-semibold text-rose-600"}>
                        {Number(log.quantityChange || 0) > 0 ? "+" : ""}{log.quantityChange ?? 0}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                      {log.remark || "-"}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500">
                      {log.createTime || "-"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </BaseDialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="删除耗材"
        message={`删除后「${deleteTarget?.name || ""}」不再出现在采购申请选择列表。`}
        confirmText="删除"
        cancelText="取消"
        danger
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};

export default ConsumablePage;

