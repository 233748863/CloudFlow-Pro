import React, { useEffect, useMemo, useState } from 'react';
import {
  BellRing,
  FilePlus2,
  RefreshCcw,
  Search,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { getErrorMessage } from '@/utils/errorMessage';
import { BaseDialog } from '@/components/common/BaseDialog';
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
  Textarea,
} from '@/components/common';
import {
  HrEmployee,
  ProbationConfirmation,
  ProbationConfirmationPayload,
  approveProbationConfirmation,
  createProbationConfirmation,
  getProbationConfirmation,
  listEmployees,
  listProbationByEmployee,
  rejectProbationConfirmation,
  sendProbationReminders,
  submitProbationConfirmation,
} from '@/services/api/hr';
import { formatDateTimeDisplay as formatDateTime } from '@/utils/dateFormat';
import {
  buildEmployeeLabel,
  hasWorkflowStatus,
  matchEmployeeKeyword,
  normalizeRows,
  toDateInputValue,
} from './hrShared';

const defaultForm: ProbationConfirmationPayload = {
  employeeId: 0,
  probationStartDate: '',
  probationEndDate: '',
  expectedRegularDate: '',
  selfEvaluation: '',
  managerEvaluation: '',
};

const probationStatusClass = (status?: string) => {
  if (!status) {
    return 'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300';
  }
  if (/(EXTENDED|EXTEND)/i.test(status)) {
    return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200';
  }
  if (/(APPROV|REGULAR|COMPLETE|PASS)/i.test(status)) {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200';
  }
  if (/(DRAFT|PENDING|SUBMIT)/i.test(status)) {
    return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200';
  }
  if (/(REJECT|FAIL)/i.test(status)) {
    return 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200';
  }
  return 'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300';
};

const isProbationEmployee = (employee?: HrEmployee | null) =>
  String(employee?.employeeStatus || '').toUpperCase() === 'PROBATION';

const getEmployeeStatusLabel = (status?: string) => {
  switch (String(status || '').toUpperCase()) {
    case 'PROBATION':
      return '试用期';
    case 'REGULAR':
      return '正式';
    case 'RESIGNED':
      return '已离职';
    case 'PENDING':
      return '待入职';
    default:
      return status || '-';
  }
};

const getProbationActionHint = (status?: string) => {
  switch (String(status || '').toUpperCase()) {
    case 'DRAFT':
      return '下一步：提交转正申请';
    case 'APPROVING':
      return '下一步：审批当前申请';
    case 'APPROVED':
      return '流程完成，员工主档应已转为正式并写入预计转正日期';
    case 'EXTENDED':
      return '试用期已延长，员工仍保持试用期，观察结束后可重新发起';
    case 'REJECTED':
      return '流程已驳回；是否还能重新发起，取决于员工主档是否仍处于试用期';
    default:
      return '查看详情并核对转正信息';
  }
};

const getPreferredApplicationId = (
  rows: ProbationConfirmation[],
  preferredId?: number,
  currentDetailId?: number,
) => {
  if (preferredId && rows.some((item) => item.id === preferredId)) {
    return preferredId;
  }

  if (currentDetailId && rows.some((item) => item.id === currentDetailId)) {
    return currentDetailId;
  }

  return (
    rows.find((item) => ['DRAFT', 'APPROVING'].includes(String(item.status || '').toUpperCase()))
      ?.id || rows[0]?.id
  );
};

const InlineState = ({
  title,
  className,
}: {
  title: string;
  description?: string;
  className?: string;
}) => (
  <div className={['flex flex-col items-center justify-center px-6 py-10 text-center', className].filter(Boolean).join(' ')}>
    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500">
      <ShieldCheck className="h-4 w-4" />
    </div>
    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
  </div>
);

