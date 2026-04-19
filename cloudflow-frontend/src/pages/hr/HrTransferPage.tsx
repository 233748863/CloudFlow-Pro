import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRightLeft, FilePlus2, RefreshCcw, Search, Users } from 'lucide-react';
import { toast } from 'sonner';
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
import { WorkspaceDialogShell, WorkspaceHeroCard, WorkspaceMetricCard, WorkspaceSectionCard } from '@/components/workspace/WorkspacePanels';
import { WorkspaceInlineState } from '@/components/workspace/WorkspacePrimitives';
import {
  approveTransfer,
  effectiveTransfer,
  HrEmployee,
  PostOption,
  PositionOption,
  TransferApplication,
  TransferApplicationPayload,
  createTransferApplication,
  getDeptTreeOptions,
  getPostOptions,
  getPositionOptions,
  getTransferApplication,
  listEmployees,
  listTransferByEmployee,
  submitTransferApplication,
} from '@/services/api/hr';
import { buildEmployeeLabel, flattenDeptTree, hasWorkflowStatus, matchEmployeeKeyword, normalizeRows, toDateInputValue } from './hrShared';

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
  positions.find(option => !postId || option.postId === postId)?.id;

const transferStatusClass = (status?: string) => {
  if (!status) return 'bg-slate-100 text-slate-700';
  if (/(APPROV|EFFECT|COMPLETE|SUCCESS)/i.test(status)) return 'bg-emerald-50 text-emerald-700';
  if (/(DRAFT|PENDING|SUBMIT)/i.test(status)) return 'bg-amber-50 text-amber-700';
  if (/(REJECT|FAIL)/i.test(status)) return 'bg-rose-50 text-rose-700';
  return 'bg-slate-100 text-slate-700';
};

