import React, { useEffect, useMemo, useState } from 'react';
import { Clock3, Download, Edit, Eye, Paperclip, Plus, Receipt, RotateCcw, Send, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { expenseClaimApi, ExpenseClaim, ExpenseItem } from '@/services/api/expense';
import { crmApi, CrmCustomer } from '@/services/api/crm';
import { projectApi, Project } from '@/services/api/project';
import { budgetApi, BudgetSubject } from '@/services/api/budget';
import FileUpload from '@/components/FileUpload';
import { formatDateTimeDisplay } from '@/utils/dateFormat';
import { buildExcelFileName, downloadBlob } from '@/utils/download';
import { getErrorMessage } from '@/utils/errorMessage';
import { BaseDialog } from '@/components/common/BaseDialog';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { Pagination } from '@/components/common/Pagination';
import { TablePageLayout } from '@/components/layout/TablePageLayout';
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
  TableActionHead,
  TableHead,
  TableHeader,
  Textarea,
} from '@/components/common';
import { TableRowActions } from '@/components/common/table-row-actions';

const STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
  { value: 'DRAFT', label: '草稿' },
  { value: 'PENDING', label: '审批中' },
  { value: 'APPROVED', label: '已通过' },
  { value: 'REJECTED', label: '已驳回' },
  { value: 'PAID', label: '已打款' },
] as const;

const CATEGORY_OPTIONS = [
  { value: '', label: '全部类别' },
  { value: 'TRAVEL', label: '差旅' },
  { value: 'OFFICE', label: '办公' },
  { value: 'ENTERTAINMENT', label: '招待' },
  { value: 'TRANSPORT', label: '交通' },
  { value: 'OTHER', label: '其他' },
] as const;

const EXPENSE_TYPE_OPTIONS = [
  { value: 'TRANSPORT', label: '交通' },
  { value: 'ACCOMMODATION', label: '住宿' },
  { value: 'MEAL', label: '餐饮' },
  { value: 'COMMUNICATION', label: '通讯' },
  { value: 'OFFICE_SUPPLIES', label: '办公用品' },
  { value: 'OTHER', label: '其他' },
] as const;

const STATUS_LABELS: Record<string, string> = {
  DRAFT: '草稿',
  PENDING: '审批中',
  APPROVED: '已通过',
  REJECTED: '已驳回',
  PAID: '已打款',
};

const CATEGORY_LABELS: Record<string, string> = {
  TRAVEL: '差旅',
  OFFICE: '办公',
  ENTERTAINMENT: '招待',
  TRANSPORT: '交通',
  OTHER: '其他',
};

const EXPENSE_TYPE_LABELS: Record<string, string> = {
  TRANSPORT: '交通',
  ACCOMMODATION: '住宿',
  MEAL: '餐饮',
  COMMUNICATION: '通讯',
  OFFICE_SUPPLIES: '办公用品',
  OTHER: '其他',
};

interface ConfirmState {
  type: 'delete' | 'submit' | 'pay';
  id: number;
  title: string;
  message: string;
  confirmText: string;
  danger?: boolean;
}

