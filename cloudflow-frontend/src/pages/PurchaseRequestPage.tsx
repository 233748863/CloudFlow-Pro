import React, { useEffect, useMemo, useState } from 'react';
import { getConfigIntSync } from '../hooks/useSystemConfig';
import { SYS_PAGE_DEFAULT_PAGE_SIZE } from '../constants/sysConfig';
import { useWorkflowRefresh } from '@/hooks/useWorkflowRefresh';
import {
  Clock3,
  CreditCard,
  Edit,
  Eye,
  PackageCheck,
  Paperclip,
  Plus,
  RotateCcw,
  Send,
  ShoppingCart,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import FileUpload from '@/components/FileUpload';
import { consumableApi, Consumable } from '@/services/api/consumable';
import { crmApi, CrmCustomer } from '@/services/api/crm';
import { projectApi, Project } from '@/services/api/project';
import { budgetApi, BudgetSubject } from '@/services/api/budget';
import {
  purchaseRequestApi,
  PurchaseItem,
  PurchaseRequest,
  supplierApi,
  Supplier,
} from '@/services/api/purchase';
import { formatDateTimeDisplay } from '@/utils/dateFormat';
import { getErrorMessage } from '@/utils/errorMessage';
import { getAttachmentDisplayName, normalizeAttachmentUrls } from '@/utils/attachment';
import { BaseDialog } from '@/components/common/BaseDialog';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { ListResultFooter } from '@/components/common/ListResultFooter';
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
} from '@/components/common';
import { useDict } from '@/hooks/useDict';
import { DictBadge } from '@/components/common/DictBadge';
import { InnerTableSurface, TablePageLayout } from '@/components/layout/TablePageLayout';

interface ConfirmState {
  type: 'delete' | 'submit' | 'payment';
  id: number;
  title: string;
  message: string;
  confirmText: string;
  danger?: boolean;
}

const createDefaultItem = (): PurchaseItem => ({
  consumableId: 0,
  quantity: 1,
  unitPrice: 0,
  amount: 0,
  receivedQuantity: 0,
});

const createDefaultForm = (): PurchaseRequest => ({
  supplierId: 0,
  expectedDate: '',
  reason: '',
  attachmentUrl: '',
  items: [createDefaultItem()],
});

