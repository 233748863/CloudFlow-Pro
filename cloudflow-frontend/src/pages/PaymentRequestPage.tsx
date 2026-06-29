import React, { useEffect, useMemo, useState } from 'react';
import { getConfigIntSync } from '../hooks/useSystemConfig';
import { SYS_PAGE_DEFAULT_PAGE_SIZE } from '../constants/sysConfig';
import { CheckCircle2, Clock3, Download, DollarSign, Edit, Eye, Paperclip, Plus, RefreshCw, RotateCcw, Search, Send, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { paymentRequestApi, PaymentRequest } from '@/services/api/expense';
import { crmApi, CrmCustomer } from '@/services/api/crm';
import { useWorkflowRefresh } from '@/hooks/useWorkflowRefresh';
import { projectApi, Project } from '@/services/api/project';
import { budgetApi, BudgetSubject } from '@/services/api/budget';
import FileUpload from '@/components/FileUpload';
import { formatDateTimeDisplay } from '@/utils/dateFormat';
import { buildExcelFileName, downloadBlob } from '@/utils/download';
import { getErrorMessage } from '@/utils/errorMessage';
import { getAttachmentDisplayName, normalizeAttachmentUrls } from '@/utils/attachment';
import { BaseDialog } from '@/components/common/BaseDialog';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { ListResultFooter } from '@/components/common/ListResultFooter';
import { useAuth } from '@/context/AuthContext';
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
  type: 'delete' | 'submit' | 'pay';
  id: number;
  title: string;
  message: string;
  confirmText: string;
  danger?: boolean;
}

const createDefaultForm = (): PaymentRequest => ({
  payeeName: '',
  payeeAccount: '',
  payeeBank: '',
  amount: 0,
  paymentType: 'PURCHASE',
  reason: '',
  expectedDate: '',
  attachmentUrl: '',
});

const InlineState: React.FC<{
  title: string;
  description?: string;
  icon?: React.ReactNode;
  className?: string;
}> = ({ title, description, icon, className }) => (
  <div className={['flex flex-col items-center justify-center px-6 py-10 text-center', className].filter(Boolean).join(' ')}>
    <div className="admin-source-stat-icon mb-3">
      {icon || <DollarSign className="h-4 w-4" />}
    </div>
    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
    {description ? (
      <div className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">{description}</div>
    ) : null}
  </div>
);

const TableStateRow: React.FC<{
  colSpan: number;
  title: string;
  description?: string;
  icon?: React.ReactNode;
  loading?: boolean;
}> = ({ colSpan, title, description, icon, loading = false }) => (
  <tr className="hover:bg-transparent">
    <td colSpan={colSpan} className="px-4 py-10">
      <div className="flex flex-col items-center justify-center text-center">
        <div className="admin-source-stat-icon mb-3">
          {loading ? <Clock3 className="h-4 w-4 animate-spin" /> : icon || <DollarSign className="h-4 w-4" />}
        </div>
        <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
        {description ? (
          <div className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">{description}</div>
        ) : null}
      </div>
    </td>
  </tr>
);

const DetailRows: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className }) => (
  <div className={['admin-finance-detail-list admin-contract-detail-grid', className].filter(Boolean).join(' ')}>
    {children}
  </div>
);

const DetailRow: React.FC<{
  label: string;
  value: React.ReactNode;
  alignStart?: boolean;
}> = ({ label, value, alignStart = false }) => (
  <div className={alignStart ? 'admin-detail-wide' : ''}>
    <span>{label}</span>
    <strong>{value}</strong>
  </div>
);

const PaymentPanel: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="table-scroll-container admin-inner-table-surface">
    <div className="admin-source-section-head border-b border-slate-200 px-4 py-3 dark:border-slate-800">
      <div>
        <strong>{title}</strong>
      </div>
    </div>
    <div className="p-4">{children}</div>
  </section>
);

