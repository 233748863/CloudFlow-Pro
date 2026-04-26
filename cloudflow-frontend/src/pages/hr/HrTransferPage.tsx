import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRightLeft, FilePlus2, RefreshCcw, Search } from 'lucide-react';
import { toast } from 'sonner';
import { BaseDialog } from '@/components/common/BaseDialog';
import { TablePageLayout } from '@/components/layout/TablePageLayout';
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
} from '@/components/ui';
import {
  approveTransfer,
  createTransferApplication,
  effectiveTransfer,
  getDeptTreeOptions,
  getPositionOptions,
  getPostOptions,
  getTransferApplication,
  HrEmployee,
  listEmployees,
  listTransferByEmployee,
  PositionOption,
  PostOption,
  submitTransferApplication,
  TransferApplication,
  TransferApplicationPayload,
} from '@/services/api/hr';
import {
  buildEmployeeLabel,
  flattenDeptTree,
  hasWorkflowStatus,
  matchEmployeeKeyword,
  normalizeRows,
  toDateInputValue,
} from './hrShared';

const EMPTY_VALUE = '__empty__';

const defaultForm: TransferApplicationPayload = {
  employeeId: 0,
  toDeptId: 0,
  toPostId: 0,
  toPositionId: undefined,
  transferType: 'DEPT',
  reason: '',
  effectiveDate: '',
  salaryChange: false,
};

const getDefaultPositionId = (postId: number, positions: PositionOption[]) =>
  positions.find((option) => !postId || option.postId === postId)?.id;

