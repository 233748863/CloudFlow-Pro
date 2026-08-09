import React, { useCallback, useEffect, useMemo, useState } from "react";
import { getConfigIntSync } from '../../../hooks/useSystemConfig';
import { SYS_PAGE_DEFAULT_PAGE_SIZE } from '../../../constants/sysConfig';
import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  Edit,
  History,
  Loader2,
  Package,
  Search,
  ShoppingCart,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { BaseDialog } from "@/components/common/BaseDialog";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Pagination } from "@/components/common/Pagination";
import { InnerTableSurface, TablePageLayout } from "@/components/layout/TablePageLayout";
import {
  Button,
  DatePicker,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  Switch,
} from "@/components/common";
import {
  consumableApi,
  Consumable,
  ConsumableReplenishmentSuggestion,
  ConsumableStockLog,
} from "@/services/api/consumable";
import { purchaseRequestApi, supplierApi, Supplier } from "@/services/api/purchase";
import { useAuth } from "@/context/AuthContext";
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
  const { hasPermission } = useAuth();
  const [list, setList] = useState<Consumable[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [searchName, setSearchName] = useState("");
  const [searchParams, setSearchParams] = useState({
    name: "",
    pageNum: 1,
    pageSize: getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10),
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
  const warnEnabledCount = useMemo(
    () => list.filter((item) => Number(item.warnEnabled ?? 1) === 1).length,
    [list],
  );
  const hasActiveFilters = Boolean(searchParams.name);
  const metrics = [
    { label: "耗材", value: String(total), meta: `当前页 ${list.length}`, icon: <Package size={18} />, tone: "blue" },
    { label: "库存量", value: String(totalQuantity), meta: "当前页合计", icon: <ArrowUpCircle size={18} />, tone: "green" },
    { label: "低库存", value: String(lowStockCount), meta: "触发补货", icon: <AlertTriangle size={18} />, tone: "red" },
    { label: "预警项", value: String(warnEnabledCount), meta: `第 ${searchParams.pageNum}/${totalPages} 页`, icon: <ShoppingCart size={18} />, tone: "amber" },
  ];

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

  const pageActions = (
    <>
        <header className="admin-source-header">
          <div>
            <p className="admin-source-kicker">CONSUMABLES</p>
            <h2>耗材管理</h2>
            <span>维护耗材库存、预警阈值、供应商、入库出库和补货建议</span>
          </div>
          <div className="admin-source-controls">
              <Button variant="outline" size="sm" onClick={() => void openSuggestion()}>
                <ShoppingCart size={16} />
                补货建议
              </Button>
              <Button size="sm" onClick={handleAdd} disabled={!hasPermission('oa:consumable:add')}>
                <Plus size={16} />
                新增耗材
              </Button>
          </div>
        </header>

        <section className="admin-source-stat-grid">
          {metrics.map((metric) => (
            <article key={metric.label} className={`card admin-source-stat admin-source-tone-${metric.tone}`}>
              <div className="admin-source-stat-icon">{metric.icon}</div>
              <div>
                <p>{metric.label}</p>
                <strong>{metric.value}</strong>
                <span>{metric.meta}</span>
              </div>
            </article>
          ))}
        </section>
    </>
  );

  const pageFilters = (
        <section className="card admin-users-toolbar">
          <div className="admin-oa-filter-grid">
            <label>
              <span className="input-label">耗材名称</span>
              <div className="admin-source-search-field">
                <Search size={16} />
                <Input
                  value={searchName}
                  onChange={(event) => setSearchName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") handleSearch();
                  }}
                  placeholder="搜索耗材名称"
                  className="h-[42px]"
                />
              </div>
            </label>
            <div className="admin-users-toolbar-actions">
              <span className="admin-users-filter-count">{hasActiveFilters ? searchParams.name : "全部耗材"}</span>
              <Button variant="outline" size="sm" onClick={handleSearch}>
                <Search size={14} />
                搜索
              </Button>
              <Button variant="outline" size="sm" onClick={handleReset} disabled={!hasActiveFilters}>
                <RotateCcw size={14} />
                重置
              </Button>
            </div>
          </div>
        </section>
  );

  const pageTable = (
        <InnerTableSurface className="flex min-h-0 flex-1 flex-col">
            <table className="unity-data-table admin-source-table min-w-[980px]">
              <thead>
                <tr>
                  <th>耗材</th>
                  <th>型号</th>
                  <th>单位</th>
                  <th className="text-center">库存</th>
                  <th className="text-center">预警阈值</th>
                  <th className="text-center">目标库存</th>
                  <th>默认供应商</th>
                  <th>状态</th>
                  <th className="text-right">当前操作</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td
                      colSpan={9}
                      className="px-4 py-10 text-center text-sm text-cf-subtle"
                    >
                      正在加载耗材...
                    </td>
                  </tr>
                ) : list.length === 0 ? (
                  <tr>
                    <td
                      colSpan={9}
                      className="px-4 py-10 text-center text-sm text-cf-subtle"
                    >
                      暂无耗材
                    </td>
                  </tr>
                ) : (
                  list.map((item) => (
                    <tr key={item.consumableId}>
                      <td>
                        <div className="font-medium text-cf-title">
                          {item.name}
                        </div>
                        <div className="mt-1 text-xs text-cf-faint">
                          ID {item.consumableId || "-"}
                        </div>
                      </td>
                      <td>
                        {item.model || "-"}
                      </td>
                      <td>
                        {item.unit || "-"}
                      </td>
                      <td className="text-center">
                        <span
                          className={
                            isLowStock(item)
                              ? "font-semibold text-rose-600"
                              : "font-semibold text-cf-title"
                          }
                        >
                          {item.quantity ?? 0}
                        </span>
                      </td>
                      <td className="text-center">
                        {item.lowStockThreshold ?? "-"}
                      </td>
                      <td className="text-center">
                        {item.targetStock ?? "-"}
                      </td>
                      <td>
                        {suppliers.find((supplier) => supplier.supplierId === item.defaultSupplierId)?.supplierName || "-"}
                      </td>
                      <td>
                        {Number(item.warnEnabled ?? 1) !== 1 ? (
                          <span className="inline-flex items-center rounded-md border border-slate-200 bg-[var(--cf-surface-muted)] px-2.5 py-1 text-xs font-semibold text-cf-subtle dark:border-slate-800 dark:bg-slate-900">
                            未预警
                          </span>
                        ) : isLowStock(item) ? (
                          <span className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-600 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">
                            <AlertTriangle size={12} />
                            库存不足
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-600 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
                            正常
                          </span>
                        )}
                      </td>
                      <td>
                        <div className="admin-users-row-actions">
                          {isLowStock(item) ? <button type="button" data-tooltip="采购" aria-label="采购" onClick={() => void openSuggestion(item)}><ShoppingCart size={15} /></button> : null}
                          {hasPermission("oa:consumable:add-stock") ? <button type="button" data-tooltip="入库" aria-label="入库" onClick={() => openStockModal(item, "add")}><ArrowUpCircle size={15} /></button> : null}
                          {hasPermission("oa:consumable:reduce-stock") ? <button type="button" data-tooltip="出库" aria-label="出库" onClick={() => openStockModal(item, "reduce")}><ArrowDownCircle size={15} /></button> : null}
                          <button type="button" data-tooltip="流水" aria-label="流水" onClick={() => void openLogs(item)}><History size={15} /></button>
                          {hasPermission("oa:consumable:edit") ? <button type="button" data-tooltip="编辑" aria-label="编辑" onClick={() => handleEdit(item)}><Edit size={15} /></button> : null}
                          {hasPermission("oa:consumable:remove") ? <button type="button" data-tooltip="删除" aria-label="删除" onClick={() => setDeleteTarget(item)}><Trash2 size={15} /></button> : null}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
        </InnerTableSurface>
  );

  const pagePagination = total > 0 ? (
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
  ) : null;

  return (
    <>
      <section className="admin-source-page consumable-page">
        <TablePageLayout
          actions={pageActions}
          filters={pageFilters}
          table={pageTable}
          pagination={pagePagination}
        />
      </section>

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
        bodyClassName="admin-dialog-stack"
        footer={
          <>
            <Button variant="outline" onClick={() => setShowForm(false)}>
              取消
            </Button>
            <Button onClick={() => void handleSave()} disabled={submitting || (currentItem?.consumableId ? !hasPermission('oa:consumable:edit') : !hasPermission('oa:consumable:add'))}>
              {submitting ? (
                <Loader2 size={16} className="mr-1.5 animate-spin" />
              ) : null}
              保存
            </Button>
          </>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="admin-dialog-field">
            <Label>耗材名称</Label>
            <Input
              value={formData.name}
              onChange={(event) =>
                setFormData((prev) => ({ ...prev, name: event.target.value }))
              }
              placeholder="请输入耗材名称"
            />
          </div>
          <div className="admin-dialog-field">
            <Label>型号</Label>
            <Input
              value={formData.model || ""}
              onChange={(event) =>
                setFormData((prev) => ({ ...prev, model: event.target.value }))
              }
              placeholder="如 70g/500张"
            />
          </div>
          <div className="admin-dialog-field">
            <Label>单位</Label>
            <Input
              value={formData.unit || ""}
              onChange={(event) =>
                setFormData((prev) => ({ ...prev, unit: event.target.value }))
              }
              placeholder="如 个/箱/包"
            />
          </div>
          <div className="admin-dialog-field">
            <Label>低库存预警</Label>
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
          <div className="admin-dialog-field">
            <Label>目标库存</Label>
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
          <div className="admin-dialog-field">
            <Label>默认供应商</Label>
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
          <div className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-[var(--cf-surface-muted)] px-4 py-3 dark:border-slate-800 dark:bg-slate-900/70 md:col-span-2">
            <div>
              <div className="text-sm font-medium text-cf-body">
                启用库存预警
              </div>
              <div className="mt-1 text-xs text-cf-faint">
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
        bodyClassName="admin-dialog-stack"
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
        <div className="admin-dialog-stack">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="admin-dialog-field md:col-span-2">
              <Label>供应商</Label>
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
            <div className="admin-dialog-field">
              <Label>期望到货日期</Label>
              <DatePicker
                type="date"
                value={suggestionExpectedDate}
                onChange={(event) => setSuggestionExpectedDate(event.target.value)}
                placeholder="选择日期"
              />
            </div>
          </div>
          <div className="admin-dialog-field">
            <Label>采购事由</Label>
            <Textarea
              value={suggestionReason}
              onChange={(event) => setSuggestionReason(event.target.value)}
              rows={3}
            />
          </div>
          <div className="admin-horizontal-scroll">
            <table className="unity-data-table admin-source-table min-w-[760px]">
              <thead>
                <tr>
                  <th>耗材</th>
                  <th className="text-center">库存</th>
                  <th className="text-center">阈值</th>
                  <th className="text-center">目标</th>
                  <th className="text-center">建议采购</th>
                  <th>默认供应商</th>
                </tr>
              </thead>
              <tbody>
                {suggestionLoading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-sm text-cf-subtle">
                      正在加载补货建议...
                    </td>
                  </tr>
                ) : suggestions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-sm text-cf-subtle">
                      暂无补货建议
                    </td>
                  </tr>
                ) : suggestions.map((item) => (
                  <tr key={item.consumableId}>
                    <td>
                      {item.name}
                      <div className="mt-1 text-xs text-cf-faint">{item.model || "-"} / {item.unit || "-"}</div>
                    </td>
                    <td className="text-center">{item.quantity ?? 0}</td>
                    <td className="text-center">{item.lowStockThreshold ?? 0}</td>
                    <td className="text-center">{item.targetStock ?? 0}</td>
                    <td className="text-center font-semibold text-cyan-700 dark:text-cyan-200">
                      {item.suggestedQuantity ?? 0}
                    </td>
                    <td>{item.defaultSupplierName || "-"}</td>
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
        bodyClassName="admin-dialog-stack"
        footer={
          <>
            <Button variant="outline" onClick={() => setShowStockModal(false)}>
              取消
            </Button>
            <Button
              onClick={() => void handleStock()}
              disabled={submitting || stockQuantity <= 0 || !hasPermission(stockAction === "add" ? 'oa:consumable:add-stock' : 'oa:consumable:reduce-stock')}
            >
              {submitting ? (
                <Loader2 size={16} className="mr-1.5 animate-spin" />
              ) : null}
              确认{stockAction === "add" ? "入库" : "出库"}
            </Button>
          </>
        }
      >
        <div className="admin-dialog-stack">
          {stockAction === "reduce" ? (
            <div className="admin-dialog-field">
              <Label>出库类型</Label>
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
          <div className="admin-dialog-field">
            <Label>{stockAction === "add" ? "入库" : "出库"}数量</Label>
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
          <div className="admin-dialog-field">
            <Label>{stockAction === "add" ? "入库" : "出库"}原因</Label>
            <Textarea
              value={stockRemark}
              onChange={(event) => setStockRemark(event.target.value)}
              placeholder={stockAction === "add" ? "如 初始库存、采购入库、盘盈调整" : "如 部门领用、盘点盘亏"}
              rows={3}
            />
          </div>
        </div>
      </BaseDialog>

      <BaseDialog
        open={Boolean(logTarget)}
        title={`库存流水 - ${logTarget?.name || ""}`}
        onClose={() => setLogTarget(null)}
        width="wide"
      >
        <div className="admin-horizontal-scroll min-h-64">
          <table className="unity-data-table admin-source-table min-w-[720px]">
            <thead>
              <tr>
                <th>类型</th>
                <th className="text-center">数量变动</th>
                <th>原因</th>
                <th>时间</th>
              </tr>
            </thead>
            <tbody>
              {logLoading ? (
                <tr>
                  <td colSpan={4} className="px-4 py-12 text-center text-sm text-cf-subtle">
                    正在加载库存流水...
                  </td>
                </tr>
              ) : stockLogs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-12 text-center text-sm text-cf-subtle">
                    暂无库存流水
                  </td>
                </tr>
              ) : (
                stockLogs.map((log) => (
                  <tr key={log.logId}>
                    <td>
                      {log.type || "-"}
                    </td>
                    <td className="text-center">
                      <span className={Number(log.quantityChange || 0) >= 0 ? "font-semibold text-emerald-600" : "font-semibold text-rose-600"}>
                        {Number(log.quantityChange || 0) > 0 ? "+" : ""}{log.quantityChange ?? 0}
                      </span>
                    </td>
                    <td>
                      {log.remark || "-"}
                    </td>
                    <td>
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
    </>
  );
};

export default ConsumablePage;
