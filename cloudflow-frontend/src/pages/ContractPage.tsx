import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AlertTriangle, Clock3, Edit, Eye, FileSignature, Link2, Plus, RotateCcw, Send, Trash2, XCircle } from 'lucide-react';
import { useWorkflowRefresh } from '@/hooks/useWorkflowRefresh';
import { toast } from 'sonner';
import { BaseDialog, Button, ConfirmDialog, DatePicker, Input, Label, Pagination, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, TableActionHead, TableHead, TableHeader, Textarea } from '@/components/common';
import { TableRowActions } from '@/components/common/table-row-actions';
import { TablePageLayout, TableSurfaceCard } from '@/components/layout/TablePageLayout';
import AttachmentLinks, { getAttachmentList } from '@/components/AttachmentLinks';
import BusinessTimeline from '@/components/common/BusinessTimeline';
import FileUpload from '@/components/FileUpload';
import { contractApi, OaContract, OaRiskAlert } from '@/services/api/contractRisk';
import { crmApi, CrmCustomer } from '@/services/api/crm';
import { projectApi, Project } from '@/services/api/project';
import { budgetApi, BudgetSubject } from '@/services/api/budget';
import { OaSealApplication, sealApplicationApi } from '@/services/api/sealLicense';
import { PageResult } from '@/types';
import { useAuth } from '@/context/AuthContext';
import { formatDateTimeDisplay } from '@/utils/dateFormat';
import { getErrorMessage } from '@/utils/errorMessage';

const STATUS_LABELS: Record<string, string> = {
  DRAFT: '草稿',
  PENDING: '审批中',
  APPROVED: '已通过',
  REJECTED: '已驳回',
  SEALING: '用印中',
  SEALED: '已用印',
  ACTIVE: '履行中',
  EXPIRED: '已到期',
  TERMINATED: '已终止',
  CANCELLED: '已取消',
};

const TYPE_LABELS: Record<string, string> = {
  SALES: '销售合同',
  PURCHASE: '采购合同',
  SERVICE: '服务合同',
  OTHER: '其他',
};

const RISK_LABELS: Record<string, string> = {
  LOW: '低',
  MEDIUM: '中',
  HIGH: '高',
  CRITICAL: '严重',
};

const emptyForm: OaContract = {
  contractName: '',
  counterpartyName: '',
  contractType: 'SERVICE',
  amount: 0,
  currency: 'CNY',
  riskLevel: 'LOW',
  attachmentUrl: '',
  archiveAttachmentUrl: '',
  remark: '',
};

interface ConfirmState {
  type: 'delete' | 'submit' | 'cancel';
  id: number;
  title: string;
  message: string;
  confirmText: string;
  danger?: boolean;
}

const normalizeRows = <T,>(result: PageResult<T>) => result.rows || result.records || [];

const getStatusBadge = (status?: string) => {
  const toneMap: Record<string, string> = {
    DRAFT: 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
    PENDING: 'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-200',
    APPROVED: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200',
    REJECTED: 'border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200',
    SEALING: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200',
    SEALED: 'border-green-200 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950/30 dark:text-green-200',
    ACTIVE: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-200',
    EXPIRED: 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900 dark:bg-orange-950/30 dark:text-orange-200',
    TERMINATED: 'border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
    CANCELLED: 'border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
  };
  return <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${toneMap[status || 'DRAFT'] || toneMap.DRAFT}`}>{STATUS_LABELS[status || 'DRAFT'] || status || '-'}</span>;
};

const getRiskBadge = (level?: string) => {
  const toneMap: Record<string, string> = {
    LOW: 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
    MEDIUM: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200',
    HIGH: 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900 dark:bg-orange-950/30 dark:text-orange-200',
    CRITICAL: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200',
  };
  return <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${toneMap[level || 'LOW'] || toneMap.LOW}`}>{RISK_LABELS[level || 'LOW'] || level || '-'}</span>;
};

const TableStateRow: React.FC<{ colSpan: number; title: string; loading?: boolean }> = ({ colSpan, title, loading = false }) => (
  <tr className="hover:bg-transparent">
    <td colSpan={colSpan} className="px-4 py-16">
      <div className="flex flex-col items-center justify-center text-center">
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500">
          {loading ? <Clock3 className="h-4 w-4 animate-spin" /> : <FileSignature className="h-4 w-4" />}
        </div>
        <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
      </div>
    </td>
  </tr>
);

