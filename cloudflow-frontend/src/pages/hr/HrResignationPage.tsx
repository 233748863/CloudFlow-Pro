import React, { useEffect, useMemo, useState } from 'react';
import { FilePlus2, LogOut, RefreshCcw, Search, Users } from 'lucide-react';
import { toast } from 'sonner';
import {
  Button,
  Card,
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
} from '@/components/ui';
import {
  approveResignation,
  HrEmployee,
  ResignationApplication,
  ResignationApplicationPayload,
  ResignationHandover,
  completeResignationHandover,
  conductExitInterview,
  confirmResignation,
  createResignationApplication,
  getResignationApplication,
  listEmployees,
  listResignationByEmployee,
  listResignationHandovers,
  submitResignationApplication,
} from '@/services/api/hr';
import { buildEmployeeLabel, hasWorkflowStatus, matchEmployeeKeyword, normalizeRows, toDateInputValue } from './hrShared';

const defaultForm: ResignationApplicationPayload = {
  employeeId: 0,
  resignationType: 'VOLUNTARY',
  resignationReason: '',
  expectedDate: '',
};

const resignationStatusClass = (status?: string) => {
  if (!status) return 'bg-slate-100 text-slate-700';
  if (/(CONFIRM|COMPLETE|SUCCESS)/i.test(status)) return 'bg-emerald-50 text-emerald-700';
  if (/(DRAFT|PENDING|SUBMIT|HANDOVER)/i.test(status)) return 'bg-amber-50 text-amber-700';
  if (/(REJECT|FAIL)/i.test(status)) return 'bg-rose-50 text-rose-700';
  return 'bg-slate-100 text-slate-700';
};

const handoverStatusClass = (status?: string) => {
  if (!status) return 'bg-slate-100 text-slate-700';
  if (/(COMPLETE|DONE|FINISH)/i.test(status)) return 'bg-emerald-50 text-emerald-700';
  return 'bg-blue-50 text-blue-700';
};

const isHandoverCompleted = (status?: string) => /(COMPLETE|DONE|FINISH)/i.test(status || '');
const isResignationCreatableEmployee = (employee?: HrEmployee | null) => String(employee?.employeeStatus || '').toUpperCase() !== 'RESIGNED';

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
  if (preferredId && rows.some(item => item.id === preferredId)) {
    return preferredId;
  }

  if (currentDetailId && rows.some(item => item.id === currentDetailId)) {
    return currentDetailId;
  }

  return rows.find(item => ['DRAFT', 'APPROVING', 'APPROVED'].includes(String(item.status || '').toUpperCase()))?.id
    || rows[0]?.id;
};

