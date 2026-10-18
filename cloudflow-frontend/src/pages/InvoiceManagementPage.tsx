import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import AttachmentLinks from '@/components/AttachmentLinks';
import { FileUpload } from '@/components/FileUpload';
import './InvoiceManagementPage.css';
import FinancePublicationPanel from '@/components/finance/FinancePublicationPanel';

type InvoiceDialog =
  | { type: 'invoice'; item?: Invoice | null }
  | { type: 'detail'; item: Invoice }
  | { type: 'bind'; item: Invoice }
  | { type: 'writeoff'; item: Invoice }
  | null;

type BindTargetType = 'NONE' | 'EXPENSE' | 'PAYMENT';

const fieldLabelClassName = 'text-xs font-medium text-cf-subtle';


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

const formatMoney = (value?: number, currency = 'CNY') =>
  `${currency === 'CNY' ? '¥' : `${currency} `}${Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const InvoiceReceiptSummary: React.FC<{ invoice: Invoice }> = ({ invoice }) => (
  <div className="invoice-receipt-summary" aria-label="到账汇总" aria-live="polite">
    <div><span>{invoice.invoiceDirection === 'OUTPUT' ? '累计到账' : '累计核销'}</span><strong data-testid="invoice-received-total">{formatMoney(invoice.receivedAmount, invoice.currency)}</strong></div>
    <div><span>剩余可登记</span><strong data-testid="invoice-receipt-remaining">{formatMoney(invoice.outstandingAmount, invoice.currency)}</strong></div>
    {invoice.receivableId ? <p>累计到账已包含绑定前历史到账，请勿重复登记。</p> : null}
    {Number(invoice.pendingReceivedAmount || 0) > 0 ? <p role="status">其中 {formatMoney(invoice.pendingReceivedAmount, invoice.currency)} 等待同步至CRM，已计入累计，请勿重复登记。</p> : null}
  </div>
);

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
  const [financeProtected, setFinanceProtected] = useState(false);
  const [invoiceForm, setInvoiceForm] = useState<Invoice>(emptyInvoice);
  const [writeoffForm, setWriteoffForm] = useState<InvoiceWriteoff>(emptyWriteoff);
  const [writeoffHistory, setWriteoffHistory] = useState<InvoiceWriteoff[]>([]);
  const [bindTargetType, setBindTargetType] = useState<BindTargetType>('NONE');
  const [saving, setSaving] = useState(false);
  const [loadingInvoice, setLoadingInvoice] = useState(false);
  const [writeoffError, setWriteoffError] = useState('');
  const [latestInvoice, setLatestInvoice] = useState<Invoice | null>(null);
  const dialogRequest = useRef(0);
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
        keyword: keyword || undefined,
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
        hasPermission('oa:expense:list') ? expenseClaimApi.list({ pageNum: 1, pageSize: 100 }) : Promise.resolve(undefined),
        hasPermission('oa:payment:list') ? paymentRequestApi.list({ pageNum: 1, pageSize: 100 }) : Promise.resolve(undefined),
        hasPermission('crm:receivable:list') ? crmApi.listReceivables({ pageNum: 1, pageSize: 100 }) : Promise.resolve(undefined),
        hasPermission('oa:contract:list') ? contractApi.list({ pageNum: 1, pageSize: 100 }) : Promise.resolve(undefined),
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
    const requestId = ++dialogRequest.current;
    setDialog(next);
    setLoadingInvoice(false);
    setWriteoffError('');
    setLatestInvoice(null);
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
      setWriteoffForm(emptyWriteoff);
      setWriteoffHistory([]);
      setLoadingInvoice(true);
      try {
        const [detail, history] = await Promise.all([invoiceApi.getInfo(next.item.invoiceId!), invoiceApi.listWriteoffs(next.item.invoiceId!)]);
        if (requestId !== dialogRequest.current) return;
        setInvoiceForm(detail);
        setWriteoffForm({
          businessType: detail.receivableId ? 'CRM_RECEIVABLE' : detail.paymentRequestId ? 'PAYMENT_REQUEST' : 'EXPENSE_CLAIM',
          businessId: detail.receivableId || detail.paymentRequestId || detail.expenseClaimId || 0,
          invoiceVersion: detail.version,
          writeoffAmount: 0,
          writeoffDate: new Intl.DateTimeFormat('sv-SE').format(new Date()),
          remark: '',
        });
        setWriteoffHistory(history);
      } catch (error) {
        if (requestId === dialogRequest.current) setWriteoffError(getErrorMessage(error, '加载最新到账失败，请核对最新到账后重试'));
      } finally {
        if (requestId === dialogRequest.current) setLoadingInvoice(false);
      }
      return;
    }
    if (next.type === 'detail') {
      try {
        const [detail, history] = await Promise.all([
          invoiceApi.getInfo(next.item.invoiceId!),
          invoiceApi.listWriteoffs(next.item.invoiceId!),
        ]);
        if (requestId !== dialogRequest.current) return;
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
    if (!invoiceForm.invoiceId || saving || loadingInvoice || writeoffForm.invoiceVersion == null) return;
    if (!Number.isFinite(writeoffForm.writeoffAmount) || writeoffForm.writeoffAmount <= 0
      || writeoffForm.writeoffAmount > Number(invoiceForm.outstandingAmount || 0)
      || !/^\d+(?:\.\d{1,2})?$/.test(String(writeoffForm.writeoffAmount))) {
      setWriteoffError('本次金额须大于0、最多两位小数，且不能超过剩余可登记金额。');
      return;
    }
    setSaving(true);
    setWriteoffError('');
    try {
      await invoiceApi.writeoff(invoiceForm.invoiceId, writeoffForm);
      toast.success('发票已核销');
      await openDialog({ type: 'writeoff', item: { ...invoiceForm } });
      await load();
      await loadBindings();
    } catch (error) {
      setWriteoffError(getErrorMessage(error, '发票核销失败，输入已保留，请核对最新到账后重试'));
    } finally {
      setSaving(false);
    }
  };

  const inspectLatestInvoice = async () => {
    if (!invoiceForm.invoiceId || saving || loadingInvoice) return;
    const requestId = dialogRequest.current;
    setLoadingInvoice(true);
    try {
      const detail = await invoiceApi.getInfo(invoiceForm.invoiceId);
      if (requestId === dialogRequest.current) setLatestInvoice(detail);
    } catch (error) {
      if (requestId === dialogRequest.current) setWriteoffError(getErrorMessage(error, '读取最新到账失败，输入已保留'));
    } finally {
      if (requestId === dialogRequest.current) setLoadingInvoice(false);
    }
  };

  const writeoffAllowed = !saving && !loadingInvoice && !writeoffError && writeoffForm.invoiceVersion != null && writeoffForm.businessId > 0
    && Number.isFinite(writeoffForm.writeoffAmount) && writeoffForm.writeoffAmount > 0
    && writeoffForm.writeoffAmount <= Number(invoiceForm.outstandingAmount || 0)
    && /^\d+(?:\.\d{1,2})?$/.test(String(writeoffForm.writeoffAmount)) && invoiceForm.status !== 'VOID';

  const statusBadge = (value?: string) => (
    <DictBadge dictType="invoice_status" value={value || ''} className="rounded-md px-2.5 py-1 font-semibold" />
  );

  const bindDescription = invoiceForm.invoiceDirection === 'OUTPUT'
    ? '销项发票 = 绑定 CRM 回款计划，自动带出客户和合同，并把核销状态回写到 CRM 回款和 OA 合同。'
    : '进项发票 = 绑定报销单或付款单，绑定和核销后会同步更新 OA 单据的发票汇总状态。';
  const metrics = [
    { label: '发票总数', value: String(rows.length), meta: new Set(rows.map(item => item.currency || 'CNY')).size > 1 ? '多币种金额按票列示' : `含税 ${formatMoney(rows.reduce((sum, item) => sum + Number(item.grossAmount || 0), 0), rows[0]?.currency)}`, icon: <FileCheck2 size={18} />, tone: 'blue' },
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
      <table role="table" aria-label="发票列表" className="unity-data-table admin-source-table finance-source-table admin-invoice-table">
          <colgroup>
            <col />
            <col />
            <col />
            <col />
            <col />
            <col />
            <col />
          </colgroup>
          <thead role="rowgroup">
            <tr role="row">
              <th>发票</th>
              <th>方向</th>
              <th>金额</th>
              <th>购方 / 销方</th>
              <th>绑定对象</th>
              <th>状态</th>
              <th className="text-right">操作</th>
            </tr>
          </thead>
          <tbody role="rowgroup">
            {rows.map((item) => (
              <tr role="row" className="invoice-record-row" key={item.invoiceId}>
                <td role="cell" data-label="发票">
                  <strong>{item.invoiceCode} / {item.invoiceNo}</strong>
                  <div className="text-xs text-cf-subtle">{item.invoiceType || '未分类'} / {item.invoiceDate || '-'}</div>
                </td>
                <td role="cell" data-label="方向">{getInvoiceDirectionLabel(item.invoiceDirection || 'OUTPUT')}</td>
                <td role="cell" data-label="金额">
                  <div>{formatMoney(item.grossAmount, item.currency)}</div>
                  <div className="text-xs text-cf-subtle">税额 {formatMoney(item.taxAmount, item.currency)}</div>
                  {item.receivableId ? <div className="text-xs text-cf-subtle">累计到账 {formatMoney(item.receivedAmount, item.currency)}</div> : null}
                </td>
                <td role="cell" data-label="购方 / 销方">
                  <div>{item.buyerName || '-'}</div>
                  <div className="text-xs text-cf-subtle">{item.sellerName || '-'}</div>
                </td>
                <td role="cell" data-label="绑定对象">
                  <div>{item.contractNo || '-'}</div>
                  <div className="text-xs text-cf-subtle">
                    回款 {item.receivableId || '-'} / 报销 {item.expenseClaimId || '-'} / 付款 {item.paymentRequestId || '-'}
                  </div>
                </td>
                <td role="cell" data-label="状态">{statusBadge(item.status)}</td>
                <td role="cell" data-label="操作">
                  <div className="admin-users-row-actions">
                    <button type="button" data-tooltip="详情" aria-label="详情" onClick={() => void openDialog({ type: 'detail', item })}><Eye size={15} /><span className="invoice-action-label">详情</span></button>
                    {hasPermission('oa:invoice:edit') ? <button type="button" data-tooltip="编辑" aria-label="编辑" onClick={() => void openDialog({ type: 'invoice', item })}><Edit size={15} /><span className="invoice-action-label">编辑</span></button> : null}
                    {item.status !== 'VOID' && hasPermission('oa:invoice:bind') ? <button type="button" data-tooltip="绑定业务" aria-label="绑定业务" onClick={() => void openDialog({ type: 'bind', item })}><Send size={15} /><span className="invoice-action-label">绑定业务</span></button> : null}
                    {item.status !== 'VOID' && hasPermission('oa:invoice:writeoff') ? <button type="button" data-tooltip="核销发票" aria-label="核销发票" onClick={() => void openDialog({ type: 'writeoff', item })}><Receipt size={15} /><span className="invoice-action-label">核销发票</span></button> : null}
                    {item.status !== 'VOID' && hasPermission('oa:invoice:void') ? <button type="button" className="danger" data-tooltip="作废发票" aria-label="作废发票" onClick={() => setVoidTarget(item)}><RotateCcw size={15} /><span className="invoice-action-label">作废发票</span></button> : null}
                    {item.externalLinkUrl ? <button type="button" data-tooltip="打开外链" aria-label="打开外链" onClick={() => window.open(item.externalLinkUrl, '_blank', 'noopener,noreferrer')}><ExternalLink size={15} /><span className="invoice-action-label">打开外链</span></button> : null}
                  </div>
                </td>
              </tr>
            ))}
            {!rows.length ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-cf-subtle"><FileCheck2 className="mx-auto mb-3 h-4 w-4" />暂无发票。下一步操作：新建一张进项或销项发票，随后绑定业务对象。</td></tr>
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
              <Label className={fieldLabelClassName}>发票扫描件</Label>
              <FileUpload value={invoiceForm.imageUrl || ''} onChange={imageUrl => setInvoiceForm(previous => ({ ...previous, imageUrl }))} maxCount={1} accept=".pdf,.png,.jpg,.jpeg,.gif,.webp" />
              <Label className={fieldLabelClassName}>备注</Label>
              <Textarea value={invoiceForm.remark || ''} onChange={(e) => setInvoiceForm((prev) => ({ ...prev, remark: e.target.value }))} placeholder="例如：景曜科技首期回款对应销项发票" />
            </div>
          </div>
        </div>
      </BaseDialog>

      <BaseDialog
        open={dialog?.type === 'detail'}
        title={`${invoiceForm.invoiceCode || ''} / ${invoiceForm.invoiceNo || '发票详情'}`}
        onClose={() => { if (!financeProtected) void openDialog(null); }}
        hideCloseButton={financeProtected}
        closeOnEscape={!financeProtected}
        width="wide"
      >
        <div className="admin-dialog-stack">
          <div className="admin-source-stat-grid">
            <InvoiceMetric label="发票方向" value={getInvoiceDirectionLabel(invoiceForm.invoiceDirection || 'OUTPUT')} meta="业务流向" icon={<FileCheck2 size={18} />} tone="blue" />
            <InvoiceMetric label="发票状态" value={statusBadge(invoiceForm.status)} meta="当前状态" icon={<Receipt size={18} />} tone="amber" />
            <InvoiceMetric label="含税金额" value={formatMoney(invoiceForm.grossAmount, invoiceForm.currency)} meta="票面金额" icon={<Send size={18} />} tone="green" />
            <InvoiceMetric label="税额" value={formatMoney(invoiceForm.taxAmount, invoiceForm.currency)} meta="税额合计" icon={<RotateCcw size={18} />} tone="violet" />
          </div>
          <InvoiceReceiptSummary invoice={invoiceForm} />

          {dialog?.type === 'detail' && invoiceForm.invoiceId && invoiceForm.invoiceId === dialog.item.invoiceId && invoiceForm.invoiceDirection === 'OUTPUT' && hasPermission('crm:portal-finance:manage') &&
            <FinancePublicationPanel key={invoiceForm.invoiceId} kind="INVOICE" id={invoiceForm.invoiceId} onProtectionChange={setFinanceProtected}
              onSaved={value => setInvoiceForm(previous => ({ ...previous, version: value.version }))} />}

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

          <InvoicePanel title="发票扫描件">
            <AttachmentLinks value={invoiceForm.imageUrl} previewContext={{ bizType: 'OA_INVOICE', bizId: String(invoiceForm.invoiceId) }} />
          </InvoicePanel>
          <InvoicePanel title="核销历史">
            <div className="admin-dialog-stack">
              {writeoffHistory.length ? writeoffHistory.map((item) => (
                <InvoiceHistoryRow key={item.writeoffId || `${item.businessType}-${item.businessId}-${item.writeoffDate}`}>
                  <div>{item.businessType} / {item.businessNo || item.businessId || '-'}</div>
                  <div className="text-xs text-cf-subtle">核销金额 {formatMoney(item.writeoffAmount, invoiceForm.currency)} / 核销日期 {item.writeoffDate || '-'}</div>
                </InvoiceHistoryRow>
              )) : <div className="text-sm text-cf-subtle">暂无核销历史。下一步操作：在“核销发票”中录入第一笔核销。</div>}
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
        onClose={() => { if (!saving) void openDialog(null); }}
        closeOnEscape={!saving}
        hideCloseButton={saving}
        panelClassName="invoice-receipt-dialog"
        width="wide"
        footer={<><Button variant="outline" disabled={saving} onClick={() => void openDialog(null)}>取消</Button><Button onClick={() => void saveWriteoff()} disabled={!writeoffAllowed}>{saving ? '核销中...' : '确认核销'}</Button></>}
      >
        <div className="admin-dialog-stack">
          <InvoiceNote>
            {invoiceForm.invoiceDirection === 'OUTPUT'
              ? '销项发票核销 = 只登记本次新增到账，累计金额包含绑定前已收到的款项；绑定本身不增加收款。保存后本次金额清空，避免重复登记。'
              : '进项发票核销 = 把发票金额冲抵到已绑定业务对象。作废发票禁止继续核销；核销后，OA单据的发票状态会同步刷新。'}
          </InvoiceNote>
          {loadingInvoice ? <p role="status">正在读取最新到账，请稍候。</p> : <InvoiceReceiptSummary invoice={invoiceForm} />}
          {writeoffError ? <div className="admin-dialog-stack">
            <p role="alert">{writeoffError}</p>
            <Button variant="outline" disabled={saving || loadingInvoice} onClick={() => void inspectLatestInvoice()}>核对最新到账</Button>
          </div> : null}
          {latestInvoice ? <div className="admin-dialog-stack">
            <p role="status">最新累计到账 {formatMoney(latestInvoice.receivedAmount, latestInvoice.currency)}，剩余可登记 {formatMoney(latestInvoice.outstandingAmount, latestInvoice.currency)}；本次输入保持不变。</p>
            <Button variant="outline" disabled={saving || loadingInvoice} onClick={() => {
              setInvoiceForm(latestInvoice);
              setWriteoffForm(previous => ({ ...previous, invoiceVersion: latestInvoice.version,
                businessType: latestInvoice.receivableId ? 'CRM_RECEIVABLE' : latestInvoice.paymentRequestId ? 'PAYMENT_REQUEST' : 'EXPENSE_CLAIM',
                businessId: latestInvoice.receivableId || latestInvoice.paymentRequestId || latestInvoice.expenseClaimId || 0 }));
              setLatestInvoice(null);
              setWriteoffError('');
            }}>已核对，采用最新版本</Button>
          </div> : null}
          <fieldset disabled={saving || loadingInvoice} className="admin-dialog-stack min-w-0" aria-busy={saving || loadingInvoice}>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label className={fieldLabelClassName}>业务类型 <span className="text-red-500">*</span></Label>
              <Select disabled value={writeoffForm.businessType || 'CRM_RECEIVABLE'}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CRM_RECEIVABLE">CRM 回款</SelectItem>
                  <SelectItem value="EXPENSE_CLAIM">报销单</SelectItem>
                  <SelectItem value="PAYMENT_REQUEST">付款单</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="invoice-receipt-amount" className={fieldLabelClassName}>{invoiceForm.invoiceDirection === 'OUTPUT' ? '本次新增到账' : '核销金额'} <span className="text-red-500">*</span></Label>
              <Input id="invoice-receipt-amount" type="number" min={0.01} step="0.01" max={Number(invoiceForm.outstandingAmount || 0)} value={String(writeoffForm.writeoffAmount || 0)} onChange={(event) => setWriteoffForm((prev) => ({ ...prev, writeoffAmount: Number(event.target.value || 0) }))} placeholder="例如：20000" />
            </div>
            <div>
              <Label htmlFor="invoice-receipt-date" className={fieldLabelClassName}>实际收款日期</Label>
              <Input id="invoice-receipt-date" type="date" value={writeoffForm.writeoffDate || ''} max={new Intl.DateTimeFormat('sv-SE').format(new Date())}
                onChange={event => setWriteoffForm(previous => ({ ...previous, writeoffDate: event.target.value }))} />
            </div>
          </div>
          <div>
            <Label className={fieldLabelClassName}>业务对象</Label>
            {writeoffForm.businessType === 'CRM_RECEIVABLE' ? (
              <Select disabled value={writeoffForm.businessId ? String(writeoffForm.businessId) : 'NONE'} onValueChange={(value) => {
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
              <Select disabled value={writeoffForm.businessId ? String(writeoffForm.businessId) : 'NONE'} onValueChange={(value) => {
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
              <Select disabled value={writeoffForm.businessId ? String(writeoffForm.businessId) : 'NONE'} onValueChange={(value) => {
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
            {invoiceForm.receivableId ? <p className="text-xs text-cf-subtle">此处只列本发票登记的收款；绑定前历史已计入累计到账。</p> : null}
            <div className="admin-dialog-stack">
              {writeoffHistory.length ? writeoffHistory.map((item) => (
                <InvoiceHistoryRow key={item.writeoffId || `${item.businessType}-${item.businessId}-${item.writeoffDate}`}>
                  <div>{item.businessType} / {item.businessNo || item.businessId || '-'}</div>
                  <div className="text-xs text-cf-subtle">核销金额 {formatMoney(item.writeoffAmount, invoiceForm.currency)} / 核销日期 {item.writeoffDate || '-'}</div>
                </InvoiceHistoryRow>
              )) : <div className="text-sm text-cf-subtle">暂无核销历史。</div>}
            </div>
          </InvoicePanel>
          </fieldset>
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
