import React, { useEffect, useMemo, useState } from 'react';
import { FilePlus2, LogOut, RefreshCcw, Search } from 'lucide-react';
import { toast } from 'sonner';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
} from '@/components/common';
import {
  approveResignation,
  completeResignationHandover,
  conductExitInterview,
  confirmResignation,
  createResignationApplication,
  getResignationApplication,
  HrEmployee,
  listEmployees,
  listResignationByEmployee,
  listResignationHandovers,
  ResignationApplication,
  ResignationApplicationPayload,
  ResignationHandover,
  submitResignationApplication,
} from '@/services/api/hr';
import {
  buildEmployeeLabel,
  hasWorkflowStatus,
  matchEmployeeKeyword,
  normalizeRows,
  toDateInputValue,
} from './hrShared';

const defaultForm: ResignationApplicationPayload = {
  employeeId: 0,
  resignationType: 'VOLUNTARY',
  resignationReason: '',
  expectedDate: '',
};

const resignationStatusClass = (status?: string) => {
  if (!status) {
    return 'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300';
  }
  if (/(CONFIRM|COMPLETE|SUCCESS)/i.test(status)) {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200';
  }
  if (/(DRAFT|PENDING|SUBMIT|HANDOVER|APPROV)/i.test(status)) {
    return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200';
  }
  if (/(REJECT|FAIL)/i.test(status)) {
    return 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200';
  }
  return 'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300';
};

const handoverStatusClass = (status?: string) => {
  if (!status) {
    return 'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300';
  }
  if (/(COMPLETE|DONE|FINISH)/i.test(status)) {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200';
  }
  return 'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-200';
};

const isHandoverCompleted = (status?: string) => /(COMPLETE|DONE|FINISH)/i.test(status || '');

const isResignationCreatableEmployee = (employee?: HrEmployee | null) =>
  String(employee?.employeeStatus || '').toUpperCase() !== 'RESIGNED';

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

const hasOpenResignationApplication = (application?: ResignationApplication | null) =>
  ['DRAFT', 'APPROVING', 'APPROVED'].includes(String(application?.status || '').toUpperCase());

const getResignationActionHint = (status?: string) => {
  switch (String(status || '').toUpperCase()) {
    case 'DRAFT':
      return '下一步：提交离职申请';
    case 'APPROVING':
      return '下一步：审批当前申请';
    case 'APPROVED':
      return '下一步：完成交接后确认离职';
    case 'COMPLETED':
      return '流程完成，员工已离职';
    default:
      return '查看详情并核对离职办理进度';
  }
};

const getPreferredApplicationId = (
  rows: ResignationApplication[],
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
    rows.find((item) =>
      ['DRAFT', 'APPROVING', 'APPROVED'].includes(String(item.status || '').toUpperCase()),
    )?.id || rows[0]?.id
  );
};

const formatDateTime = (value?: string | null) => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString('zh-CN');
};