export const HrResignationPage: React.FC = () => {
  const [employees, setEmployees] = useState<HrEmployee[]>([]);
  const [employeeKeyword, setEmployeeKeyword] = useState('');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
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
      setConfirmDate(toDateInputValue(detailRes.actualDate) || toDateInputValue(detailRes.expectedDate));
    } catch (error) {
      console.error(error);
      toast.error('离职详情加载失败');
    } finally {
      setDetailLoading(false);
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
    () => employees.filter(employee => matchEmployeeKeyword(employee, employeeKeyword)),
    [employees, employeeKeyword],
  );

  const creatableFilteredEmployees = useMemo(
    () => filteredEmployees.filter(employee => isResignationCreatableEmployee(employee)),
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

    // 搜索结果变化后自动聚焦第一位员工，减少桌面端重复切换成本。
    if (!selectedEmployeeId || !filteredEmployees.some(item => String(item.id) === selectedEmployeeId)) {
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
    () => employees.find(item => String(item.id) === selectedEmployeeId) || null,
    [employees, selectedEmployeeId],
  );
  // 创建申请时过滤掉已离职员工，避免真实联调时直接命中后端业务校验。
  const creatableEmployees = useMemo(
    () => employees.filter(employee => isResignationCreatableEmployee(employee)),
    [employees],
  );

  const pendingHandoverCount = useMemo(
    () => handovers.filter(item => !isHandoverCompleted(item.status)).length,
    [handovers],
  );
  const actionableCount = useMemo(
    () => applications.filter(item => ['DRAFT', 'APPROVING', 'APPROVED'].includes(String(item.status || '').toUpperCase())).length,
    [applications],
  );
  const canSubmitDetail = hasWorkflowStatus(detail?.status, 'DRAFT');
  const canApproveDetail = hasWorkflowStatus(detail?.status, 'APPROVING');
  const canConfirmDetail = hasWorkflowStatus(detail?.status, 'APPROVED') && pendingHandoverCount === 0;
  const canSaveInterview = detail ? !hasWorkflowStatus(detail.status, 'COMPLETED') : false;
  const selectedEmployeeCanCreate = isResignationCreatableEmployee(selectedEmployee);
  const selectedEmployeeHasOpenResignation = useMemo(
    () => applications.some(item => hasOpenResignationApplication(item)),
    [applications],
  );
  const defaultCreateEmployee = useMemo(
    () =>
      (selectedEmployeeCanCreate && !selectedEmployeeHasOpenResignation ? selectedEmployee : null)
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
    const targetEmployee = employees.find(item => item.id === createForm.employeeId);
    if (!isResignationCreatableEmployee(targetEmployee)) {
      toast.error('已离职员工不能新建离职申请');
      return;
    }

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
    }
  };

  const handleSubmit = async (id: number) => {
    try {
      await submitResignationApplication(id);
      toast.success('离职申请已提交');

      if (selectedEmployeeId) {
        await loadApplications(Number(selectedEmployeeId), id);
      }
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || '提交离职申请失败');
    }
  };

  const handleSaveInterview = async () => {
    if (!detail) return;

    try {
      await conductExitInterview(detail.id, interviewContent);
      toast.success('离职面谈已记录');
      await loadDetail(detail.id);
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || '保存离职面谈失败');
    }
  };

  const handleApprove = async (id: number) => {
    try {
      await approveResignation(id);
      toast.success('离职申请已审批通过');

      if (selectedEmployeeId) {
        await loadApplications(Number(selectedEmployeeId), id);
      }
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || '审批离职申请失败');
    }
  };

  const handleCompleteHandover = async (handoverId: number) => {
    if (!detail) return;

    try {
      await completeResignationHandover(handoverId, handoverRemarks[handoverId]);
      toast.success('交接事项已完成');
      setHandoverRemarks(prev => ({ ...prev, [handoverId]: '' }));
      await loadDetail(detail.id);
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || '完成交接失败');
    }
  };

  const handleConfirm = async () => {
    if (!detail) return;
    if (!confirmDate) {
      toast.error('请选择实际离职日期');
      return;
    }

    try {
      await confirmResignation(detail.id, confirmDate);
      toast.success('已确认离职');

      if (selectedEmployeeId) {
        await loadApplications(Number(selectedEmployeeId), detail.id);
      }

    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || '确认离职失败');
    }
  };

  return (
    <div className="space-y-6">
      <Card className="rounded-3xl border-white/80 bg-white/70 p-8 shadow-[0_12px_40px_rgba(15,23,42,0.06)] backdrop-blur-xl">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700">
              <LogOut size={14} />
              Resignation Flow
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">离职办理中心</h1>
            <p className="mt-2 text-sm text-slate-500">支持离职申请、离职面谈、交接清单和最终确认离职的桌面端闭环。</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button className="rounded-2xl" onClick={handleOpenCreate} disabled={!creatableEmployees.length}>
              <FilePlus2 size={16} className="mr-2" />
              新建离职申请
            </Button>
            <Button variant="outline" className="rounded-2xl" onClick={() => void handleRefreshCurrentEmployee()}>
              <RefreshCcw size={16} className="mr-2" />
              刷新当前数据
            </Button>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="rounded-3xl border-white/80 bg-white/70 p-6 backdrop-blur-xl">
          <div className="text-sm font-medium text-slate-500">命中员工</div>
          <div className="mt-3 text-3xl font-bold tracking-tight text-slate-900">{loading ? '--' : filteredEmployees.length}</div>
          <div className="mt-2 text-xs text-slate-400">当前关键词筛出的员工数量</div>
        </Card>
        <Card className="rounded-3xl border-white/80 bg-white/70 p-6 backdrop-blur-xl">
          <div className="text-sm font-medium text-slate-500">当前员工申请</div>
          <div className="mt-3 text-3xl font-bold tracking-tight text-slate-900">{selectedEmployee ? applications.length : '--'}</div>
          <div className="mt-2 text-xs text-slate-400">{selectedEmployee ? `${selectedEmployee.name} 的离职记录` : '先从左侧选择员工'}</div>
        </Card>
        <Card className="rounded-3xl border-white/80 bg-white/70 p-6 backdrop-blur-xl">
          <div className="text-sm font-medium text-slate-500">待推进申请</div>
          <div className="mt-3 text-3xl font-bold tracking-tight text-slate-900">{selectedEmployee ? actionableCount : '--'}</div>
          <div className="mt-2 text-xs text-slate-400">{detail ? `当前单据还有 ${pendingHandoverCount} 项交接待完成` : '等待选择员工'}</div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[320px_360px_minmax(0,1fr)]">
        <Card className="rounded-3xl border-white/80 bg-white/70 p-6 backdrop-blur-xl">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-slate-900">员工列表</h2>
            <p className="mt-1 text-sm text-slate-500">先定位员工，再连续处理该员工的离职申请、面谈和交接。</p>
          </div>

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
              搜索命中后会自动聚焦首位员工，便于快速切换不同人的离职办理进度。
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
                        ? 'border-rose-200 bg-rose-50/80 shadow-sm'
                        : 'border-slate-200 bg-white/80 hover:border-slate-300 hover:bg-slate-50'
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
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-8 text-center text-sm text-slate-400">
                  当前搜索条件下没有匹配员工
                </div>
              )}
              {loading && (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-8 text-center text-sm text-slate-400">
                  正在加载员工列表...
                </div>
              )}
            </div>
          </div>
        </Card>

        <Card className="rounded-3xl border-white/80 bg-white/70 p-6 backdrop-blur-xl">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">申请列表</h2>
              <p className="mt-1 text-sm text-slate-500">优先定位还能推进的离职单据，减少在员工维度下的来回切换。</p>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
              <Users size={14} />
              {selectedEmployee ? `${applications.length} 条记录` : '等待选择员工'}
            </div>
          </div>

          {selectedEmployee && (
            <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm font-semibold text-slate-900">{selectedEmployee.name}</div>
              <div className="mt-1 text-xs text-slate-500">
                {[selectedEmployee.employeeNo, selectedEmployee.deptName, selectedEmployee.postName].filter(Boolean).join(' / ') || '-'}
              </div>
              <div className="mt-3 text-xs text-slate-500">当前状态：{getEmployeeStatusLabel(selectedEmployee.employeeStatus)}</div>
              {selectedEmployeeHasOpenResignation && (
                <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  当前员工已有待处理离职申请。新建时页面会优先切到其他可发起员工；若仍继续提交，后端会直接拒绝。
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
                      ? 'border-sky-200 bg-sky-50/80 shadow-sm'
                      : 'border-slate-200 bg-white/80 hover:border-slate-300 hover:bg-slate-50'
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
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${resignationStatusClass(item.status)}`}>
                      {item.statusDesc || item.status}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-3 text-xs text-slate-500">
                    <div className="flex items-center justify-between gap-3">
                      <span>预计离职：{toDateInputValue(item.expectedDate) || '-'}</span>
                      <span>实际离职：{toDateInputValue(item.actualDate) || '-'}</span>
                    </div>
                    <div>{item.resignationTypeDesc || item.resignationType || '-'}</div>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div className="text-xs text-slate-400">{getResignationActionHint(item.status)}</div>
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
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-8 text-center text-sm text-slate-400">
                {selectedEmployee ? '该员工暂无离职申请' : '先从左侧选择员工'}
              </div>
            )}
            {listLoading && (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-8 text-center text-sm text-slate-400">
                正在加载离职申请...
              </div>
            )}
          </div>
        </Card>

        <Card className="rounded-3xl border-white/80 bg-white/70 p-6 backdrop-blur-xl">
          <div className="mb-4 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">申请详情与面谈</h2>
              <p className="mt-1 text-sm text-slate-500">在详情面板里完成提交、离职面谈和确认离职动作。</p>
            </div>
            {detail && (
              <div className="flex flex-wrap gap-3">
                <Button variant="outline" disabled={!canSubmitDetail} onClick={() => void handleSubmit(detail.id)}>提交当前申请</Button>
                <Button variant="outline" disabled={!canApproveDetail} onClick={() => void handleApprove(detail.id)}>审批通过</Button>
                <div className="flex gap-2">
                  <Input type="date" value={confirmDate} onChange={event => setConfirmDate(event.target.value)} />
                  <Button disabled={!canConfirmDetail} onClick={() => void handleConfirm()}>确认离职</Button>
                </div>
              </div>
            )}
          </div>

          {!detail && (
            <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50/80 px-6 py-16 text-center text-sm text-slate-500">
              先在中间列表选择一条离职申请，这里会展示完整详情与办理动作。
            </div>
          )}

          {detail && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                  <div className="text-xs text-slate-400">申请编号</div>
                  <div className="mt-2 font-semibold text-slate-900">{detail.applicationNo}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                  <div className="text-xs text-slate-400">状态</div>
                  <div className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${resignationStatusClass(detail.status)}`}>
                    {detail.statusDesc || detail.status}
                  </div>
                  <div className="mt-2 text-xs text-slate-400">{getResignationActionHint(detail.status)}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                  <div className="text-xs text-slate-400">离职类型</div>
                  <div className="mt-2 font-semibold text-slate-900">{detail.resignationTypeDesc || detail.resignationType}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                  <div className="text-xs text-slate-400">预计离职日期</div>
                  <div className="mt-2 font-semibold text-slate-900">{toDateInputValue(detail.expectedDate) || '-'}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                  <div className="text-xs text-slate-400">实际离职日期</div>
                  <div className="mt-2 font-semibold text-slate-900">{toDateInputValue(detail.actualDate) || '-'}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                  <div className="text-xs text-slate-400">员工</div>
                  <div className="mt-2 font-semibold text-slate-900">{detail.employeeName || '-'}</div>
                  <div className="mt-1 text-sm text-slate-500">{detail.employeeNo || '-'}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 md:col-span-2 xl:col-span-3">
                  <div className="text-xs text-slate-400">离职原因</div>
                  <div className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{detail.resignationReason || '-'}</div>
                </div>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white/80 p-5">
                <div className="mb-3">
                  <h3 className="text-base font-semibold text-slate-900">离职面谈</h3>
                  <p className="mt-1 text-sm text-slate-500">这里直接调用后端 `interview` 接口保存面谈内容。</p>
                </div>
                <Textarea value={interviewContent} onChange={event => setInterviewContent(event.target.value)} rows={5} disabled={!canSaveInterview} />
                <div className="mt-4 flex justify-end">
                  <Button disabled={!canSaveInterview} onClick={() => void handleSaveInterview()}>保存面谈记录</Button>
                </div>
              </div>
            </div>
          )}

          {detailLoading && <div className="mt-4 text-sm text-slate-400">正在加载离职详情...</div>}
          {detail && hasWorkflowStatus(detail.status, 'APPROVED') && pendingHandoverCount > 0 && (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              当前申请还有 {pendingHandoverCount} 项交接未完成，暂不能确认离职。
            </div>
          )}
          {detail && hasWorkflowStatus(detail.status, 'APPROVED') && pendingHandoverCount === 0 && (
            <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-700">
              当前申请已满足确认离职条件。真实联调确认，点击“确认离职”后会同步写回员工离职状态、离职日期，并停用已绑定的系统账号。
            </div>
          )}
        </Card>
      </div>

      <Card className="rounded-3xl border-white/80 bg-white/70 p-6 backdrop-blur-xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">交接清单</h2>
            <p className="mt-1 text-sm text-slate-500">交接事项完成后会实时刷新，方便核对离职闭环是否完成。</p>
          </div>
          <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
            {detail ? `${handovers.length} 项交接` : '等待加载申请'}
          </div>
        </div>
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
            {handovers.map(item => {
              const completed = isHandoverCompleted(item.status);

              return (
                <TableRow key={item.id}>
                  <TableCell className="font-semibold text-slate-900">{item.handoverItem}</TableCell>
                  <TableCell>{item.handoverTypeDesc || item.handoverType}</TableCell>
                  <TableCell>{item.handoverToName || '-'}</TableCell>
                  <TableCell>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${handoverStatusClass(item.status)}`}>
                      {item.statusDesc || item.status}
                    </span>
                  </TableCell>
                  <TableCell className="min-w-[220px]">
                    <Input
                      placeholder="可选填写交接备注"
                      disabled={completed}
                      value={handoverRemarks[item.id] ?? item.remark ?? ''}
                      onChange={event => setHandoverRemarks(prev => ({ ...prev, [item.id]: event.target.value }))}
                    />
                  </TableCell>
                  <TableCell>{item.completedTime || '-'}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant={completed ? 'outline' : 'default'} disabled={completed} onClick={() => void handleCompleteHandover(item.id)}>
                      {completed ? '已完成' : '完成交接'}
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
            {!handovers.length && (
              <TableRow>
                <TableCell colSpan={7} className="py-12 text-center text-slate-400">
                  {detail ? '当前申请暂无交接事项' : '先加载离职申请，再查看交接清单'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      {createDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-white/80 bg-white p-6 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">新建离职申请</h2>
                <p className="mt-1 text-sm text-slate-500">直接按后端 DTO 提交离职类型、原因和预计离职日期。</p>
              </div>
              <Button variant="ghost" onClick={resetCreateDialog}>关闭</Button>
            </div>

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
                <div className="mt-2 text-xs text-slate-500">这里只展示当前仍可发起离职流程的在职员工。</div>
              </div>
              <div>
                <Label>离职类型</Label>
                <Select value={createForm.resignationType} onValueChange={value => setCreateForm(prev => ({ ...prev, resignationType: value }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="VOLUNTARY">主动离职</SelectItem>
                    <SelectItem value="INVOLUNTARY">被动离职</SelectItem>
                    <SelectItem value="CONTRACT_EXPIRY">合同到期</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>预计离职日期</Label>
                <Input type="date" value={createForm.expectedDate} onChange={event => setCreateForm(prev => ({ ...prev, expectedDate: event.target.value }))} />
              </div>
              <div className="md:col-span-2">
                <Label>离职原因</Label>
                <Textarea value={createForm.resignationReason || ''} onChange={event => setCreateForm(prev => ({ ...prev, resignationReason: event.target.value }))} />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <Button variant="outline" onClick={resetCreateDialog}>取消</Button>
              <Button onClick={() => void handleCreate()}>创建申请</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HrResignationPage;
