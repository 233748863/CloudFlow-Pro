import React, { useEffect, useMemo, useState } from 'react';
import { BellRing, FilePlus2, RefreshCcw, Search, ShieldCheck, Users } from 'lucide-react';
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
  Textarea,
} from '@/components/ui';
import { WorkspaceDialogShell, WorkspaceHeroCard, WorkspaceMetricCard, WorkspaceSectionCard } from '@/components/workspace/WorkspacePanels';
import { WorkspaceInlineState } from '@/components/workspace/WorkspacePrimitives';
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
import { buildEmployeeLabel, hasWorkflowStatus, matchEmployeeKeyword, normalizeRows, toDateInputValue } from './hrShared';

const defaultForm: ProbationConfirmationPayload = {
  employeeId: 0,
  probationStartDate: '',
  probationEndDate: '',
  expectedRegularDate: '',
  selfEvaluation: '',
  managerEvaluation: '',
};

const probationStatusClass = (status?: string) => {
  if (!status) return 'bg-slate-100 text-slate-700';
  if (/(EXTENDED|EXTEND)/i.test(status)) return 'bg-amber-50 text-amber-700';
  if (/(APPROV|REGULAR|COMPLETE|PASS)/i.test(status)) return 'bg-emerald-50 text-emerald-700';
  if (/(DRAFT|PENDING|SUBMIT)/i.test(status)) return 'bg-amber-50 text-amber-700';
  if (/(REJECT|FAIL)/i.test(status)) return 'bg-rose-50 text-rose-700';
  return 'bg-slate-100 text-slate-700';
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
  if (preferredId && rows.some(item => item.id === preferredId)) {
    return preferredId;
  }

  if (currentDetailId && rows.some(item => item.id === currentDetailId)) {
    return currentDetailId;
  }

  return rows.find(item => ['DRAFT', 'APPROVING'].includes(String(item.status || '').toUpperCase()))?.id
    || rows[0]?.id;
};