const isTransferCreatableEmployee = (employee?: HrEmployee | null) => String(employee?.employeeStatus || '').toUpperCase() !== 'RESIGNED';

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
  if (preferredId && rows.some(item => item.id === preferredId)) {
    return preferredId;
  }

  if (currentDetailId && rows.some(item => item.id === currentDetailId)) {
    return currentDetailId;
  }

  return rows.find(item => ['DRAFT', 'APPROVING', 'APPROVED'].includes(String(item.status || '').toUpperCase()))?.id
    || rows[0]?.id;
};

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

      setCreateForm(prev => ({
        ...prev,
        employeeId: prev.employeeId || employeeList[0]?.id || 0,
        toDeptId: prev.toDeptId || deptList[0]?.value || 0,
        toPostId: prev.toPostId || postList[0]?.postId || 0,
        toPositionId:
          prev.toPositionId && positionList.some(option => option.id === prev.toPositionId && option.postId === (prev.toPostId || postList[0]?.postId || 0))
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

  useEffect(() => {
    void loadBootstrapData();
  }, []);

  const handleRefreshCurrentEmployee = async () => {
    await loadBootstrapData();

    if (selectedEmployeeId) {
      await loadApplications(Number(selectedEmployeeId), detail?.id);
    }
  };

  const filteredEmployees = useMemo(
    () => employees.filter(employee => matchEmployeeKeyword(employee, employeeKeyword)),
    [employees, employeeKeyword],
  );

  const creatableFilteredEmployees = useMemo(
    () => filteredEmployees.filter(employee => isTransferCreatableEmployee(employee)),
    [filteredEmployees],
  );

  useEffect(() => {
    if (!filteredEmployees.length) {
      setSelectedEmployeeId('');
      setApplications([]);
      setDetail(null);
      return;
    }

    // 搜索结果变化后自动聚焦第一位员工，减少桌面端重复选择动作。
    if (!selectedEmployeeId || !filteredEmployees.some(item => String(item.id) === selectedEmployeeId)) {
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
    () => employees.find(item => String(item.id) === selectedEmployeeId) || null,
    [employees, selectedEmployeeId],
  );
  // 调岗创建时过滤掉已离职员工，避免前端可选但后端必拒的联调断点。
  const creatableEmployees = useMemo(
    () => employees.filter(employee => isTransferCreatableEmployee(employee)),
    [employees],
  );

  const salaryChangeCount = useMemo(
    () => applications.filter(item => Boolean(item.salaryChange)).length,
    [applications],
  );
  const actionableCount = useMemo(
    () => applications.filter(item => ['DRAFT', 'APPROVING', 'APPROVED'].includes(String(item.status || '').toUpperCase())).length,
    [applications],
  );
  const canSubmitDetail = hasWorkflowStatus(detail?.status, 'DRAFT');
  const canApproveDetail = hasWorkflowStatus(detail?.status, 'APPROVING');
  const canEffectiveDetail = hasWorkflowStatus(detail?.status, 'APPROVED');
  const selectedEmployeeCanCreate = isTransferCreatableEmployee(selectedEmployee);
  const selectedEmployeeHasOpenTransfer = useMemo(
    () => applications.some(item => hasOpenTransferApplication(item)),
    [applications],
  );
  const defaultCreateEmployee = useMemo(
    () =>
      (selectedEmployeeCanCreate && !selectedEmployeeHasOpenTransfer ? selectedEmployee : null)
      || creatableFilteredEmployees.find(employee => employee.id !== selectedEmployee?.id)
      || creatableEmployees.find(employee => employee.id !== selectedEmployee?.id)
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
    () => positionOptions.filter(option => !createForm.toPostId || option.postId === createForm.toPostId),
    [createForm.toPostId, positionOptions],
  );

  useEffect(() => {
    // 目标岗位变化后，自动把职位收敛到该岗位下的真实可选项，避免前端拼出错误组合。
    if (createForm.toPositionId && filteredPositionOptions.some(option => option.id === createForm.toPositionId)) {
      return;
    }

    const nextPositionId = getDefaultPositionId(createForm.toPostId, filteredPositionOptions);
    if (createForm.toPositionId !== nextPositionId) {
      setCreateForm(prev => ({
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
    const targetEmployee = employees.find(item => item.id === createForm.employeeId);
    if (!isTransferCreatableEmployee(targetEmployee)) {
      toast.error('已离职员工不能新建调岗申请');
      return;
    }

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
    }
  };

  const handleSubmit = async (id: number) => {
    try {
      await submitTransferApplication(id);
      toast.success('调岗申请已提交');

      if (selectedEmployeeId) {
        await loadApplications(Number(selectedEmployeeId), id);
      }
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || '提交调岗申请失败');
    }
  };

  const handleApprove = async (id: number) => {
    try {
      await approveTransfer(id);
      toast.success('调岗申请已审批通过');

      if (selectedEmployeeId) {
        await handleRefreshCurrentEmployee();
      }
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || '审批调岗申请失败');
    }
  };

  const handleEffective = async (id: number) => {
    try {
      await effectiveTransfer(id);
      toast.success('调岗已生效');

      if (selectedEmployeeId) {
        await handleRefreshCurrentEmployee();
      }
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || '调岗生效失败');
    }
  };

  return (
    <div className="space-y-6">
      <WorkspaceHeroCard
        badge={(
          <div className="inline-flex items-center gap-2 rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">
            <ArrowRightLeft size={14} />
            Transfer Flow
          </div>
        )}
        title="调岗申请中心"
        description="左侧锁定员工，中间切换申请，右侧持续推进审批与生效，减少桌面端操作折返。"
        actions={(
          <>
            <Button className="rounded-lg" onClick={handleOpenCreate} disabled={!creatableEmployees.length}>
              <FilePlus2 size={16} className="mr-2" />
              新建调岗申请
            </Button>
            <Button variant="outline" className="rounded-lg" onClick={() => void handleRefreshCurrentEmployee()}>
              <RefreshCcw size={16} className="mr-2" />
              刷新当前数据
            </Button>
          </>
        )}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <WorkspaceMetricCard
          label="命中员工"
          value={loading ? '--' : filteredEmployees.length}
          hint="当前关键词筛出的员工数量"
        />
        <WorkspaceMetricCard
          label="当前员工申请"
          value={selectedEmployee ? applications.length : '--'}
          hint={selectedEmployee ? `${selectedEmployee.name} 的调岗记录` : '先从左侧选择员工'}
        />
        <WorkspaceMetricCard
          label="待推进申请"
          value={selectedEmployee ? actionableCount : '--'}
          hint={selectedEmployee ? `其中 ${salaryChangeCount} 条涉及薪资变更` : '等待选择员工'}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[320px_360px_minmax(0,1fr)]">
        <WorkspaceSectionCard
          title="员工列表"
          description="先定位员工，再处理该员工的调岗申请和生效动作。"
        >
          <div className="space-y-4">
            <div className="relative">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                className="pl-10"
                placeholder="搜索姓名、工号、部门"
                value={employeeKeyword}
                onChange={event => setEmployeeKeyword(event.target.value)}
              />
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              搜索命中后会自动聚焦首位员工，方便开发时快速轮询不同人的真实调岗数据。
            </div>
            <div className="space-y-3">
              {filteredEmployees.map(employee => {
                const active = String(employee.id) === selectedEmployeeId;

                return (
                  <button
                    key={employee.id}
                    type="button"
                    className={`w-full rounded-2xl border px-4 py-4 text-left transition ${
                      active
                        ? 'border-violet-200 bg-violet-50 shadow-sm'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                    }`}
                    onClick={() => setSelectedEmployeeId(String(employee.id))}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-slate-900">{employee.name}</div>
                        <div className="mt-1 truncate text-xs text-slate-500">{buildEmployeeLabel(employee)}</div>
                      </div>
                      <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                        {getEmployeeStatusLabel(employee.employeeStatus)}
                      </span>
                    </div>
                    <div className="mt-3 text-xs text-slate-500">
                      <div className="text-slate-400">当前组织</div>
                      <div className="mt-1">{[employee.deptName, employee.postName, employee.positionName].filter(Boolean).join(' / ') || '-'}</div>
                    </div>
                  </button>
                );
              })}
              {!loading && !filteredEmployees.length && (
                <WorkspaceInlineState title="当前搜索条件下没有匹配员工" />
              )}
              {loading && (
                <WorkspaceInlineState type="loading" title="正在加载员工列表..." />
              )}
            </div>
          </div>
        </WorkspaceSectionCard>

        <WorkspaceSectionCard
          title="申请列表"
          description="优先聚焦最近申请，并默认定位到还能继续推进的单据。"
          headerAside={(
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-500 shadow-sm">
              <Users size={14} />
              {selectedEmployee ? `${applications.length} 条记录` : '等待选择员工'}
            </div>
          )}
        >

          {selectedEmployee && (
            <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm font-semibold text-slate-900">{selectedEmployee.name}</div>
              <div className="mt-1 text-xs text-slate-500">
                {[selectedEmployee.employeeNo, selectedEmployee.deptName, selectedEmployee.postName].filter(Boolean).join(' / ') || '-'}
              </div>
              <div className="mt-3 text-xs text-slate-500">当前职位：{selectedEmployee.positionName || '未维护'}</div>
              {selectedEmployeeHasOpenTransfer && (
                <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  当前员工已有待处理调岗申请。新建时页面会优先切到其他可发起员工；若仍继续提交，后端会直接拒绝。
                </div>
              )}
            </div>
          )}

          <div className="space-y-3">
            {applications.map(item => {
              const active = detail?.id === item.id;

              return (
                <div
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  className={`w-full rounded-2xl border px-4 py-4 text-left transition ${
                    active
                      ? 'border-sky-200 bg-sky-50 shadow-sm'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                  }`}
                  onClick={() => void loadDetail(item.id)}
                  onKeyDown={event => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      void loadDetail(item.id);
                    }
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-900">{item.applicationNo}</div>
                      <div className="mt-1 text-xs text-slate-500">{item.employeeName || '-'} / {item.employeeNo || '-'}</div>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${transferStatusClass(item.status)}`}>
                      {item.statusDesc || item.status}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-3 text-xs text-slate-500">
                    <div>
                      <div className="text-slate-400">目标组织</div>
                      <div className="mt-1">{[item.toDeptName, item.toPostName, item.toPositionName].filter(Boolean).join(' / ') || '-'}</div>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span>生效日期：{toDateInputValue(item.effectiveDate) || '-'}</span>
                      <span>{item.salaryChange ? '涉及薪资变更' : '不涉及薪资变更'}</span>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div className="text-xs text-slate-400">{getTransferActionHint(item.status)}</div>
                    <Button
                      size="sm"
                      type="button"
                      disabled={!hasWorkflowStatus(item.status, 'DRAFT')}
                      onClick={event => {
                        event.stopPropagation();
                        void handleSubmit(item.id);
                      }}
                    >
                      提交
                    </Button>
                  </div>
                </div>
              );
            })}

            {!applications.length && !listLoading && (
              <WorkspaceInlineState title={selectedEmployee ? '该员工暂无调岗申请' : '先从左侧选择员工'} />
            )}
            {listLoading && (
              <WorkspaceInlineState type="loading" title="正在加载调岗申请..." />
            )}
          </div>
        </WorkspaceSectionCard>

        <WorkspaceSectionCard
          title="申请详情"
          description="直接核对原组织、目标组织和调岗原因，并推进审批或生效。"
          headerAside={detail ? (
            <>
              <Button variant="outline" disabled={!canSubmitDetail} onClick={() => void handleSubmit(detail.id)}>提交当前申请</Button>
              <Button variant="outline" disabled={!canApproveDetail} onClick={() => void handleApprove(detail.id)}>审批通过</Button>
              <Button disabled={!canEffectiveDetail} onClick={() => void handleEffective(detail.id)}>调岗生效</Button>
            </>
          ) : undefined}
        >

          {!detail && (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-6 py-14 text-center text-sm text-slate-500">
              先在中间列表选择一条调岗申请，这里会展示完整详情与办理动作。
            </div>
          )}

          {detail && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="text-xs text-slate-400">申请编号</div>
                  <div className="mt-2 font-semibold text-slate-900">{detail.applicationNo}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="text-xs text-slate-400">状态</div>
                  <div className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${transferStatusClass(detail.status)}`}>
                    {detail.statusDesc || detail.status}
                  </div>
                  <div className="mt-2 text-xs text-slate-400">{getTransferActionHint(detail.status)}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="text-xs text-slate-400">生效日期</div>
                  <div className="mt-2 font-semibold text-slate-900">{toDateInputValue(detail.effectiveDate) || '-'}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="text-xs text-slate-400">员工</div>
                  <div className="mt-2 font-semibold text-slate-900">{detail.employeeName || '-'}</div>
                  <div className="mt-1 text-sm text-slate-500">{detail.employeeNo || '-'}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="text-xs text-slate-400">原组织</div>
                  <div className="mt-2 font-semibold text-slate-900">{detail.fromDeptName || '-'}</div>
                  <div className="mt-1 text-sm text-slate-500">{detail.fromPostName || '-'} / {detail.fromPositionName || '-'}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="text-xs text-slate-400">目标组织</div>
                  <div className="mt-2 font-semibold text-slate-900">{detail.toDeptName || '-'}</div>
                  <div className="mt-1 text-sm text-slate-500">{detail.toPostName || '-'} / {detail.toPositionName || '-'}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="text-xs text-slate-400">调岗类型</div>
                  <div className="mt-2 font-semibold text-slate-900">{detail.transferTypeDesc || detail.transferType}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="text-xs text-slate-400">薪资影响</div>
                  <div className="mt-2 font-semibold text-slate-900">{detail.salaryChange ? '涉及薪资变更' : '不涉及薪资变更'}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="text-xs text-slate-400">流程提示</div>
                  <div className="mt-2 text-sm text-slate-700">{getTransferActionHint(detail.status)}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4 md:col-span-2 xl:col-span-3">
                  <div className="text-xs text-slate-400">调岗原因</div>
                  <div className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{detail.reason || '-'}</div>
                </div>
              </div>

              {hasWorkflowStatus(detail.status, 'APPROVED') && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                  当前申请已审批通过，但还未执行生效。点击右上角“调岗生效”后，员工组织信息才会真正更新。
                </div>
              )}

              {detail.salaryChange && (
                <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-700">
                  当前版本里，`salaryChange` 只作为“需要后续调薪”的真实标记保存。调岗生效后不会自动创建调薪申请，仍需到薪酬模块继续处理。
                </div>
              )}
            </div>
          )}

          {detailLoading && <WorkspaceInlineState type="loading" title="正在加载调岗详情..." className="mt-4 py-4" />}
        </WorkspaceSectionCard>
      </div>

      {createDialogOpen && (
        <WorkspaceDialogShell
          title="新建调岗申请"
          description="保持和后端创建 DTO 一致，直接联调目标部门、岗位与生效日。"
          onClose={resetCreateDialog}
          maxWidthClassName="max-w-3xl"
        >

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <Label>员工</Label>
                <Select value={createForm.employeeId ? String(createForm.employeeId) : undefined} onValueChange={value => setCreateForm(prev => ({ ...prev, employeeId: Number(value) }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="请选择员工" />
                  </SelectTrigger>
                  <SelectContent>
                    {creatableEmployees.map(item => (
                      <SelectItem key={item.id} value={String(item.id)}>
                        {buildEmployeeLabel(item)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="mt-2 text-xs text-slate-500">这里只展示当前仍可发起调岗流程的在职员工。</div>
              </div>
              <div>
                <Label>目标部门</Label>
                <Select value={createForm.toDeptId ? String(createForm.toDeptId) : undefined} onValueChange={value => setCreateForm(prev => ({ ...prev, toDeptId: Number(value) }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="请选择目标部门" />
                  </SelectTrigger>
                  <SelectContent>
                    {deptOptions.map(option => (
                      <SelectItem key={option.value} value={String(option.value)}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>目标岗位</Label>
                <Select value={createForm.toPostId ? String(createForm.toPostId) : undefined} onValueChange={value => setCreateForm(prev => ({ ...prev, toPostId: Number(value) }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="请选择目标岗位" />
                  </SelectTrigger>
                  <SelectContent>
                    {postOptions.map(option => (
                      <SelectItem key={option.postId} value={String(option.postId)}>
                        {option.postName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>目标职位</Label>
                <Select
                  value={createForm.toPositionId ? String(createForm.toPositionId) : EMPTY_VALUE}
                  onValueChange={value => setCreateForm(prev => ({
                    ...prev,
                    toPositionId: value === EMPTY_VALUE ? undefined : Number(value),
                  }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="可选：请选择职位" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={EMPTY_VALUE}>暂不指定职位</SelectItem>
                    {filteredPositionOptions.map(option => (
                      <SelectItem key={option.id} value={String(option.id)}>
                        {option.positionName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="mt-2 text-xs text-slate-500">职位选项会随目标岗位联动，避免提交出不匹配的岗位与职位。</div>
              </div>
              <div>
                <Label>调岗类型</Label>
                <Select value={createForm.transferType} onValueChange={value => setCreateForm(prev => ({ ...prev, transferType: value }))}>
                  <SelectTrigger>
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
              <div>
                <Label>生效日期</Label>
                <Input type="date" value={createForm.effectiveDate} onChange={event => setCreateForm(prev => ({ ...prev, effectiveDate: event.target.value }))} />
              </div>
              <div className="md:col-span-2 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-slate-900">是否涉及薪资变更</div>
                    <div className="mt-1 text-sm text-slate-500">打开后会把 `salaryChange` 按真实布尔字段提交，调岗生效后仍需去薪酬模块继续发起调薪。</div>
                  </div>
                  <Switch checked={Boolean(createForm.salaryChange)} onCheckedChange={checked => setCreateForm(prev => ({ ...prev, salaryChange: checked }))} />
                </div>
              </div>
              <div className="md:col-span-2">
                <Label>调岗原因</Label>
                <Textarea value={createForm.reason || ''} onChange={event => setCreateForm(prev => ({ ...prev, reason: event.target.value }))} />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <Button variant="outline" onClick={resetCreateDialog}>取消</Button>
              <Button onClick={() => void handleCreate()}>创建申请</Button>
            </div>
        </WorkspaceDialogShell>
      )}
    </div>
  );
};

export default HrTransferPage;
