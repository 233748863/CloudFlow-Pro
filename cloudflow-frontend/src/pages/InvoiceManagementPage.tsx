import React, { useEffect, useMemo, useState } from 'react';
import { Edit, ExternalLink, Eye, FileCheck2, Plus, Receipt, RotateCcw, Send } from 'lucide-react';
import { toast } from 'sonner';
import { expenseClaimApi, paymentRequestApi, ExpenseClaim, PaymentRequest } from '@/services/api/expense';
import { invoiceApi, Invoice, InvoiceWriteoff } from '@/services/api/invoice';
import { crmApi, CrmReceivable } from '@/services/api/crm';
import { contractApi, OaContract } from '@/services/api/contractRisk';
import { getErrorMessage } from '@/utils/errorMessage';
import { BaseDialog } from '@/components/common/BaseDialog';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { TablePageLayout } from '@/components/layout/TablePageLayout';
import { Button, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, TableActionHead, TableHead, TableHeader, Textarea } from '@/components/common';
import { TableRowActions } from '@/components/common/table-row-actions';

type InvoiceDialog =
  | { type: 'invoice'; item?: Invoice | null }
  | { type: 'detail'; item: Invoice }
  | { type: 'bind'; item: Invoice }
  | { type: 'writeoff'; item: Invoice }
  | null;

const fieldLabelClassName = 'mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300';

const statusLabelMap: Record<string, string> = {
  REGISTERED: '已登记',
  BOUND: '已绑定',
  WRITEOFF_PARTIAL: '部分核销',
  WRITEOFF_FULL: '全部核销',
  VOID: '已作废',
};

const directionLabelMap: Record<string, string> = {
  INPUT: '进项发票',
  OUTPUT: '销项发票',
};

const statusToneMap: Record<string, string> = {
  REGISTERED: 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
  BOUND: 'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-200',
  WRITEOFF_PARTIAL: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200',
  WRITEOFF_FULL: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200',
  VOID: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200',
};

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