const formatAmount = (value?: number | null) => {
  if (value === undefined || value === null || Number.isNaN(Number(value))) {
    return '-';
  }

  return `¥${Number(value).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const createDefaultItem = (): ExpenseItem => ({
  expenseType: 'TRANSPORT',
  amount: 0,
  expenseDate: '',
  description: '',
  receiptUrl: '',
});

const createDefaultForm = (): ExpenseClaim => ({
  category: 'TRAVEL',
  description: '',
  items: [createDefaultItem()],
});

const getReceiptList = (receiptUrl?: string) =>
  receiptUrl?.split(',').map((item) => item.trim()).filter(Boolean) ?? [];

const InlineState: React.FC<{
  title: string;
  description?: string;
  icon?: React.ReactNode;
  className?: string;
}> = ({ title, description, icon, className }) => (
  <div className={['flex flex-col items-center justify-center px-6 py-10 text-center', className].filter(Boolean).join(' ')}>
    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500">
      {icon || <Receipt className="h-4 w-4" />}
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
    <td colSpan={colSpan} className="px-4 py-16">
      <div className="flex flex-col items-center justify-center text-center">
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500">
          {loading ? <Clock3 className="h-4 w-4 animate-spin" /> : icon || <Receipt className="h-4 w-4" />}
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
  <div className={['grid gap-x-6 gap-y-3 md:grid-cols-2 xl:grid-cols-3', className].filter(Boolean).join(' ')}>
    {children}
  </div>
);

const DetailRow: React.FC<{
  label: string;
  value: React.ReactNode;
  alignStart?: boolean;
}> = ({ label, value, alignStart = false }) => (
  <div
    className={[
      'border-b border-slate-100 pb-3 dark:border-slate-800',
      alignStart ? 'md:col-span-2 xl:col-span-3' : '',
    ].filter(Boolean).join(' ')}
  >
    <div className="text-[11px] font-medium text-slate-400 dark:text-slate-500">{label}</div>
    <div className="mt-1.5 text-sm leading-6 text-slate-900 dark:text-slate-100">{value}</div>
  </div>
);

export const ExpenseClaimPage: React.FC = () => {
  const [claims, setClaims] = useState<ExpenseClaim[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchParams, setSearchParams] = useState({
    status: '',
    category: '',
    pageNum: 1,
    pageSize: 10,
  });
  const [categoryDraft, setCategoryDraft] = useState('');
  const [remoteTotal, setRemoteTotal] = useState(0);
  const [showDialog, setShowDialog] = useState(false);
  const [currentClaim, setCurrentClaim] = useState<ExpenseClaim | null>(null);
  const [detailClaim, setDetailClaim] = useState<ExpenseClaim | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [formData, setFormData] = useState<ExpenseClaim>(createDefaultForm());
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [projectOptions, setProjectOptions] = useState<Project[]>([]);
  const [customerOptions, setCustomerOptions] = useState<CrmCustomer[]>([]);
  const [budgetSubjectOptions, setBudgetSubjectOptions] = useState<BudgetSubject[]>([]);

  useEffect(() => {
    void fetchClaims();
  }, [searchParams]);

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
    ? STATUS_LABELS[searchParams.status] || searchParams.status
    : '全部状态';
  const currentCategoryLabel = searchParams.category
    ? CATEGORY_LABELS[searchParams.category] || searchParams.category
    : '全部类别';
  const totalPages = Math.max(1, Math.ceil(remoteTotal / searchParams.pageSize));
  const formTotalAmount = formData.items?.reduce((sum, item) => sum + Number(item.amount || 0), 0) || 0;

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
      pageSize: 10,
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
        items: response.items?.length ? response.items : [createDefaultItem()],
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
      const payload = { ...formData, totalAmount };
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
      return { ...prev, items: nextItems.length ? nextItems : [createDefaultItem()] };
    });
  };

  const updateItem = (index: number, field: keyof ExpenseItem, value: string | number) => {
    setFormData((prev) => {
      const nextItems = [...(prev.items || [])];
      nextItems[index] = { ...nextItems[index], [field]: value };
      return { ...prev, items: nextItems };
    });
  };

  const getStatusBadge = (status?: string) => {
    const toneMap: Record<string, string> = {
      DRAFT: 'border border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
      PENDING: 'border border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-200',
      APPROVED: 'border border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200',
      REJECTED: 'border border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200',
      PAID: 'border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200',
    };

    return (
      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${toneMap[status || 'DRAFT'] || toneMap.DRAFT}`}>
        {STATUS_LABELS[status || 'DRAFT'] || status || '-'}
      </span>
    );
  };

  const renderDetailValue = (value?: string | number | null) => {
    if (value === undefined || value === null || value === '') {
      return '-';
    }
    return value;
  };

  return (
    <div className="space-y-4">
      <TablePageLayout
        className="gap-4"
        filters={(
          <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/88 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-1 flex-wrap items-center gap-3">
              <div className="w-full sm:w-[180px]">
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
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="状态" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">全部状态</SelectItem>
                    {STATUS_OPTIONS.filter((option) => option.value).map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="w-full sm:w-[180px]">
                <Select
                  value={categoryDraft || 'ALL'}
                  onValueChange={(value) => setCategoryDraft(value === 'ALL' ? '' : value)}
                >
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="报销类别" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">全部类别</SelectItem>
                    {CATEGORY_OPTIONS.filter((option) => option.value).map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex min-w-[280px] flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                <span>{hasActiveFilters ? `${currentStatusLabel} / ${currentCategoryLabel}` : '全部'}</span>
                <span>第 {searchParams.pageNum} / {totalPages} 页</span>
                <span>共 {remoteTotal} 条</span>
                <span>草稿 {draftCount}</span>
                <span>审批中 {pendingCount}</span>
                <span>已通过 {approvedCount}</span>
                <span>已打款 {paidCount}</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
              <Button variant="outline" size="sm" onClick={handleApplyFilters}>
                应用
              </Button>
              <Button variant="outline" size="sm" onClick={handleResetFilters}>
                <RotateCcw size={14} className="mr-1.5" />
                清空条件
              </Button>
              <Button variant="outline" size="sm" onClick={handleExport}>
                <Download size={14} className="mr-1.5" />
                导出结果
              </Button>
              <Button size="sm" onClick={handleAdd}>
                <Plus size={14} className="mr-1.5" />
                新建申请
              </Button>
            </div>
          </div>
        )}
        table={(
          <div className="flex min-h-[40rem] flex-col">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1080px]">
                <TableHeader className="sticky top-0 z-10 bg-white dark:bg-slate-950/95">
                  <tr>
                    <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                      报销单号
                    </TableHead>
                    <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                      申请人 / 部门
                    </TableHead>
                    <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                      类别 / 明细
                    </TableHead>
                    <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                      金额
                    </TableHead>
                    <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                      说明
                    </TableHead>
                    <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                      状态
                    </TableHead>
                    <TableActionHead className="w-40 px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                      当前操作
                    </TableActionHead>
                  </tr>
                </TableHeader>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {loading ? (
                    <TableStateRow colSpan={7} title="正在加载报销申请..." loading />
                  ) : claims.length === 0 ? (
                    <TableStateRow
                      colSpan={7}
                      title={hasActiveFilters ? '当前筛选下暂无记录' : '暂无报销申请'}
                    />
                  ) : (
                    claims.map((item) => (
                      <tr key={item.id} className="transition hover:bg-slate-50 dark:hover:bg-slate-900/60">
                        <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                          <div className="font-medium text-slate-900 dark:text-slate-100">{item.claimNo || '-'}</div>
                          <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">{formatDateTimeDisplay(item.createTime)}</div>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                          <div className="font-medium text-slate-900 dark:text-slate-100">{item.userName || '-'}</div>
                          <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">{item.deptName || '-'}</div>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                          <div className="font-medium text-slate-900 dark:text-slate-100">
                            {CATEGORY_LABELS[item.category] || item.category || '-'}
                          </div>
                          <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                            {(item.items?.length || 0)} 条明细
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-200">{formatAmount(item.totalAmount)}</td>
                        <td className="max-w-sm truncate px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                          {item.description || '-'}
                        </td>
                        <td className="px-4 py-3">{getStatusBadge(item.status)}</td>
                        <td className="px-4 py-3 text-right">
                          <TableRowActions
                            align="end"
                            className="gap-1"
                            actions={[
                              {
                                label: '详情',
                                icon: <Eye size={14} />,
                                onClick: () => void handleView(item),
                                tone: 'neutral',
                              },
                              {
                                label: '编辑',
                                icon: <Edit size={14} />,
                                onClick: () => void handleEdit(item.id!),
                                tone: 'primary',
                                hidden: item.status !== 'DRAFT',
                              },
                              {
                                label: '提交',
                                icon: <Send size={14} />,
                                onClick: () => openSubmitConfirm(item.id!),
                                tone: 'success',
                                hidden: item.status !== 'DRAFT',
                              },
                              {
                                label: '打款',
                                icon: <Receipt size={14} />,
                                onClick: () => openPayConfirm(item.id!),
                                tone: 'success',
                                hidden: item.status !== 'APPROVED',
                              },
                              {
                                label: '删除',
                                icon: <Trash2 size={14} />,
                                onClick: () => openDeleteConfirm(item.id!),
                                tone: 'danger',
                                hidden: item.status !== 'DRAFT',
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
          </div>
        )}
        pagination={(
          remoteTotal > 0 ? (
            <Pagination
              total={remoteTotal}
              page={searchParams.pageNum}
              pageSize={searchParams.pageSize}
              showPageSizeSelector={false}
              showJump={false}
              onPageChange={(page) => setSearchParams((prev) => ({ ...prev, pageNum: page }))}
              onPageSizeChange={() => {}}
            />
          ) : null
        )}
      />

      <BaseDialog
        open={showDialog}
        title={currentClaim ? '编辑报销申请' : '新建报销申请'}
        onClose={closeFormDialog}
        width="wide"
        footer={(
          <>
            <Button variant="outline" onClick={closeFormDialog}>
              取消
            </Button>
            <Button onClick={() => void handleSave()}>
              保存
            </Button>
          </>
        )}
      >
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">报销类别</Label>
              <Select
                value={formData.category}
                onValueChange={(value) => setFormData((prev) => ({ ...prev, category: value }))}
              >
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="请选择报销类别" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.filter((option) => option.value).map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">汇总金额</Label>
              <Input className="h-11" value={formatAmount(formTotalAmount)} disabled />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">关联项目</Label>
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

            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">客户</Label>
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

            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">预算科目</Label>
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
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">报销说明</Label>
            <Textarea
              className="min-h-[120px] resize-none"
              value={formData.description || ''}
              onChange={(event) => setFormData((prev) => ({ ...prev, description: event.target.value }))}
              placeholder="填写报销原因"
            />
          </div>

          <div className="rounded-lg border border-slate-200 px-4 py-4 dark:border-slate-800">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="text-sm font-medium text-slate-900 dark:text-slate-100">费用明细</div>
              <Button size="sm" onClick={addItem}>
                <Plus size={14} className="mr-1.5" />
                添加明细
              </Button>
            </div>

            <div className="space-y-2">
              {formData.items?.map((item, index) => (
                <div
                  key={`${index}-${item.expenseDate || 'draft'}`}
                  className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-3 dark:border-slate-800 dark:bg-slate-900/60"
                >
                  <div className="grid gap-3 lg:grid-cols-[160px_120px_160px_minmax(0,1fr)_40px]">
                    <div className="space-y-2">
                      <Label className="text-xs font-medium text-slate-500 dark:text-slate-400">费用类型</Label>
                      <Select value={item.expenseType} onValueChange={(value) => updateItem(index, 'expenseType', value)}>
                        <SelectTrigger className="h-10">
                          <SelectValue placeholder="请选择费用类型" />
                        </SelectTrigger>
                        <SelectContent>
                          {EXPENSE_TYPE_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs font-medium text-slate-500 dark:text-slate-400">金额</Label>
                      <Input
                        className="h-10"
                        type="number"
                        value={item.amount || ''}
                        onChange={(event) => updateItem(index, 'amount', parseFloat(event.target.value) || 0)}
                        placeholder="0.00"
                        step="0.01"
                        min="0"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs font-medium text-slate-500 dark:text-slate-400">费用日期</Label>
                      <DatePicker
                        className="h-10"
                        type="date"
                        value={item.expenseDate}
                        onChange={(event) => updateItem(index, 'expenseDate', event.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs font-medium text-slate-500 dark:text-slate-400">费用说明</Label>
                      <Input
                        className="h-10"
                        type="text"
                        value={item.description || ''}
                        onChange={(event) => updateItem(index, 'description', event.target.value)}
                        placeholder="填写费用说明"
                      />
                    </div>

                    <div className="flex items-end justify-end">
                      <button
                        type="button"
                        onClick={() => removeItem(index)}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-rose-200 bg-white text-rose-600 transition-colors hover:bg-rose-50 hover:text-rose-700 dark:border-rose-900 dark:bg-slate-950 dark:text-rose-300 dark:hover:bg-rose-950/30"
                        aria-label="删除明细"
                        title="删除明细"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 space-y-2">
                    <Label className="text-xs font-medium text-slate-500 dark:text-slate-400">凭证附件</Label>
                    <FileUpload
                      value={item.receiptUrl || ''}
                      onChange={(urls) => updateItem(index, 'receiptUrl', urls)}
                      maxCount={5}
                      variant="glass"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </BaseDialog>

      <BaseDialog
        open={Boolean(detailClaim)}
        title={detailClaim?.claimNo || '报销申请详情'}
        onClose={closeDetailDialog}
        width="wide"
        headerAside={detailClaim && !detailLoading ? getStatusBadge(detailClaim.status) : null}
        bodyClassName="space-y-4"
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
            <DetailRows>
              <DetailRow label="申请人" value={renderDetailValue(detailClaim.userName)} />
              <DetailRow label="所属部门" value={renderDetailValue(detailClaim.deptName)} />
              <DetailRow label="报销类别" value={CATEGORY_LABELS[detailClaim.category] || detailClaim.category || '-'} />
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

            <div className="rounded-xl border border-slate-200 px-4 py-4 dark:border-slate-800">
              <div className="text-sm font-medium text-slate-900 dark:text-slate-100">报销说明</div>
              <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600 dark:text-slate-300">
                {detailClaim.description || '-'}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 px-4 py-4 dark:border-slate-800">
              <div className="mb-3 text-sm font-medium text-slate-900 dark:text-slate-100">报销明细</div>
              {detailClaim.items?.length ? (
                <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
                  <table className="w-full min-w-[820px]">
                    <thead className="bg-slate-50/80 dark:bg-slate-900/70">
                      <tr>
                        <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">费用类型</th>
                        <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">金额</th>
                        <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">费用日期</th>
                        <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">说明</th>
                        <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">凭证</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {detailClaim.items.map((item, index) => (
                        <tr key={`${index}-${item.expenseDate || 'detail'}`} className="hover:bg-slate-50 dark:hover:bg-slate-900/60">
                          <td className="px-4 py-3 text-sm text-slate-900 dark:text-slate-100">
                            {EXPENSE_TYPE_LABELS[item.expenseType] || item.expenseType || '-'}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-200">{formatAmount(item.amount)}</td>
                          <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">{renderDetailValue(item.expenseDate)}</td>
                          <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">{renderDetailValue(item.description)}</td>
                          <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                            {getReceiptList(item.receiptUrl).length ? (
                              <div className="flex flex-col gap-1.5">
                                {getReceiptList(item.receiptUrl).map((url) => {
                                  const label = decodeURIComponent(url.split('/').pop() || '凭证附件');
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
                </div>
              ) : (
                <InlineState title="暂无报销明细" className="py-8" />
              )}
            </div>
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
    </div>
  );
};

export default ExpenseClaimPage;

