import React, { useEffect, useMemo, useState } from 'react';
import { Edit, ExternalLink, Eye, FileCheck2, Plus, Receipt, RefreshCw, RotateCcw, Search, Send } from 'lucide-react';
import { toast } from 'sonner';
import { expenseClaimApi, paymentRequestApi, ExpenseClaim, PaymentRequest } from '@/services/api/expense';
import { invoiceApi, Invoice, InvoiceWriteoff } from '@/services/api/invoice';
import { crmApi, CrmReceivable } from '@/services/api/crm';
import { contractApi, OaContract } from '@/services/api/contractRisk';
import { useAuth } from '@/context/AuthContext';
import { getErrorMessage } from '@/utils/errorMessage';
import { BaseDialog } from '@/components/common/BaseDialog';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { Button, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from '@/components/common';
import { getInvoiceDirectionLabel } from '@/utils/enumLabels';
import { useDict } from '@/hooks/useDict';
import { DictBadge } from '@/components/common/DictBadge';
import { InnerTableSurface, TablePageLayout } from '@/components/layout/TablePageLayout';

type InvoiceDialog =
  | { type: 'invoice'; item?: Invoice | null }
  | { type: 'detail'; item: Invoice }
  | { type: 'bind'; item: Invoice }
  | { type: 'writeoff'; item: Invoice }
  | null;

type BindTargetType = 'NONE' | 'EXPENSE' | 'PAYMENT';

const fieldLabelClassName = 'text-xs font-medium text-slate-500 dark:text-slate-400';


const emptyInvoice: Invoice = {
  invoiceDirection: 'OUTPUT',
  invoiceCode: '',
  invoiceNo: '',
  invoiceType: '',
  grossAmount: 0,
  taxAmount: 0,
  thirdPartySystem: '',
  externalBillNo: '',
  externalLinkUrl: '',
  sellerName: '',
  buyerName: '',
  customerName: '',
  contractNo: '',
  remark: '',
};

const emptyWriteoff: InvoiceWriteoff = {
  businessType: 'CRM_RECEIVABLE',
  businessId: 0,
  writeoffAmount: 0,
  remark: '',
};

const formatMoney = (value?: number) =>
  `¥${Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const InvoiceMetric: React.FC<{
  label: string;
  value: React.ReactNode;
  meta?: React.ReactNode;
  icon: React.ReactNode;
  tone?: 'blue' | 'green' | 'amber' | 'violet';
}> = ({ label, value, meta, icon, tone = 'blue' }) => (
  <article className={`card admin-source-stat admin-source-tone-${tone} admin-invoice-metric`}>
    <div className="admin-source-stat-icon">{icon}</div>
    <div className="min-w-0">
      <p>{label}</p>
      <strong>{value}</strong>
      {meta ? <span>{meta}</span> : null}
    </div>
  </article>
);

const InvoicePanel: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="admin-invoice-panel">
    <div className="admin-invoice-panel-head">
      <div>
        <h3>{title}</h3>
      </div>
    </div>
    <div className="admin-invoice-panel-body">{children}</div>
  </section>
);

const InvoiceNote: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="admin-invoice-note">{children}</div>
);

const InvoiceHistoryRow: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="admin-invoice-history-row text-sm">{children}</div>
);

const resolvePageRows = <T,>(page?: { rows?: T[]; records?: T[] } | null) => page?.rows || page?.records || [];

export default function InvoiceManagementPage() {
  const { hasPermission } = useAuth();
  const [rows, setRows] = useState<Invoice[]>([]);
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState('');
  const [direction, setDirection] = useState('');
  const [dialog, setDialog] = useState<InvoiceDialog>(null);
  const [invoiceForm, setInvoiceForm] = useState<Invoice>(emptyInvoice);
  const [writeoffForm, setWriteoffForm] = useState<InvoiceWriteoff>(emptyWriteoff);
  const [writeoffHistory, setWriteoffHistory] = useState<InvoiceWriteoff[]>([]);
  const [bindTargetType, setBindTargetType] = useState<BindTargetType>('NONE');
  const [saving, setSaving] = useState(false);
  const [voidTarget, setVoidTarget] = useState<Invoice | null>(null);

  const invoiceStatusDict = useDict('invoice_status');

  const [expenseClaims, setExpenseClaims] = useState<ExpenseClaim[]>([]);
  const [paymentRequests, setPaymentRequests] = useState<PaymentRequest[]>([]);
  const [receivables, setReceivables] = useState<CrmReceivable[]>([]);
  const [contracts, setContracts] = useState<OaContract[]>([]);

  const expenseOptions = useMemo(
    () => expenseClaims.map((item) => ({ label: `${item.claimNo || item.id} / ${item.description || '报销单'}`, value: item.id || 0 })),
    [expenseClaims],
  );

  const paymentOptions = useMemo(
    () => paymentRequests.map((item) => ({ label: `${item.paymentNo || item.id} / ${item.payeeName}`, value: item.id || 0 })),
    [paymentRequests],
  );

  const receivableOptions = useMemo(
    () => receivables.map((item) => ({ label: `${item.receivableNo || item.receivableId} / ${item.receivableName}`, value: item.receivableId || 0 })),
    [receivables],
  );

  const contractOptions = useMemo(
    () => contracts.map((item) => ({ label: `${item.contractNo || item.contractId} / ${item.contractName}`, value: item.contractId || 0 })),
    [contracts],
  );

  const load = async () => {
    try {
      const result = await invoiceApi.list({
        pageNum: 1,
        pageSize: 100,
        invoiceNo: keyword || undefined,
        invoiceCode: keyword || undefined,
        invoiceDirection: direction || undefined,
        status: status || undefined,
      });
      setRows(resolvePageRows(result));
    } catch (error) {
      toast.error(getErrorMessage(error, '加载发票失败'));
    }
  };

  const loadBindings = async () => {
    try {
      const [expenseResult, paymentResult, receivableResult, contractResult] = await Promise.all([
        expenseClaimApi.list({ pageNum: 1, pageSize: 100 }),
        paymentRequestApi.list({ pageNum: 1, pageSize: 100 }),
        crmApi.listReceivables({ pageNum: 1, pageSize: 100 }),
        contractApi.list({ pageNum: 1, pageSize: 100 }),
      ]);
      setExpenseClaims(resolvePageRows(expenseResult));
      setPaymentRequests(resolvePageRows(paymentResult));
      setReceivables(resolvePageRows(receivableResult));
      setContracts(resolvePageRows(contractResult));
    } catch (error) {
      toast.error(getErrorMessage(error, '加载业务候选数据失败'));
    }
  };

  useEffect(() => {
    void load();
  }, [keyword, direction, status]);

  useEffect(() => {
    void loadBindings();
  }, []);

  const openDialog = async (next: InvoiceDialog) => {
    setDialog(next);
    if (!next) {
      setInvoiceForm(emptyInvoice);
      setWriteoffForm(emptyWriteoff);
      setWriteoffHistory([]);
      setBindTargetType('NONE');
      return;
    }
    if (next.type === 'invoice') {
      setInvoiceForm(next.item || emptyInvoice);
      setWriteoffHistory([]);
      return;
    }
    if (next.type === 'bind') {
      setInvoiceForm(next.item);
      setBindTargetType(next.item.paymentRequestId ? 'PAYMENT' : next.item.expenseClaimId ? 'EXPENSE' : 'NONE');
      setWriteoffHistory([]);
      return;
    }
    if (next.type === 'writeoff') {
      setInvoiceForm(next.item);
      setWriteoffForm({
        businessType: next.item.receivableId ? 'CRM_RECEIVABLE' : next.item.paymentRequestId ? 'PAYMENT_REQUEST' : 'EXPENSE_CLAIM',
        businessId: next.item.receivableId || next.item.paymentRequestId || next.item.expenseClaimId || 0,
        businessNo: next.item.receivableId ? next.item.contractNo : next.item.paymentRequestId ? next.item.paymentRequestId.toString() : next.item.expenseClaimId?.toString(),
        writeoffAmount: Number(next.item.grossAmount || 0),
        remark: '',
      });
      try {
        const history = await invoiceApi.listWriteoffs(next.item.invoiceId!);
        setWriteoffHistory(history);
      } catch (error) {
        toast.error(getErrorMessage(error, '加载核销历史失败'));
      }
      return;
    }
    if (next.type === 'detail') {
      try {
        const [detail, history] = await Promise.all([
          invoiceApi.getInfo(next.item.invoiceId!),
          invoiceApi.listWriteoffs(next.item.invoiceId!),
        ]);
        setInvoiceForm(detail);
        setWriteoffHistory(history);
      } catch (error) {
        toast.error(getErrorMessage(error, '加载发票详情失败'));
      }
    }
  };

  const saveInvoice = async () => {
    setSaving(true);
    try {
      if (invoiceForm.invoiceId) {
        await invoiceApi.edit(invoiceForm);
      } else {
        await invoiceApi.add(invoiceForm);
      }
      toast.success('发票已保存');
      await openDialog(null);
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error, '保存发票失败'));
    } finally {
      setSaving(false);
    }
  };

  const saveBind = async () => {
    if (!invoiceForm.invoiceId) return;
    setSaving(true);
    try {
      await invoiceApi.bind(invoiceForm.invoiceId, {
        receivableId: invoiceForm.receivableId,
        customerId: invoiceForm.customerId,
        customerName: invoiceForm.customerName,
        contractId: invoiceForm.contractId,
        contractNo: invoiceForm.contractNo,
        expenseClaimId: invoiceForm.expenseClaimId,
        paymentRequestId: invoiceForm.paymentRequestId,
      });
      toast.success('发票已绑定业务对象');
      await openDialog(null);
      await load();
      await loadBindings();
    } catch (error) {
      toast.error(getErrorMessage(error, '绑定发票失败'));
    } finally {
      setSaving(false);
    }
  };

  const saveWriteoff = async () => {
    if (!invoiceForm.invoiceId) return;
    setSaving(true);
    try {
      await invoiceApi.writeoff(invoiceForm.invoiceId, writeoffForm);
      toast.success('发票已核销');
      await openDialog({ type: 'writeoff', item: { ...invoiceForm } });
      await load();
      await loadBindings();
    } catch (error) {
      toast.error(getErrorMessage(error, '发票核销失败'));
    } finally {
      setSaving(false);
    }
  };

  const statusBadge = (value?: string) => (
    <DictBadge dictType="invoice_status" value={value || ''} className="rounded-md px-2.5 py-1 font-semibold" />
  );

  const bindDescription = invoiceForm.invoiceDirection === 'OUTPUT'
    ? '销项发票 = 绑定 CRM 回款计划，自动带出客户和合同，并把核销状态回写到 CRM 回款和 OA 合同。'
    : '进项发票 = 绑定报销单或付款单，绑定和核销后会同步更新 OA 单据的发票汇总状态。';
  const metrics = [
    { label: '发票总数', value: String(rows.length), meta: `含税 ${formatMoney(rows.reduce((sum, item) => sum + Number(item.grossAmount || 0), 0))}`, icon: <FileCheck2 size={18} />, tone: 'blue' },
    { label: '销项发票', value: String(rows.filter((item) => item.invoiceDirection === 'OUTPUT').length), meta: 'CRM 回款', icon: <Send size={18} />, tone: 'green' },
    { label: '进项发票', value: String(rows.filter((item) => item.invoiceDirection === 'INPUT').length), meta: '报销 / 付款', icon: <Receipt size={18} />, tone: 'violet' },
    { label: '已作废', value: String(rows.filter((item) => item.status === 'VOID').length), meta: '禁止核销', icon: <RotateCcw size={18} />, tone: 'amber' },
  ];

  const pageActions = (
    <div className="grid gap-5">
      <header className="admin-source-header">
        <div>
          <p className="admin-source-kicker">INVOICE CONTROL</p>
          <h2>发票管理</h2>
          <span>维护发票录入、业务绑定、核销、作废和外链跳转</span>
        </div>
        <div className="admin-source-controls">
          <Button variant="outline" size="sm" onClick={() => void load()}>
            <RefreshCw size={16} />
            刷新
          </Button>
          <Button size="sm" onClick={() => void openDialog({ type: 'invoice' })} disabled={!hasPermission('oa:invoice:add')}>
            <Plus size={16} />新增发票
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
      <div className="admin-finance-filter-grid">
        <label className="admin-source-search">
          <span className="input-label">发票代码 / 号码</span>
          <div className="admin-source-search-field">
            <Search size={16} />
            <Input className="h-[42px]" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="搜索发票代码或号码" type="search" />
          </div>
        </label>
        <label>
          <span className="input-label">发票方向</span>
          <Select value={direction || 'ALL'} onValueChange={(value) => setDirection(value === 'ALL' ? '' : value)}>
            <SelectTrigger className="h-[42px]"><SelectValue placeholder="全部方向" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">全部方向</SelectItem>
              <SelectItem value="INPUT">进项发票</SelectItem>
              <SelectItem value="OUTPUT">销项发票</SelectItem>
            </SelectContent>
          </Select>
        </label>
        <label>
          <span className="input-label">发票状态</span>
          <Select value={status || 'ALL'} onValueChange={(value) => setStatus(value === 'ALL' ? '' : value)}>
            <SelectTrigger className="h-[42px]"><SelectValue placeholder="全部状态" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">全部状态</SelectItem>
              {(invoiceStatusDict.data || []).filter((item) => item.value !== 'NONE').map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </label>
        <div className="admin-users-toolbar-actions">
          <span className="admin-users-filter-count">{direction || status || keyword ? '已筛选' : '全部发票'}</span>
        </div>
      </div>
    </section>
  );

  const pageTable = (
    <InnerTableSurface>
      <table className="unity-data-table admin-source-table finance-source-table admin-invoice-table">
          <colgroup>
            <col />
            <col />
            <col />
            <col />
            <col />
            <col />
            <col />
          </colgroup>
          <thead>
            <tr>
              <th>发票</th>
              <th>方向</th>
              <th>金额</th>
              <th>购方 / 销方</th>
              <th>绑定对象</th>
              <th>状态</th>
              <th className="text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => (
              <tr key={item.invoiceId}>
                <td>
                  <strong>{item.invoiceCode} / {item.invoiceNo}</strong>
                  <div className="text-xs text-slate-500">{item.invoiceType || '未分类'} / {item.invoiceDate || '-'}</div>
                </td>
                <td>{getInvoiceDirectionLabel(item.invoiceDirection || 'OUTPUT')}</td>
                <td>
                  <div>{formatMoney(item.grossAmount)}</div>
                  <div className="text-xs text-slate-500">税额 {formatMoney(item.taxAmount)}</div>
                </td>
                <td>
                  <div>{item.buyerName || '-'}</div>
                  <div className="text-xs text-slate-500">{item.sellerName || '-'}</div>
                </td>
                <td>
                  <div>{item.contractNo || '-'}</div>
                  <div className="text-xs text-slate-500">
                    回款 {item.receivableId || '-'} / 报销 {item.expenseClaimId || '-'} / 付款 {item.paymentRequestId || '-'}
                  </div>
                </td>
                <td>{statusBadge(item.status)}</td>
                <td>
                  <div className="admin-users-row-actions">
                    <button type="button" title="详情" aria-label="详情" onClick={() => void openDialog({ type: 'detail', item })}><Eye size={15} /></button>
                    {hasPermission('oa:invoice:edit') ? <button type="button" title="编辑" aria-label="编辑" onClick={() => void openDialog({ type: 'invoice', item })}><Edit size={15} /></button> : null}
                    {item.status !== 'VOID' && hasPermission('oa:invoice:bind') ? <button type="button" title="绑定业务" aria-label="绑定业务" onClick={() => void openDialog({ type: 'bind', item })}><Send size={15} /></button> : null}
                    {item.status !== 'VOID' && hasPermission('oa:invoice:writeoff') ? <button type="button" title="核销发票" aria-label="核销发票" onClick={() => void openDialog({ type: 'writeoff', item })}><Receipt size={15} /></button> : null}
                    {item.status !== 'VOID' && hasPermission('oa:invoice:void') ? <button type="button" className="danger" title="作废发票" aria-label="作废发票" onClick={() => setVoidTarget(item)}><RotateCcw size={15} /></button> : null}
                    {item.externalLinkUrl ? <button type="button" title="打开外链" aria-label="打开外链" onClick={() => window.open(item.externalLinkUrl, '_blank', 'noopener,noreferrer')}><ExternalLink size={15} /></button> : null}
                  </div>
                </td>
              </tr>
            ))}
            {!rows.length ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-500"><FileCheck2 className="mx-auto mb-3 h-4 w-4" />暂无发票。下一步操作：新建一张进项或销项发票，随后绑定业务对象。</td></tr>
            ) : null}
          </tbody>
      </table>
    </InnerTableSurface>
  );

  return (
    <>
      <section className="admin-source-page finance-source-page invoice-management-page">
        <TablePageLayout
          actions={pageActions}
          filters={pageFilters}
          table={pageTable}
        />
      </section>

      <BaseDialog
        open={dialog?.type === 'invoice'}
        title={invoiceForm.invoiceId ? '编辑发票' : '新增发票'}
        onClose={() => void openDialog(null)}
        width="wide"
        footer={<><Button variant="outline" onClick={() => void openDialog(null)}>取消</Button><Button onClick={() => void saveInvoice()} disabled={saving}>{saving ? '保存中...' : '保存'}</Button></>}
      >
        <div className="admin-dialog-stack">
          <InvoiceNote>
            发票录入 = 先登记基础信息，再按方向决定后续绑定对象。`INPUT` 对应报销 / 付款，`OUTPUT` 对应 CRM 回款计划。
          </InvoiceNote>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label className={fieldLabelClassName}>发票方向 <span className="text-red-500">*</span></Label>
              <Select value={invoiceForm.invoiceDirection || 'OUTPUT'} onValueChange={(value) => setInvoiceForm((prev) => ({ ...prev, invoiceDirection: value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="INPUT">进项发票</SelectItem>
                  <SelectItem value="OUTPUT">销项发票</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className={fieldLabelClassName}>第三方系统</Label>
              <Input value={invoiceForm.thirdPartySystem || ''} onChange={(e) => setInvoiceForm((prev) => ({ ...prev, thirdPartySystem: e.target.value }))} placeholder="例如：金税云" />
            </div>
            <div>
              <Label className={fieldLabelClassName}>发票代码 <span className="text-red-500">*</span></Label>
              <Input value={invoiceForm.invoiceCode || ''} onChange={(e) => setInvoiceForm((prev) => ({ ...prev, invoiceCode: e.target.value }))} placeholder="例如：OUT2026050801" />
            </div>
            <div>
              <Label className={fieldLabelClassName}>发票号码 <span className="text-red-500">*</span></Label>
              <Input value={invoiceForm.invoiceNo || ''} onChange={(e) => setInvoiceForm((prev) => ({ ...prev, invoiceNo: e.target.value }))} placeholder="例如：0008801" />
            </div>
            <div>
              <Label className={fieldLabelClassName}>含税金额</Label>
              <Input type="number" min={0} value={String(invoiceForm.grossAmount || 0)} onChange={(e) => setInvoiceForm((prev) => ({ ...prev, grossAmount: Number(e.target.value || 0) }))} placeholder="例如：120000" />
            </div>
            <div>
              <Label className={fieldLabelClassName}>税额</Label>
              <Input type="number" min={0} value={String(invoiceForm.taxAmount || 0)} onChange={(e) => setInvoiceForm((prev) => ({ ...prev, taxAmount: Number(e.target.value || 0) }))} placeholder="例如：7200" />
            </div>
            <div>
              <Label className={fieldLabelClassName}>购方名称</Label>
              <Input value={invoiceForm.buyerName || ''} onChange={(e) => setInvoiceForm((prev) => ({ ...prev, buyerName: e.target.value }))} placeholder="例如：景曜科技有限公司" />
            </div>
            <div>
              <Label className={fieldLabelClassName}>销方名称</Label>
              <Input value={invoiceForm.sellerName || ''} onChange={(e) => setInvoiceForm((prev) => ({ ...prev, sellerName: e.target.value }))} placeholder="例如：CloudFlow 科技有限公司" />
            </div>
            <div>
              <Label className={fieldLabelClassName}>第三方单号</Label>
              <Input value={invoiceForm.externalBillNo || ''} onChange={(e) => setInvoiceForm((prev) => ({ ...prev, externalBillNo: e.target.value }))} placeholder="例如：CRM-INV-8801" />
            </div>
            <div>
              <Label className={fieldLabelClassName}>外链 URL</Label>
              <Input value={invoiceForm.externalLinkUrl || ''} onChange={(e) => setInvoiceForm((prev) => ({ ...prev, externalLinkUrl: e.target.value }))} placeholder="例如：https://tax.example.com/invoice/CRM-INV-8801" />
            </div>
            <div className="md:col-span-2">
              <Label className={fieldLabelClassName}>备注</Label>
              <Textarea value={invoiceForm.remark || ''} onChange={(e) => setInvoiceForm((prev) => ({ ...prev, remark: e.target.value }))} placeholder="例如：景曜科技首期回款对应销项发票" />
            </div>
          </div>
        </div>
      </BaseDialog>

      <BaseDialog
        open={dialog?.type === 'detail'}
        title={`${invoiceForm.invoiceCode || ''} / ${invoiceForm.invoiceNo || '发票详情'}`}
        onClose={() => void openDialog(null)}
        width="wide"
      >
        <div className="admin-dialog-stack">
          <div className="admin-source-stat-grid">
            <InvoiceMetric label="发票方向" value={getInvoiceDirectionLabel(invoiceForm.invoiceDirection || 'OUTPUT')} meta="业务流向" icon={<FileCheck2 size={18} />} tone="blue" />
            <InvoiceMetric label="发票状态" value={statusBadge(invoiceForm.status)} meta="当前状态" icon={<Receipt size={18} />} tone="amber" />
            <InvoiceMetric label="含税金额" value={formatMoney(invoiceForm.grossAmount)} meta="票面金额" icon={<Send size={18} />} tone="green" />
            <InvoiceMetric label="税额" value={formatMoney(invoiceForm.taxAmount)} meta="税额合计" icon={<RotateCcw size={18} />} tone="violet" />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <InvoicePanel title="绑定对象">
              <div className="admin-finance-detail-list">
                <div><span>客户</span><strong>{invoiceForm.customerName || '-'}</strong></div>
                <div><span>合同</span><strong>{invoiceForm.contractNo || '-'}</strong></div>
                <div><span>回款计划</span><strong>{invoiceForm.receivableId || '-'}</strong></div>
                <div><span>报销单</span><strong>{invoiceForm.expenseClaimId || '-'}</strong></div>
                <div><span>付款单</span><strong>{invoiceForm.paymentRequestId || '-'}</strong></div>
              </div>
            </InvoicePanel>
            <InvoicePanel title="第三方信息">
              <div className="admin-finance-detail-list">
                <div><span>系统</span><strong>{invoiceForm.thirdPartySystem || '-'}</strong></div>
                <div><span>外部单号</span><strong>{invoiceForm.externalBillNo || '-'}</strong></div>
                <div><span>外链</span><strong>{invoiceForm.externalLinkUrl || '-'}</strong></div>
              </div>
            </InvoicePanel>
          </div>

          <InvoicePanel title="核销历史">
            <div className="admin-dialog-stack">
              {writeoffHistory.length ? writeoffHistory.map((item) => (
                <InvoiceHistoryRow key={item.writeoffId || `${item.businessType}-${item.businessId}-${item.writeoffDate}`}>
                  <div>{item.businessType} / {item.businessNo || item.businessId || '-'}</div>
                  <div className="text-xs text-slate-500">核销金额 {formatMoney(item.writeoffAmount)} / 核销日期 {item.writeoffDate || '-'}</div>
                </InvoiceHistoryRow>
              )) : <div className="text-sm text-slate-500">暂无核销历史。下一步操作：在“核销发票”中录入第一笔核销。</div>}
            </div>
          </InvoicePanel>
        </div>
      </BaseDialog>

      <BaseDialog
        open={dialog?.type === 'bind'}
        title="绑定发票业务对象"
        onClose={() => void openDialog(null)}
        width="wide"
        footer={<><Button variant="outline" onClick={() => void openDialog(null)}>取消</Button><Button onClick={() => void saveBind()} disabled={saving}>{saving ? '绑定中...' : '确认绑定'}</Button></>}
      >
        <div className="admin-dialog-stack">
          <InvoiceNote>
            {bindDescription}
          </InvoiceNote>

          {invoiceForm.invoiceDirection === 'OUTPUT' ? (
            <div className="admin-dialog-stack">
              <div>
                <Label className={fieldLabelClassName}>CRM 回款计划 <span className="text-red-500">*</span></Label>
                <Select value={invoiceForm.receivableId ? String(invoiceForm.receivableId) : 'NONE'} onValueChange={(value) => {
                  const receivableId = value === 'NONE' ? 0 : Number(value);
                  const matched = receivables.find((item) => item.receivableId === receivableId);
                  const contract = contracts.find((item) => item.contractId === matched?.contractId);
                  setInvoiceForm((prev) => ({
                    ...prev,
                    receivableId,
                    customerId: matched?.customerId,
                    customerName: matched?.customerName,
                    contractId: matched?.contractId,
                    contractNo: matched?.contractNo || contract?.contractNo,
                  }));
                }}>
                  <SelectTrigger><SelectValue placeholder="选择 CRM 回款计划" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">选择 CRM 回款计划</SelectItem>
                    {receivableOptions.map((item) => <SelectItem key={item.value} value={String(item.value)}>{item.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label className={fieldLabelClassName}>客户名称</Label>
                  <Input value={invoiceForm.customerName || ''} onChange={(e) => setInvoiceForm((prev) => ({ ...prev, customerName: e.target.value }))} placeholder="绑定回款后自动回填" />
                </div>
                <div>
                  <Label className={fieldLabelClassName}>合同编号</Label>
                  <Select value={invoiceForm.contractId ? String(invoiceForm.contractId) : 'NONE'} onValueChange={(value) => {
                    const contractId = value === 'NONE' ? undefined : Number(value);
                    const matched = contracts.find((item) => item.contractId === contractId);
                    setInvoiceForm((prev) => ({ ...prev, contractId, contractNo: matched?.contractNo || '' }));
                  }}>
                    <SelectTrigger><SelectValue placeholder="选择合同" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NONE">选择合同</SelectItem>
                      {contractOptions.map((item) => <SelectItem key={item.value} value={String(item.value)}>{item.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          ) : (
            <div className="admin-dialog-stack">
              <div>
                <Label className={fieldLabelClassName}>绑定对象类型</Label>
                <Select value={bindTargetType} onValueChange={(value) => {
                  const nextType = value as BindTargetType;
                  setBindTargetType(nextType);
                  setInvoiceForm((prev) => ({
                    ...prev,
                    expenseClaimId: nextType === 'EXPENSE' ? prev.expenseClaimId : undefined,
                    paymentRequestId: nextType === 'PAYMENT' ? prev.paymentRequestId : undefined,
                  }));
                }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">选择绑定类型</SelectItem>
                    <SelectItem value="EXPENSE">报销单</SelectItem>
                    <SelectItem value="PAYMENT">付款单</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {bindTargetType === 'PAYMENT' ? (
                <div>
                  <Label className={fieldLabelClassName}>付款单</Label>
                  <Select value={invoiceForm.paymentRequestId ? String(invoiceForm.paymentRequestId) : 'NONE'} onValueChange={(value) => {
                    const paymentRequestId = value === 'NONE' ? undefined : Number(value);
                    const matched = paymentRequests.find((item) => item.id === paymentRequestId);
                    setBindTargetType('PAYMENT');
                    setInvoiceForm((prev) => ({
                      ...prev,
                      paymentRequestId,
                      expenseClaimId: undefined,
                      projectId: matched?.projectId,
                      customerId: matched?.customerId,
                      customerName: matched?.customerName,
                    }));
                  }}>
                    <SelectTrigger><SelectValue placeholder="选择付款单" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NONE">选择付款单</SelectItem>
                      {paymentOptions.map((item) => <SelectItem key={item.value} value={String(item.value)}>{item.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ) : bindTargetType === 'EXPENSE' ? (
                <div>
                  <Label className={fieldLabelClassName}>报销单</Label>
                  <Select value={invoiceForm.expenseClaimId ? String(invoiceForm.expenseClaimId) : 'NONE'} onValueChange={(value) => {
                    const expenseClaimId = value === 'NONE' ? undefined : Number(value);
                    const matched = expenseClaims.find((item) => item.id === expenseClaimId);
                    setBindTargetType('EXPENSE');
                    setInvoiceForm((prev) => ({
                      ...prev,
                      expenseClaimId,
                      paymentRequestId: undefined,
                      customerId: matched?.customerId,
                      customerName: matched?.customerName,
                    }));
                  }}>
                    <SelectTrigger><SelectValue placeholder="选择报销单" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NONE">选择报销单</SelectItem>
                      {expenseOptions.map((item) => <SelectItem key={item.value} value={String(item.value)}>{item.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="admin-invoice-empty-note">
                  先选择绑定类型，再选择对应单据。
                </div>
              )}
            </div>
          )}
        </div>
      </BaseDialog>

      <BaseDialog
        open={dialog?.type === 'writeoff'}
        title="发票核销"
        onClose={() => void openDialog(null)}
        width="wide"
        footer={<><Button variant="outline" onClick={() => void openDialog(null)}>取消</Button><Button onClick={() => void saveWriteoff()} disabled={saving}>{saving ? '核销中...' : '确认核销'}</Button></>}
      >
        <div className="admin-dialog-stack">
          <InvoiceNote>
            核销 = 把发票金额冲抵到已绑定业务对象。作废发票禁止继续核销；核销后，OA 单据和 CRM 回款的发票状态会同步刷新。
          </InvoiceNote>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label className={fieldLabelClassName}>业务类型 <span className="text-red-500">*</span></Label>
              <Select value={writeoffForm.businessType || 'CRM_RECEIVABLE'} onValueChange={(value) => setWriteoffForm((prev) => ({ ...prev, businessType: value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CRM_RECEIVABLE">CRM 回款</SelectItem>
                  <SelectItem value="EXPENSE_CLAIM">报销单</SelectItem>
                  <SelectItem value="PAYMENT_REQUEST">付款单</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className={fieldLabelClassName}>核销金额 <span className="text-red-500">*</span></Label>
              <Input type="number" min={0} value={String(writeoffForm.writeoffAmount || 0)} onChange={(e) => setWriteoffForm((prev) => ({ ...prev, writeoffAmount: Number(e.target.value || 0) }))} placeholder="例如：20000" />
            </div>
          </div>
          <div>
            <Label className={fieldLabelClassName}>业务对象</Label>
            {writeoffForm.businessType === 'CRM_RECEIVABLE' ? (
              <Select value={writeoffForm.businessId ? String(writeoffForm.businessId) : 'NONE'} onValueChange={(value) => {
                const businessId = value === 'NONE' ? 0 : Number(value);
                const matched = receivables.find((item) => item.receivableId === businessId);
                setWriteoffForm((prev) => ({ ...prev, businessId, businessNo: matched?.receivableNo || '' }));
              }}>
                <SelectTrigger><SelectValue placeholder="选择 CRM 回款计划" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">选择 CRM 回款计划</SelectItem>
                  {receivableOptions.map((item) => <SelectItem key={item.value} value={String(item.value)}>{item.label}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : writeoffForm.businessType === 'PAYMENT_REQUEST' ? (
              <Select value={writeoffForm.businessId ? String(writeoffForm.businessId) : 'NONE'} onValueChange={(value) => {
                const businessId = value === 'NONE' ? 0 : Number(value);
                const matched = paymentRequests.find((item) => item.id === businessId);
                setWriteoffForm((prev) => ({ ...prev, businessId, businessNo: matched?.paymentNo || '' }));
              }}>
                <SelectTrigger><SelectValue placeholder="选择付款单" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">选择付款单</SelectItem>
                  {paymentOptions.map((item) => <SelectItem key={item.value} value={String(item.value)}>{item.label}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : (
              <Select value={writeoffForm.businessId ? String(writeoffForm.businessId) : 'NONE'} onValueChange={(value) => {
                const businessId = value === 'NONE' ? 0 : Number(value);
                const matched = expenseClaims.find((item) => item.id === businessId);
                setWriteoffForm((prev) => ({ ...prev, businessId, businessNo: matched?.claimNo || '' }));
              }}>
                <SelectTrigger><SelectValue placeholder="选择报销单" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">选择报销单</SelectItem>
                  {expenseOptions.map((item) => <SelectItem key={item.value} value={String(item.value)}>{item.label}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </div>
          <div>
            <Label className={fieldLabelClassName}>核销备注</Label>
            <Textarea value={writeoffForm.remark || ''} onChange={(e) => setWriteoffForm((prev) => ({ ...prev, remark: e.target.value }))} placeholder="例如：景曜科技首期回款到账 2 万，先做部分核销。" />
          </div>

          <InvoicePanel title="已有核销历史">
            <div className="admin-dialog-stack">
              {writeoffHistory.length ? writeoffHistory.map((item) => (
                <InvoiceHistoryRow key={item.writeoffId || `${item.businessType}-${item.businessId}-${item.writeoffDate}`}>
                  <div>{item.businessType} / {item.businessNo || item.businessId || '-'}</div>
                  <div className="text-xs text-slate-500">核销金额 {formatMoney(item.writeoffAmount)} / 核销日期 {item.writeoffDate || '-'}</div>
                </InvoiceHistoryRow>
              )) : <div className="text-sm text-slate-500">暂无核销历史。</div>}
            </div>
          </InvoicePanel>
        </div>
      </BaseDialog>

      <ConfirmDialog
        open={Boolean(voidTarget)}
        title="作废发票"
        message={`作废后发票状态将改为“已作废”，并禁止继续绑定或核销。\n发票：${voidTarget?.invoiceCode || ''} / ${voidTarget?.invoiceNo || ''}`}
        confirmText="确认作废"
        danger
        onCancel={() => setVoidTarget(null)}
        onConfirm={async () => {
          if (!voidTarget?.invoiceId) return;
          try {
            await invoiceApi.voidInvoice(voidTarget.invoiceId, '人工作废');
            toast.success('发票已作废');
            setVoidTarget(null);
            await load();
            await loadBindings();
          } catch (error) {
            toast.error(getErrorMessage(error, '发票作废失败'));
          }
        }}
      />
    </>
  );
}
