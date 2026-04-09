import React, { useEffect, useMemo, useState } from 'react';
import { ClipboardList, FilePlus2, RefreshCcw, Search, UserRoundPlus } from 'lucide-react';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui';
import { WorkspaceDialogShell, WorkspaceHeroCard, WorkspaceMetricCard, WorkspaceSectionCard } from '@/components/workspace/WorkspacePanels';
import { WorkspaceInlineState, WorkspaceTableStateRow } from '@/components/workspace/WorkspacePrimitives';
import {
  approveOnboarding,
  Candidate,
  OnboardingApplication,
  OnboardingApplicationPayload,
  OnboardingTask,
  PostOption,
  PositionOption,
  completeOnboardingTask,
  confirmOnboarding,
  createOnboardingApplication,
  getDeptTreeOptions,
  getOnboardingApplication,
  getOnboardingTasks,
  getPostOptions,
  getPositionOptions,
  listCandidates,
  listOnboardingApplications,
  rejectOnboarding,
  submitOnboardingApplication,
} from '@/services/api/hr';
import { flattenDeptTree, hasWorkflowStatus, normalizeRows, toDateInputValue } from './hrShared';

const EMPTY_VALUE = '__empty__';
const ALL_STATUS_VALUE = '__all__';
const PHONE_PATTERN = /^1[3-9]\d{9}$/;
const EMAIL_PATTERN = /^[A-Za-z0-9+_.-]+@[A-Za-z0-9.-]+$/;

const onboardingStatusOptions = [
  { value: ALL_STATUS_VALUE, label: '全部状态' },
  { value: 'DRAFT', label: '草稿' },
  { value: 'APPROVING', label: '审批中' },
  { value: 'APPROVED', label: '已通过' },
  { value: 'ONBOARDED', label: '已入职' },
  { value: 'REJECTED', label: '已拒绝' },
];

const defaultCreateForm: OnboardingApplicationPayload = {
  name: '',
  gender: 'MALE',
  phone: '',
  email: '',
  deptId: 0,
  postId: 0,
  positionId: undefined,
  expectedDate: '',
};

const getDefaultPositionId = (postId: number, positions: PositionOption[]) =>
  positions.find(option => !postId || option.postId === postId)?.id;

const onboardingStatusClass = (status?: string) => {
  if (!status) return 'bg-slate-100 text-slate-700';
  // 真实联调口径：ONBOARDED 是最终完成态，REJECTED 需要明确区分成失败态。
  if (/(ONBOARD|CONFIRM|COMPLETE|SUCCESS)/i.test(status)) return 'bg-emerald-50 text-emerald-700';
  if (/(REJECT|FAIL)/i.test(status)) return 'bg-rose-50 text-rose-700';
  if (/(APPROV|PENDING|TASK)/i.test(status)) return 'bg-amber-50 text-amber-700';
  return 'bg-slate-100 text-slate-700';
};

const taskStatusClass = (status?: string) => {
  if (!status) return 'bg-slate-100 text-slate-700';
  if (/(COMPLETE|DONE|FINISH)/i.test(status)) return 'bg-emerald-50 text-emerald-700';
  if (/(PENDING|TODO|PROCESS)/i.test(status)) return 'bg-blue-50 text-blue-700';
  return 'bg-slate-100 text-slate-700';
};

const isTaskCompleted = (status?: string) => /(COMPLETE|DONE|FINISH)/i.test(status || '');