const InlineState = ({
  title,
  className,
}: {
  title: string;
  description?: string;
  className?: string;
}) => (
  <div
    className={[
      'flex flex-col items-center justify-center px-6 py-10 text-center',
      className,
    ]
      .filter(Boolean)
      .join(' ')}
  >
    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500">
      <LogOut className="h-4 w-4" />
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

export const HrResignationPage: React.FC = () => {
  const [employees, setEmployees] = useState<HrEmployee[]>([]);
  const [employeeKeyword, setEmployeeKeyword] = useState('');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createForm, setCreateForm] = useState<ResignationApplicationPayload>(defaultForm);
  const [applications, setApplications] = useState<ResignationApplication[]>([]);
  const [detail, setDetail] = useState<ResignationApplication | null>(null);
  const [handovers, setHandovers] = useState<ResignationHandover[]>([]);
  const [handoverRemarks, setHandoverRemarks] = useState<Record<number, string>>({});
  const [interviewContent, setInterviewContent] = useState('');
  const [confirmDate, setConfirmDate] = useState('');

  const loadEmployees = async () => {
    setLoading(true);
    try {
      const employeeRes = await listEmployees({ pageNum: 1, pageSize: 200 });
      setEmployees(normalizeRows<HrEmployee>(employeeRes));
    } catch (error) {
      console.error(error);
      toast.error('员工列表加载失败');
    } finally {
      setLoading(false);
    }
  };

  const loadDetail = async (id: number) => {
    setDetailLoading(true);
    try {
      const [detailRes, handoverRes] = await Promise.all([
        getResignationApplication(id),
        listResignationHandovers(id),
      ]);
      setDetail(detailRes);
      setHandovers(Array.isArray(handoverRes) ? handoverRes : []);
      setInterviewContent(detailRes.interviewContent || '');
      setConfirmDate(
        toDateInputValue(detailRes.actualDate) || toDateInputValue(detailRes.expectedDate) || '',
      );
    } catch (error) {
      console.error(error);
      toast.error('离职详情加载失败');
    } finally {
      setDetailLoading(false);
    }
  };

  const loadApplications = async (employeeId: number, preferredId?: number) => {
    setListLoading(true);
    try {
      const applicationRes = await listResignationByEmployee(employeeId);
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
        setHandovers([]);
        return;
      }

      await loadDetail(nextId);
    } catch (error) {
      console.error(error);
      setApplications([]);
      setDetail(null);
      setHandovers([]);
      toast.error('离职申请列表加载失败');
    } finally {
      setListLoading(false);
    }
  };

  useEffect(() => {
    void loadEmployees();
  }, []);

  const handleRefreshCurrentEmployee = async () => {
    await loadEmployees();

    if (selectedEmployeeId) {
      await loadApplications(Number(selectedEmployeeId), detail?.id);
    }
  };

  const filteredEmployees = useMemo(
    () => employees.filter((employee) => matchEmployeeKeyword(employee, employeeKeyword)),
    [employees, employeeKeyword],
  );

  const creatableFilteredEmployees = useMemo(
    () => filteredEmployees.filter((employee) => isResignationCreatableEmployee(employee)),
    [filteredEmployees],
  );

  useEffect(() => {
    if (!filteredEmployees.length) {
      setSelectedEmployeeId('');
      setApplications([]);
      setDetail(null);
      setHandovers([]);
      return;
    }

    // 搜索结果变化后优先聚焦可继续办理的在职员工，减少无效切换。
    if (
      !selectedEmployeeId
      || !filteredEmployees.some((item) => String(item.id) === selectedEmployeeId)
    ) {
      const preferredEmployee = creatableFilteredEmployees[0] || filteredEmployees[0];
      setSelectedEmployeeId(String(preferredEmployee.id));
    }
  }, [creatableFilteredEmployees, filteredEmployees, selectedEmployeeId]);

  useEffect(() => {
    if (!selectedEmployeeId) {
      setApplications([]);
      setDetail(null);
      setHandovers([]);
      return;
    }

    void loadApplications(Number(selectedEmployeeId));
  }, [selectedEmployeeId]);

  const selectedEmployee = useMemo(
    () => employees.find((item) => String(item.id) === selectedEmployeeId) || null,
    [employees, selectedEmployeeId],
  );

  const creatableEmployees = useMemo(
    () => employees.filter((employee) => isResignationCreatableEmployee(employee)),
    [employees],
  );

  const pendingHandoverCount = useMemo(
    () => handovers.filter((item) => !isHandoverCompleted(item.status)).length,
    [handovers],
  );

  const actionableCount = useMemo(
    () =>
      applications.filter((item) =>
        ['DRAFT', 'APPROVING', 'APPROVED'].includes(String(item.status || '').toUpperCase()),
      ).length,
    [applications],
  );

  const completedCount = useMemo(
    () => applications.filter((item) => hasWorkflowStatus(item.status, 'COMPLETED')).length,
    [applications],
  );

  const canSubmitDetail = hasWorkflowStatus(detail?.status, 'DRAFT');
  const canApproveDetail = hasWorkflowStatus(detail?.status, 'APPROVING');
  const canConfirmDetail =
    hasWorkflowStatus(detail?.status, 'APPROVED') && pendingHandoverCount === 0;
  const canSaveInterview = detail ? !hasWorkflowStatus(detail.status, 'COMPLETED') : false;
  const selectedEmployeeCanCreate = isResignationCreatableEmployee(selectedEmployee);
  const selectedEmployeeHasOpenResignation = useMemo(
    () => applications.some((item) => hasOpenResignationApplication(item)),
    [applications],
  );

  const defaultCreateEmployee = useMemo(
    () =>
      (selectedEmployeeCanCreate && !selectedEmployeeHasOpenResignation ? selectedEmployee : null)
      || creatableFilteredEmployees.find((employee) => employee.id !== selectedEmployee?.id)
      || creatableEmployees.find((employee) => employee.id !== selectedEmployee?.id)
      || (selectedEmployeeCanCreate ? selectedEmployee : null)
      || creatableFilteredEmployees[0]
      || creatableEmployees[0]
      || null,
    [
      creatableEmployees,
      creatableFilteredEmployees,
      selectedEmployee,
      selectedEmployeeCanCreate,
      selectedEmployeeHasOpenResignation,
    ],
  );

  const defaultCreateEmployeeId = defaultCreateEmployee?.id || 0;

  const resetCreateDialog = () => {
    setCreateForm({
      ...defaultForm,
      employeeId: defaultCreateEmployeeId,
    });
    setCreateDialogOpen(false);
  };

  const handleOpenCreate = () => {
    if (!creatableEmployees.length) {
      toast.error('暂无可发起离职申请的在职员工');
      return;
    }

    setCreateForm({
      ...defaultForm,
      employeeId: defaultCreateEmployeeId,
    });
    setCreateDialogOpen(true);
  };

  const handleCreate = async () => {
    const targetEmployee = employees.find((item) => item.id === createForm.employeeId);

    if (!createForm.employeeId) {
      toast.error('请先选择员工');
      return;
    }
    if (!isResignationCreatableEmployee(targetEmployee)) {
      toast.error('已离职员工不能新建离职申请');
      return;
    }
    if (!createForm.expectedDate) {
      toast.error('请填写预计离职日期');
      return;
    }

    setPendingAction('create');
    try {
      const id = await createResignationApplication(createForm);
      toast.success(`离职申请已创建，申请 ID：${id}`);
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
      toast.error(error?.message || '创建离职申请失败');
    } finally {
      setPendingAction(null);
    }
  };

  const handleSubmit = async (id: number) => {
    setPendingAction(`submit-${id}`);
    try {
      await submitResignationApplication(id);
      toast.success('离职申请已提交');

      if (selectedEmployeeId) {
        await loadApplications(Number(selectedEmployeeId), id);
      }
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || '提交离职申请失败');
    } finally {
      setPendingAction(null);
    }
  };

  const handleSaveInterview = async () => {
    if (!detail) return;

    setPendingAction('interview');
    try {
      await conductExitInterview(detail.id, interviewContent);
      toast.success('离职面谈已记录');
      await loadDetail(detail.id);
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || '保存离职面谈失败');
    } finally {
      setPendingAction(null);
    }
  };

  const handleApprove = async (id: number) => {
    setPendingAction('approve');
    try {
      await approveResignation(id);
      toast.success('离职申请已审批通过');

      if (selectedEmployeeId) {
        await loadApplications(Number(selectedEmployeeId), id);
      }
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || '审批离职申请失败');
    } finally {
      setPendingAction(null);
    }
  };

  const handleCompleteHandover = async (handoverId: number) => {
    if (!detail) return;

    setPendingAction(`handover-${handoverId}`);
    try {
      await completeResignationHandover(handoverId, handoverRemarks[handoverId]);
      toast.success('交接事项已完成');
      setHandoverRemarks((prev) => ({ ...prev, [handoverId]: '' }));
      await loadDetail(detail.id);
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || '完成交接失败');
    } finally {
      setPendingAction(null);
    }
  };

  const handleConfirm = async () => {
    if (!detail) return;
    if (!confirmDate) {
      toast.error('请选择实际离职日期');
      return;
    }

    setPendingAction('confirm');
    try {
      await confirmResignation(detail.id, confirmDate);
      toast.success('已确认离职');

      if (selectedEmployeeId) {
        // 确认离职会回写员工主档状态，因此必须同时刷新员工列表和当前详情。
        await handleRefreshCurrentEmployee();
      }
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || '确认离职失败');
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="min-w-0">
        <div className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
          <LogOut className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-300" />
          Resignation Flow
        </div>
        <h1 className="mt-1.5 text-[26px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          离职办理
        </h1>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          命中员工 {loading ? '--' : filteredEmployees.length}
        </span>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          当前员工申请 {selectedEmployee ? applications.length : '--'}
        </span>
        <span className="rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-xs text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-200">
          待推进申请 {selectedEmployee ? actionableCount : '--'}
        </span>
        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
          已完成 {selectedEmployee ? completedCount : '--'}
        </span>
        <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          待交接 {detail ? pendingHandoverCount : '--'}
        </span>

        <div className="ml-auto flex flex-wrap gap-2">
          <Button size="sm" onClick={handleOpenCreate} disabled={!creatableEmployees.length}>
            <FilePlus2 size={14} className="mr-1.5" />
            新建离职申请
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
              <Button variant="outline" onClick={() => setEmployeeKeyword('')}>
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
                <div className="mt-1 text-xs leading-6 text-slate-500 dark:text-slate-400">
                  先定位员工，再连续处理该员工的离职链路。
                </div>
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
                        <div className="mt-3 space-y-2 text-xs text-slate-500 dark:text-slate-400">
                          <div>
                            <span className="text-slate-400 dark:text-slate-500">当前组织</span>
                            <div className="mt-1">
                              {[employee.deptName, employee.postName, employee.positionName]
                                .filter(Boolean)
                                .join(' / ') || '-'}
                            </div>
                          </div>
                          <div>
                            <span className="text-slate-400 dark:text-slate-500">联系方式</span>
                            <div className="mt-1">{employee.phone || '未维护手机号'}</div>
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
                    <div className="mt-1 text-xs leading-6 text-slate-500 dark:text-slate-400">
                      默认聚焦最近且仍可继续推进的离职记录。
                    </div>
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
                      当前状态：{getEmployeeStatusLabel(selectedEmployee.employeeStatus)}
                    </div>
                    {!selectedEmployeeCanCreate ? (
                      <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400">
                        当前员工已离职，仅建议查看历史申请；新建时会自动切到仍可发起的在职员工。
                      </div>
                    ) : null}
                    {selectedEmployeeHasOpenResignation ? (
                      <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                        当前员工已有待处理离职申请。新建时会优先切到其他可发起员工，避免重复发起。
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {listLoading ? (
                  <InlineState title="正在加载离职申请..." className="py-12" />
                ) : applications.length === 0 ? (
                  <InlineState
                    title={selectedEmployee ? '该员工暂无离职申请' : '先从左侧选择员工'}
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
                              resignationStatusClass(item.status),
                            ].join(' ')}
                          >
                            {item.statusDesc || item.status}
                          </span>
                        </div>
                        <div className="mt-3 space-y-2 text-xs text-slate-500 dark:text-slate-400">
                          <div className="flex items-center justify-between gap-3">
                            <span>预计离职：{toDateInputValue(item.expectedDate) || '-'}</span>
                            <span>实际离职：{toDateInputValue(item.actualDate) || '-'}</span>
                          </div>
                          <div>{item.resignationTypeDesc || item.resignationType || '-'}</div>
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-3">
                          <div className="text-xs text-slate-400 dark:text-slate-500">
                            {getResignationActionHint(item.status)}
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
                  <div className="mt-1 text-xs leading-6 text-slate-500 dark:text-slate-400">
                    详情区直接办理提交、审批、面谈和确认动作，不再堆叠额外工作台摘要。
                  </div>
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
                  title="请选择一条离职申请"
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
                            resignationStatusClass(detail.status),
                          ].join(' ')}
                        >
                          {detail.statusDesc || detail.status}
                        </span>
                      )}
                    />
                    <DetailRow label="状态提示" value={getResignationActionHint(detail.status)} />
                    <DetailRow
                      label="离职类型"
                      value={detail.resignationTypeDesc || detail.resignationType}
                    />
                    <DetailRow
                      label="预计离职日期"
                      value={toDateInputValue(detail.expectedDate) || '-'}
                    />
                    <DetailRow
                      label="实际离职日期"
                      value={toDateInputValue(detail.actualDate) || '-'}
                    />
                    <DetailRow label="创建时间" value={formatDateTime(detail.createTime)} />
                    <DetailRow label="流程实例 ID" value={detail.processInstanceId || '-'} />
                  </div>

                  <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
                    <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
                      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">离职信息</div>
                    </div>
                    <div className="space-y-4 p-4">
                      <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-900/40">
                        <div className="text-xs text-slate-400 dark:text-slate-500">离职原因</div>
                        <div className="mt-2 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">
                          {detail.resignationReason || '-'}
                        </div>
                      </div>

                      {hasWorkflowStatus(detail.status, 'APPROVED') && pendingHandoverCount > 0 ? (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                          当前申请还有 {pendingHandoverCount} 项交接未完成，暂不能确认离职。
                        </div>
                      ) : null}

                      {hasWorkflowStatus(detail.status, 'APPROVED') && pendingHandoverCount === 0 ? (
                        <div className="rounded-xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm leading-6 text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-200">
                          当前申请已满足确认离职条件。确认后会同步写回员工离职状态和实际离职日期。
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
                    <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
                      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">离职面谈</div>
                      <div className="mt-1 text-xs leading-6 text-slate-500 dark:text-slate-400">
                        直接调用后端 `interview` 接口保存面谈内容。
                      </div>
                    </div>
                    <div className="space-y-4 p-4">
                      <Textarea
                        rows={5}
                        value={interviewContent}
                        onChange={(event) => setInterviewContent(event.target.value)}
                        disabled={!canSaveInterview}
                      />
                      <div className="flex justify-end">
                        <Button
                          disabled={!canSaveInterview || Boolean(pendingAction)}
                          onClick={() => void handleSaveInterview()}
                        >
                          {pendingAction === 'interview' ? '保存中...' : '保存面谈记录'}
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
                    <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
                      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">确认离职</div>
                    </div>
                    <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_180px]">
                      <div className="space-y-2">
                        <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                          实际离职日期
                        </Label>
                        <Input
                          type="date"
                          value={confirmDate}
                          onChange={(event) => setConfirmDate(event.target.value)}
                          className="h-11"
                        />
                      </div>
                      <div className="flex items-end">
                        <Button
                          className="w-full"
                          disabled={!canConfirmDetail || Boolean(pendingAction)}
                          onClick={() => void handleConfirm()}
                        >
                          {pendingAction === 'confirm' ? '确认中...' : '确认离职'}
                        </Button>
                      </div>
                    </div>
                  </div>

                  {detailLoading ? (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
                      正在加载离职详情...
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        )}
      />

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">交接清单</div>
            <div className="mt-1 text-xs leading-6 text-slate-500 dark:text-slate-400">
              交接事项统一放在单表里处理，避免在详情侧栏继续叠卡。
            </div>
          </div>
          <div className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
            {detail ? `${handovers.length} 项交接` : '等待加载申请'}
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>交接事项</TableHead>
                <TableHead>类型</TableHead>
                <TableHead>接收人</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>备注</TableHead>
                <TableHead>完成时间</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {handovers.map((item) => {
                const completed = isHandoverCompleted(item.status);

                return (
                  <TableRow key={item.id}>
                    <TableCell className="font-semibold text-slate-900 dark:text-slate-100">
                      {item.handoverItem}
                    </TableCell>
                    <TableCell>{item.handoverTypeDesc || item.handoverType}</TableCell>
                    <TableCell>{item.handoverToName || '-'}</TableCell>
                    <TableCell>
                      <span
                        className={[
                          'inline-flex rounded-full border px-2 py-0.5 text-xs font-medium',
                          handoverStatusClass(item.status),
                        ].join(' ')}
                      >
                        {item.statusDesc || item.status}
                      </span>
                    </TableCell>
                    <TableCell className="min-w-[220px]">
                      <Input
                        placeholder="可选填写交接备注"
                        disabled={completed}
                        value={handoverRemarks[item.id] ?? item.remark ?? ''}
                        onChange={(event) =>
                          setHandoverRemarks((prev) => ({
                            ...prev,
                            [item.id]: event.target.value,
                          }))
                        }
                      />
                    </TableCell>
                    <TableCell>{formatDateTime(item.completedTime)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant={completed ? 'outline' : 'default'}
                        disabled={completed || Boolean(pendingAction)}
                        onClick={() => void handleCompleteHandover(item.id)}
                      >
                        {pendingAction === `handover-${item.id}`
                          ? '处理中...'
                          : completed
                            ? '已完成'
                            : '完成交接'}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}

              {handovers.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="px-6 py-12 text-center text-sm text-slate-500 dark:text-slate-400"
                  >
                    {detail ? '当前申请暂无交接事项' : '先加载离职申请，再查看交接清单'}
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      </div>

      <BaseDialog
        open={createDialogOpen}
        title="新建离职申请"
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
            title="员工与离职信息"
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
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">离职类型</Label>
                <Select
                  value={createForm.resignationType}
                  onValueChange={(value) =>
                    setCreateForm((prev) => ({ ...prev, resignationType: value }))
                  }
                >
                  <SelectTrigger className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="VOLUNTARY">主动离职</SelectItem>
                    <SelectItem value="INVOLUNTARY">被动离职</SelectItem>
                    <SelectItem value="CONTRACT_EXPIRY">合同到期</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">预计离职日期</Label>
                <DatePicker
                  type="date"
                  value={createForm.expectedDate}
                  onChange={(event) =>
                    setCreateForm((prev) => ({ ...prev, expectedDate: event.target.value }))
                  }
                  className="h-11"
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">离职原因</Label>
                <Textarea
                  rows={5}
                  value={createForm.resignationReason || ''}
                  onChange={(event) =>
                    setCreateForm((prev) => ({ ...prev, resignationReason: event.target.value }))
                  }
                  placeholder="例如：个人发展方向调整，计划在月底前完成交接"
                />
              </div>
            </div>
          </DialogSection>
        </div>
      </BaseDialog>
    </div>
  );
};

export default HrResignationPage;