const DetailRow = ({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) => (
  <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-4 py-3 last:border-b-0 dark:border-slate-800">
    <div className="text-xs font-medium uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500">
      {label}
    </div>
    <div className="text-right text-sm font-medium text-slate-900 dark:text-slate-100">{value}</div>
  </div>
);

const DialogSection = ({
  title,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) => (
  <section className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-900/40">
    <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</div>
    </div>
    <div className="p-4">{children}</div>
  </section>
);

export const HrProbationPage: React.FC = () => {
  const [employees, setEmployees] = useState<HrEmployee[]>([]);
  const [employeeKeyword, setEmployeeKeyword] = useState('');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createForm, setCreateForm] = useState<ProbationConfirmationPayload>(defaultForm);
  const [applications, setApplications] = useState<ProbationConfirmation[]>([]);
  const [detail, setDetail] = useState<ProbationConfirmation | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectExtensionDays, setRejectExtensionDays] = useState('');

  const loadEmployees = async () => {
    setLoading(true);
    try {
      const employeeRes = await listEmployees({ pageNum: 1, pageSize: 200 });
      setEmployees(normalizeRows<HrEmployee>(employeeRes));
    } catch (error) {
      console.error(error);
      toast.error(getErrorMessage(error, '员工列表加载失败'));
    } finally {
      setLoading(false);
    }
  };

  const loadDetail = async (id: number) => {
    setDetailLoading(true);
    try {
      const detailRes = await getProbationConfirmation(id);
      setDetail(detailRes);
      setRejectReason(detailRes.rejectReason || '');
      setRejectExtensionDays(detailRes.extensionDays ? String(detailRes.extensionDays) : '');
    } catch (error) {
      console.error(error);
      toast.error(getErrorMessage(error, '转正申请详情加载失败'));
    } finally {
      setDetailLoading(false);
    }
  };

  const loadApplications = async (employeeId: number, preferredId?: number) => {
    setListLoading(true);
    try {
      const applicationRes = await listProbationByEmployee(employeeId);
      const rows = Array.isArray(applicationRes) ? applicationRes : [];
      const sortedRows = [...rows].sort((left, right) => Number(right.id) - Number(left.id));
      setApplications(sortedRows);

      const nextId = getPreferredApplicationId(
        sortedRows,
        preferredId,
        detail?.employeeId === employeeId ? detail?.id : undefined,
      );

      if (!nextId) {
        setDetail(null);
        setRejectReason('');
        setRejectExtensionDays('');
        return;
      }

      await loadDetail(nextId);
    } catch (error) {
      console.error(error);
      setApplications([]);
      setDetail(null);
      toast.error(getErrorMessage(error, '转正申请列表加载失败'));
    } finally {
      setListLoading(false);
    }
  };

  const handleRefreshCurrentEmployee = async () => {
    await loadEmployees();

    if (selectedEmployeeId) {
      await loadApplications(Number(selectedEmployeeId), detail?.id);
    }
  };

  const handleApprove = async (id: number) => {
    setPendingAction('approve');
    try {
      await approveProbationConfirmation(id);
      toast.success('转正申请已审批通过');

      if (selectedEmployeeId) {
        await handleRefreshCurrentEmployee();
      }
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || '审批转正申请失败');
    } finally {
      setPendingAction(null);
    }
  };

  const handleReject = async (id: number) => {
    if (!rejectReason.trim()) {
      toast.error('请填写驳回原因');
      return;
    }

    setPendingAction('reject');
    try {
      await rejectProbationConfirmation(
        id,
        rejectReason.trim(),
        rejectExtensionDays ? Number(rejectExtensionDays) : undefined,
      );
      toast.success('转正申请已驳回');

      if (selectedEmployeeId) {
        await handleRefreshCurrentEmployee();
      }
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || '驳回转正申请失败');
    } finally {
      setPendingAction(null);
    }
  };

  useEffect(() => {
    void loadEmployees();
  }, []);

  const filteredEmployees = useMemo(
    () => employees.filter((employee) => matchEmployeeKeyword(employee, employeeKeyword)),
    [employees, employeeKeyword],
  );

  useEffect(() => {
    if (!filteredEmployees.length) {
      setSelectedEmployeeId('');
      setApplications([]);
      setDetail(null);
      return;
    }

    // 搜索结果变化后自动聚焦第一位员工，减少桌面端每次都要再点一次列表。
    if (
      !selectedEmployeeId
      || !filteredEmployees.some((item) => String(item.id) === selectedEmployeeId)
    ) {
      const preferredEmployee =
        filteredEmployees.find((item) => isProbationEmployee(item)) || filteredEmployees[0];
      setSelectedEmployeeId(String(preferredEmployee.id));
    }
  }, [filteredEmployees, selectedEmployeeId]);

  useEffect(() => {
    if (!selectedEmployeeId) {
      setApplications([]);
      setDetail(null);
      return;
    }

    void loadApplications(Number(selectedEmployeeId));
  }, [selectedEmployeeId]);

  const selectedEmployee = useMemo(
    () => employees.find((item) => String(item.id) === selectedEmployeeId) || null,
    [employees, selectedEmployeeId],
  );

  const creatableEmployees = useMemo(
    () => employees.filter((item) => isProbationEmployee(item)),
    [employees],
  );

  const draftOrApprovingCount = useMemo(
    () =>
      applications.filter((item) =>
        ['DRAFT', 'APPROVING'].includes(String(item.status || '').toUpperCase()),
      ).length,
    [applications],
  );

  const approvedCount = useMemo(
    () => applications.filter((item) => hasWorkflowStatus(item.status, 'APPROVED')).length,
    [applications],
  );

  const detailHistoryTone = hasWorkflowStatus(detail?.status, 'EXTENDED')
    ? 'border-amber-100 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200'
    : 'border-rose-100 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200';

  const canSubmitDetail = hasWorkflowStatus(detail?.status, 'DRAFT');
  const canApproveDetail = hasWorkflowStatus(detail?.status, 'APPROVING');
  const canRejectDetail = hasWorkflowStatus(detail?.status, 'APPROVING');
  const selectedEmployeeCanCreate = isProbationEmployee(selectedEmployee);
  const canOpenCreate = creatableEmployees.length > 0;

  const resetCreateDialog = () => {
    const defaultEmployee =
      selectedEmployeeCanCreate && selectedEmployee
        ? selectedEmployee
        : creatableEmployees[0] || null;

    setCreateForm({
      ...defaultForm,
      employeeId: defaultEmployee?.id || 0,
      probationStartDate: toDateInputValue(defaultEmployee?.hireDate) || '',
      probationEndDate: toDateInputValue(defaultEmployee?.regularDate) || '',
      expectedRegularDate: toDateInputValue(defaultEmployee?.regularDate) || '',
    });
    setCreateDialogOpen(false);
  };

  const handleOpenCreate = () => {
    if (!canOpenCreate) {
      toast.error('当前没有可发起转正的试用期员工');
      return;
    }

    const defaultEmployee =
      selectedEmployeeCanCreate && selectedEmployee
        ? selectedEmployee
        : creatableEmployees[0] || null;

    setCreateForm({
      ...defaultForm,
      employeeId: defaultEmployee?.id || 0,
      probationStartDate: toDateInputValue(defaultEmployee?.hireDate) || '',
      probationEndDate: toDateInputValue(defaultEmployee?.regularDate) || '',
      expectedRegularDate: toDateInputValue(defaultEmployee?.regularDate) || '',
    });
    setCreateDialogOpen(true);
  };

  const handleCreate = async () => {
    if (!createForm.employeeId) {
      toast.error('请先选择员工');
      return;
    }
    if (!createForm.probationStartDate || !createForm.probationEndDate) {
      toast.error('请填写完整的试用周期');
      return;
    }
    if (!createForm.expectedRegularDate) {
      toast.error('请填写预计转正日期');
      return;
    }
    if (createForm.probationEndDate < createForm.probationStartDate) {
      toast.error('试用结束日期不能早于试用开始日期');
      return;
    }
    if (createForm.expectedRegularDate < createForm.probationStartDate) {
      toast.error('预计转正日期不能早于试用开始日期');
      return;
    }

    setPendingAction('create');
    try {
      const id = await createProbationConfirmation(createForm);
      toast.success(`转正申请已创建，申请 ID：${id}`);
      const targetEmployeeId = createForm.employeeId;

      resetCreateDialog();

      if (!targetEmployeeId) {
        return;
      }

      if (String(targetEmployeeId) !== selectedEmployeeId) {
        setSelectedEmployeeId(String(targetEmployeeId));
        return;
      }

      await loadApplications(targetEmployeeId, id);
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || '创建转正申请失败');
    } finally {
      setPendingAction(null);
    }
  };

  const handleSubmit = async (id: number) => {
    setPendingAction(`submit-${id}`);
    try {
      await submitProbationConfirmation(id);
      toast.success('转正申请已提交');

      if (selectedEmployeeId) {
        await loadApplications(Number(selectedEmployeeId), id);
      }
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || '提交转正申请失败');
    } finally {
      setPendingAction(null);
    }
  };

  const handleSendReminders = async () => {
    setPendingAction('remind');
    try {
      await sendProbationReminders();
      toast.success('转正提醒已发送');
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || '发送提醒失败');
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <div className="space-y-4">

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          命中员工 {loading ? '--' : filteredEmployees.length}
        </span>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          当前员工申请 {selectedEmployee ? applications.length : '--'}
        </span>
        <span className="rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-xs text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-200">
          待推进申请 {selectedEmployee ? draftOrApprovingCount : '--'}
        </span>
        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
          已完成转正 {selectedEmployee ? approvedCount : '--'}
        </span>

        <div className="ml-auto flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={!canOpenCreate}
            onClick={handleOpenCreate}
          >
            <FilePlus2 size={14} className="mr-1.5" />
            新建转正申请
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={Boolean(pendingAction)}
            onClick={() => void handleSendReminders()}
          >
            <BellRing size={14} className="mr-1.5" />
            {pendingAction === 'remind' ? '发送中...' : '发送转正提醒'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={Boolean(pendingAction)}
            onClick={() => void handleRefreshCurrentEmployee()}
          >
            <RefreshCcw
              size={14}
              className={`mr-1.5 ${loading || listLoading || detailLoading ? 'animate-spin' : ''}`}
            />
            刷新当前数据
          </Button>
        </div>
      </div>

      <TablePageLayout
        filters={(
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
            <div className="flex flex-1 flex-wrap items-center gap-3">
              <div className="relative w-full sm:w-72">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                <Input
                  className="pl-10"
                  placeholder="搜索姓名、工号、部门"
                  value={employeeKeyword}
                  onChange={(event) => setEmployeeKeyword(event.target.value)}
                />
              </div>
            </div>

            <div className="flex w-full flex-shrink-0 flex-wrap items-center justify-end gap-3 lg:w-auto">
              <Button
                variant="outline"
                onClick={() => setEmployeeKeyword('')}
              >
                重置搜索
              </Button>
            </div>
          </div>
        )}
        table={(
          <div className="grid min-h-[720px] grid-cols-1 xl:grid-cols-[280px_320px_minmax(0,1fr)]">
            <aside className="min-w-0 border-b border-slate-200 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-900/20 xl:border-b-0 xl:border-r">
              <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">员工列表</div>
              </div>
              <div className="space-y-3 overflow-y-auto p-4">
                {loading ? (
                  <InlineState title="正在加载员工列表..." className="py-12" />
                ) : filteredEmployees.length === 0 ? (
                  <InlineState title="当前搜索条件下没有匹配员工" className="py-12" />
                ) : (
                  filteredEmployees.map((employee) => {
                    const active = String(employee.id) === selectedEmployeeId;

                    return (
                      <button
                        key={employee.id}
                        type="button"
                        className={[
                          'w-full rounded-xl border px-4 py-4 text-left transition',
                          active
                            ? 'border-amber-200 bg-amber-50 shadow-sm dark:border-amber-900 dark:bg-amber-950/20'
                            : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950/88 dark:hover:bg-slate-900/70',
                        ].join(' ')}
                        onClick={() => setSelectedEmployeeId(String(employee.id))}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                              {employee.name}
                            </div>
                            <div className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
                              {buildEmployeeLabel(employee)}
                            </div>
                          </div>
                          <span className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                            {getEmployeeStatusLabel(employee.employeeStatus)}
                          </span>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-500 dark:text-slate-400">
                          <div>
                            <div className="text-slate-400 dark:text-slate-500">入职日期</div>
                            <div className="mt-1">{toDateInputValue(employee.hireDate) || '-'}</div>
                          </div>
                          <div>
                            <div className="text-slate-400 dark:text-slate-500">转正日期</div>
                            <div className="mt-1">{toDateInputValue(employee.regularDate) || '-'}</div>
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </aside>

            <aside className="min-w-0 border-b border-slate-200 bg-slate-50/40 dark:border-slate-800 dark:bg-slate-900/10 xl:border-b-0 xl:border-r">
              <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">申请列表</div>
                  </div>
                  <div className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                    {selectedEmployee ? `${applications.length} 条` : '等待选择员工'}
                  </div>
                </div>
              </div>

              <div className="space-y-3 overflow-y-auto p-4">
                {selectedEmployee ? (
                  <div className="rounded-xl border border-slate-200 bg-white px-4 py-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {selectedEmployee.name}
                    </div>
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {[selectedEmployee.employeeNo, selectedEmployee.deptName, selectedEmployee.postName]
                        .filter(Boolean)
                        .join(' / ') || '-'}
                    </div>
                    <div className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                      {selectedEmployee.phone || '未维护手机号'}
                    </div>
                  </div>
                ) : null}

                {listLoading ? (
                  <InlineState title="正在加载转正申请..." className="py-12" />
                ) : applications.length === 0 ? (
                  <InlineState
                    title={selectedEmployee ? '该员工暂无转正申请' : '先从左侧选择员工'}
                    className="py-12"
                  />
                ) : (
                  applications.map((item) => {
                    const active = detail?.id === item.id;

                    return (
                      <div
                        key={item.id}
                        role="button"
                        tabIndex={0}
                        className={[
                          'w-full rounded-xl border px-4 py-4 text-left transition',
                          active
                            ? 'border-cyan-200 bg-cyan-50 shadow-sm dark:border-cyan-900 dark:bg-cyan-950/20'
                            : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950/88 dark:hover:bg-slate-900/70',
                        ].join(' ')}
                        onClick={() => void loadDetail(item.id)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            void loadDetail(item.id);
                          }
                        }}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                              {item.applicationNo}
                            </div>
                            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                              {item.employeeName || '-'} / {item.employeeNo || '-'}
                            </div>
                          </div>
                          <span
                            className={[
                              'shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium',
                              probationStatusClass(item.status),
                            ].join(' ')}
                          >
                            {item.statusDesc || item.status}
                          </span>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-slate-500 dark:text-slate-400">
                          <div>
                            <div className="text-slate-400 dark:text-slate-500">试用周期</div>
                            <div className="mt-1">
                              {toDateInputValue(item.probationStartDate) || '-'} ~ {toDateInputValue(item.probationEndDate) || '-'}
                            </div>
                          </div>
                          <div>
                            <div className="text-slate-400 dark:text-slate-500">预计转正</div>
                            <div className="mt-1">{toDateInputValue(item.expectedRegularDate) || '-'}</div>
                          </div>
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-3">
                          <div className="text-xs text-slate-400 dark:text-slate-500">
                            {getProbationActionHint(item.status)}
                          </div>
                          <Button
                            size="sm"
                            type="button"
                            disabled={!hasWorkflowStatus(item.status, 'DRAFT') || Boolean(pendingAction)}
                            onClick={(event) => {
                              event.stopPropagation();
                              void handleSubmit(item.id);
                            }}
                          >
                            {pendingAction === `submit-${item.id}` ? '提交中...' : '提交'}
                          </Button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </aside>

            <div className="flex min-h-0 flex-col">
              <div className="flex flex-col gap-4 border-b border-slate-200 px-4 py-3 dark:border-slate-800 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">申请详情</div>
                </div>
                {detail ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!canSubmitDetail || Boolean(pendingAction)}
                      onClick={() => void handleSubmit(detail.id)}
                    >
                      {pendingAction === `submit-${detail.id}` ? '提交中...' : '提交当前申请'}
                    </Button>
                    <Button
                      size="sm"
                      disabled={!canApproveDetail || Boolean(pendingAction)}
                      onClick={() => void handleApprove(detail.id)}
                    >
                      {pendingAction === 'approve' ? '处理中...' : '审批通过'}
                    </Button>
                  </div>
                ) : null}
              </div>

              {!detail ? (
                <InlineState
                  title="请选择一条转正申请"
                  className="py-20"
                />
              ) : (
                <div className="flex flex-1 flex-col gap-4 p-4">
                  <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
                    <DetailRow label="申请编号" value={detail.applicationNo} />
                    <DetailRow
                      label="员工"
                      value={`${detail.employeeName || '-'} / ${detail.employeeNo || '-'}`}
                    />
                    <DetailRow
                      label="状态"
                      value={(
                        <span
                          className={[
                            'inline-flex rounded-full border px-2 py-0.5 text-xs font-medium',
                            probationStatusClass(detail.status),
                          ].join(' ')}
                        >
                          {detail.statusDesc || detail.status}
                        </span>
                      )}
                    />
                    <DetailRow label="状态提示" value={getProbationActionHint(detail.status)} />
                    <DetailRow
                      label="试用开始"
                      value={toDateInputValue(detail.probationStartDate) || '-'}
                    />
                    <DetailRow
                      label="试用结束"
                      value={toDateInputValue(detail.probationEndDate) || '-'}
                    />
                    <DetailRow
                      label="预计转正日期"
                      value={toDateInputValue(detail.expectedRegularDate) || '-'}
                    />
                    <DetailRow
                      label="创建时间"
                      value={formatDateTime(detail.createTime)}
                    />
                    <DetailRow
                      label="流程实例 ID"
                      value={detail.processInstanceId || '-'}
                    />
                  </div>

                  <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
                    <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
                      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">评价信息</div>
                    </div>
                    <div className="grid grid-cols-1 gap-4 p-4">
                      <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-900/40">
                        <div className="text-xs text-slate-400 dark:text-slate-500">自我评价</div>
                        <div className="mt-2 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">
                          {detail.selfEvaluation || '-'}
                        </div>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-900/40">
                        <div className="text-xs text-slate-400 dark:text-slate-500">主管评价</div>
                        <div className="mt-2 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">
                          {detail.managerEvaluation || '-'}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
                    <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
                      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">驳回处理</div>
                    </div>

                    <div className="space-y-4 p-4">

                      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_220px]">
                        <div className="space-y-2">
                          <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">驳回原因</Label>
                          <Textarea
                            rows={5}
                            value={rejectReason}
                            onChange={(event) => setRejectReason(event.target.value)}
                            placeholder="例如：试用期目标未达成，建议延长观察期"
                          />
                        </div>
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">延长天数</Label>
                            <Input
                              type="number"
                              min={0}
                              placeholder="留空则不延长"
                              value={rejectExtensionDays}
                              onChange={(event) => setRejectExtensionDays(event.target.value)}
                              className="h-11"
                            />
                          </div>
                          <Button
                            className="w-full"
                            disabled={!canRejectDetail || Boolean(pendingAction)}
                            onClick={() => void handleReject(detail.id)}
                          >
                            {pendingAction === 'reject' ? '处理中...' : '驳回申请'}
                          </Button>
                        </div>
                      </div>

                      {detail.rejectReason || detail.extensionDays ? (
                        <div className={`rounded-xl border px-4 py-3 text-sm ${detailHistoryTone}`}>
                          {hasWorkflowStatus(detail.status, 'EXTENDED') ? '历史延长信息：' : '历史驳回信息：'}
                          {detail.rejectReason || '未填写原因'}
                          {detail.extensionDays ? `，延长 ${detail.extensionDays} 天` : ''}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {detailLoading ? (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
                      正在加载申请详情...
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        )}
      />

      <BaseDialog
        open={createDialogOpen}
        title="新建转正申请"
        onClose={resetCreateDialog}
        maxWidthClassName="max-w-3xl"
        footer={(
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={resetCreateDialog}>
              取消
            </Button>
            <Button disabled={pendingAction === 'create'} onClick={() => void handleCreate()}>
              {pendingAction === 'create' ? '创建中...' : '创建申请'}
            </Button>
          </div>
        )}
      >
        <div className="space-y-4">
          <DialogSection
            title="员工与周期"
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">员工</Label>
                <Select
                  value={createForm.employeeId ? String(createForm.employeeId) : undefined}
                  onValueChange={(value) =>
                    setCreateForm((prev) => ({ ...prev, employeeId: Number(value) }))
                  }
                >
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="请选择员工" />
                  </SelectTrigger>
                  <SelectContent>
                    {creatableEmployees.map((item) => (
                      <SelectItem key={item.id} value={String(item.id)}>
                        {buildEmployeeLabel(item)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">试用开始日期</Label>
                <DatePicker
                  type="date"
                  value={createForm.probationStartDate}
                  onChange={(event) =>
                    setCreateForm((prev) => ({ ...prev, probationStartDate: event.target.value }))
                  }
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">试用结束日期</Label>
                <DatePicker
                  type="date"
                  value={createForm.probationEndDate}
                  onChange={(event) =>
                    setCreateForm((prev) => ({ ...prev, probationEndDate: event.target.value }))
                  }
                  className="h-11"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">预计转正日期</Label>
                <DatePicker
                  type="date"
                  value={createForm.expectedRegularDate}
                  onChange={(event) =>
                    setCreateForm((prev) => ({ ...prev, expectedRegularDate: event.target.value }))
                  }
                  className="h-11"
                />
              </div>
            </div>
          </DialogSection>

          <DialogSection
            title="评价信息"
          >
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">自我评价</Label>
                <Textarea
                  rows={4}
                  value={createForm.selfEvaluation || ''}
                  onChange={(event) =>
                    setCreateForm((prev) => ({ ...prev, selfEvaluation: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">主管评价</Label>
                <Textarea
                  rows={4}
                  value={createForm.managerEvaluation || ''}
                  onChange={(event) =>
                    setCreateForm((prev) => ({ ...prev, managerEvaluation: event.target.value }))
                  }
                />
              </div>
            </div>
          </DialogSection>
        </div>
      </BaseDialog>
    </div>
  );
};

export default HrProbationPage;
