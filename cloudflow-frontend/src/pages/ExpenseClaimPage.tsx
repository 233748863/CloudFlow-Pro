import React, { useEffect, useMemo, useState } from 'react';
import { getConfigIntSync } from '../hooks/useSystemConfig';
import { SYS_PAGE_DEFAULT_PAGE_SIZE } from '../constants/sysConfig';
import { CheckCircle2, Clock3, Download, Edit, Eye, Paperclip, Plus, Receipt, RefreshCw, RotateCcw, Search, Send, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { expenseClaimApi, ExpenseClaim, ExpenseItem } from '@/services/api/expense';
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
import './ExpenseClaimPage.css';

interface ConfirmState {
  type: 'delete' | 'submit' | 'pay';
  id: number;
  title: string;
  message: string;
  confirmText: string;
  danger?: boolean;
}

type ExpenseFormItem = ExpenseItem & {
  clientKey: string;
};

type ExpenseClaimForm = Omit<ExpenseClaim, 'items'> & {
  items: ExpenseFormItem[];
};

const formatAmount = (value?: number | null) => {
  if (value === undefined || value === null || Number.isNaN(Number(value))) {
    return '-';
  }

  return `¥${Number(value).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const createExpenseItemKey = () =>
  `expense-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const createDefaultItem = (): ExpenseFormItem => ({
  clientKey: createExpenseItemKey(),
  expenseType: 'TRANSPORT',
  amount: 0,
  expenseDate: '',
  description: '',
  receiptUrl: '',
});

const withClientKey = (item: ExpenseItem): ExpenseFormItem => ({
  ...item,
  clientKey: (item as ExpenseFormItem).clientKey || createExpenseItemKey(),
});

const stripClientKey = (item: ExpenseFormItem): ExpenseItem => {
  const { clientKey: _clientKey, ...payload } = item;
  return payload;
};

const createDefaultForm = (): ExpenseClaimForm => ({
  category: 'TRAVEL',
  description: '',
  items: [createDefaultItem()],
});

const getReceiptList = (receiptUrl?: string) =>
  normalizeAttachmentUrls(receiptUrl);

const expenseItemControlClass = '!h-10 h-10 min-h-10';

const InlineState: React.FC<{
  title: string;
  description?: string;
  icon?: React.ReactNode;
  className?: string;
}> = ({ title, description, icon, className }) => (
  <div className={['admin-dialog-empty-note', className].filter(Boolean).join(' ')}>
    <div className="flex flex-col items-center justify-center text-center">
      <div className="admin-source-stat-icon mb-3 text-cf-faint">
        {icon || <Receipt className="h-4 w-4" />}
      </div>
      <div className="text-sm font-medium text-cf-title">{title}</div>
      {description ? (
        <div className="mt-2 text-xs leading-6 text-cf-subtle">{description}</div>
      ) : null}
    </div>
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
        <div className="admin-source-stat-icon mb-3 text-cf-faint">
          {loading ? <Clock3 className="h-4 w-4 animate-spin" /> : icon || <Receipt className="h-4 w-4" />}
        </div>
        <div className="text-sm font-medium text-cf-title">{title}</div>
        {description ? (
          <div className="mt-2 text-xs leading-6 text-cf-subtle">{description}</div>
        ) : null}
      </div>
    </td>
  </tr>
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

const DetailRows: React.FC<{
  children: React.ReactNode;
  className?: string;
  title?: string;
  description?: string;
}> = ({ children, className, title = '基础信息', description }) => (
  <DialogPanel title={title} description={description} className="admin-expense-detail-panel" bodyClassName={['admin-expense-detail-grid', className].filter(Boolean).join(' ')}>
    {children}
  </DialogPanel>
);

const DetailRow: React.FC<{
  label: string;
  value: React.ReactNode;
  alignStart?: boolean;
}> = ({ label, value, alignStart = false }) => (
  <div className={['admin-expense-detail-item', alignStart && 'admin-expense-detail-item-wide'].filter(Boolean).join(' ')}>
    <div className="text-[11px] font-medium text-cf-faint">{label}</div>
    <div className="mt-1.5 text-sm leading-6 text-cf-title">{value}</div>
  </div>
);

const ExpensePanel: React.FC<{
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

export const ExpenseClaimPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const statusDict = useDict('oa_expense_status');
  const categoryDict = useDict('oa_expense_category');
  const expenseTypeDict = useDict('oa_expense_item_type');
  const [claims, setClaims] = useState<ExpenseClaim[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchParams, setSearchParams] = useState({
    status: '',
    category: '',
    pageNum: 1,
    pageSize: getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10),
  });
  const [categoryDraft, setCategoryDraft] = useState('');
  const [remoteTotal, setRemoteTotal] = useState(0);
  const [showDialog, setShowDialog] = useState(false);
  const [currentClaim, setCurrentClaim] = useState<ExpenseClaim | null>(null);
  const [detailClaim, setDetailClaim] = useState<ExpenseClaim | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [formData, setFormData] = useState<ExpenseClaimForm>(createDefaultForm());
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [projectOptions, setProjectOptions] = useState<Project[]>([]);
  const [customerOptions, setCustomerOptions] = useState<CrmCustomer[]>([]);
  const [budgetSubjectOptions, setBudgetSubjectOptions] = useState<BudgetSubject[]>([]);

  const fetchClaims = async () => {
    setLoading(true);
    try {
      const response = await expenseClaimApi.list(searchParams);
      setClaims(response.records || response.rows || []);
      setRemoteTotal(response.total || 0);
    } catch (error) {
      toast.error(getErrorMessage(error, '获取报销申请列表失败'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchClaims();
  }, [searchParams]);

  useWorkflowRefresh(fetchClaims, 'expense_claim');

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
        toast.error(getErrorMessage(error, '加载报销候选数据失败'));
      }
    };
    void loadReferences();
  }, []);

  const draftCount = useMemo(
    () => claims.filter((item) => item.status === 'DRAFT').length,
    [claims],
  );
  const pendingCount = useMemo(
    () => claims.filter((item) => item.status === 'PENDING').length,
    [claims],
  );
  const approvedCount = useMemo(
    () => claims.filter((item) => item.status === 'APPROVED').length,
    [claims],
  );
  const paidCount = useMemo(
    () => claims.filter((item) => item.status === 'PAID').length,
    [claims],
  );

  const hasActiveFilters = Boolean(searchParams.status || searchParams.category);
  const currentStatusLabel = searchParams.status
    ? statusDict.getLabel(searchParams.status)
    : '全部状态';
  const currentCategoryLabel = searchParams.category
    ? categoryDict.getLabel(searchParams.category)
    : '全部类别';
  const totalPages = Math.max(1, Math.ceil(remoteTotal / searchParams.pageSize));
  const resultSummary = hasActiveFilters ? `${currentStatusLabel} / ${currentCategoryLabel}` : '全部报销';
  const formTotalAmount = formData.items?.reduce((sum, item) => sum + Number(item.amount || 0), 0) || 0;
  const metrics = [
    { label: '报销申请', value: String(remoteTotal), meta: `当前页 ${claims.length}`, icon: <Receipt size={18} />, tone: 'blue' },
    { label: '审批中', value: String(pendingCount), meta: '待审批流转', icon: <Clock3 size={18} />, tone: 'amber' },
    { label: '已通过', value: String(approvedCount), meta: '待打款', icon: <CheckCircle2 size={18} />, tone: 'green' },
    { label: '已打款', value: String(paidCount), meta: `草稿 ${draftCount}`, icon: <Send size={18} />, tone: 'violet' },
  ];

  const handleApplyFilters = () => {
    setSearchParams((prev) => ({
      ...prev,
      category: categoryDraft,
      pageNum: 1,
    }));
  };

  const handleResetFilters = () => {
    setCategoryDraft('');
    setSearchParams({
      status: '',
      category: '',
      pageNum: 1,
      pageSize: getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10),
    });
  };

  const handleAdd = () => {
    setCurrentClaim(null);
    setFormData(createDefaultForm());
    setShowDialog(true);
  };

  const closeFormDialog = () => {
    setShowDialog(false);
    setCurrentClaim(null);
    setFormData(createDefaultForm());
  };

  const closeDetailDialog = () => {
    setDetailLoading(false);
    setDetailClaim(null);
  };

  const handleView = async (claim: ExpenseClaim) => {
    setDetailClaim(claim);
    setDetailLoading(true);
    try {
      const response = await expenseClaimApi.getInfo(claim.id!);
      setDetailClaim(response);
    } catch (error) {
      closeDetailDialog();
      toast.error(getErrorMessage(error, '获取报销申请详情失败'));
    } finally {
      setDetailLoading(false);
    }
  };

  const handleEdit = async (id: number) => {
    try {
      const response = await expenseClaimApi.getInfo(id);
      setCurrentClaim(response);
      setFormData({
        ...createDefaultForm(),
        ...response,
        items: response.items?.length ? response.items.map(withClientKey) : [createDefaultItem()],
      });
      setShowDialog(true);
    } catch (error) {
      toast.error(getErrorMessage(error, '获取报销申请详情失败'));
    }
  };

  const handleSave = async () => {
    if (!formData.category || !formData.description?.trim()) {
      toast.error('请填写完整信息');
      return;
    }

    if (!formData.items?.length) {
      toast.error('请至少添加一条报销明细');
      return;
    }

    for (const item of formData.items) {
      if (!item.expenseType || !item.expenseDate || Number(item.amount) <= 0) {
        toast.error('请填写完整的报销明细信息');
        return;
      }
    }

    const totalAmount = formData.items.reduce((sum, item) => sum + Number(item.amount || 0), 0);

    try {
      const payload: ExpenseClaim = {
        ...formData,
        totalAmount,
        items: formData.items.map(stripClientKey),
      };
      if (currentClaim?.id) {
        await expenseClaimApi.edit(payload);
        toast.success('更新成功');
      } else {
        await expenseClaimApi.add(payload);
        toast.success('创建成功');
      }

      closeFormDialog();
      await fetchClaims();
    } catch (error) {
      toast.error(getErrorMessage(error, '保存失败'));
    }
  };

  const openDeleteConfirm = (id: number) => {
    setConfirmState({
      type: 'delete',
      id,
      title: '删除报销申请',
      message: '删除后当前草稿不可恢复。',
      confirmText: '删除',
      danger: true,
    });
  };

  const openSubmitConfirm = (id: number) => {
    setConfirmState({
      type: 'submit',
      id,
      title: '提交报销申请',
      message: '提交后将进入审批流程。',
      confirmText: '提交',
    });
  };

  const openPayConfirm = (id: number) => {
    setConfirmState({
      type: 'pay',
      id,
      title: '确认报销打款',
      message: '确认后报销单将标记为已打款，并同步触发预算核销。',
      confirmText: '确认打款',
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
        await expenseClaimApi.remove([currentState.id]);
        toast.success('删除成功');
      } else if (currentState.type === 'pay') {
        await expenseClaimApi.confirmPaid(currentState.id);
        toast.success('已确认打款');
      } else {
        await expenseClaimApi.submit(currentState.id);
        toast.success('提交成功');
      }

      await fetchClaims();
      setDetailClaim((prev) => (prev?.id === currentState.id ? null : prev));
    } catch (error) {
      toast.error(getErrorMessage(
        error,
        currentState.type === 'delete' ? '删除失败' : currentState.type === 'pay' ? '确认打款失败' : '提交失败',
      ));
    }
  };

  const handleExport = async () => {
    try {
      const blob = await expenseClaimApi.export(searchParams);
      const fileName = downloadBlob(blob, buildExcelFileName('报销申请'));
      toast.success(
        remoteTotal > 0
          ? `已导出 ${remoteTotal} 条报销申请，下载文件：${fileName}`
          : `已导出空结果，下载文件：${fileName}`,
      );
    } catch (error) {
      toast.error(getErrorMessage(error, '导出失败'));
    }
  };

  const addItem = () => {
    setFormData((prev) => ({ ...prev, items: [...(prev.items || []), createDefaultItem()] }));
  };

  const removeItem = (index: number) => {
    setFormData((prev) => {
      const nextItems = [...(prev.items || [])];
      nextItems.splice(index, 1);
      return { ...prev, items: nextItems };
    });
  };

  const updateItem = (index: number, field: keyof ExpenseItem, value: string | number) => {
    setFormData((prev) => {
      const nextItems = [...(prev.items || [])];
      nextItems[index] = { ...nextItems[index], [field]: value };
      return { ...prev, items: nextItems };
    });
  };

  const getStatusBadge = (status?: string) => (
    <DictBadge dictType="oa_expense_status" value={String(status || 'DRAFT')} />
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
          <p className="admin-source-kicker">EXPENSE CLAIM</p>
          <h2>报销申请</h2>
          <span>集中查看报销类别、费用明细、预算科目和审批打款状态</span>
        </div>
        <div className="admin-source-controls">
          <Button variant="outline" size="sm" onClick={() => void fetchClaims()} disabled={loading}>
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            刷新
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download size={16} />
            导出结果
          </Button>
          <Button size="sm" onClick={handleAdd} disabled={!hasPermission('oa:expense:add')}>
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
          <span className="input-label">报销类别</span>
          <Select value={categoryDraft || 'ALL'} onValueChange={(value) => setCategoryDraft(value === 'ALL' ? '' : value)}>
            <SelectTrigger className="h-[42px]">
              <SelectValue placeholder="全部类别" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">全部类别</SelectItem>
              {categoryDict.getOptions().map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <div className="admin-users-toolbar-actions">
          <Button size="sm" onClick={handleApplyFilters}><Search size={14} />查询</Button>
          <Button variant="outline" size="sm" onClick={handleResetFilters} disabled={!hasActiveFilters && !categoryDraft}><RotateCcw size={14} />重置</Button>
        </div>
      </div>
    </section>
  );

  const pageTable = (
    <InnerTableSurface>
      <table className="unity-data-table admin-source-table finance-source-table min-w-[1080px]">
          <thead>
            <tr>
              <th>报销单号</th>
              <th>申请人 / 部门</th>
              <th>类别 / 明细</th>
              <th>金额</th>
              <th>说明</th>
              <th>状态</th>
              <th className="text-right">当前操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableStateRow colSpan={7} title="正在加载报销申请..." loading />
            ) : claims.length === 0 ? (
              <TableStateRow colSpan={7} title={hasActiveFilters ? '当前筛选下暂无记录' : '暂无报销申请'} />
            ) : (
              claims.map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.claimNo || '-'}</strong>
                    <div className="mt-1 text-xs text-cf-faint">{formatDateTimeDisplay(item.createTime)}</div>
                  </td>
                  <td>
                    <strong>{item.userName || '-'}</strong>
                    <div className="mt-1 text-xs text-cf-subtle">{item.deptName || '-'}</div>
                  </td>
                  <td>
                    <strong>{categoryDict.getLabel(String(item.category ?? '')) || '-'}</strong>
                    <div className="mt-1 text-xs text-cf-subtle">{(item.items?.length || 0)} 条明细</div>
                  </td>
                  <td>{formatAmount(item.totalAmount)}</td>
                  <td><div className="max-w-sm truncate">{item.description || '-'}</div></td>
                  <td>{getStatusBadge(item.status)}</td>
                  <td>
                    <div className="admin-users-row-actions">
                      <button type="button" data-tooltip="详情" aria-label="详情" onClick={() => void handleView(item)}><Eye size={15} /></button>
                      {item.status === 'DRAFT' && hasPermission('oa:expense:edit') ? <button type="button" data-tooltip="编辑" aria-label="编辑" onClick={() => void handleEdit(item.id!)}><Edit size={15} /></button> : null}
                      {item.status === 'DRAFT' && hasPermission('oa:expense:submit') ? <button type="button" data-tooltip="提交" aria-label="提交" onClick={() => openSubmitConfirm(item.id!)}><Send size={15} /></button> : null}
                      {item.status === 'APPROVED' && hasPermission('oa:expense:pay') ? <button type="button" data-tooltip="打款" aria-label="打款" onClick={() => openPayConfirm(item.id!)}><Receipt size={15} /></button> : null}
                      {item.status === 'DRAFT' && hasPermission('oa:expense:remove') ? <button type="button" className="danger" data-tooltip="删除" aria-label="删除" onClick={() => openDeleteConfirm(item.id!)}><Trash2 size={15} /></button> : null}
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
      total={remoteTotal}
      page={searchParams.pageNum}
      pageSize={searchParams.pageSize}
      summary={resultSummary}
      onPageChange={(page) => setSearchParams((prev) => ({ ...prev, pageNum: page }))}
    />
  );

  return (
    <>
      <section className="admin-source-page finance-source-page expense-claim-page">
        <TablePageLayout
          actions={pageActions}
          filters={pageFilters}
          table={pageTable}
          pagination={pagePagination}
        />
      </section>

      <BaseDialog
        open={showDialog}
        title={currentClaim ? '编辑报销申请' : '新建报销申请'}
        onClose={closeFormDialog}
        width="wide"
        footer={(
          <>
            <Button type="button" variant="outline" onClick={closeFormDialog}>
              取消
            </Button>
            <Button type="button" onClick={() => void handleSave()} disabled={!hasPermission(currentClaim ? 'oa:expense:edit' : 'oa:expense:add')}>
              保存
            </Button>
          </>
        )}
      >
        <div className="admin-dialog-stack">
          <DialogPanel title="基础信息" bodyClassName="grid gap-4 md:grid-cols-2">
            <div className="admin-dialog-field">
              <Label className="text-sm font-medium text-cf-body">报销类别</Label>
              <Select
                value={formData.category}
                onValueChange={(value) => setFormData((prev) => ({ ...prev, category: value }))}
              >
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="请选择报销类别" />
                </SelectTrigger>
                <SelectContent>
                  {categoryDict.getOptions().map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="admin-dialog-field">
              <Label className="text-sm font-medium text-cf-body">汇总金额</Label>
              <Input className="h-11" value={formatAmount(formTotalAmount)} disabled />
            </div>
          </DialogPanel>

          <DialogPanel title="业务归属" bodyClassName="grid gap-4 md:grid-cols-3">
            <div className="admin-dialog-field">
              <Label className="text-sm font-medium text-cf-body">关联项目</Label>
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
              <Label className="text-sm font-medium text-cf-body">客户</Label>
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
              <Label className="text-sm font-medium text-cf-body">预算科目</Label>
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
                      budgetSubjectCode: value === 'NONE' ? '' : value,
                      budgetSubjectName: subject?.subjectName || '',
                    })),
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
          </DialogPanel>

          <DialogPanel title="报销说明">
            <div className="admin-dialog-field">
              <Label className="text-sm font-medium text-cf-body">说明内容</Label>
              <Textarea
                className="min-h-[120px] resize-none"
                value={formData.description || ''}
                onChange={(event) => setFormData((prev) => ({ ...prev, description: event.target.value }))}
                placeholder="填写报销原因"
              />
            </div>
          </DialogPanel>

          <ExpensePanel
            title="费用明细"
            meta={`${formData.items?.length || 0} 条费用记录`}
            bodyClassName="admin-expense-item-list"
            actions={(
              <Button type="button" size="sm" onClick={addItem} className="h-10">
                <Plus size={14} className="mr-1.5" />
                添加明细
              </Button>
            )}
          >
            {formData.items?.length ? formData.items.map((item, index) => (
              <article key={item.clientKey} className="admin-expense-item-card">
                <div className="admin-expense-item-grid">
                    <div className="admin-dialog-field">
                      <Label className="text-xs font-medium text-cf-subtle">费用类型</Label>
                      <Select value={item.expenseType} onValueChange={(value) => updateItem(index, 'expenseType', value)}>
                        <SelectTrigger className={expenseItemControlClass}>
                          <SelectValue placeholder="请选择费用类型" />
                        </SelectTrigger>
                        <SelectContent>
                          {expenseTypeDict.getOptions().map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="admin-dialog-field">
                      <Label className="text-xs font-medium text-cf-subtle">金额</Label>
                      <Input
                        className={expenseItemControlClass}
                        type="number"
                        value={item.amount || ''}
                        onChange={(event) => updateItem(index, 'amount', parseFloat(event.target.value) || 0)}
                        placeholder="0.00"
                        step="0.01"
                        min="0"
                      />
                    </div>

                    <div className="admin-dialog-field">
                      <Label className="text-xs font-medium text-cf-subtle">费用日期</Label>
                      <DatePicker
                        className={expenseItemControlClass}
                        type="date"
                        value={item.expenseDate}
                        onChange={(event) => updateItem(index, 'expenseDate', event.target.value)}
                      />
                    </div>

                    <div className="admin-dialog-field">
                      <Label className="text-xs font-medium text-cf-subtle">费用说明</Label>
                      <Input
                        className={expenseItemControlClass}
                        type="text"
                        value={item.description || ''}
                        onChange={(event) => updateItem(index, 'description', event.target.value)}
                        placeholder="填写费用说明"
                      />
                    </div>

                    <div className="admin-expense-item-actions">
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        onClick={() => removeItem(index)}
                        className="h-10 w-10 rounded-md"
                        aria-label="删除明细"
                        title="删除明细"
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                </div>

                <div className="admin-dialog-field mt-3">
                  <Label className="text-xs font-medium text-cf-subtle">凭证附件</Label>
                  <FileUpload
                    value={item.receiptUrl || ''}
                    onChange={(urls) => updateItem(index, 'receiptUrl', urls)}
                    maxCount={5}
                  />
                </div>
              </article>
            )) : (
              <InlineState
                title="暂无费用明细"
                description="点击添加明细录入报销费用。"
                className="min-h-[7rem]"
              />
            )}
          </ExpensePanel>
        </div>
      </BaseDialog>

      <BaseDialog
        open={Boolean(detailClaim)}
        title={detailClaim?.claimNo || '报销申请详情'}
        onClose={closeDetailDialog}
        width="wide"
        headerAside={detailClaim && !detailLoading ? getStatusBadge(detailClaim.status) : null}
        panelClassName="admin-expense-detail-dialog"
        bodyClassName="admin-dialog-stack admin-expense-detail-dialog-body"
        footerClassName="admin-expense-detail-dialog-footer"
        footer={(
          <Button variant="outline" onClick={closeDetailDialog}>
            关闭
          </Button>
        )}
      >
        {detailLoading ? (
          <InlineState title="正在加载报销详情..." className="py-12" icon={<Clock3 className="h-4 w-4 animate-spin" />} />
        ) : detailClaim ? (
          <>
            {detailClaim.exceededStandard ? (
              <div className="admin-dialog-warning">
                <div className="font-medium">超标提示</div>
                <div className="mt-1 text-xs">
                  超出标准合计 {formatAmount(detailClaim.exceededAmount || 0)}，已触发上级追加审批。
                </div>
                {detailClaim.exceededDetail ? (
                  <pre className="mt-2 max-h-32 overflow-auto rounded bg-amber-100/60 p-2 text-[11px] dark:bg-amber-900/30">
                    {detailClaim.exceededDetail}
                  </pre>
                ) : null}
              </div>
            ) : null}

            <DetailRows>
              <DetailRow label="申请人" value={renderDetailValue(detailClaim.userName)} />
              <DetailRow label="所属部门" value={renderDetailValue(detailClaim.deptName)} />
              <DetailRow label="报销类别" value={categoryDict.getLabel(String(detailClaim.category ?? '')) || '-'} />
              <DetailRow label="总金额" value={formatAmount(detailClaim.totalAmount)} />
              <DetailRow label="关联项目" value={renderDetailValue(detailClaim.projectName)} />
              <DetailRow label="客户" value={renderDetailValue(detailClaim.customerName)} />
              <DetailRow label="预算科目" value={renderDetailValue(detailClaim.budgetSubjectName || detailClaim.budgetSubjectCode)} />
              <DetailRow label="发票状态" value={renderDetailValue(detailClaim.invoiceStatus)} />
              <DetailRow label="明细数量" value={`${detailClaim.items?.length || 0} 条`} />
              <DetailRow label="流程实例" value={renderDetailValue(detailClaim.instanceId)} />
              <DetailRow label="创建时间" value={formatDateTimeDisplay(detailClaim.createTime)} />
              <DetailRow label="更新时间" value={formatDateTimeDisplay(detailClaim.updateTime)} />
            </DetailRows>

            <ExpensePanel title="报销说明">
              <div className="whitespace-pre-wrap text-sm leading-6 text-cf-muted">
                {detailClaim.description || '-'}
              </div>
            </ExpensePanel>

            <ExpensePanel title="报销明细" meta={`${detailClaim.items?.length || 0} 条费用记录`}>
              {detailClaim.items?.length ? (
                <InnerTableSurface>
                  <table className="unity-data-table admin-source-table admin-expense-detail-table min-w-[820px]">
                    <thead>
                      <tr>
                        <th>费用类型</th>
                        <th>金额</th>
                        <th>费用日期</th>
                        <th>说明</th>
                        <th>凭证</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailClaim.items.map((item, index) => (
                        <tr key={`${index}-${item.expenseDate || 'detail'}`}>
                          <td>
                            {expenseTypeDict.getLabel(String(item.expenseType ?? '')) || '-'}
                          </td>
                          <td>{formatAmount(item.amount)}</td>
                          <td>{renderDetailValue(item.expenseDate)}</td>
                          <td>{renderDetailValue(item.description)}</td>
                          <td>
                            {getReceiptList(item.receiptUrl).length ? (
                              <div className="flex flex-col gap-1.5">
                                {getReceiptList(item.receiptUrl).map((url) => {
                                  const label = getAttachmentDisplayName(url) || '凭证附件';
                                  return (
                                    <a
                                      key={url}
                                      href={url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="inline-flex items-center gap-1.5 text-cyan-700 underline decoration-dashed underline-offset-4 hover:text-cyan-800 dark:text-cyan-300 dark:hover:text-cyan-200"
                                    >
                                      <Paperclip className="h-3.5 w-3.5" />
                                      <span className="truncate">{label}</span>
                                    </a>
                                  );
                                })}
                              </div>
                            ) : (
                              '-'
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </InnerTableSurface>
              ) : (
                <InlineState title="暂无报销明细" className="py-6" />
              )}
            </ExpensePanel>
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

export default ExpenseClaimPage;