export const ContractPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [rows, setRows] = useState<OaContract[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState({ pageNum: 1, pageSize: 10, status: '', contractName: '', contractNo: '', riskLevel: '' });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<OaContract>(emptyForm);
  const [detail, setDetail] = useState<OaContract | null>(null);
  const [risks, setRisks] = useState<OaRiskAlert[]>([]);
  const [sealApplications, setSealApplications] = useState<OaSealApplication[]>([]);
  const [linkSealId, setLinkSealId] = useState('');
  const [saving, setSaving] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [projectOptions, setProjectOptions] = useState<Project[]>([]);
  const [customerOptions, setCustomerOptions] = useState<CrmCustomer[]>([]);
  const [budgetSubjectOptions, setBudgetSubjectOptions] = useState<BudgetSubject[]>([]);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const result = await contractApi.list({
        pageNum: query.pageNum,
        pageSize: query.pageSize,
        status: query.status || undefined,
        contractName: query.contractName || undefined,
        contractNo: query.contractNo || undefined,
        riskLevel: query.riskLevel || undefined,
      });
      setRows(normalizeRows(result));
      setTotal(result.total || 0);
    } catch (error) {
      toast.error(getErrorMessage(error, '获取合同列表失败'));
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  useWorkflowRefresh(fetchRows, 'biz_contract');

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
        toast.error(getErrorMessage(error, '加载合同候选数据失败'));
      }
    };
    void loadReferences();
  }, []);

  useEffect(() => {
    const state = location.state as { focusContractId?: number } | null;
    if (!state?.focusContractId) {
      return;
    }
    const focusContractId = state.focusContractId;
    const openFocusedDetail = async () => {
      try {
        await openDetail({ contractId: focusContractId } as OaContract);
      } finally {
        navigate(location.pathname, { replace: true, state: {} });
      }
    };
    void openFocusedDetail();
  }, [location.pathname, location.state, navigate]);

  const totalPages = Math.max(1, Math.ceil(total / query.pageSize));
  const pendingCount = useMemo(() => rows.filter((item) => item.status === 'PENDING').length, [rows]);
  const openRiskCount = useMemo(() => risks.filter((item) => item.riskStatus === 'OPEN' || item.riskStatus === 'HANDLING').length, [risks]);

  const openCreate = () => {
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (item: OaContract) => {
    setForm({ ...item });
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setForm(emptyForm);
  };

  const openDetail = async (item: OaContract) => {
    setDetail(item);
    setRisks([]);
    setLinkSealId('');
    setDetailLoading(true);
    try {
      const [contract, riskResult, sealResult] = await Promise.all([
        contractApi.getInfo(item.contractId!),
        contractApi.risks(item.contractId!),
        sealApplicationApi.list({ pageNum: 1, pageSize: 50, status: 'APPROVED' }),
      ]);
      setDetail(contract);
      setRisks(riskResult);
      setSealApplications(normalizeRows(sealResult));
    } catch (error) {
      toast.error(getErrorMessage(error, '获取合同详情失败'));
    } finally {
      setDetailLoading(false);
    }
  };

  const saveForm = async () => {
    if (!form.contractName.trim() || !form.counterpartyName.trim() || !form.contractType || Number(form.amount) < 0) {
      toast.warning('请补全合同名称、相对方、合同类型和金额');
      return;
    }
    setSaving(true);
    try {
      if (form.contractId) {
        await contractApi.edit(form);
      } else {
        await contractApi.add(form);
      }
      toast.success('保存成功');
      closeDialog();
      await fetchRows();
    } catch (error) {
      toast.error(getErrorMessage(error, '保存合同失败'));
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmAction = async () => {
    if (!confirmState) return;
    const current = confirmState;
    setConfirmState(null);
    try {
      if (current.type === 'delete') {
        await contractApi.remove([current.id]);
        toast.success('删除成功');
      } else if (current.type === 'cancel') {
        await contractApi.cancel(current.id);
        toast.success('取消成功');
      } else {
        await contractApi.submit(current.id);
        toast.success('提交成功');
      }
      await fetchRows();
    } catch (error) {
      toast.error(getErrorMessage(error, '操作失败'));
    }
  };

  const linkSeal = async () => {
    if (!detail?.contractId || !linkSealId) return;
    try {
      await contractApi.linkSeal(detail.contractId, Number(linkSealId));
      toast.success('绑定成功');
      await openDetail(detail);
      await fetchRows();
    } catch (error) {
      toast.error(getErrorMessage(error, '绑定用印失败'));
    }
  };

  return (
    <div className="space-y-4">
      <TablePageLayout
        className="gap-4"
        filters={(
          <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/88 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-1 flex-wrap items-center gap-3">
              <div className="w-full sm:w-[160px]">
                <Select value={query.status || 'ALL'} onValueChange={(value) => setQuery((prev) => ({ ...prev, pageNum: 1, status: value === 'ALL' ? '' : value }))}>
                  <SelectTrigger className="h-10"><SelectValue placeholder="状态" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">全部状态</SelectItem>
                    {Object.entries(STATUS_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-full sm:w-[150px]">
                <Select value={query.riskLevel || 'ALL'} onValueChange={(value) => setQuery((prev) => ({ ...prev, pageNum: 1, riskLevel: value === 'ALL' ? '' : value }))}>
                  <SelectTrigger className="h-10"><SelectValue placeholder="风险等级" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">全部风险</SelectItem>
                    {Object.entries(RISK_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Input className="h-10 w-full sm:w-[200px]" value={query.contractName} onChange={(event) => setQuery((prev) => ({ ...prev, pageNum: 1, contractName: event.target.value }))} placeholder="合同名称" />
              <Input className="h-10 w-full sm:w-[180px]" value={query.contractNo} onChange={(event) => setQuery((prev) => ({ ...prev, pageNum: 1, contractNo: event.target.value }))} placeholder="合同编号" />
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                <span>第 {query.pageNum} / {totalPages} 页</span>
                <span>共 {total} 条</span>
                <span>审批中 {pendingCount}</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
              <Button variant="outline" size="sm" onClick={() => setQuery({ pageNum: 1, pageSize: 10, status: '', contractName: '', contractNo: '', riskLevel: '' })}>
                <RotateCcw size={14} className="mr-1.5" />
                清空条件
              </Button>
              <Button size="sm" onClick={openCreate} disabled={!hasPermission('oa:contract:add')}>
                <Plus size={14} className="mr-1.5" />
                新建合同
              </Button>
            </div>
          </div>
        )}
        table={(<TableSurfaceCard>
          <div className="flex min-h-[40rem] flex-col">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1200px]">
                <TableHeader className="sticky top-0 z-10">
                  <tr>
                    <TableHead className="px-4 py-3 text-left">合同编号</TableHead>
                    <TableHead className="px-4 py-3 text-left">合同 / 相对方</TableHead>
                    <TableHead className="px-4 py-3 text-left">类型 / 金额</TableHead>
                    <TableHead className="px-4 py-3 text-left">负责人 / 部门</TableHead>
                    <TableHead className="px-4 py-3 text-left">周期</TableHead>
                    <TableHead className="px-4 py-3 text-left">附件</TableHead>
                    <TableHead className="px-4 py-3 text-left">状态</TableHead>
                    <TableHead className="px-4 py-3 text-left">风险</TableHead>
                    <TableActionHead className="w-44 px-4 py-3 text-right">操作</TableActionHead>
                  </tr>
                </TableHeader>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {loading ? (
                    <TableStateRow colSpan={9} title="正在加载合同..." loading />
                  ) : rows.length === 0 ? (
                    <TableStateRow colSpan={9} title="暂无合同" />
                  ) : rows.map((item) => (
                    <tr key={item.contractId} className="transition hover:bg-slate-50 dark:hover:bg-slate-900/60">
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                        <div className="font-medium text-slate-900 dark:text-slate-100">{item.contractNo || '-'}</div>
                        <div className="mt-1 text-xs text-slate-400">{formatDateTimeDisplay(item.createTime)}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                        <div className="font-medium text-slate-900 dark:text-slate-100">{item.contractName}</div>
                        <div className="mt-1 text-xs text-slate-400">{item.counterpartyName}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                        <div>{TYPE_LABELS[item.contractType] || item.contractType}</div>
                        <div className="mt-1 text-xs text-slate-400">{item.currency || 'CNY'} {Number(item.amount || 0).toLocaleString()}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                        <div>{item.ownerName || '-'}</div>
                        <div className="mt-1 text-xs text-slate-400">{item.deptName || '-'}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                        <div>{item.startDate || '-'}</div>
                        <div className="mt-1 text-xs text-slate-400">{item.endDate || '-'}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">{getAttachmentList(item.attachmentUrl).length} 个</td>
                      <td className="px-4 py-3">{getStatusBadge(item.status)}</td>
                      <td className="px-4 py-3">{getRiskBadge(item.riskLevel)}</td>
                      <td className="px-4 py-3 text-right">
                        <TableRowActions
                          align="end"
                          overflowLabel="更多"
                          actions={[
                            { label: '查看详情', icon: <Eye size={14} />, onClick: () => void openDetail(item), semantic: 'view', isPrimary: true },
                            { label: '编辑合同', icon: <Edit size={14} />, onClick: () => openEdit(item), hidden: !['DRAFT', 'REJECTED', 'APPROVED', 'ACTIVE'].includes(item.status || 'DRAFT'), semantic: 'edit', isPrimary: true, permissionKey: 'oa:contract:edit' },
                            { label: '提交审批', icon: <Send size={14} />, onClick: () => setConfirmState({ type: 'submit', id: item.contractId!, title: '提交合同审批', message: '提交后将进入合同审批流程。', confirmText: '提交' }), hidden: !['DRAFT', 'REJECTED'].includes(item.status || 'DRAFT'), semantic: 'submit', permissionKey: 'oa:contract:submit' },
                            { label: '取消合同', icon: <XCircle size={14} />, onClick: () => setConfirmState({ type: 'cancel', id: item.contractId!, title: '取消合同', message: '取消后该合同不再继续审批。', confirmText: '取消' }), hidden: !['DRAFT', 'PENDING'].includes(item.status || 'DRAFT'), semantic: 'disable', permissionKey: 'oa:contract:cancel' },
                            { label: '删除合同', icon: <Trash2 size={14} />, onClick: () => setConfirmState({ type: 'delete', id: item.contractId!, title: '删除合同', message: '删除后当前合同不可恢复。', confirmText: '删除', danger: true }), hidden: !['DRAFT', 'REJECTED', 'CANCELLED'].includes(item.status || 'DRAFT'), semantic: 'delete', danger: true, permissionKey: 'oa:contract:remove' },
                          ]}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </TableSurfaceCard>)}
        pagination={total > 0 ? (
          <Pagination total={total} page={query.pageNum} pageSize={query.pageSize} showPageSizeSelector={false} showJump={false} onPageChange={(pageNum) => setQuery((prev) => ({ ...prev, pageNum }))} onPageSizeChange={() => {}} />
        ) : null}
      />

      <BaseDialog
        open={dialogOpen}
        title={form.contractId ? '编辑合同' : '新建合同'}
        onClose={closeDialog}
        width="wide"
        footer={(
          <>
            <Button variant="outline" onClick={closeDialog}>取消</Button>
            <Button onClick={() => void saveForm()} disabled={saving}>保存</Button>
          </>
        )}
      >
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div className="space-y-2">
              <Label>合同编号</Label>
              <Input className="h-11" value={form.contractNo || ''} onChange={(event) => setForm((prev) => ({ ...prev, contractNo: event.target.value }))} placeholder="留空自动生成" />
            </div>
            <div className="space-y-2">
              <Label>合同名称</Label>
              <Input className="h-11" value={form.contractName} onChange={(event) => setForm((prev) => ({ ...prev, contractName: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>相对方</Label>
              <Input className="h-11" value={form.counterpartyName} onChange={(event) => setForm((prev) => ({ ...prev, counterpartyName: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>合同类型</Label>
              <Select value={form.contractType} onValueChange={(value) => setForm((prev) => ({ ...prev, contractType: value }))}>
                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TYPE_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>合同金额</Label>
              <Input className="h-11" type="number" min={0} value={form.amount} onChange={(event) => setForm((prev) => ({ ...prev, amount: Number(event.target.value) || 0 }))} />
            </div>
            <div className="space-y-2">
              <Label>风险等级</Label>
              <Select value={form.riskLevel || 'LOW'} onValueChange={(value) => setForm((prev) => ({ ...prev, riskLevel: value as OaContract['riskLevel'] }))}>
                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(RISK_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>开始日期</Label>
              <DatePicker className="h-11" type="date" value={form.startDate || ''} onChange={(event) => setForm((prev) => ({ ...prev, startDate: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>结束日期</Label>
              <DatePicker className="h-11" type="date" value={form.endDate || ''} onChange={(event) => setForm((prev) => ({ ...prev, endDate: event.target.value }))} />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>关联项目</Label>
              <Select
                value={form.projectId ? String(form.projectId) : 'NONE'}
                onValueChange={(value) => {
                  const project = projectOptions.find((item) => String(item.projectId) === value);
                  setForm((prev) => ({
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
              <Label>客户</Label>
              <Select
                value={form.customerId ? String(form.customerId) : 'NONE'}
                onValueChange={(value) => {
                  const customer = customerOptions.find((item) => String(item.customerId) === value);
                  setForm((prev) => ({
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
              <Label>预算科目</Label>
              <Select
                value={form.budgetSubjectCode || 'NONE'}
                onValueChange={(value) => {
                  const subject = budgetSubjectOptions.find((item) => item.subjectCode === value);
                  setForm((prev) => ({
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
          <div className="space-y-2">
            <Label>合同附件</Label>
            <FileUpload value={form.attachmentUrl || ''} onChange={(urls) => setForm((prev) => ({ ...prev, attachmentUrl: urls }))} maxCount={5} />
          </div>
          <div className="space-y-2">
            <Label>归档附件</Label>
            <FileUpload value={form.archiveAttachmentUrl || ''} onChange={(urls) => setForm((prev) => ({ ...prev, archiveAttachmentUrl: urls }))} maxCount={5} />
          </div>
          <div className="space-y-2">
            <Label>备注</Label>
            <Textarea className="min-h-[100px] resize-none" value={form.remark || ''} onChange={(event) => setForm((prev) => ({ ...prev, remark: event.target.value }))} />
          </div>
        </div>
      </BaseDialog>

      <BaseDialog
        open={Boolean(detail)}
        title={detail?.contractNo || '合同详情'}
        onClose={() => setDetail(null)}
        width="wide"
        headerAside={detail && !detailLoading ? getStatusBadge(detail.status) : null}
        footer={<Button variant="outline" onClick={() => setDetail(null)}>关闭</Button>}
      >
        {detailLoading ? (
          <div className="flex items-center justify-center py-12 text-sm text-slate-500 dark:text-slate-400">
            <Clock3 className="mr-2 h-4 w-4 animate-spin" />
            正在加载合同详情...
          </div>
        ) : detail ? (
          <div className="space-y-4">
            <div className="grid gap-x-6 gap-y-3 md:grid-cols-2 xl:grid-cols-3">
              {[
                ['合同名称', detail.contractName],
                ['相对方', detail.counterpartyName],
                ['合同类型', TYPE_LABELS[detail.contractType] || detail.contractType],
                ['金额', `${detail.currency || 'CNY'} ${Number(detail.amount || 0).toLocaleString()}`],
                ['负责人', detail.ownerName],
                ['部门', detail.deptName],
                ['关联项目', detail.projectName],
                ['客户', detail.customerName],
                ['预算科目', detail.budgetSubjectName || detail.budgetSubjectCode],
                ['发票状态', detail.invoiceStatus],
                ['开始日期', detail.startDate],
                ['结束日期', detail.endDate],
                ['流程实例', detail.instanceId],
                ['用印申请', detail.sealApplicationId ? String(detail.sealApplicationId) : '-'],
              ].map(([label, value]) => (
                <div key={label} className="border-b border-slate-100 pb-3 dark:border-slate-800">
                  <div className="text-[11px] font-medium text-slate-400 dark:text-slate-500">{label}</div>
                  <div className="mt-1.5 text-sm leading-6 text-slate-900 dark:text-slate-100">{value || '-'}</div>
                </div>
              ))}
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <div className="rounded-xl border border-slate-200 px-4 py-4 dark:border-slate-800">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="text-sm font-medium text-slate-900 dark:text-slate-100">关联合同用印</div>
                  <Button size="sm" variant="outline" onClick={() => void linkSeal()} disabled={!linkSealId}>
                    <Link2 size={14} className="mr-1.5" />
                    绑定
                  </Button>
                </div>
                <Select value={linkSealId || 'NONE'} onValueChange={(value) => setLinkSealId(value === 'NONE' ? '' : value)}>
                  <SelectTrigger className="h-10"><SelectValue placeholder="选择已审批用印申请" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">选择已审批用印申请</SelectItem>
                    {sealApplications.map((item) => (
                      <SelectItem key={item.id} value={String(item.id)}>{item.applicationNo} / {item.sealName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="rounded-xl border border-slate-200 px-4 py-4 dark:border-slate-800">
                <div className="mb-3 text-sm font-medium text-slate-900 dark:text-slate-100">附件</div>
                <AttachmentLinks value={detail.attachmentUrl} />
                <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-800">
                  <AttachmentLinks value={detail.archiveAttachmentUrl} />
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 px-4 py-4 dark:border-slate-800">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-900 dark:text-slate-100">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                风险记录 {openRiskCount}
              </div>
              {risks.length ? (
                <div className="grid gap-3 md:grid-cols-2">
                  {risks.map((risk) => (
                    <div key={risk.id} className="rounded-lg border border-slate-100 px-3 py-3 dark:border-slate-800">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{risk.riskName}</span>
                        {getRiskBadge(risk.riskLevel)}
                      </div>
                      <div className="mt-2 text-xs text-slate-400">{risk.riskSource} / {risk.riskStatus} / {formatDateTimeDisplay(risk.detectedTime)}</div>
                    </div>
                  ))}
                </div>
              ) : <div className="py-6 text-center text-sm text-slate-400">暂无风险记录</div>}
            </div>

            <BusinessTimeline businessType="CONTRACT" businessId={detail.contractId} />
          </div>
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

export default ContractPage;