const formatAmount = (value?: number | null) => {
  if (value === undefined || value === null || Number.isNaN(Number(value))) {
    return '-';
  }

  return `¥${Number(value).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const getAttachmentList = (attachmentUrl?: string) =>
  normalizeAttachmentUrls(attachmentUrl);

export const PaymentRequestPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const statusDict = useDict('oa_payment_request_status');
  const paymentTypeDict = useDict('oa_payment_type');
  const getPaymentTypeLabel = (paymentType?: string) =>
    paymentTypeDict.getLabel(String(paymentType ?? '')) || '-';
  const [payments, setPayments] = useState<PaymentRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchParams, setSearchParams] = useState({
    status: '',
    paymentType: '',
    pageNum: 1,
    pageSize: getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10),
  });
  const [paymentTypeDraft, setPaymentTypeDraft] = useState('');
  const [total, setTotal] = useState(0);
  const [showDialog, setShowDialog] = useState(false);
  const [currentPayment, setCurrentPayment] = useState<PaymentRequest | null>(null);
  const [detailPayment, setDetailPayment] = useState<PaymentRequest | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [formData, setFormData] = useState<PaymentRequest>(createDefaultForm());
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [projectOptions, setProjectOptions] = useState<Project[]>([]);
  const [customerOptions, setCustomerOptions] = useState<CrmCustomer[]>([]);
  const [budgetSubjectOptions, setBudgetSubjectOptions] = useState<BudgetSubject[]>([]);

  const fetchPayments = async () => {
    setLoading(true);
    try {
      const result = await paymentRequestApi.list(searchParams);
      setPayments(result.records || result.rows || []);
      setTotal(result.total || 0);
    } catch (error) {
      toast.error(getErrorMessage(error, '获取付款申请列表失败'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchPayments();
  }, [searchParams]);

  useWorkflowRefresh(fetchPayments, 'payment_request');

  useEffect(() => {
    const loadReferences = async () => {
      try {
        const [projectResult, customerResult, subjectResult] = await Promise.all([
          projectApi.list({ pageNum: 1, pageSize: 100 }),
          crmApi.listCustomers({ pageNum: 1, pageSize: 100 }),
          budgetApi.listSubjects({ pageNum: 1, pageSize: 100 }),
        ]);
        setProjectOptions(projectResult.rows || []);
        setCustomerOptions(customerResult.rows || []);
        setBudgetSubjectOptions(subjectResult.rows || []);
      } catch (error) {
        toast.error(getErrorMessage(error, '加载付款候选数据失败'));
      }
    };
    void loadReferences();
  }, []);

  const draftCount = useMemo(
    () => payments.filter((item) => item.status === 'DRAFT').length,
    [payments],
  );
  const pendingCount = useMemo(
    () => payments.filter((item) => item.status === 'PENDING').length,
    [payments],
  );
  const approvedCount = useMemo(
    () => payments.filter((item) => item.status === 'APPROVED').length,
    [payments],
  );
  const paidCount = useMemo(
    () => payments.filter((item) => item.status === 'PAID').length,
    [payments],
  );

  const hasActiveFilters = Boolean(searchParams.status || searchParams.paymentType);
  const currentStatusLabel = searchParams.status
    ? statusDict.getLabel(searchParams.status)
    : '全部状态';
  const currentTypeLabel = searchParams.paymentType
    ? getPaymentTypeLabel(searchParams.paymentType)
    : '全部类型';
  const resultSummary = hasActiveFilters ? `${currentStatusLabel} / ${currentTypeLabel}` : '全部付款';
  const metrics = [
    { label: '付款申请', value: String(total), meta: `当前页 ${payments.length}`, icon: <DollarSign size={18} />, tone: 'blue' },
    { label: '审批中', value: String(pendingCount), meta: '待审批流转', icon: <Clock3 size={18} />, tone: 'amber' },
    { label: '已通过', value: String(approvedCount), meta: '待付款确认', icon: <CheckCircle2 size={18} />, tone: 'green' },
    { label: '已付款', value: String(paidCount), meta: `草稿 ${draftCount}`, icon: <Send size={18} />, tone: 'violet' },
  ];

  const handleApplyFilters = () => {
    setSearchParams((prev) => ({
      ...prev,
      paymentType: paymentTypeDraft,
      pageNum: 1,
    }));
  };

  const handleResetFilters = () => {
    setPaymentTypeDraft('');
    setSearchParams({
      status: '',
      paymentType: '',
      pageNum: 1,
      pageSize: getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10),
    });
  };

  const handleAdd = () => {
    setCurrentPayment(null);
    setFormData(createDefaultForm());
    setShowDialog(true);
  };

  const closeFormDialog = () => {
    setShowDialog(false);
    setCurrentPayment(null);
    setFormData(createDefaultForm());
  };

  const closeDetailDialog = () => {
    setDetailLoading(false);
    setDetailPayment(null);
  };

  const handleView = async (payment: PaymentRequest) => {
    setDetailPayment(payment);
    setDetailLoading(true);
    try {
      const result = await paymentRequestApi.getInfo(payment.id!);
      setDetailPayment(result);
    } catch (error) {
      closeDetailDialog();
      toast.error(getErrorMessage(error, '获取付款申请详情失败'));
    } finally {
      setDetailLoading(false);
    }
  };

  const handleEdit = async (id: number) => {
    try {
      const result = await paymentRequestApi.getInfo(id);
      setCurrentPayment(result);
      setFormData({ ...createDefaultForm(), ...result });
      setShowDialog(true);
    } catch (error) {
      toast.error(getErrorMessage(error, '获取付款申请详情失败'));
    }
  };

  const handleSave = async () => {
    if (!formData.payeeName.trim() || !formData.reason.trim()) {
      toast.error('请填写完整信息');
      return;
    }

    if (Number(formData.amount) <= 0) {
      toast.error('付款金额必须大于 0');
      return;
    }

    try {
      if (currentPayment?.id) {
        await paymentRequestApi.edit(formData);
        toast.success('更新成功');
      } else {
        await paymentRequestApi.add(formData);
        toast.success('创建成功');
      }

      closeFormDialog();
      await fetchPayments();
    } catch (error) {
      toast.error(getErrorMessage(error, '保存失败'));
    }
  };

  const openDeleteConfirm = (id: number) => {
    setConfirmState({
      type: 'delete',
      id,
      title: '删除付款申请',
      message: '删除后当前草稿不可恢复。',
      confirmText: '删除',
      danger: true,
    });
  };

  const openSubmitConfirm = (id: number) => {
    setConfirmState({
      type: 'submit',
      id,
      title: '提交付款申请',
      message: '提交后将进入审批流程。',
      confirmText: '提交',
    });
  };

  const openPayConfirm = (id: number) => {
    setConfirmState({
      type: 'pay',
      id,
      title: '确认付款',
      message: '确认后付款单将标记为已付款，并同步回写采购单付款状态。',
      confirmText: '确认付款',
    });
  };

  const handleConfirmAction = async () => {
    if (!confirmState) {
      return;
    }

    const currentState = confirmState;
    setConfirmState(null);

    try {
      if (currentState.type === 'delete') {
        await paymentRequestApi.remove([currentState.id]);
        toast.success('删除成功');
      } else if (currentState.type === 'pay') {
        await paymentRequestApi.confirmPaid(currentState.id);
        toast.success('已确认付款');
      } else {
        await paymentRequestApi.submit(currentState.id);
        toast.success('提交成功');
      }

      await fetchPayments();
      setDetailPayment((prev) => (prev?.id === currentState.id ? null : prev));
    } catch (error) {
      toast.error(getErrorMessage(
        error,
        currentState.type === 'delete'
          ? '删除失败'
          : currentState.type === 'pay'
            ? '确认付款失败'
            : '提交失败',
      ));
    }
  };

  const handleExport = async () => {
    try {
      const blob = await paymentRequestApi.export(searchParams);
      const fileName = downloadBlob(blob, buildExcelFileName('付款申请'));
      toast.success(
        total > 0
          ? `已导出 ${total} 条付款申请，下载文件：${fileName}`
          : `已导出空结果，下载文件：${fileName}`,
      );
    } catch (error) {
      toast.error(getErrorMessage(error, '导出失败'));
    }
  };

  const getStatusBadge = (status?: string) => (
    <DictBadge dictType="oa_payment_request_status" value={String(status || 'DRAFT')} />
  );

  const renderDetailValue = (value?: string | number | null) => {
    if (value === undefined || value === null || value === '') {
      return '-';
    }
    return value;
  };

  const pageActions = (
    <div className="grid gap-5">
      <header className="admin-source-header">
        <div>
          <p className="admin-source-kicker">PAYMENT REQUEST</p>
          <h2>付款申请</h2>
          <span>跟踪收款方、预算科目、审批状态和实际付款确认</span>
        </div>
        <div className="admin-source-controls">
          <Button variant="outline" size="sm" onClick={() => void fetchPayments()} disabled={loading}>
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            刷新
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download size={16} />
            导出结果
          </Button>
          <Button size="sm" onClick={handleAdd} disabled={!hasPermission('oa:payment:add')}>
            <Plus size={16} />
            新建申请
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
        <label>
          <span className="input-label">状态</span>
          <Select
            value={searchParams.status || 'ALL'}
            onValueChange={(value) =>
              setSearchParams((prev) => ({
                ...prev,
                status: value === 'ALL' ? '' : value,
                pageNum: 1,
              }))
            }
          >
            <SelectTrigger className="h-[42px]">
              <SelectValue placeholder="全部状态" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">全部状态</SelectItem>
              {statusDict.getOptions().map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label>
          <span className="input-label">付款类型</span>
          <Select value={paymentTypeDraft || 'ALL'} onValueChange={(value) => setPaymentTypeDraft(value === 'ALL' ? '' : value)}>
            <SelectTrigger className="h-[42px]">
              <SelectValue placeholder="全部类型" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">全部类型</SelectItem>
              {paymentTypeDict.getOptions().map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <div className="admin-users-toolbar-actions">
          <Button size="sm" onClick={handleApplyFilters}><Search size={14} />查询</Button>
          <Button variant="outline" size="sm" onClick={handleResetFilters} disabled={!hasActiveFilters && !paymentTypeDraft}><RotateCcw size={14} />重置</Button>
        </div>
      </div>
    </section>
  );

  const pageTable = (
    <InnerTableSurface>
      <table className="unity-data-table admin-source-table finance-source-table min-w-[1180px]">
          <thead>
            <tr>
              <th>付款单号</th>
              <th>收款方 / 账户</th>
              <th>申请人 / 部门</th>
              <th>类型 / 日期</th>
              <th>金额</th>
              <th>付款事由</th>
              <th>状态</th>
              <th className="text-right">当前操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableStateRow colSpan={8} title="正在加载付款申请..." loading />
            ) : payments.length === 0 ? (
              <TableStateRow colSpan={8} title={hasActiveFilters ? '当前筛选下暂无记录' : '暂无付款申请'} />
            ) : (
              payments.map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.paymentNo || '-'}</strong>
                    <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">{formatDateTimeDisplay(item.createTime)}</div>
                  </td>
                  <td>
                    <strong>{item.payeeName || '-'}</strong>
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{item.payeeAccount || item.payeeBank || '-'}</div>
                  </td>
                  <td>
                    <strong>{item.userName || '-'}</strong>
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{item.deptName || '-'}</div>
                  </td>
                  <td>
                    <span>{getPaymentTypeLabel(item.paymentType)}</span>
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{item.expectedDate || '-'}</div>
                  </td>
                  <td>{formatAmount(item.amount)}</td>
                  <td><div className="max-w-sm truncate">{item.reason || '-'}</div></td>
                  <td>{getStatusBadge(item.status)}</td>
                  <td>
                    <div className="admin-users-row-actions">
                      <button type="button" title="详情" aria-label="详情" onClick={() => void handleView(item)}><Eye size={15} /></button>
                      {item.status === 'DRAFT' && hasPermission('oa:payment:edit') ? <button type="button" title="编辑" aria-label="编辑" onClick={() => void handleEdit(item.id!)}><Edit size={15} /></button> : null}
                      {item.status === 'DRAFT' && hasPermission('oa:payment:submit') ? <button type="button" title="提交" aria-label="提交" onClick={() => openSubmitConfirm(item.id!)}><Send size={15} /></button> : null}
                      {item.status === 'APPROVED' && hasPermission('oa:payment:pay') ? <button type="button" title="付款" aria-label="付款" onClick={() => openPayConfirm(item.id!)}><CheckCircle2 size={15} /></button> : null}
                      {item.status === 'DRAFT' && hasPermission('oa:payment:remove') ? <button type="button" className="danger" title="删除" aria-label="删除" onClick={() => openDeleteConfirm(item.id!)}><Trash2 size={15} /></button> : null}
                    </div>
                  </td>
                </tr>
              ))
            )}
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
      <section className="admin-source-page finance-source-page payment-request-page">
        <TablePageLayout
          actions={pageActions}
          filters={pageFilters}
          table={pageTable}
          pagination={pagePagination}
        />
      </section>

      <BaseDialog
        open={showDialog}
        title={currentPayment ? '编辑付款申请' : '新建付款申请'}
        onClose={closeFormDialog}
        width="wide"
        bodyClassName="admin-dialog-stack"
        footer={(
          <>
            <Button variant="outline" onClick={closeFormDialog}>
              取消
            </Button>
            <Button onClick={() => void handleSave()} disabled={!hasPermission(currentPayment ? 'oa:payment:edit' : 'oa:payment:add')}>
              保存
            </Button>
          </>
        )}
      >
        <div className="admin-dialog-stack">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="admin-dialog-field">
              <Label>收款方名称</Label>
              <Input
                className="h-11"
                type="text"
                value={formData.payeeName}
                onChange={(event) => setFormData((prev) => ({ ...prev, payeeName: event.target.value }))}
                placeholder="请输入收款方名称"
              />
            </div>
            <div className="admin-dialog-field">
              <Label>付款金额</Label>
              <Input
                className="h-11"
                type="number"
                value={formData.amount || ''}
                onChange={(event) => setFormData((prev) => ({ ...prev, amount: parseFloat(event.target.value) || 0 }))}
                placeholder="0.00"
                step="0.01"
                min="0"
              />
            </div>
            <div className="admin-dialog-field">
              <Label>付款类型</Label>
              <Select
                value={formData.paymentType}
                onValueChange={(value) => setFormData((prev) => ({ ...prev, paymentType: value }))}
              >
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="请选择付款类型" />
                </SelectTrigger>
                <SelectContent>
                  {paymentTypeDict.getOptions().map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="admin-dialog-field">
              <Label>期望付款日期</Label>
              <DatePicker
                className="h-11"
                type="date"
                value={formData.expectedDate || ''}
                onChange={(event) => setFormData((prev) => ({ ...prev, expectedDate: event.target.value }))}
              />
            </div>
            <div className="admin-dialog-field">
              <Label>收款账号</Label>
              <Input
                className="h-11"
                type="text"
                value={formData.payeeAccount || ''}
                onChange={(event) => setFormData((prev) => ({ ...prev, payeeAccount: event.target.value }))}
                placeholder="请输入收款账号"
              />
            </div>
            <div className="admin-dialog-field">
              <Label>开户银行</Label>
              <Input
                className="h-11"
                type="text"
                value={formData.payeeBank || ''}
                onChange={(event) => setFormData((prev) => ({ ...prev, payeeBank: event.target.value }))}
                placeholder="请输入开户银行"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
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
              <Label>预算科目</Label>
              <Select
                value={formData.budgetSubjectCode || 'NONE'}
                onValueChange={(value) => {
                  const subject = budgetSubjectOptions.find((item) => item.subjectCode === value);
                  setFormData((prev) => ({
                    ...prev,
                    budgetSubjectCode: value === 'NONE' ? '' : value,
                    budgetSubjectName: subject?.subjectName || '',
                  }));
                }}
              >
                <SelectTrigger className="h-11"><SelectValue placeholder="选择预算科目" /></SelectTrigger>
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
          </div>

          <div className="admin-dialog-field">
            <Label>付款事由</Label>
            <Textarea
              className="min-h-[120px] resize-none"
              value={formData.reason}
              onChange={(event) => setFormData((prev) => ({ ...prev, reason: event.target.value }))}
              placeholder="填写付款原因"
            />
          </div>

          <div className="admin-dialog-field">
            <Label>附件</Label>
            <FileUpload
              value={formData.attachmentUrl || ''}
              onChange={(urls) => setFormData((prev) => ({ ...prev, attachmentUrl: urls }))}
              maxCount={5}
            />
          </div>
        </div>
      </BaseDialog>

      <BaseDialog
        open={Boolean(detailPayment)}
        title={detailPayment?.paymentNo || '付款申请详情'}
        onClose={closeDetailDialog}
        width="wide"
        headerAside={detailPayment && !detailLoading ? getStatusBadge(detailPayment.status) : null}
        bodyClassName="admin-dialog-stack"
        footer={(
          <Button variant="outline" onClick={closeDetailDialog}>
            关闭
          </Button>
        )}
      >
        {detailLoading ? (
          <InlineState title="正在加载付款详情..." className="py-12" icon={<Clock3 className="h-4 w-4 animate-spin" />} />
        ) : detailPayment ? (
          <>
            <DetailRows>
              <DetailRow label="收款方" value={renderDetailValue(detailPayment.payeeName)} />
              <DetailRow label="付款金额" value={formatAmount(detailPayment.amount)} />
              <DetailRow label="付款类型" value={getPaymentTypeLabel(detailPayment.paymentType)} />
              <DetailRow label="期望付款日期" value={renderDetailValue(detailPayment.expectedDate)} />
              <DetailRow label="收款账号" value={renderDetailValue(detailPayment.payeeAccount)} />
              <DetailRow label="开户银行" value={renderDetailValue(detailPayment.payeeBank)} />
              <DetailRow label="关联项目" value={renderDetailValue(detailPayment.projectName)} />
              <DetailRow label="客户" value={renderDetailValue(detailPayment.customerName)} />
              <DetailRow label="预算科目" value={renderDetailValue(detailPayment.budgetSubjectName || detailPayment.budgetSubjectCode)} />
              <DetailRow label="发票状态" value={renderDetailValue(detailPayment.invoiceStatus)} />
              <DetailRow label="申请人" value={renderDetailValue(detailPayment.userName)} />
              <DetailRow label="所属部门" value={renderDetailValue(detailPayment.deptName)} />
              <DetailRow label="流程实例" value={renderDetailValue(detailPayment.instanceId)} />
              <DetailRow label="创建时间" value={formatDateTimeDisplay(detailPayment.createTime)} />
              <DetailRow label="更新时间" value={formatDateTimeDisplay(detailPayment.updateTime)} />
            </DetailRows>

            <PaymentPanel title="付款事由">
              <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600 dark:text-slate-300">
                {detailPayment.reason || '-'}
              </div>
            </PaymentPanel>

            <PaymentPanel title="附件">
              {getAttachmentList(detailPayment.attachmentUrl).length ? (
                <div className="admin-dialog-stack">
                  {getAttachmentList(detailPayment.attachmentUrl).map((url) => {
                    const label = getAttachmentDisplayName(url);
                    return (
                      <a
                        key={url}
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="admin-option-surface flex items-center gap-2 rounded-md border border-slate-200 bg-[var(--cf-surface-strong)] px-4 py-3 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300"
                      >
                        <Paperclip size={14} />
                        <span className="truncate">{label}</span>
                      </a>
                    );
                  })}
                </div>
              ) : (
                <InlineState title="暂无附件" className="py-5" icon={<Paperclip className="h-4 w-4" />} />
              )}
            </PaymentPanel>
          </>
        ) : null}
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

export default PaymentRequestPage;