const formatAmount = (value?: number | null) => {
  if (value === undefined || value === null || Number.isNaN(Number(value))) return '-';
  return `¥${Number(value).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const getAttachmentList = (attachmentUrl?: string) =>
  normalizeAttachmentUrls(attachmentUrl);

const getStatusBadge = (status?: string) => (
  <DictBadge dictType="oa_purchase_request_status" value={String(status || 'DRAFT')} />
);

const getPaymentStatusBadge = (status?: string) => (
  <DictBadge dictType="oa_payment_status" value={String(status || 'NONE')} />
);

const getReceivableQuantity = (item: PurchaseItem) =>
  Math.max(0, Number(item.quantity || 0) - Number(item.receivedQuantity || 0));

const hasReceivableItems = (items?: PurchaseItem[]) =>
  Boolean(items?.some((item) => getReceivableQuantity(item) > 0));

const InlineState: React.FC<{ title: string; icon?: React.ReactNode; className?: string }> = ({ title, icon, className }) => (
  <div className={['admin-dialog-empty-note', className].filter(Boolean).join(' ')}>
    <div className="flex flex-col items-center justify-center text-center">
      <div className="admin-source-stat-icon mb-3">
        {icon || <ShoppingCart className="h-4 w-4" />}
      </div>
      <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
    </div>
  </div>
);

const DialogPanel: React.FC<{
  title?: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}> = ({ title, description, actions, children, className, bodyClassName }) => (
  <section className={['table-scroll-container admin-inner-table-surface', className].filter(Boolean).join(' ')}>
    {title || description || actions ? (
      <div className="admin-source-section-head border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <div>
          {title ? <strong>{title}</strong> : null}
          {description ? <span>{description}</span> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    ) : null}
    <div className={['p-4', bodyClassName].filter(Boolean).join(' ')}>{children}</div>
  </section>
);

const DetailRows: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <DialogPanel title="基础信息" bodyClassName={['admin-purchase-detail-grid', className].filter(Boolean).join(' ')}>
    {children}
  </DialogPanel>
);

const DetailRow: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="admin-purchase-detail-item">
    <div className="text-[11px] font-medium text-slate-400 dark:text-slate-500">{label}</div>
    <div className="mt-1.5 text-sm leading-6 text-slate-900 dark:text-slate-100">{value || '-'}</div>
  </div>
);

const PurchasePanel: React.FC<{
  title: string;
  children: React.ReactNode;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  bodyClassName?: string;
}> = ({ title, children, meta, actions, bodyClassName }) => (
  <DialogPanel title={title} description={meta ? String(meta) : undefined} actions={actions} bodyClassName={bodyClassName}>
    {children}
  </DialogPanel>
);

export const PurchaseRequestPage: React.FC = () => {
  const statusDict = useDict('oa_purchase_request_status');
  const [purchases, setPurchases] = useState<PurchaseRequest[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [consumables, setConsumables] = useState<Consumable[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchParams, setSearchParams] = useState({
    status: '',
    supplierId: undefined as number | undefined,
    pageNum: 1,
    pageSize: getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10),
  });
  const [total, setTotal] = useState(0);
  const [showDialog, setShowDialog] = useState(false);
  const [currentPurchase, setCurrentPurchase] = useState<PurchaseRequest | null>(null);
  const [detailPurchase, setDetailPurchase] = useState<PurchaseRequest | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [formData, setFormData] = useState<PurchaseRequest>(createDefaultForm());
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [receiptPurchase, setReceiptPurchase] = useState<PurchaseRequest | null>(null);
  const [receiptQuantities, setReceiptQuantities] = useState<Record<number, number>>({});
  const [receiptRemark, setReceiptRemark] = useState('');
  const [projectOptions, setProjectOptions] = useState<Project[]>([]);
  const [customerOptions, setCustomerOptions] = useState<CrmCustomer[]>([]);
  const [budgetSubjectOptions, setBudgetSubjectOptions] = useState<BudgetSubject[]>([]);

  useEffect(() => {
    void fetchPurchases();
  }, [searchParams]);

  useEffect(() => {
    void fetchReferences();
  }, []);

  const fetchReferences = async () => {
    try {
      const [supplierResult, consumableResult, projectResult, customerResult, subjectResult] = await Promise.all([
        supplierApi.list({ pageNum: 1, pageSize: 100, status: 'ACTIVE' }),
        consumableApi.list({ pageNum: 1, pageSize: 100 }) as Promise<any>,
        projectApi.list({ pageNum: 1, pageSize: 100 }),
        crmApi.listCustomers({ pageNum: 1, pageSize: 100 }),
        budgetApi.listSubjects({ pageNum: 1, pageSize: 100 }),
      ]);
      setSuppliers(supplierResult.records || supplierResult.rows || []);
      setConsumables(consumableResult.records || consumableResult.rows || []);
      setProjectOptions(projectResult.rows || []);
      setCustomerOptions(customerResult.rows || []);
      setBudgetSubjectOptions(subjectResult.rows || []);
    } catch (error) {
      toast.error(getErrorMessage(error, '加载采购基础数据失败'));
    }
  };

  const fetchPurchases = async () => {
    setLoading(true);
    try {
      const result = await purchaseRequestApi.list(searchParams);
      setPurchases(result.records || result.rows || []);
      setTotal(result.total || 0);
    } catch (error) {
      toast.error(getErrorMessage(error, '获取采购申请列表失败'));
    } finally {
      setLoading(false);
    }
  };

  const formTotalAmount = useMemo(
    () => formData.items?.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unitPrice || 0), 0) || 0,
    [formData.items],
  );
  const pendingCount = useMemo(() => purchases.filter((item) => item.status === 'PENDING').length, [purchases]);
  const draftCount = useMemo(() => purchases.filter((item) => item.status === 'DRAFT').length, [purchases]);
  const approvedCount = useMemo(() => purchases.filter((item) => item.status === 'APPROVED').length, [purchases]);
  const canProcess = (status?: string) =>
    ['APPROVED', 'PARTIAL_RECEIVED'].includes(status || '');

  const resetFilters = () => {
    setSearchParams({ status: '', supplierId: undefined, pageNum: 1, pageSize: getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10) });
  };

  const handleAdd = () => {
    setCurrentPurchase(null);
    setFormData(createDefaultForm());
    setShowDialog(true);
  };

  const closeFormDialog = () => {
    setShowDialog(false);
    setCurrentPurchase(null);
    setFormData(createDefaultForm());
  };

  const handleView = async (purchase: PurchaseRequest) => {
    setDetailPurchase(purchase);
    setDetailLoading(true);
    try {
      const result = await purchaseRequestApi.getInfo(purchase.id!);
      setDetailPurchase(result);
    } catch (error) {
      setDetailPurchase(null);
      toast.error(getErrorMessage(error, '获取采购详情失败'));
    } finally {
      setDetailLoading(false);
    }
  };

  const handleEdit = async (id: number) => {
    try {
      const result = await purchaseRequestApi.getInfo(id);
      setCurrentPurchase(result);
      setFormData({
        ...createDefaultForm(),
        ...result,
        items: result.items?.length ? result.items : [createDefaultItem()],
      });
      setShowDialog(true);
    } catch (error) {
      toast.error(getErrorMessage(error, '获取采购详情失败'));
    }
  };

  const handleSave = async () => {
    if (!formData.supplierId || !formData.reason.trim()) {
      toast.error('请填写供应商和采购事由');
      return;
    }
    if (!formData.items?.length) {
      toast.error('请至少添加一条采购明细');
      return;
    }
    for (const item of formData.items) {
      if (!item.consumableId || Number(item.quantity) <= 0 || Number(item.unitPrice) < 0) {
        toast.error('请填写完整的采购明细');
        return;
      }
    }
    const payload = { ...formData, totalAmount: formTotalAmount };
    try {
      if (currentPurchase?.id) {
        await purchaseRequestApi.edit(payload);
        toast.success('更新成功');
      } else {
        await purchaseRequestApi.add(payload);
        toast.success('创建成功');
      }
      closeFormDialog();
      await fetchPurchases();
    } catch (error) {
      toast.error(getErrorMessage(error, '保存失败'));
    }
  };

  const handleConfirmAction = async () => {
    if (!confirmState) return;
    const current = confirmState;
    setConfirmState(null);
    try {
      if (current.type === 'delete') {
        await purchaseRequestApi.remove([current.id]);
        toast.success('删除成功');
      } else if (current.type === 'submit') {
        await purchaseRequestApi.submit(current.id);
        toast.success('提交成功');
      } else {
        await purchaseRequestApi.createPayment(current.id);
        toast.success('付款申请草稿已生成');
      }
      setDetailPurchase((prev) => (prev?.id === current.id ? null : prev));
      await fetchPurchases();
    } catch (error) {
      toast.error(getErrorMessage(error, '操作失败'));
    }
  };

  const addItem = () => {
    setFormData((prev) => ({ ...prev, items: [...(prev.items || []), createDefaultItem()] }));
  };

  const removeItem = (index: number) => {
    setFormData((prev) => {
      const nextItems = [...(prev.items || [])];
      nextItems.splice(index, 1);
      return { ...prev, items: nextItems.length ? nextItems : [createDefaultItem()] };
    });
  };

  const updateItem = (index: number, field: keyof PurchaseItem, value: string | number) => {
    setFormData((prev) => {
      const nextItems = [...(prev.items || [])];
      const current = { ...nextItems[index], [field]: value };
      if (field === 'consumableId') {
        const consumable = consumables.find((item) => item.consumableId === Number(value));
        current.consumableId = Number(value);
        current.consumableName = consumable?.name;
        current.model = consumable?.model;
        current.unit = consumable?.unit;
      }
      current.amount = Number(current.quantity || 0) * Number(current.unitPrice || 0);
      nextItems[index] = current;
      return { ...prev, items: nextItems };
    });
  };

  const openReceipt = async (purchase: PurchaseRequest) => {
    try {
      const detail = await purchaseRequestApi.getInfo(purchase.id!);
      if (!hasReceivableItems(detail.items)) {
        toast.info('该采购单已全部入库，无需重复入库');
        await fetchPurchases();
        return;
      }
      setReceiptPurchase(detail);
      const next: Record<number, number> = {};
      detail.items?.forEach((item) => {
        if (item.id) next[item.id] = getReceivableQuantity(item);
      });
      setReceiptQuantities(next);
      setReceiptRemark('');
    } catch (error) {
      toast.error(getErrorMessage(error, '获取入库明细失败'));
    }
  };

  const handleReceipt = async () => {
    if (!receiptPurchase?.id) return;
    const items = Object.entries(receiptQuantities)
      .map(([itemId, quantity]) => ({ itemId: Number(itemId), quantity: Number(quantity || 0) }))
      .filter((item) => item.quantity > 0);
    if (!items.length) {
      toast.error('请填写本次入库数量');
      return;
    }
    const itemMap = new Map((receiptPurchase.items || []).map((item) => [item.id, item]));
    for (const item of items) {
      const purchaseItem = itemMap.get(item.itemId);
      if (!purchaseItem) continue;
      const remain = getReceivableQuantity(purchaseItem);
      if (item.quantity > remain) {
        toast.error(`本次入库不能超过剩余数量：${purchaseItem.consumableName || '采购明细'}`);
        return;
      }
    }
    try {
      await purchaseRequestApi.receipt(receiptPurchase.id, { remark: receiptRemark, items });
      toast.success('入库成功');
      setReceiptPurchase(null);
      await fetchPurchases();
    } catch (error) {
      toast.error(getErrorMessage(error, '入库失败'));
    }
  };

  const renderDetailValue = (value?: string | number | null) =>
    value === undefined || value === null || value === '' ? '-' : value;
  const hasActiveFilters = Boolean(searchParams.status || searchParams.supplierId);
  const currentStatusLabel = searchParams.status ? statusDict.getLabel(searchParams.status) : '全部状态';
  const currentSupplierLabel = searchParams.supplierId
    ? suppliers.find((supplier) => supplier.supplierId === searchParams.supplierId)?.supplierName || '指定供应商'
    : '全部供应商';
  const resultSummary = hasActiveFilters ? `${currentStatusLabel} / ${currentSupplierLabel}` : '全部采购';
  const receiptTotal = useMemo(
    () => Object.values(receiptQuantities).reduce((sum, quantity) => sum + Number(quantity || 0), 0),
    [receiptQuantities],
  );
  const metrics = [
    { label: '采购申请', value: String(total), meta: `当前页 ${purchases.length}`, icon: <ShoppingCart size={18} />, tone: 'blue' },
    { label: '草稿', value: String(draftCount), meta: '待提交', icon: <Edit size={18} />, tone: 'amber' },
    { label: '审批中', value: String(pendingCount), meta: '流程流转', icon: <Send size={18} />, tone: 'violet' },
    { label: '已通过', value: String(approvedCount), meta: '可入库付款', icon: <PackageCheck size={18} />, tone: 'green' },
  ];

  const pageActions = (
    <div className="grid gap-5">
        <header className="admin-source-header">
          <div>
            <p className="admin-source-kicker">PURCHASE REQUESTS</p>
            <h2>采购申请</h2>
            <span>跟踪供应商、采购明细、入库、付款和审批状态</span>
          </div>
          <div className="admin-source-controls">
            <Button variant="outline" size="sm" onClick={() => void fetchPurchases()} disabled={loading}>
              <RotateCcw size={16} className={loading ? 'animate-spin' : ''} />
              刷新
            </Button>
            <Button size="sm" onClick={handleAdd}>
              <Plus size={16} />
              新建采购
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
    </div>
  );

  const pageFilters = (
        <section className="card admin-users-toolbar">
          <div className="admin-oa-filter-grid">
            <label>
              <span className="input-label">状态</span>
              <Select
                value={searchParams.status || 'ALL'}
                onValueChange={(value) => setSearchParams((prev) => ({
                  ...prev,
                  status: value === 'ALL' ? '' : value,
                  pageNum: 1,
                }))}
              >
                <SelectTrigger className="h-[42px]"><SelectValue placeholder="状态" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">全部状态</SelectItem>
                  {statusDict.getOptions().map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label>
              <span className="input-label">供应商</span>
              <Select
                value={searchParams.supplierId ? String(searchParams.supplierId) : 'ALL'}
                onValueChange={(value) => setSearchParams((prev) => ({
                  ...prev,
                  supplierId: value === 'ALL' ? undefined : Number(value),
                  pageNum: 1,
                }))}
              >
                <SelectTrigger className="h-[42px]"><SelectValue placeholder="供应商" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">全部供应商</SelectItem>
                  {suppliers.map((supplier) => (
                    <SelectItem key={supplier.supplierId} value={String(supplier.supplierId)}>
                      {supplier.supplierName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <div className="admin-users-toolbar-actions">
              <Button variant="outline" size="sm" onClick={resetFilters} disabled={!hasActiveFilters}>
                <RotateCcw size={14} />
                重置
              </Button>
            </div>
          </div>
        </section>
  );

  const pageTable = (
        <InnerTableSurface>
              <table className="unity-data-table admin-source-table min-w-[1160px]">
                <thead>
                  <tr>
                    <th>采购单号</th>
                    <th>供应商</th>
                    <th>申请人 / 部门</th>
                    <th>金额 / 到货</th>
                    <th>事由</th>
                    <th>状态</th>
                    <th>付款</th>
                    <th className="text-right">当前操作</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-500">正在加载采购申请...</td></tr>
                  ) : purchases.length === 0 ? (
                    <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-500">暂无采购申请</td></tr>
                  ) : purchases.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <div className="font-medium text-slate-900 dark:text-slate-100">{item.purchaseNo || '-'}</div>
                        <div className="mt-1 text-xs text-slate-400">{formatDateTimeDisplay(item.createTime)}</div>
                      </td>
                      <td>
                        <div className="font-medium text-slate-900 dark:text-slate-100">{item.supplierName || '-'}</div>
                        <div className="mt-1 text-xs text-slate-400">{item.supplierContact || item.supplierPhone || '-'}</div>
                      </td>
                      <td>
                        <div>{item.userName || '-'}</div>
                        <div className="mt-1 text-xs text-slate-400">{item.deptName || '-'}</div>
                      </td>
                      <td>
                        <div>{formatAmount(item.totalAmount)}</div>
                        <div className="mt-1 text-xs text-slate-400">{item.expectedDate || '-'}</div>
                      </td>
                      <td><div className="max-w-xs truncate">{item.reason || '-'}</div></td>
                      <td>{getStatusBadge(item.status)}</td>
                      <td>{getPaymentStatusBadge(item.paymentStatus)}</td>
                      <td>
                        <div className="admin-users-row-actions">
                          <button type="button" title="详情" aria-label="详情" onClick={() => void handleView(item)}><Eye size={15} /></button>
                          {item.status === 'DRAFT' ? <button type="button" title="编辑" aria-label="编辑" onClick={() => void handleEdit(item.id!)}><Edit size={15} /></button> : null}
                          {item.status === 'DRAFT' ? <button type="button" title="提交" aria-label="提交" onClick={() => setConfirmState({ type: 'submit', id: item.id!, title: '提交采购申请', message: '提交后将进入采购审批流程。', confirmText: '提交' })}><Send size={15} /></button> : null}
                          {canProcess(item.status) ? <button type="button" title="入库" aria-label="入库" onClick={() => void openReceipt(item)}><PackageCheck size={15} /></button> : null}
                          {canProcess(item.status) && !item.paymentRequestId ? <button type="button" title="付款" aria-label="付款" onClick={() => setConfirmState({ type: 'payment', id: item.id!, title: '生成付款申请', message: '将基于当前采购单创建付款申请草稿。', confirmText: '生成' })}><CreditCard size={15} /></button> : null}
                          {item.status === 'DRAFT' ? <button type="button" title="删除" aria-label="删除" onClick={() => setConfirmState({ type: 'delete', id: item.id!, title: '删除采购申请', message: '删除后当前草稿不可恢复。', confirmText: '删除', danger: true })}><Trash2 size={15} /></button> : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
        </InnerTableSurface>
  );

  const pagePagination = (
    <ListResultFooter
      total={total}
      page={searchParams.pageNum}
      pageSize={searchParams.pageSize}
      summary={resultSummary}
      onPageChange={(page) => setSearchParams((prev) => ({ ...prev, pageNum: page }))}
    />
  );

  return (
    <>
      <section className="admin-source-page oa-approval-page purchase-request-page">
        <TablePageLayout
          actions={pageActions}
          filters={pageFilters}
          table={pageTable}
          pagination={pagePagination}
        />
      </section>

      <BaseDialog
        open={showDialog}
        title={currentPurchase ? '编辑采购申请' : '新建采购申请'}
        onClose={closeFormDialog}
        width="wide"
        footer={(
          <>
            <Button variant="outline" onClick={closeFormDialog}>取消</Button>
            <Button onClick={() => void handleSave()}>保存</Button>
          </>
        )}
      >
        <div className="admin-dialog-stack">
          <DialogPanel title="基础信息" bodyClassName="grid gap-4 md:grid-cols-3">
            <div className="admin-dialog-field md:col-span-2">
              <Label>供应商</Label>
              <Select
                value={formData.supplierId ? String(formData.supplierId) : ''}
                onValueChange={(value) => setFormData((prev) => ({ ...prev, supplierId: Number(value) }))}
              >
                <SelectTrigger className="h-11"><SelectValue placeholder="请选择供应商" /></SelectTrigger>
                <SelectContent>
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
                className="h-11"
                type="date"
                value={formData.expectedDate || ''}
                onChange={(event) => setFormData((prev) => ({ ...prev, expectedDate: event.target.value }))}
              />
            </div>
          </DialogPanel>

          <DialogPanel title="业务归属" bodyClassName="grid gap-4 md:grid-cols-3">
            <div className="admin-dialog-field">
              <Label>关联项目</Label>
              <Select
                value={formData.projectId ? String(formData.projectId) : 'NONE'}
                onValueChange={(value) => {
                  const project = projectOptions.find((item) => String(item.projectId) === value);
                  setFormData((prev) => ({
                    ...prev,
                    projectId: value === 'NONE' ? undefined : Number(value),
                    projectName: project?.projectName || '',
                    customerId: project?.customerId || prev.customerId,
                    customerName: project?.customerName || prev.customerName,
                  }));
                }}
              >
                <SelectTrigger className="h-11"><SelectValue placeholder="选择项目" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">暂不关联项目</SelectItem>
                  {projectOptions.map((item) => (
                    <SelectItem key={item.projectId} value={String(item.projectId)}>
                      {item.projectName} / {item.customerName || '无客户'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="admin-dialog-field">
              <Label>客户</Label>
              <Select
                value={formData.customerId ? String(formData.customerId) : 'NONE'}
                onValueChange={(value) => {
                  const customer = customerOptions.find((item) => String(item.customerId) === value);
                  setFormData((prev) => ({
                    ...prev,
                    customerId: value === 'NONE' ? undefined : Number(value),
                    customerName: customer?.customerName || '',
                  }));
                }}
              >
                <SelectTrigger className="h-11"><SelectValue placeholder="选择客户" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">暂不关联客户</SelectItem>
                  {customerOptions.map((item) => (
                    <SelectItem key={item.customerId} value={String(item.customerId)}>
                      {item.customerName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="admin-dialog-field">
              <Label>默认预算科目</Label>
              <Select
                value={formData.budgetSubjectCode || 'NONE'}
                onValueChange={(value) => {
                  const subject = budgetSubjectOptions.find((item) => item.subjectCode === value);
                  setFormData((prev) => ({
                    ...prev,
                    budgetSubjectCode: value === 'NONE' ? '' : value,
                    budgetSubjectName: subject?.subjectName || '',
                    items: (prev.items || []).map((item) => ({
                      ...item,
                      budgetSubjectCode: item.budgetSubjectCode || (value === 'NONE' ? '' : value),
                      budgetSubjectName: item.budgetSubjectName || subject?.subjectName || '',
                    })),
                  }));
                }}
              >
                <SelectTrigger className="h-11"><SelectValue placeholder="选择默认预算科目" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">暂不指定预算科目</SelectItem>
                  {budgetSubjectOptions.map((item) => (
                    <SelectItem key={item.subjectId} value={item.subjectCode}>
                      {item.subjectCode} / {item.subjectName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </DialogPanel>

          <DialogPanel title="采购事由">
            <div className="admin-dialog-field">
              <Label>事由说明</Label>
              <Textarea
                className="min-h-[100px] resize-none"
                value={formData.reason}
                onChange={(event) => setFormData((prev) => ({ ...prev, reason: event.target.value }))}
                placeholder="填写采购原因"
              />
            </div>
          </DialogPanel>

          <PurchasePanel
            title="采购明细"
            meta={`汇总金额 ${formatAmount(formTotalAmount)}`}
            bodyClassName="admin-purchase-item-list"
            actions={(
              <Button size="sm" onClick={addItem}>
                <Plus size={14} className="mr-1.5" />
                添加明细
              </Button>
            )}
          >
            {formData.items?.map((item, index) => (
              <article key={`${index}-${item.id || 'draft'}`} className="admin-purchase-item-card">
                <div className="admin-purchase-item-grid">
                    <div className="admin-dialog-field">
                      <Label className="text-xs text-slate-500">耗材</Label>
                      <Select value={item.consumableId ? String(item.consumableId) : ''} onValueChange={(value) => updateItem(index, 'consumableId', Number(value))}>
                        <SelectTrigger className="h-10"><SelectValue placeholder="请选择耗材" /></SelectTrigger>
                        <SelectContent>
                          {consumables.map((consumable) => (
                            <SelectItem key={consumable.consumableId} value={String(consumable.consumableId)}>
                              {consumable.name} {consumable.model ? `/${consumable.model}` : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="admin-dialog-field">
                      <Label className="text-xs text-slate-500">预算科目</Label>
                      <Select value={item.budgetSubjectCode || 'NONE'} onValueChange={(value) => {
                        const subject = budgetSubjectOptions.find((option) => option.subjectCode === value);
                        const next = [...(formData.items || [])];
                        next[index] = {
                          ...next[index],
                          budgetSubjectCode: value === 'NONE' ? '' : value,
                          budgetSubjectName: subject?.subjectName || '',
                        };
                        setFormData((prev) => ({ ...prev, items: next }));
                      }}>
                        <SelectTrigger className="h-10"><SelectValue placeholder="预算科目" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="NONE">默认科目</SelectItem>
                          {budgetSubjectOptions.map((option) => (
                            <SelectItem key={option.subjectId} value={option.subjectCode}>
                              {option.subjectCode} / {option.subjectName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="admin-dialog-field">
                      <Label className="text-xs text-slate-500">数量</Label>
                      <Input className="h-10" type="number" min="1" value={item.quantity || ''} onChange={(event) => updateItem(index, 'quantity', parseInt(event.target.value, 10) || 0)} />
                    </div>
                    <div className="admin-dialog-field">
                      <Label className="text-xs text-slate-500">单价</Label>
                      <Input className="h-10" type="number" min="0" step="0.01" value={item.unitPrice || ''} onChange={(event) => updateItem(index, 'unitPrice', parseFloat(event.target.value) || 0)} />
                    </div>
                    <div className="admin-dialog-field">
                      <Label className="text-xs text-slate-500">金额</Label>
                      <Input className="h-10" value={formatAmount(Number(item.quantity || 0) * Number(item.unitPrice || 0))} disabled />
                    </div>
                    <div className="admin-purchase-item-actions">
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        onClick={() => removeItem(index)}
                        className="h-10 w-10 border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 dark:border-rose-900 dark:bg-rose-950/20 dark:text-rose-300"
                        aria-label="删除明细"
                        title="删除明细"
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  {item.consumableName || '-'} {item.model ? ` / ${item.model}` : ''} {item.unit ? ` / ${item.unit}` : ''}
                </div>
              </article>
            ))}
          </PurchasePanel>

          <DialogPanel title="附件">
            <div className="admin-dialog-field">
              <Label className="text-xs font-medium text-slate-500 dark:text-slate-400">附件文件</Label>
              <FileUpload
                value={formData.attachmentUrl || ''}
                onChange={(urls) => setFormData((prev) => ({ ...prev, attachmentUrl: urls }))}
                maxCount={5}
              />
            </div>
          </DialogPanel>
        </div>
      </BaseDialog>

      <BaseDialog
        open={Boolean(detailPurchase)}
        title={detailPurchase?.purchaseNo || '采购申请详情'}
        onClose={() => setDetailPurchase(null)}
        width="wide"
        headerAside={detailPurchase && !detailLoading ? getStatusBadge(detailPurchase.status) : null}
        bodyClassName="admin-dialog-stack"
        footer={<Button variant="outline" onClick={() => setDetailPurchase(null)}>关闭</Button>}
      >
        {detailLoading ? (
          <InlineState title="正在加载采购详情..." icon={<Clock3 className="h-4 w-4 animate-spin" />} />
        ) : detailPurchase ? (
          <>
            <DetailRows>
              <DetailRow label="供应商" value={renderDetailValue(detailPurchase.supplierName)} />
              <DetailRow label="联系人" value={renderDetailValue(detailPurchase.supplierContact)} />
              <DetailRow label="联系电话" value={renderDetailValue(detailPurchase.supplierPhone)} />
              <DetailRow label="总金额" value={formatAmount(detailPurchase.totalAmount)} />
              <DetailRow label="期望到货日期" value={renderDetailValue(detailPurchase.expectedDate)} />
              <DetailRow label="付款申请" value={detailPurchase.paymentRequestId ? `#${detailPurchase.paymentRequestId}` : '-'} />
              <DetailRow label="付款状态" value={getPaymentStatusBadge(detailPurchase.paymentStatus)} />
              <DetailRow label="关联项目" value={renderDetailValue(detailPurchase.projectName)} />
              <DetailRow label="客户" value={renderDetailValue(detailPurchase.customerName)} />
              <DetailRow label="默认预算科目" value={renderDetailValue(detailPurchase.budgetSubjectName || detailPurchase.budgetSubjectCode)} />
              <DetailRow label="申请人" value={renderDetailValue(detailPurchase.userName)} />
              <DetailRow label="所属部门" value={renderDetailValue(detailPurchase.deptName)} />
              <DetailRow label="流程实例" value={renderDetailValue(detailPurchase.instanceId)} />
              <DetailRow label="创建时间" value={formatDateTimeDisplay(detailPurchase.createTime)} />
              <DetailRow label="更新时间" value={formatDateTimeDisplay(detailPurchase.updateTime)} />
            </DetailRows>
            <PurchasePanel title="采购事由">
              <div className="whitespace-pre-wrap text-sm leading-6 text-slate-600 dark:text-slate-300">{detailPurchase.reason || '-'}</div>
            </PurchasePanel>
            <PurchasePanel title="采购明细">
              {detailPurchase.items?.length ? (
                <InnerTableSurface>
                  <table className="unity-data-table admin-source-table min-w-[760px]">
                    <thead>
                      <tr>
                        <th className="px-4 py-3 text-left text-sm font-medium text-slate-500">耗材</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-slate-500">数量</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-slate-500">单价</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-slate-500">金额</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-slate-500">已入库</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailPurchase.items.map((item) => (
                        <tr key={item.id}>
                          <td>{item.consumableName || '-'}</td>
                          <td>{item.quantity} {item.unit || ''}</td>
                          <td>{formatAmount(item.unitPrice)}</td>
                          <td>{formatAmount(item.amount)}</td>
                          <td>{item.receivedQuantity || 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </InnerTableSurface>
              ) : <InlineState title="暂无采购明细" className="py-6" />}
            </PurchasePanel>
            <PurchasePanel title="附件">
              {getAttachmentList(detailPurchase.attachmentUrl).length ? (
                <div className="admin-dialog-link-list">
                  {getAttachmentList(detailPurchase.attachmentUrl).map((url) => (
                    <a key={url} href={url} target="_blank" rel="noreferrer" className="admin-dialog-link-card">
                      <Paperclip size={14} />
                      <span className="truncate">{getAttachmentDisplayName(url)}</span>
                    </a>
                  ))}
                </div>
              ) : <InlineState title="暂无附件" className="py-5" icon={<Paperclip className="h-4 w-4" />} />}
            </PurchasePanel>
          </>
        ) : null}
      </BaseDialog>

      <BaseDialog
        open={Boolean(receiptPurchase)}
        title={receiptPurchase?.purchaseNo ? `采购入库 - ${receiptPurchase.purchaseNo}` : '采购入库'}
        onClose={() => setReceiptPurchase(null)}
        width="wide"
        footer={(
          <>
            <Button variant="outline" onClick={() => setReceiptPurchase(null)}>取消</Button>
            <Button onClick={() => void handleReceipt()} disabled={receiptTotal <= 0}>确认入库</Button>
          </>
        )}
      >
        <div className="admin-dialog-stack">
          <PurchasePanel title="入库明细">
            <InnerTableSurface>
                <table className="unity-data-table admin-source-table min-w-[720px]">
                  <thead>
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-500">耗材</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-500">申请数量</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-500">已入库</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-500">本次入库</th>
                    </tr>
                  </thead>
                  <tbody>
                    {receiptPurchase?.items?.map((item) => {
                      const remain = getReceivableQuantity(item);
                      return (
                        <tr key={item.id}>
                          <td className="px-4 py-3 text-sm text-slate-900 dark:text-slate-100">{item.consumableName || '-'}</td>
                          <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">{item.quantity} {item.unit || ''}</td>
                          <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">{item.receivedQuantity || 0}</td>
                          <td className="px-4 py-3">
                            <Input
                              className="h-10 max-w-[160px]"
                              type="number"
                              min="0"
                              max={remain}
                              value={item.id ? receiptQuantities[item.id] ?? 0 : 0}
                              disabled={remain <= 0}
                              onChange={(event) => item.id && setReceiptQuantities((prev) => ({
                                ...prev,
                                [item.id!]: Math.min(remain, parseInt(event.target.value, 10) || 0),
                              }))}
                            />
                            <div className="mt-1 text-xs text-slate-400">
                              {remain > 0 ? `剩余可入库 ${remain}${item.unit || ''}` : '已全部入库'}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
            </InnerTableSurface>
          </PurchasePanel>
          <DialogPanel title="入库备注">
            <div className="admin-dialog-field">
              <Label className="text-xs font-medium text-slate-500 dark:text-slate-400">备注内容</Label>
              <Textarea className="min-h-[90px] resize-none" value={receiptRemark} onChange={(event) => setReceiptRemark(event.target.value)} />
            </div>
          </DialogPanel>
        </div>
      </BaseDialog>

      <ConfirmDialog
        open={Boolean(confirmState)}
        title={confirmState?.title || '确认操作'}
        message={confirmState?.message || ''}
        confirmText={confirmState?.confirmText || '确定'}
        danger={confirmState?.danger}
        onConfirm={() => void handleConfirmAction()}
        onCancel={() => setConfirmState(null)}
      />
    </>
  );
};

export default PurchaseRequestPage;