const transferStatusClass = (status?: string) => {
  if (!status) {
    return 'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300';
  }
  if (/(APPROV|EFFECT|COMPLETE|SUCCESS)/i.test(status)) {
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

const isTransferCreatableEmployee = (employee?: HrEmployee | null) =>
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

const hasOpenTransferApplication = (application?: TransferApplication | null) =>
  ['DRAFT', 'APPROVING', 'APPROVED'].includes(String(application?.status || '').toUpperCase());

const getTransferActionHint = (status?: string) => {
  switch (String(status || '').toUpperCase()) {
    case 'DRAFT':
      return '下一步：提交调岗申请';
    case 'APPROVING':
      return '下一步：审批当前申请';
    case 'APPROVED':
      return '下一步：执行调岗生效';
    case 'EFFECTIVE':
      return '流程完成，组织信息已更新';
    default:
      return '查看详情并核对调岗信息';
  }
};

const getPreferredApplicationId = (
  rows: TransferApplication[],
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
      <ArrowRightLeft className="h-4 w-4" />
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

export const HrTransferPage: React.FC = () => {
  const [employees, setEmployees] = useState<HrEmployee[]>([]);
  const [deptOptions, setDeptOptions] = useState<Array<{ label: string; value: number }>>([]);
  const [postOptions, setPostOptions] = useState<PostOption[]>([]);
  const [positionOptions, setPositionOptions] = useState<PositionOption[]>([]);
  const [employeeKeyword, setEmployeeKeyword] = useState('');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [applications, setApplications] = useState<TransferApplication[]>([]);
  const [detail, setDetail] = useState<TransferApplication | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createForm, setCreateForm] = useState<TransferApplicationPayload>(defaultForm);

  const buildCreateForm = (
    employeeId: number,
    deptId = deptOptions[0]?.value || 0,
    postId = postOptions[0]?.postId || 0,
  ): TransferApplicationPayload => ({
    ...defaultForm,
    employeeId,
    toDeptId: deptId,
    toPostId: postId,
    toPositionId: getDefaultPositionId(postId, positionOptions),
  });

  const loadBootstrapData = async () => {
    setLoading(true);
    try {
      const [employeeRes, deptRes, postRes, positionRes] = await Promise.all([
        listEmployees({ pageNum: 1, pageSize: 200 }),
        getDeptTreeOptions(),
        getPostOptions(),
        getPositionOptions(),
      ]);

      const employeeList = normalizeRows<HrEmployee>(employeeRes);
      const deptList = flattenDeptTree(Array.isArray(deptRes) ? deptRes : []);
      const postList = normalizeRows<PostOption>(postRes);
      const positionList = Array.isArray(positionRes) ? positionRes : [];

      setEmployees(employeeList);
      setDeptOptions(deptList);
      setPostOptions(postList);
      setPositionOptions(positionList);

      setCreateForm((prev) => ({
        ...prev,
        employeeId: prev.employeeId || employeeList[0]?.id || 0,
        toDeptId: prev.toDeptId || deptList[0]?.value || 0,
        toPostId: prev.toPostId || postList[0]?.postId || 0,
        toPositionId:
          prev.toPositionId
          && positionList.some(
            (option) =>
              option.id === prev.toPositionId
              && option.postId === (prev.toPostId || postList[0]?.postId || 0),
          )
            ? prev.toPositionId
            : getDefaultPositionId(prev.toPostId || postList[0]?.postId || 0, positionList),
      }));
    } catch (error) {
      console.error(error);
      toast.error('调岗基础数据加载失败');
    } finally {
      setLoading(false);
    }
  };

  const loadDetail = async (id: number) => {
    setDetailLoading(true);
    try {
      const detailRes = await getTransferApplication(id);
      setDetail(detailRes);
    } catch (error) {
      console.error(error);
      toast.error('调岗申请详情加载失败');
    } finally {
      setDetailLoading(false);
    }
  };

  const loadApplications = async (employeeId: number, preferredId?: number) => {
    setListLoading(true);
    try {
      const applicationRes = await listTransferByEmployee(employeeId);
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
        return;
      }

      await loadDetail(nextId);
    } catch (error) {
      console.error(error);
      setApplications([]);
      setDetail(null);
      toast.error('调岗申请列表加载失败');
    } finally {
      setListLoading(false);
    }
  };

  const handleRefreshCurrentEmployee = async () => {
    await loadBootstrapData();

    if (selectedEmployeeId) {
      await loadApplications(Number(selectedEmployeeId), detail?.id);
    }
  };

  useEffect(() => {
    void loadBootstrapData();
  }, []);

  const filteredEmployees = useMemo(
    () => employees.filter((employee) => matchEmployeeKeyword(employee, employeeKeyword)),
    [employees, employeeKeyword],
  );

  const creatableFilteredEmployees = useMemo(
    () => filteredEmployees.filter((employee) => isTransferCreatableEmployee(employee)),
    [filteredEmployees],
  );

  useEffect(() => {
    if (!filteredEmployees.length) {
      setSelectedEmployeeId('');
      setApplications([]);
      setDetail(null);
      return;
    }

    // 搜索结果变化后优先聚焦仍可发起流程的员工，避免每次都回到无效数据上。
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
      return;
    }

    void loadApplications(Number(selectedEmployeeId));
  }, [selectedEmployeeId]);

  const selectedEmployee = useMemo(
    () => employees.find((item) => String(item.id) === selectedEmployeeId) || null,
    [employees, selectedEmployeeId],
  );

  const creatableEmployees = useMemo(
    () => employees.filter((employee) => isTransferCreatableEmployee(employee)),
    [employees],
  );

  const actionableCount = useMemo(
    () =>
      applications.filter((item) =>
        ['DRAFT', 'APPROVING', 'APPROVED'].includes(String(item.status || '').toUpperCase()),
      ).length,
    [applications],
  );

  const salaryChangeCount = useMemo(
    () => applications.filter((item) => Boolean(item.salaryChange)).length,
    [applications],
  );

  const effectiveCount = useMemo(
    () => applications.filter((item) => hasWorkflowStatus(item.status, 'EFFECTIVE')).length,
    [applications],
  );

  const canSubmitDetail = hasWorkflowStatus(detail?.status, 'DRAFT');
  const canApproveDetail = hasWorkflowStatus(detail?.status, 'APPROVING');
  const canEffectiveDetail = hasWorkflowStatus(detail?.status, 'APPROVED');
  const selectedEmployeeCanCreate = isTransferCreatableEmployee(selectedEmployee);
  const selectedEmployeeHasOpenTransfer = useMemo(
    () => applications.some((item) => hasOpenTransferApplication(item)),
    [applications],
  );

  const defaultCreateEmployee = useMemo(
    () =>
      (selectedEmployeeCanCreate && !selectedEmployeeHasOpenTransfer ? selectedEmployee : null)
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
      selectedEmployeeHasOpenTransfer,
    ],
  );

  const defaultCreateEmployeeId = defaultCreateEmployee?.id || 0;

  const filteredPositionOptions = useMemo(
    () =>
      positionOptions.filter(
        (option) => !createForm.toPostId || option.postId === createForm.toPostId,
      ),
    [createForm.toPostId, positionOptions],
  );

  useEffect(() => {
    // 目标岗位变更后，职位必须立即收敛到该岗位下的真实可选项，避免拼出错误组合。
    if (
      createForm.toPositionId
      && filteredPositionOptions.some((option) => option.id === createForm.toPositionId)
    ) {
      return;
    }

    const nextPositionId = getDefaultPositionId(createForm.toPostId, filteredPositionOptions);
    if (createForm.toPositionId !== nextPositionId) {
      setCreateForm((prev) => ({
        ...prev,
        toPositionId: nextPositionId,
      }));
    }
  }, [createForm.toPositionId, createForm.toPostId, filteredPositionOptions]);

  const resetCreateDialog = () => {
    setCreateForm(buildCreateForm(defaultCreateEmployeeId));
    setCreateDialogOpen(false);
  };

  const handleOpenCreate = () => {
    if (!creatableEmployees.length) {
      toast.error('暂无可发起调岗申请的在职员工');
      return;
    }

    setCreateForm(buildCreateForm(defaultCreateEmployeeId));
    setCreateDialogOpen(true);
  };

  const handleCreate = async () => {
    const targetEmployee = employees.find((item) => item.id === createForm.employeeId);

    if (!createForm.employeeId) {
      toast.error('请先选择员工');
      return;
    }
    if (!isTransferCreatableEmployee(targetEmployee)) {
      toast.error('已离职员工不能新建调岗申请');
      return;
    }
    if (!createForm.toDeptId || !createForm.toPostId) {
      toast.error('请完整选择目标部门和岗位');
      return;
    }
    if (!createForm.effectiveDate) {
      toast.error('请填写生效日期');
      return;
    }

    setPendingAction('create');
    try {
      const id = await createTransferApplication({
        ...createForm,
        toPositionId: createForm.toPositionId || undefined,
      });
      toast.success(`调岗申请已创建，申请 ID：${id}`);
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
      toast.error(error?.message || '创建调岗申请失败');
    } finally {
      setPendingAction(null);
    }
  };

  const handleSubmit = async (id: number) => {
    setPendingAction(`submit-${id}`);
    try {
      await submitTransferApplication(id);
      toast.success('调岗申请已提交');

      if (selectedEmployeeId) {
        await loadApplications(Number(selectedEmployeeId), id);
      }
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || '提交调岗申请失败');
    } finally {
      setPendingAction(null);
    }
  };

  const handleApprove = async (id: number) => {
    setPendingAction('approve');
    try {
      await approveTransfer(id);
      toast.success('调岗申请已审批通过');

      if (selectedEmployeeId) {
        await handleRefreshCurrentEmployee();
      }
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || '审批调岗申请失败');
    } finally {
      setPendingAction(null);
    }
  };

  const handleEffective = async (id: number) => {
    setPendingAction('effective');
    try {
      await effectiveTransfer(id);
      toast.success('调岗已生效');

      if (selectedEmployeeId) {
        await handleRefreshCurrentEmployee();
      }
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || '调岗生效失败');
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="min-w-0">
        <div className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
          <ArrowRightLeft className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-300" />
          Transfer Flow
        </div>
        <h1 className="mt-1.5 text-[26px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          调岗申请
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
          已生效 {selectedEmployee ? effectiveCount : '--'}
        </span>
        <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          涉及调薪 {selectedEmployee ? salaryChangeCount : '--'}
        </span>

        <div className="ml-auto flex flex-wrap gap-2">
          <Button size="sm" onClick={handleOpenCreate} disabled={!creatableEmployees.length}>
            <FilePlus2 size={14} className="mr-1.5" />
            新建调岗申请
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
                  先定位员工，再持续处理该员工的调岗流程。
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
                      默认聚焦最近且仍可推进的调岗记录。
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
                      当前职位：{selectedEmployee.positionName || '未维护'}
                    </div>
                    {!selectedEmployeeCanCreate ? (
                      <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400">
                        当前员工已离职，仅建议查看历史申请；新建时会自动切到仍可发起的在职员工。
                      </div>
                    ) : null}
                    {selectedEmployeeHasOpenTransfer ? (
                      <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                        当前员工已有待处理调岗申请。新建时会优先切到其他可发起员工，避免重复发起。
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {listLoading ? (
                  <InlineState title="正在加载调岗申请..." className="py-12" />
                ) : applications.length === 0 ? (
                  <InlineState
                    title={selectedEmployee ? '该员工暂无调岗申请' : '先从左侧选择员工'}
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
                              transferStatusClass(item.status),
                            ].join(' ')}
                          >
                            {item.statusDesc || item.status}
                          </span>
                        </div>
                        <div className="mt-3 space-y-2 text-xs text-slate-500 dark:text-slate-400">
                          <div>
                            <span className="text-slate-400 dark:text-slate-500">组织变更</span>
                            <div className="mt-1 flex items-center gap-2">
                              <span className="truncate">
                                {[item.fromDeptName, item.fromPostName, item.fromPositionName]
                                  .filter(Boolean)
                                  .join(' / ') || '-'}
                              </span>
                              <ArrowRightLeft className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-500" />
                              <span className="truncate">
                                {[item.toDeptName, item.toPostName, item.toPositionName]
                                  .filter(Boolean)
                                  .join(' / ') || '-'}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span>生效日期：{toDateInputValue(item.effectiveDate) || '-'}</span>
                            <span>{item.salaryChange ? '涉及调薪' : '不涉及调薪'}</span>
                          </div>
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-3">
                          <div className="text-xs text-slate-400 dark:text-slate-500">
                            {getTransferActionHint(item.status)}
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
                    详情区直接核对原组织、目标组织和流程状态，并原位办理审批与生效。
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
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!canEffectiveDetail || Boolean(pendingAction)}
                      onClick={() => void handleEffective(detail.id)}
                    >
                      {pendingAction === 'effective' ? '生效中...' : '调岗生效'}
                    </Button>
                  </div>
                ) : null}
              </div>

              {!detail ? (
                <InlineState
                  title="请选择一条调岗申请"
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
                            transferStatusClass(detail.status),
                          ].join(' ')}
                        >
                          {detail.statusDesc || detail.status}
                        </span>
                      )}
                    />
                    <DetailRow label="状态提示" value={getTransferActionHint(detail.status)} />
                    <DetailRow
                      label="调岗类型"
                      value={detail.transferTypeDesc || detail.transferType}
                    />
                    <DetailRow
                      label="生效日期"
                      value={toDateInputValue(detail.effectiveDate) || '-'}
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
                      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">组织变更</div>
                    </div>
                    <div className="grid grid-cols-1 gap-4 p-4 xl:grid-cols-2">
                      <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-900/40">
                        <div className="text-xs text-slate-400 dark:text-slate-500">原组织</div>
                        <div className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {detail.fromDeptName || '-'}
                        </div>
                        <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                          {[detail.fromPostName, detail.fromPositionName].filter(Boolean).join(' / ') || '-'}
                        </div>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-900/40">
                        <div className="text-xs text-slate-400 dark:text-slate-500">目标组织</div>
                        <div className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {detail.toDeptName || '-'}
                        </div>
                        <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                          {[detail.toPostName, detail.toPositionName].filter(Boolean).join(' / ') || '-'}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
                    <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
                      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">调岗信息</div>
                    </div>
                    <div className="space-y-4 p-4">
                      {hasWorkflowStatus(detail.status, 'APPROVED') ? (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                          当前申请已审批通过，但还未执行生效；只有点击“调岗生效”后，员工组织信息才会真正更新。
                        </div>
                      ) : null}

                      {detail.salaryChange ? (
                        <div className="rounded-xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm leading-6 text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-200">
                          当前记录标记为“涉及调薪”。调岗生效后不会自动创建调薪申请，仍需到薪酬链路继续处理。
                        </div>
                      ) : (
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
                          当前记录不涉及调薪，只会更新组织任职信息。
                        </div>
                      )}

                      <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-900/40">
                        <div className="text-xs text-slate-400 dark:text-slate-500">调岗原因</div>
                        <div className="mt-2 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">
                          {detail.reason || '-'}
                        </div>
                      </div>
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
        title="新建调岗申请"
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
            title="员工与目标组织"
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
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">目标部门</Label>
                <Select
                  value={createForm.toDeptId ? String(createForm.toDeptId) : undefined}
                  onValueChange={(value) =>
                    setCreateForm((prev) => ({ ...prev, toDeptId: Number(value) }))
                  }
                >
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="请选择目标部门" />
                  </SelectTrigger>
                  <SelectContent>
                    {deptOptions.map((option) => (
                      <SelectItem key={option.value} value={String(option.value)}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">目标岗位</Label>
                <Select
                  value={createForm.toPostId ? String(createForm.toPostId) : undefined}
                  onValueChange={(value) =>
                    setCreateForm((prev) => ({ ...prev, toPostId: Number(value) }))
                  }
                >
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="请选择目标岗位" />
                  </SelectTrigger>
                  <SelectContent>
                    {postOptions.map((option) => (
                      <SelectItem key={option.postId} value={String(option.postId)}>
                        {option.postName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">目标职位</Label>
                <Select
                  value={createForm.toPositionId ? String(createForm.toPositionId) : EMPTY_VALUE}
                  onValueChange={(value) =>
                    setCreateForm((prev) => ({
                      ...prev,
                      toPositionId: value === EMPTY_VALUE ? undefined : Number(value),
                    }))
                  }
                >
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="可选：请选择职位" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={EMPTY_VALUE}>暂不指定职位</SelectItem>
                    {filteredPositionOptions.map((option) => (
                      <SelectItem key={option.id} value={String(option.id)}>
                        {option.positionName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">调岗类型</Label>
                <Select
                  value={createForm.transferType}
                  onValueChange={(value) =>
                    setCreateForm((prev) => ({ ...prev, transferType: value }))
                  }
                >
                  <SelectTrigger className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DEPT">部门调动</SelectItem>
                    <SelectItem value="POST">岗位调整</SelectItem>
                    <SelectItem value="PROMOTION">晋升</SelectItem>
                    <SelectItem value="DEMOTION">降级</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">生效日期</Label>
                <Input
                  type="date"
                  value={createForm.effectiveDate}
                  onChange={(event) =>
                    setCreateForm((prev) => ({ ...prev, effectiveDate: event.target.value }))
                  }
                  className="h-11"
                />
              </div>
            </div>
          </DialogSection>

          <DialogSection
            title="流程补充"
          >
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-4 dark:border-slate-800 dark:bg-slate-950/88">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">涉及调薪</div>
                    <div className="mt-1 text-xs leading-6 text-slate-500 dark:text-slate-400">
                      打开后会按真实布尔字段提交 `salaryChange`，后续仍需到薪酬模块继续处理。
                    </div>
                  </div>
                  <Switch
                    checked={Boolean(createForm.salaryChange)}
                    onCheckedChange={(checked) =>
                      setCreateForm((prev) => ({ ...prev, salaryChange: checked }))
                    }
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">调岗原因</Label>
                <Textarea
                  rows={5}
                  value={createForm.reason || ''}
                  onChange={(event) =>
                    setCreateForm((prev) => ({ ...prev, reason: event.target.value }))
                  }
                  placeholder="例如：组织调整后转入新部门，职责重心同步切换"
                />
              </div>
            </div>
          </DialogSection>
        </div>
      </BaseDialog>
    </div>
  );
};

export default HrTransferPage;