export const HrProbationPage: React.FC = () => {
  const [employees, setEmployees] = useState<HrEmployee[]>([]);
  const [employeeKeyword, setEmployeeKeyword] = useState('');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
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
      toast.error('员工列表加载失败');
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
      toast.error('转正申请详情加载失败');
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
      toast.error('转正申请列表加载失败');
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
    try {
      await approveProbationConfirmation(id);
      toast.success('转正申请已审批通过');

      if (selectedEmployeeId) {
        await handleRefreshCurrentEmployee();
      }
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || '审批转正申请失败');
    }
  };

  const handleReject = async (id: number) => {
    if (!rejectReason.trim()) {
      toast.error('请填写驳回原因');
      return;
    }

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
    }
  };

  useEffect(() => {
    void loadEmployees();
  }, []);

  const filteredEmployees = useMemo(
    () => employees.filter(employee => matchEmployeeKeyword(employee, employeeKeyword)),
    [employees, employeeKeyword],
  );

  useEffect(() => {
    if (!filteredEmployees.length) {
      setSelectedEmployeeId('');
      setApplications([]);
      setDetail(null);
      return;
    }

    // 搜索结果变化后自动聚焦第一位员工，减少桌面端每次都要再点一次下拉框。
    if (!selectedEmployeeId || !filteredEmployees.some(item => String(item.id) === selectedEmployeeId)) {
      const preferredEmployee = filteredEmployees.find(item => isProbationEmployee(item)) || filteredEmployees[0];
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
    () => employees.find(item => String(item.id) === selectedEmployeeId) || null,
    [employees, selectedEmployeeId],
  );

  const creatableEmployees = useMemo(
    () => employees.filter(item => isProbationEmployee(item)),
    [employees],
  );

  const draftOrApprovingCount = useMemo(
    () => applications.filter(item => ['DRAFT', 'APPROVING'].includes(String(item.status || '').toUpperCase())).length,
    [applications],
  );

  const approvedCount = useMemo(
    () => applications.filter(item => hasWorkflowStatus(item.status, 'APPROVED')).length,
    [applications],
  );

  const detailHistoryTone = hasWorkflowStatus(detail?.status, 'EXTENDED')
    ? 'border-amber-100 bg-amber-50 text-amber-700'
    : 'border-rose-100 bg-rose-50 text-rose-700';

  const canSubmitDetail = hasWorkflowStatus(detail?.status, 'DRAFT');
  const canApproveDetail = hasWorkflowStatus(detail?.status, 'APPROVING');
  const canRejectDetail = hasWorkflowStatus(detail?.status, 'APPROVING');
  const selectedEmployeeCanCreate = isProbationEmployee(selectedEmployee);
  const canOpenCreate = creatableEmployees.length > 0;

  const resetCreateDialog = () => {
    setCreateForm({
      ...defaultForm,
      employeeId: selectedEmployeeCanCreate
        ? selectedEmployee!.id
        : creatableEmployees[0]?.id || 0,
    });
    setCreateDialogOpen(false);
  };

  const handleOpenCreate = () => {
    if (!canOpenCreate) {
      toast.error('当前没有可发起转正的试用期员工');
      return;
    }

    setCreateForm({
      ...defaultForm,
      employeeId: selectedEmployeeCanCreate
        ? selectedEmployee!.id
        : creatableEmployees[0]?.id || 0,
    });
    setCreateDialogOpen(true);
  };

  const handleCreate = async () => {
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
    }
  };

  const handleSubmit = async (id: number) => {
    try {
      await submitProbationConfirmation(id);
      toast.success('转正申请已提交');

      if (selectedEmployeeId) {
        await loadApplications(Number(selectedEmployeeId), id);
      }
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || '提交转正申请失败');
    }
  };

  const handleSendReminders = async () => {
    try {
      await sendProbationReminders();
      toast.success('转正提醒已发送');
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || '发送提醒失败');
    }
  };

  return (
    <div className="space-y-6">
      <WorkspaceHeroCard
        badge={(
          <div className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
            <ShieldCheck size={14} />
            Probation Flow
          </div>
        )}
        title="转正申请中心"
        description="左侧锁定员工，右侧持续办理转正申请，减少桌面端来回切换与手动查找。"
        actions={(
          <>
            <Button className="rounded-2xl" disabled={!canOpenCreate} onClick={handleOpenCreate}>
              <FilePlus2 size={16} className="mr-2" />
              新建转正申请
            </Button>
            <Button variant="outline" className="rounded-2xl" onClick={() => void handleSendReminders()}>
              <BellRing size={16} className="mr-2" />
              发送转正提醒
            </Button>
            <Button variant="outline" className="rounded-2xl" onClick={() => void handleRefreshCurrentEmployee()}>
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
          hint={selectedEmployee ? `${selectedEmployee.name} 的转正记录` : '先从左侧选择员工'}
        />
        <WorkspaceMetricCard
          label="待推进申请"
          value={selectedEmployee ? draftOrApprovingCount : '--'}
          hint={selectedEmployee ? `已完成 ${approvedCount} 条转正` : '等待选择员工'}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[320px_360px_minmax(0,1fr)]">
        <WorkspaceSectionCard
          title="员工列表"
          description="先定位员工，再连续处理该员工的转正单据。"
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
              搜索结果会自动选中首位员工，适合开发阶段快速轮询真实数据。
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
                        ? 'border-amber-200 bg-amber-50/80 shadow-sm'
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
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-500">
                      <div>
                        <div className="text-slate-400">入职日期</div>
                        <div className="mt-1">{toDateInputValue(employee.hireDate) || '-'}</div>
                      </div>
                      <div>
                        <div className="text-slate-400">转正日期</div>
                        <div className="mt-1">{toDateInputValue(employee.regularDate) || '-'}</div>
                      </div>
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
          description="优先展示当前员工最近的转正记录，并默认聚焦可推进申请。"
          headerAside={(
            <div className="inline-flex items-center gap-2 rounded-full bg-white/82 px-3 py-1.5 text-xs font-medium text-slate-500 ring-1 ring-white/80 shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
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
              <div className="mt-3 text-xs text-slate-500">{selectedEmployee.phone || '未维护手机号'}</div>
              {!selectedEmployeeCanCreate && (
                <div className="mt-3 rounded-2xl border border-slate-200 bg-white/80 px-3 py-2 text-xs text-slate-500">
                  当前员工不是试用期，仅建议查看历史转正记录；新建申请时会自动切换到可发起的试用期员工。
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
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${probationStatusClass(item.status)}`}>
                      {item.statusDesc || item.status}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-slate-500">
                    <div>
                      <div className="text-slate-400">试用周期</div>
                      <div className="mt-1">
                        {toDateInputValue(item.probationStartDate) || '-'} ~ {toDateInputValue(item.probationEndDate) || '-'}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-400">预计转正</div>
                      <div className="mt-1">{toDateInputValue(item.expectedRegularDate) || '-'}</div>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div className="text-xs text-slate-400">{getProbationActionHint(item.status)}</div>
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
              <WorkspaceInlineState title={selectedEmployee ? '该员工暂无转正申请' : '先从左侧选择员工'} />
            )}
            {listLoading && (
              <WorkspaceInlineState type="loading" title="正在加载转正申请..." />
            )}
          </div>
        </WorkspaceSectionCard>

        <WorkspaceSectionCard
          title="申请详情"
          description="详情区保留真实接口字段，并直接办理提交、审批和驳回动作。"
          headerAside={detail ? (
            <>
              <Button variant="outline" disabled={!canSubmitDetail} onClick={() => void handleSubmit(detail.id)}>
                提交当前申请
              </Button>
              <Button disabled={!canApproveDetail} onClick={() => void handleApprove(detail.id)}>
                审批通过
              </Button>
            </>
          ) : undefined}
        >

          {!detail && (
            <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50/80 px-6 py-16 text-center text-sm text-slate-500">
              先在中间列表选择一条转正申请，这里会展示完整评价信息与办理动作。
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
                  <div className="text-xs text-slate-400">员工</div>
                  <div className="mt-2 font-semibold text-slate-900">{detail.employeeName || '-'}</div>
                  <div className="mt-1 text-sm text-slate-500">{detail.employeeNo || '-'}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                  <div className="text-xs text-slate-400">状态</div>
                  <div className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${probationStatusClass(detail.status)}`}>
                    {detail.statusDesc || detail.status}
                  </div>
                  <div className="mt-2 text-xs text-slate-400">{getProbationActionHint(detail.status)}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                  <div className="text-xs text-slate-400">试用开始</div>
                  <div className="mt-2 font-semibold text-slate-900">{toDateInputValue(detail.probationStartDate) || '-'}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                  <div className="text-xs text-slate-400">试用结束</div>
                  <div className="mt-2 font-semibold text-slate-900">{toDateInputValue(detail.probationEndDate) || '-'}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                  <div className="text-xs text-slate-400">预计转正日期</div>
                  <div className="mt-2 font-semibold text-slate-900">{toDateInputValue(detail.expectedRegularDate) || '-'}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                  <div className="text-xs text-slate-400">创建时间</div>
                  <div className="mt-2 font-semibold text-slate-900">
                    {detail.createTime ? new Date(detail.createTime).toLocaleString('zh-CN') : '-'}
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 md:col-span-2">
                  <div className="text-xs text-slate-400">流程实例 ID</div>
                  <div className="mt-2 break-all font-mono text-sm text-slate-700">{detail.processInstanceId || '-'}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 md:col-span-2 xl:col-span-3">
                  <div className="text-xs text-slate-400">自我评价</div>
                  <div className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{detail.selfEvaluation || '-'}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 md:col-span-2 xl:col-span-3">
                  <div className="text-xs text-slate-400">主管评价</div>
                  <div className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{detail.managerEvaluation || '-'}</div>
                </div>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white/80 p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">驳回处理</h3>
                    <p className="mt-1 text-sm text-slate-500">审批中申请可以直接填写驳回原因，并可选延长试用期。</p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                    {canRejectDetail ? '可驳回' : '当前状态不可驳回'}
                  </span>
                </div>

                {/* 真实联调发现：是否填写延长天数会直接决定申请终态和员工主档状态。 */}
                <div className="mb-4 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
                  填写正整数延长天数时，后端会把申请置为“延长试用期”，员工继续保持试用期；
                  留空则走“已拒绝”，当前后端实现会同步把员工主档更新为离职。
                </div>

                <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_220px]">
                  <div>
                    <Label>驳回原因</Label>
                    <Textarea
                      className="mt-2"
                      rows={5}
                      value={rejectReason}
                      onChange={event => setRejectReason(event.target.value)}
                      placeholder="例如：试用期目标未达成，建议延长观察期"
                    />
                  </div>
                  <div className="space-y-4">
                    <div>
                      <Label>延长天数</Label>
                      <Input
                        className="mt-2"
                        type="number"
                        min={0}
                        placeholder="留空则不延长"
                        value={rejectExtensionDays}
                        onChange={event => setRejectExtensionDays(event.target.value)}
                      />
                    </div>
                    <Button className="w-full" disabled={!canRejectDetail} onClick={() => void handleReject(detail.id)}>
                      驳回申请
                    </Button>
                  </div>
                </div>

                {(detail.rejectReason || detail.extensionDays) && (
                  <div className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${detailHistoryTone}`}>
                    {hasWorkflowStatus(detail.status, 'EXTENDED') ? '历史延长信息：' : '历史驳回信息：'}
                    {detail.rejectReason || '未填写原因'}
                    {detail.extensionDays ? `，延长 ${detail.extensionDays} 天` : ''}
                  </div>
                )}
              </div>
            </div>
          )}

          {detailLoading && <WorkspaceInlineState type="loading" title="正在加载申请详情..." className="mt-4 py-4" />}
        </WorkspaceSectionCard>
      </div>

      {createDialogOpen && (
        <WorkspaceDialogShell
          title="新建转正申请"
          description="直接按后端 DTO 字段提交试用期和评价信息。"
          onClose={resetCreateDialog}
          maxWidthClassName="max-w-3xl"
        >

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <Label>员工</Label>
                <Select
                  value={createForm.employeeId ? String(createForm.employeeId) : undefined}
                  onValueChange={value => setCreateForm(prev => ({ ...prev, employeeId: Number(value) }))}
                >
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
              </div>
              <div>
                <Label>试用开始日期</Label>
                <Input
                  type="date"
                  value={createForm.probationStartDate}
                  onChange={event => setCreateForm(prev => ({ ...prev, probationStartDate: event.target.value }))}
                />
              </div>
              <div>
                <Label>试用结束日期</Label>
                <Input
                  type="date"
                  value={createForm.probationEndDate}
                  onChange={event => setCreateForm(prev => ({ ...prev, probationEndDate: event.target.value }))}
                />
              </div>
              <div className="md:col-span-2">
                <Label>预计转正日期</Label>
                <Input
                  type="date"
                  value={createForm.expectedRegularDate}
                  onChange={event => setCreateForm(prev => ({ ...prev, expectedRegularDate: event.target.value }))}
                />
              </div>
              <div className="md:col-span-2">
                <Label>自我评价</Label>
                <Textarea
                  rows={4}
                  value={createForm.selfEvaluation || ''}
                  onChange={event => setCreateForm(prev => ({ ...prev, selfEvaluation: event.target.value }))}
                />
              </div>
              <div className="md:col-span-2">
                <Label>主管评价</Label>
                <Textarea
                  rows={4}
                  value={createForm.managerEvaluation || ''}
                  onChange={event => setCreateForm(prev => ({ ...prev, managerEvaluation: event.target.value }))}
                />
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

export default HrProbationPage;