export default function InvoiceManagementPage() {
  const [rows, setRows] = useState<Invoice[]>([]);
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState('');
  const [direction, setDirection] = useState('');
  const [dialog, setDialog] = useState<InvoiceDialog>(null);
  const [invoiceForm, setInvoiceForm] = useState<Invoice>(emptyInvoice);
  const [writeoffForm, setWriteoffForm] = useState<InvoiceWriteoff>(emptyWriteoff);
  const [writeoffHistory, setWriteoffHistory] = useState<InvoiceWriteoff[]>([]);
  const [saving, setSaving] = useState(false);
  const [voidTarget, setVoidTarget] = useState<Invoice | null>(null);

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
      setRows(result.rows || []);
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
      setExpenseClaims(expenseResult.rows || []);
      setPaymentRequests(paymentResult.rows || []);
      setReceivables(receivableResult.rows || []);
      setContracts(contractResult.rows || []);
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
      return;
    }
    if (next.type === 'invoice') {
      setInvoiceForm(next.item || emptyInvoice);
      setWriteoffHistory([]);
      return;
    }
    if (next.type === 'bind') {
      setInvoiceForm(next.item);
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
    <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusToneMap[value || 'REGISTERED'] || statusToneMap.REGISTERED}`}>
      {statusLabelMap[value || 'REGISTERED'] || value || '-'}
    </span>
  );

  const bindDescription = invoiceForm.invoiceDirection === 'OUTPUT'
    ? '销项发票 = 绑定 CRM 回款计划，自动带出客户和合同，并把核销状态回写到 CRM 回款和 OA 合同。'
    : '进项发票 = 绑定报销单或付款单，绑定和核销后会同步更新 OA 单据的发票汇总状态。';

  return (
    <div className="space-y-4">
      <TablePageLayout
        filters={(
          <div className="space-y-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-1 flex-wrap items-center gap-3">
                <Input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="按发票代码或号码筛选" className="max-w-sm" />
                <div className="w-full sm:w-[160px]">
                  <Select value={direction || 'ALL'} onValueChange={(value) => setDirection(value === 'ALL' ? '' : value)}>
                    <SelectTrigger><SelectValue placeholder="发票方向" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">全部方向</SelectItem>
                      <SelectItem value="INPUT">进项发票</SelectItem>
                      <SelectItem value="OUTPUT">销项发票</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-full sm:w-[180px]">
                  <Select value={status || 'ALL'} onValueChange={(value) => setStatus(value === 'ALL' ? '' : value)}>
                    <SelectTrigger><SelectValue placeholder="发票状态" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">全部状态</SelectItem>
                      {Object.entries(statusLabelMap).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="text-xs text-slate-500">
                  发票管理 = 发票录入 + 业务绑定 + 核销 + 作废 + 外链跳转 + 核销历史。
                </div>
              </div>
              <Button size="sm" onClick={() => void openDialog({ type: 'invoice' })}>
                <Plus size={14} className="mr-1.5" />新增发票
              </Button>
            </div>
          </div>
        )}
        table={(
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950/88">
            <table className="w-full min-w-[1360px]">
              <TableHeader>
                <tr>
                  <TableHead>发票</TableHead>
                  <TableHead>方向</TableHead>
                  <TableHead>金额</TableHead>
                  <TableHead>购方 / 销方</TableHead>
                  <TableHead>绑定对象</TableHead>
                  <TableHead>状态</TableHead>
                  <TableActionHead>操作</TableActionHead>
                </tr>
              </TableHeader>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {rows.map((item) => (
                  <tr key={item.invoiceId}>
                    <td className="px-4 py-3 text-sm">
                      <div>{item.invoiceCode} / {item.invoiceNo}</div>
                      <div className="text-xs text-slate-500">{item.invoiceType || '未分类'} / {item.invoiceDate || '-'}</div>
                    </td>
                    <td className="px-4 py-3 text-sm">{directionLabelMap[item.invoiceDirection || 'OUTPUT'] || item.invoiceDirection || '-'}</td>
                    <td className="px-4 py-3 text-sm">
                      <div>{formatMoney(item.grossAmount)}</div>
                      <div className="text-xs text-slate-500">税额 {formatMoney(item.taxAmount)}</div>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div>{item.buyerName || '-'}</div>
                      <div className="text-xs text-slate-500">{item.sellerName || '-'}</div>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div>{item.contractNo || '-'}</div>
                      <div className="text-xs text-slate-500">
                        回款 {item.receivableId || '-'} / 报销 {item.expenseClaimId || '-'} / 付款 {item.paymentRequestId || '-'}
                      </div>
                    </td>
                    <td className="px-4 py-3">{statusBadge(item.status)}</td>
                    <td className="px-4 py-3 text-right">
                      <TableRowActions
                        iconOnly
                        actions={[
                          { label: '查看详情', icon: <Eye size={14} />, onClick: () => void openDialog({ type: 'detail', item }) },
                          { label: '编辑发票', icon: <Edit size={14} />, onClick: () => void openDialog({ type: 'invoice', item }) },
                          { label: '绑定业务', icon: <Send size={14} />, onClick: () => void openDialog({ type: 'bind', item }), hidden: item.status === 'VOID' },
                          { label: '核销发票', icon: <Receipt size={14} />, onClick: () => void openDialog({ type: 'writeoff', item }), hidden: item.status === 'VOID' },
                          { label: '作废发票', icon: <RotateCcw size={14} />, tone: 'danger', onClick: () => setVoidTarget(item), hidden: item.status === 'VOID' },
                          {
                            label: '打开外链',
                            icon: <ExternalLink size={14} />,
                            onClick: () => {
                              if (!item.externalLinkUrl) {
                                toast.error('当前发票没有配置外链');
                                return;
                              }
                              window.open(item.externalLinkUrl, '_blank', 'noopener,noreferrer');
                            },
                            hidden: !item.externalLinkUrl,
                          },
                        ]}
                      />
                    </td>
                  </tr>
                ))}
                {!rows.length ? (
                  <tr><td colSpan={7} className="px-4 py-16 text-center text-sm text-slate-500"><FileCheck2 className="mx-auto mb-3 h-4 w-4" />暂无发票。下一步操作：新建一张进项或销项发票，随后绑定业务对象。</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      />

      <BaseDialog
        open={dialog?.type === 'invoice'}
        title={invoiceForm.invoiceId ? '编辑发票' : '新增发票'}
        onClose={() => void openDialog(null)}
        width="wide"
        footer={<><Button variant="outline" onClick={() => void openDialog(null)}>取消</Button><Button onClick={() => void saveInvoice()} disabled={saving}>{saving ? '保存中...' : '保存'}</Button></>}
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400">
            发票录入 = 先登记基础信息，再按方向决定后续绑定对象。`INPUT` 对应报销 / 付款，`OUTPUT` 对应 CRM 回款计划。
          </div>
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
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
              <div className="text-sm font-medium">发票方向</div>
              <div className="mt-2 text-sm">{directionLabelMap[invoiceForm.invoiceDirection || 'OUTPUT'] || '-'}</div>
            </div>
            <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
              <div className="text-sm font-medium">发票状态</div>
              <div className="mt-2">{statusBadge(invoiceForm.status)}</div>
            </div>
            <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
              <div className="text-sm font-medium">含税金额</div>
              <div className="mt-2 text-sm">{formatMoney(invoiceForm.grossAmount)}</div>
            </div>
            <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
              <div className="text-sm font-medium">税额</div>
              <div className="mt-2 text-sm">{formatMoney(invoiceForm.taxAmount)}</div>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
              <div className="mb-3 text-sm font-medium">绑定对象</div>
              <div className="space-y-2 text-sm">
                <div>客户：{invoiceForm.customerName || '-'}</div>
                <div>合同：{invoiceForm.contractNo || '-'}</div>
                <div>回款计划：{invoiceForm.receivableId || '-'}</div>
                <div>报销单：{invoiceForm.expenseClaimId || '-'}</div>
                <div>付款单：{invoiceForm.paymentRequestId || '-'}</div>
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
              <div className="mb-3 text-sm font-medium">第三方信息</div>
              <div className="space-y-2 text-sm">
                <div>系统：{invoiceForm.thirdPartySystem || '-'}</div>
                <div>外部单号：{invoiceForm.externalBillNo || '-'}</div>
                <div>外链：{invoiceForm.externalLinkUrl || '-'}</div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
            <div className="mb-3 text-sm font-medium">核销历史</div>
            <div className="space-y-2">
              {writeoffHistory.length ? writeoffHistory.map((item) => (
                <div key={item.writeoffId || `${item.businessType}-${item.businessId}-${item.writeoffDate}`} className="rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-900">
                  <div>{item.businessType} / {item.businessNo || item.businessId || '-'}</div>
                  <div className="text-xs text-slate-500">核销金额 {formatMoney(item.writeoffAmount)} / 核销日期 {item.writeoffDate || '-'}</div>
                </div>
              )) : <div className="text-sm text-slate-500">暂无核销历史。下一步操作：在“核销发票”中录入第一笔核销。</div>}
            </div>
          </div>
        </div>
      </BaseDialog>

      <BaseDialog
        open={dialog?.type === 'bind'}
        title="绑定发票业务对象"
        onClose={() => void openDialog(null)}
        width="wide"
        footer={<><Button variant="outline" onClick={() => void openDialog(null)}>取消</Button><Button onClick={() => void saveBind()} disabled={saving}>{saving ? '绑定中...' : '确认绑定'}</Button></>}
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400">
            {bindDescription}
          </div>

          {invoiceForm.invoiceDirection === 'OUTPUT' ? (
            <div className="space-y-4">
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
            <div className="space-y-4">
              <div>
                <Label className={fieldLabelClassName}>绑定对象类型</Label>
                <Select value={invoiceForm.expenseClaimId ? 'EXPENSE' : invoiceForm.paymentRequestId ? 'PAYMENT' : 'NONE'} onValueChange={(value) => {
                  if (value === 'EXPENSE') {
                    setInvoiceForm((prev) => ({ ...prev, paymentRequestId: undefined }));
                    return;
                  }
                  if (value === 'PAYMENT') {
                    setInvoiceForm((prev) => ({ ...prev, expenseClaimId: undefined }));
                    return;
                  }
                  setInvoiceForm((prev) => ({ ...prev, expenseClaimId: undefined, paymentRequestId: undefined }));
                }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">选择绑定类型</SelectItem>
                    <SelectItem value="EXPENSE">报销单</SelectItem>
                    <SelectItem value="PAYMENT">付款单</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {invoiceForm.paymentRequestId ? (
                <div>
                  <Label className={fieldLabelClassName}>付款单</Label>
                  <Select value={invoiceForm.paymentRequestId ? String(invoiceForm.paymentRequestId) : 'NONE'} onValueChange={(value) => {
                    const paymentRequestId = value === 'NONE' ? undefined : Number(value);
                    const matched = paymentRequests.find((item) => item.id === paymentRequestId);
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
              ) : (
                <div>
                  <Label className={fieldLabelClassName}>报销单</Label>
                  <Select value={invoiceForm.expenseClaimId ? String(invoiceForm.expenseClaimId) : 'NONE'} onValueChange={(value) => {
                    const expenseClaimId = value === 'NONE' ? undefined : Number(value);
                    const matched = expenseClaims.find((item) => item.id === expenseClaimId);
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
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400">
            核销 = 把发票金额冲抵到已绑定业务对象。作废发票禁止继续核销；核销后，OA 单据和 CRM 回款的发票状态会同步刷新。
          </div>
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

          <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
            <div className="mb-3 text-sm font-medium">已有核销历史</div>
            <div className="space-y-2">
              {writeoffHistory.length ? writeoffHistory.map((item) => (
                <div key={item.writeoffId || `${item.businessType}-${item.businessId}-${item.writeoffDate}`} className="rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-900">
                  <div>{item.businessType} / {item.businessNo || item.businessId || '-'}</div>
                  <div className="text-xs text-slate-500">核销金额 {formatMoney(item.writeoffAmount)} / 核销日期 {item.writeoffDate || '-'}</div>
                </div>
              )) : <div className="text-sm text-slate-500">暂无核销历史。</div>}
            </div>
          </div>
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
    </div>
  );
}