export const HrOnboardingPage: React.FC = () => {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [applications, setApplications] = useState<OnboardingApplication[]>([]);
  const [candidateIdsWithOnboarding, setCandidateIdsWithOnboarding] = useState<number[]>([]);
  const [deptOptions, setDeptOptions] = useState<Array<{ label: string; value: number }>>([]);
  const [postOptions, setPostOptions] = useState<PostOption[]>([]);
  const [positionOptions, setPositionOptions] = useState<PositionOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createForm, setCreateForm] = useState<OnboardingApplicationPayload>(defaultCreateForm);
  const [applicationKeyword, setApplicationKeyword] = useState('');
  const [applicationStatus, setApplicationStatus] = useState(ALL_STATUS_VALUE);
  const [currentApplication, setCurrentApplication] = useState<OnboardingApplication | null>(null);
  const [tasks, setTasks] = useState<OnboardingTask[]>([]);
  const [taskRemarks, setTaskRemarks] = useState<Record<number, string>>({});
  const [confirmDate, setConfirmDate] = useState('');

  const loadBootstrapData = async () => {
    setLoading(true);
    try {
      const [candidateRes, deptRes, postRes, positionRes] = await Promise.all([
        listCandidates({ pageNum: 1, pageSize: 100 }),
        getDeptTreeOptions(),
        getPostOptions(),
        getPositionOptions(),
      ]);

      const candidateList = normalizeRows<Candidate>(candidateRes);
      const deptList = flattenDeptTree(Array.isArray(deptRes) ? deptRes : []);
      const postList = normalizeRows<PostOption>(postRes);
      const positionList = Array.isArray(positionRes) ? positionRes : [];

      setCandidates(candidateList);
      setDeptOptions(deptList);
      setPostOptions(postList);
      setPositionOptions(positionList);

      setCreateForm(prev => ({
        ...prev,
        deptId: prev.deptId || deptList[0]?.value || 0,
        postId: prev.postId || postList[0]?.postId || 0,
        positionId:
          prev.positionId && positionList.some(option => option.id === prev.positionId && option.postId === (prev.postId || postList[0]?.postId || 0))
            ? prev.positionId
            : getDefaultPositionId(prev.postId || postList[0]?.postId || 0, positionList),
      }));
    } catch (error) {
      console.error(error);
      toast.error('入职基础数据加载失败');
    } finally {
      setLoading(false);
    }
  };

  const loadCandidateAvailability = async () => {
    try {
      const applicationRes = await listOnboardingApplications();
      const rows = Array.isArray(applicationRes) ? applicationRes : [];
      const blockedIds = rows
        .filter(item => item.candidateId && String(item.status || '').toUpperCase() !== 'REJECTED')
        .map(item => Number(item.candidateId));
      setCandidateIdsWithOnboarding(Array.from(new Set(blockedIds)));
    } catch (error) {
      console.error(error);
    }
  };

  const loadApplicationList = async (
    preservedId?: number,
    nextKeyword = applicationKeyword,
    nextStatus = applicationStatus,
  ) => {
    setListLoading(true);
    try {
      const applicationRes = await listOnboardingApplications({
        keyword: nextKeyword.trim() || undefined,
        status: nextStatus === ALL_STATUS_VALUE ? undefined : nextStatus,
      });
      const rows = Array.isArray(applicationRes) ? applicationRes : [];
      setApplications(rows);
      const firstActionableId = rows.find(item =>
        ['DRAFT', 'APPROVING', 'APPROVED'].includes(String(item.status || '').toUpperCase()),
      )?.id;

      const nextId = preservedId && rows.some(item => item.id === preservedId)
        ? preservedId
        : currentApplication && rows.some(item => item.id === currentApplication.id)
          ? currentApplication.id
          : firstActionableId || rows[0]?.id;

      if (!nextId) {
        setCurrentApplication(null);
        setTasks([]);
        setConfirmDate('');
        return;
      }

      await loadApplicationDetail(nextId);
    } catch (error) {
      console.error(error);
      toast.error('入职申请列表加载失败');
    } finally {
      setListLoading(false);
    }
  };

  const loadApplicationDetail = async (applicationId: number) => {
    setDetailLoading(true);
    try {
      const [applicationRes, taskRes] = await Promise.all([
        getOnboardingApplication(applicationId),
        getOnboardingTasks(applicationId),
      ]);
      setCurrentApplication(applicationRes);
      setTasks(Array.isArray(taskRes) ? taskRes : []);
      setConfirmDate(toDateInputValue(applicationRes.expectedDate));
    } catch (error) {
      console.error(error);
      setCurrentApplication(null);
      setTasks([]);
      toast.error('入职申请加载失败');
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    void loadBootstrapData();
    void loadCandidateAvailability();
    void loadApplicationList();
  }, []);

  useEffect(() => {
    if (!deptOptions.length || !postOptions.length) return;

    setCreateForm(prev => ({
      ...prev,
      deptId: prev.deptId || deptOptions[0]?.value || 0,
      postId: prev.postId || postOptions[0]?.postId || 0,
      positionId:
        prev.positionId && positionOptions.some(option => option.id === prev.positionId && option.postId === (prev.postId || postOptions[0]?.postId || 0))
          ? prev.positionId
          : getDefaultPositionId(prev.postId || postOptions[0]?.postId || 0, positionOptions),
    }));
  }, [deptOptions, postOptions, positionOptions]);

  useEffect(() => {
    if (!createForm.candidateId) return;

    const matchedCandidate = candidates.find(item => item.id === createForm.candidateId);
    if (!matchedCandidate) return;
    const matchedPosition = positionOptions.find(item => item.id === matchedCandidate.positionId);

    // 从招聘链路带入候选人时，自动回填基础信息，方便直接验证招聘到入职的真实链路。
    setCreateForm(prev => ({
      ...prev,
      name: matchedCandidate.name,
      gender: matchedCandidate.gender || prev.gender || 'MALE',
      phone: matchedCandidate.phone,
      email: matchedCandidate.email || '',
      deptId: matchedCandidate.deptId || prev.deptId,
      postId: matchedPosition?.postId || prev.postId,
      positionId: matchedCandidate.positionId || prev.positionId,
    }));
  }, [candidates, createForm.candidateId, positionOptions]);

  const filteredPositionOptions = useMemo(
    () => positionOptions.filter(option => !createForm.postId || option.postId === createForm.postId),
    [createForm.postId, positionOptions],
  );

  useEffect(() => {
    // 岗位变化后自动收敛职位选项，避免前端拼出岗位和职位不匹配的请求。
    if (createForm.positionId && filteredPositionOptions.some(option => option.id === createForm.positionId)) {
      return;
    }

    const nextPositionId = getDefaultPositionId(createForm.postId, filteredPositionOptions);
    if (createForm.positionId !== nextPositionId) {
      setCreateForm(prev => ({
        ...prev,
        positionId: nextPositionId,
      }));
    }
  }, [createForm.positionId, createForm.postId, filteredPositionOptions]);

  const availableCandidates = useMemo(
    () => {
      const blockedCandidateIds = new Set(candidateIdsWithOnboarding);
      return candidates.filter(item =>
        ['INTERVIEW', 'OFFER', 'HIRED'].includes(String(item.status || '').toUpperCase())
        && !blockedCandidateIds.has(item.id),
      );
    },
    [candidateIdsWithOnboarding, candidates],
  );

  const completedTaskCount = useMemo(
    () => tasks.filter(item => isTaskCompleted(item.status)).length,
    [tasks],
  );

  const actionableApplicationCount = useMemo(
    () => applications.filter(item => ['DRAFT', 'APPROVING', 'APPROVED'].includes(String(item.status || '').toUpperCase())).length,
    [applications],
  );
  const pendingTaskCount = Math.max(tasks.length - completedTaskCount, 0);
  const canSubmitApplication = hasWorkflowStatus(currentApplication?.status, 'DRAFT');
  const canApproveApplication = hasWorkflowStatus(currentApplication?.status, 'APPROVING');
  const canRejectApplication = hasWorkflowStatus(currentApplication?.status, 'APPROVING');
  const canConfirmApplication = hasWorkflowStatus(currentApplication?.status, 'APPROVED') && pendingTaskCount === 0;

  const resetCreateForm = () => {
    setCreateForm({
      ...defaultCreateForm,
      deptId: deptOptions[0]?.value || 0,
      postId: postOptions[0]?.postId || 0,
      positionId: getDefaultPositionId(postOptions[0]?.postId || 0, positionOptions),
    });
    setCreateDialogOpen(false);
  };

  const handleOpenCreateDialog = () => {
    setCreateForm({
      ...defaultCreateForm,
      deptId: deptOptions[0]?.value || 0,
      postId: postOptions[0]?.postId || 0,
      positionId: getDefaultPositionId(postOptions[0]?.postId || 0, positionOptions),
    });
    setCreateDialogOpen(true);
  };

  const handleCreateApplication = async () => {
    const name = createForm.name.trim();
    const phone = createForm.phone.trim();
    const email = (createForm.email || '').trim();

    if (!name) {
      toast.error('姓名不能为空');
      return;
    }

    if (!PHONE_PATTERN.test(phone)) {
      toast.error('请输入正确的 11 位手机号');
      return;
    }

    if (email && !EMAIL_PATTERN.test(email)) {
      toast.error('请输入正确的邮箱地址');
      return;
    }

    try {
      const applicationId = await createOnboardingApplication({
        ...createForm,
        name,
        phone,
        email: email || undefined,
        candidateId: createForm.candidateId || undefined,
        positionId: createForm.positionId || undefined,
      });

      toast.success(`入职申请已创建，申请 ID：${applicationId}`);
      setConfirmDate(createForm.expectedDate);
      resetCreateForm();
      await loadBootstrapData();
      await loadCandidateAvailability();
      await loadApplicationList(applicationId);
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || '创建入职申请失败');
    }
  };

  const handleSubmitApplication = async () => {
    if (!currentApplication) return;

    try {
      await submitOnboardingApplication(currentApplication.id);
      toast.success('入职申请已提交');
      await loadApplicationList(currentApplication.id);
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || '提交入职申请失败');
    }
  };

  const handleApproveApplication = async () => {
    if (!currentApplication) return;

    try {
      await approveOnboarding(currentApplication.id);
      toast.success('入职申请已审批通过');
      await loadApplicationList(currentApplication.id);
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || '审批入职申请失败');
    }
  };

  const handleRejectApplication = async () => {
    if (!currentApplication) return;

    try {
      await rejectOnboarding(currentApplication.id);
      toast.success('入职申请已驳回');
      await loadCandidateAvailability();
      await loadApplicationList(currentApplication.id);
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || '驳回入职申请失败');
    }
  };

  const handleCompleteTask = async (taskId: number) => {
    if (!currentApplication) return;

    try {
      await completeOnboardingTask(taskId, taskRemarks[taskId]);
      toast.success('任务已完成');
      setTaskRemarks(prev => ({ ...prev, [taskId]: '' }));
      await loadApplicationList(currentApplication.id);
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || '入职任务完成失败');
    }
  };

  const handleConfirmApplication = async () => {
    if (!currentApplication) return;
    if (!confirmDate) {
      toast.error('请选择实际入职日期');
      return;
    }

    try {
      await confirmOnboarding(currentApplication.id, confirmDate);
      toast.success('已确认入职');
      await loadBootstrapData();
      await loadCandidateAvailability();
      await loadApplicationList(currentApplication.id);
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || '确认入职失败');
    }
  };

  return (
    <div className="space-y-6">
      <WorkspaceHeroCard
        badge={(
          <div className="inline-flex items-center gap-2 rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
            <UserRoundPlus size={14} />
            Onboarding Flow
          </div>
        )}
        title="入职办理中心"
        description="按后端真实能力完成入职申请、任务办理和确认入职，不依赖移动端入口。"
        actions={(
          <>
            <Button className="rounded-2xl" onClick={handleOpenCreateDialog}>
              <FilePlus2 size={16} className="mr-2" />
              新建入职申请
            </Button>
            <Button
              variant="outline"
              className="rounded-2xl"
              onClick={() => {
                void loadBootstrapData();
                void loadCandidateAvailability();
                void loadApplicationList(currentApplication?.id);
              }}
            >
              <RefreshCcw size={16} className="mr-2" />
              刷新当前数据
            </Button>
          </>
        )}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <WorkspaceMetricCard
          label="候选人来源"
          value={loading ? '--' : availableCandidates.length}
          hint="可直接带入入职申请的候选人数"
        />
        <WorkspaceMetricCard
          label="申请列表"
          value={listLoading ? '--' : applications.length}
          hint="当前筛选条件下的入职申请数"
        />
        <WorkspaceMetricCard
          label="待推进申请"
          value={listLoading ? '--' : actionableApplicationCount}
          hint={currentApplication ? `当前申请剩余 ${pendingTaskCount} 项任务` : '先从左侧列表选择一条申请'}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <WorkspaceSectionCard
          title="申请列表"
          description="左侧按真实接口筛选与切换申请，右侧持续办理当前单据。"
        >
          <div className="space-y-4">
            <div>
              <Label>关键词</Label>
              <div className="mt-2 relative">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  className="pl-10"
                  placeholder="搜索申请编号、姓名或手机号"
                  value={applicationKeyword}
                  onChange={event => setApplicationKeyword(event.target.value)}
                />
              </div>
            </div>
            <div>
              <Label>状态筛选</Label>
              <Select value={applicationStatus} onValueChange={setApplicationStatus}>
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {onboardingStatusOptions.map(option => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-3">
              <Button className="flex-1" onClick={() => void loadApplicationList(currentApplication?.id)}>
                <Search size={16} className="mr-2" />
                查询申请
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setApplicationKeyword('');
                  setApplicationStatus(ALL_STATUS_VALUE);
                  void loadApplicationList(undefined, '', ALL_STATUS_VALUE);
                }}
              >
                重置
              </Button>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              新建申请后会自动回到列表并选中当前单据，后续直接沿着左侧列表连续办理即可，不再依赖手工输入申请 ID。
            </div>
            <div className="space-y-3">
              {applications.map(item => {
                const active = currentApplication?.id === item.id;

                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`w-full rounded-2xl border px-4 py-4 text-left transition ${active
                      ? 'border-sky-200 bg-sky-50/80 shadow-sm'
                      : 'border-slate-200 bg-white/80 hover:border-slate-300 hover:bg-slate-50'}`}
                    onClick={() => void loadApplicationDetail(item.id)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-slate-900">{item.applicationNo}</div>
                        <div className="mt-1 text-sm text-slate-500">{item.name} / {item.phone}</div>
                      </div>
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${onboardingStatusClass(item.status)}`}>
                        {item.statusDesc || item.status}
                      </span>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3 text-xs text-slate-500">
                      <span>{item.deptName || '-'} / {item.postName || '-'}</span>
                      <span>{toDateInputValue(item.expectedDate) || '-'}</span>
                    </div>
                    <div className="mt-1 text-xs text-slate-400">
                      {item.employeeId ? `已生成员工 ${item.employeeId}` : '尚未生成员工档案'}
                    </div>
                  </button>
                );
              })}
              {listLoading && (
                <WorkspaceInlineState type="loading" title="正在加载入职申请列表..." />
              )}
              {!listLoading && !applications.length && (
                <WorkspaceInlineState title="当前筛选条件下暂无入职申请" />
              )}
            </div>
          </div>
        </WorkspaceSectionCard>

        <WorkspaceSectionCard
          title="申请详情"
          description="查看当前申请的状态、组织归属和入职结果。"
          headerAside={currentApplication ? (
            <>
              <Button variant="outline" disabled={!canSubmitApplication} onClick={handleSubmitApplication}>提交申请</Button>
              <Button variant="outline" disabled={!canApproveApplication} onClick={handleApproveApplication}>审批通过</Button>
              <Button variant="outline" disabled={!canRejectApplication} onClick={handleRejectApplication}>驳回申请</Button>
              <div className="flex gap-2">
                <Input type="date" value={confirmDate} onChange={event => setConfirmDate(event.target.value)} />
                <Button disabled={!canConfirmApplication} onClick={handleConfirmApplication}>确认入职</Button>
              </div>
            </>
          ) : undefined}
        >

          {!currentApplication && (
            <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50/80 px-6 py-16 text-center text-sm text-slate-500">
              从左侧列表选择一条申请后，这里会展示真实详情、任务办理动作和确认入职入口。
            </div>
          )}

          {currentApplication && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                <div className="text-xs text-slate-400">申请编号</div>
                <div className="mt-2 font-semibold text-slate-900">{currentApplication.applicationNo}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                <div className="text-xs text-slate-400">申请状态</div>
                <div className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${onboardingStatusClass(currentApplication.status)}`}>
                  {currentApplication.statusDesc || currentApplication.status}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                <div className="text-xs text-slate-400">关联员工</div>
                <div className="mt-2 font-semibold text-slate-900">{currentApplication.employeeId || '-'}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                <div className="text-xs text-slate-400">姓名 / 电话</div>
                <div className="mt-2 font-semibold text-slate-900">{currentApplication.name}</div>
                <div className="mt-1 text-sm text-slate-500">{currentApplication.phone}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                <div className="text-xs text-slate-400">部门 / 岗位 / 职位</div>
                <div className="mt-2 font-semibold text-slate-900">{currentApplication.deptName || '-'}</div>
                <div className="mt-1 text-sm text-slate-500">{currentApplication.postName || '-'} / {currentApplication.positionName || '-'}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                <div className="text-xs text-slate-400">预计入职日期</div>
                <div className="mt-2 font-semibold text-slate-900">{toDateInputValue(currentApplication.expectedDate) || '-'}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                <div className="text-xs text-slate-400">创建时间</div>
                <div className="mt-2 font-semibold text-slate-900">
                  {currentApplication.createTime ? new Date(currentApplication.createTime).toLocaleString('zh-CN') : '-'}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 md:col-span-2">
                <div className="text-xs text-slate-400">流程实例 ID</div>
                <div className="mt-2 break-all font-mono text-sm text-slate-700">{currentApplication.processInstanceId || '-'}</div>
              </div>
            </div>
          )}

          {detailLoading && <WorkspaceInlineState type="loading" title="正在加载申请详情..." className="mt-4 py-4" />}
          {currentApplication && (
            <div className="mt-4 rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm leading-6 text-sky-800">
              审批通过后后端会自动生成 4 项入职任务；任务全部完成后才能确认入职。
              确认入职时会新建员工档案，员工初始状态为试用期，并回写申请上的员工 ID。
            </div>
          )}
          {currentApplication && hasWorkflowStatus(currentApplication.status, 'APPROVED') && pendingTaskCount > 0 && (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              当前申请还有 {pendingTaskCount} 项入职任务未完成，暂不能确认入职。
            </div>
          )}
        </WorkspaceSectionCard>
      </div>

      <WorkspaceSectionCard
        title="入职任务"
        description="任务列表直接取后端入职任务接口，完成后立即刷新状态。"
        headerAside={(
          <div className="inline-flex items-center gap-2 rounded-full bg-white/82 px-3 py-1.5 text-xs font-medium text-slate-500 ring-1 ring-white/80 shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
            <ClipboardList size={14} />
            {currentApplication ? `${tasks.length} 项任务` : '等待加载申请'}
          </div>
        )}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>任务</TableHead>
              <TableHead>负责人</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>完成时间</TableHead>
              <TableHead>办理备注</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tasks.map(item => {
              const completed = isTaskCompleted(item.status);

              return (
                <TableRow key={item.id}>
                  <TableCell>
                    <div className="font-semibold text-slate-900">{item.taskName}</div>
                    <div className="mt-1 text-xs text-slate-400">{item.taskTypeDesc || item.taskType}</div>
                    {item.taskDescription && <div className="mt-1 text-xs text-slate-500">{item.taskDescription}</div>}
                  </TableCell>
                  <TableCell>{item.assigneeName || '-'}</TableCell>
                  <TableCell>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${taskStatusClass(item.status)}`}>
                      {item.statusDesc || item.status}
                    </span>
                  </TableCell>
                  <TableCell>{item.completedTime || '-'}</TableCell>
                  <TableCell className="min-w-[220px]">
                    <Input
                      placeholder="可选填写办理备注"
                      disabled={completed}
                      value={taskRemarks[item.id] ?? item.remark ?? ''}
                      onChange={event => setTaskRemarks(prev => ({ ...prev, [item.id]: event.target.value }))}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant={completed ? 'outline' : 'default'} disabled={completed} onClick={() => void handleCompleteTask(item.id)}>
                      {completed ? '已完成' : '完成任务'}
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
            {!tasks.length && <WorkspaceTableStateRow colSpan={6} title={currentApplication ? '当前申请暂无任务' : '先加载申请，再查看对应入职任务'} />}
          </TableBody>
        </Table>
      </WorkspaceSectionCard>

      {createDialogOpen && (
        <WorkspaceDialogShell
          title="新建入职申请"
          description="支持手工创建，也支持从招聘候选人带入基础信息。"
          onClose={resetCreateForm}
          maxWidthClassName="max-w-4xl"
        >

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <Label>候选人来源</Label>
                <Select
                  value={createForm.candidateId ? String(createForm.candidateId) : EMPTY_VALUE}
                  onValueChange={value => setCreateForm(prev => ({
                    ...prev,
                    candidateId: value === EMPTY_VALUE ? undefined : Number(value),
                  }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="可选：从候选人带入" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={EMPTY_VALUE}>手工创建</SelectItem>
                    {availableCandidates.map(item => (
                      <SelectItem key={item.id} value={String(item.id)}>
                        {item.name} / {item.phone} / {item.statusDesc || item.status || '-'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="mt-2 text-xs text-slate-500">已存在未拒绝入职单的候选人会自动从这里剔除，避免重复建单。</div>
              </div>

              <div>
                <Label>姓名</Label>
                <Input value={createForm.name} onChange={event => setCreateForm(prev => ({ ...prev, name: event.target.value }))} />
              </div>
              <div>
                <Label>性别</Label>
                <Select value={createForm.gender || 'MALE'} onValueChange={value => setCreateForm(prev => ({ ...prev, gender: value }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MALE">男</SelectItem>
                    <SelectItem value="FEMALE">女</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>手机号</Label>
                <Input
                  inputMode="numeric"
                  maxLength={11}
                  placeholder="请输入 11 位手机号"
                  value={createForm.phone}
                  onChange={event => setCreateForm(prev => ({ ...prev, phone: event.target.value.replace(/\s+/g, '') }))}
                />
              </div>
              <div>
                <Label>邮箱</Label>
                <Input
                  type="email"
                  placeholder="请输入邮箱地址"
                  value={createForm.email || ''}
                  onChange={event => setCreateForm(prev => ({ ...prev, email: event.target.value.trim() }))}
                />
              </div>
              <div>
                <Label>部门</Label>
                <Select value={createForm.deptId ? String(createForm.deptId) : undefined} onValueChange={value => setCreateForm(prev => ({ ...prev, deptId: Number(value) }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="请选择部门" />
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
                <Label>岗位</Label>
                <Select value={createForm.postId ? String(createForm.postId) : undefined} onValueChange={value => setCreateForm(prev => ({ ...prev, postId: Number(value) }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="请选择岗位" />
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
                <Label>职位</Label>
                <Select
                  value={createForm.positionId ? String(createForm.positionId) : EMPTY_VALUE}
                  onValueChange={value => setCreateForm(prev => ({
                    ...prev,
                    positionId: value === EMPTY_VALUE ? undefined : Number(value),
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
                <div className="mt-2 text-xs text-slate-500">职位选项会随岗位联动，避免提交出无效的岗位与职位组合。</div>
              </div>
              <div>
                <Label>预计入职日期</Label>
                <Input type="date" value={createForm.expectedDate} onChange={event => setCreateForm(prev => ({ ...prev, expectedDate: event.target.value }))} />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <Button variant="outline" onClick={resetCreateForm}>取消</Button>
              <Button onClick={() => void handleCreateApplication()}>创建申请</Button>
            </div>
        </WorkspaceDialogShell>
      )}
    </div>
  );
};

export default HrOnboardingPage;
