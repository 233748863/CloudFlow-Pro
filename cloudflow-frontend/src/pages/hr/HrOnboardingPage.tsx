import React, { useEffect, useMemo, useState } from 'react';
import {
  ClipboardList,
  FilePlus2,
  RefreshCcw,
  Search,
  UserRoundPlus,
} from 'lucide-react';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
} from '@/components/ui';
import {
  Candidate,
  OnboardingApplication,
  OnboardingApplicationPayload,
  OnboardingTask,
  PositionOption,
  PostOption,
  approveOnboarding,
  completeOnboardingTask,
  confirmOnboarding,
  createOnboardingApplication,
  getDeptTreeOptions,
  getOnboardingApplication,
  getOnboardingTasks,
  getPositionOptions,
  getPostOptions,
  listCandidates,
  listOnboardingApplications,
  rejectOnboarding,
  submitOnboardingApplication,
} from '@/services/api/hr';
import {
  flattenDeptTree,
  hasWorkflowStatus,
  normalizeRows,
  toDateInputValue,
} from './hrShared';

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
  positions.find((option) => !postId || option.postId === postId)?.id;

const onboardingStatusClass = (status?: string) => {
  if (!status) {
    return 'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300';
  }
  // 真实联调口径：ONBOARDED 是最终完成态，REJECTED 明确视为失败态。
  if (/(ONBOARD|CONFIRM|COMPLETE|SUCCESS)/i.test(status)) {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200';
  }
  if (/(REJECT|FAIL)/i.test(status)) {
    return 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200';
  }
  if (/(APPROV|PENDING|TASK)/i.test(status)) {
    return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200';
  }
  return 'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300';
};

const taskStatusClass = (status?: string) => {
  if (!status) {
    return 'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300';
  }
  if (/(COMPLETE|DONE|FINISH)/i.test(status)) {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200';
  }
  if (/(PENDING|TODO|PROCESS)/i.test(status)) {
    return 'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-200';
  }
  return 'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300';
};

const isTaskCompleted = (status?: string) => /(COMPLETE|DONE|FINISH)/i.test(status || '');

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
  <div className={['flex flex-col items-center justify-center px-6 py-10 text-center', className].filter(Boolean).join(' ')}>
    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500">
      <UserRoundPlus className="h-4 w-4" />
    </div>
    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
  </div>
);

const TableStateRow = ({
  colSpan,
  title,
  description,
  loading = false,
}: {
  colSpan: number;
  title: string;
  description?: string;
  loading?: boolean;
}) => (
  <tr className="hover:bg-transparent">
    <td colSpan={colSpan} className="px-4 py-14">
      <InlineState
        title={title}
        className={loading ? 'py-6' : 'py-4'}
      />
    </td>
  </tr>
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
  const [pendingAction, setPendingAction] = useState<string | null>(null);
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

      setCreateForm((prev) => ({
        ...prev,
        deptId: prev.deptId || deptList[0]?.value || 0,
        postId: prev.postId || postList[0]?.postId || 0,
        positionId:
          prev.positionId
          && positionList.some(
            (option) =>
              option.id === prev.positionId
              && option.postId === (prev.postId || postList[0]?.postId || 0),
          )
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
        .filter(
          (item) =>
            item.candidateId
            && String(item.status || '').toUpperCase() !== 'REJECTED',
        )
        .map((item) => Number(item.candidateId));
      setCandidateIdsWithOnboarding(Array.from(new Set(blockedIds)));
    } catch (error) {
      console.error(error);
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
      setTaskRemarks({});
    } catch (error) {
      console.error(error);
      setCurrentApplication(null);
      setTasks([]);
      toast.error('入职申请加载失败');
    } finally {
      setDetailLoading(false);
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
      const firstActionableId = rows.find((item) =>
        ['DRAFT', 'APPROVING', 'APPROVED'].includes(String(item.status || '').toUpperCase()),
      )?.id;

      const nextId =
        preservedId && rows.some((item) => item.id === preservedId)
          ? preservedId
          : currentApplication && rows.some((item) => item.id === currentApplication.id)
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

  useEffect(() => {
    void loadBootstrapData();
    void loadCandidateAvailability();
    void loadApplicationList();
  }, []);

  useEffect(() => {
    if (!deptOptions.length || !postOptions.length) return;

    setCreateForm((prev) => ({
      ...prev,
      deptId: prev.deptId || deptOptions[0]?.value || 0,
      postId: prev.postId || postOptions[0]?.postId || 0,
      positionId:
        prev.positionId
        && positionOptions.some(
          (option) =>
            option.id === prev.positionId
            && option.postId === (prev.postId || postOptions[0]?.postId || 0),
        )
          ? prev.positionId
          : getDefaultPositionId(prev.postId || postOptions[0]?.postId || 0, positionOptions),
    }));
  }, [deptOptions, postOptions, positionOptions]);

  useEffect(() => {
    if (!createForm.candidateId) return;

    const matchedCandidate = candidates.find((item) => item.id === createForm.candidateId);
    if (!matchedCandidate) return;
    const matchedPosition = positionOptions.find(
      (item) => item.id === matchedCandidate.positionId,
    );

    // 从招聘链路带入候选人时自动回填基础信息，便于直接验证招聘到入职的真实链路。
    setCreateForm((prev) => ({
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
    () =>
      positionOptions.filter(
        (option) => !createForm.postId || option.postId === createForm.postId,
      ),
    [createForm.postId, positionOptions],
  );

  useEffect(() => {
    // 岗位变化后自动收敛职位选项，避免前端拼出岗位和职位不匹配的请求。
    if (
      createForm.positionId
      && filteredPositionOptions.some((option) => option.id === createForm.positionId)
    ) {
      return;
    }

    const nextPositionId = getDefaultPositionId(createForm.postId, filteredPositionOptions);
    if (createForm.positionId !== nextPositionId) {
      setCreateForm((prev) => ({
        ...prev,
        positionId: nextPositionId,
      }));
    }
  }, [createForm.positionId, createForm.postId, filteredPositionOptions]);

  const availableCandidates = useMemo(() => {
    const blockedCandidateIds = new Set(candidateIdsWithOnboarding);
    return candidates.filter(
      (item) =>
        ['INTERVIEW', 'OFFER', 'HIRED'].includes(String(item.status || '').toUpperCase())
        && !blockedCandidateIds.has(item.id),
    );
  }, [candidateIdsWithOnboarding, candidates]);

  const completedTaskCount = useMemo(
    () => tasks.filter((item) => isTaskCompleted(item.status)).length,
    [tasks],
  );

  const actionableApplicationCount = useMemo(
    () =>
      applications.filter((item) =>
        ['DRAFT', 'APPROVING', 'APPROVED'].includes(String(item.status || '').toUpperCase()),
      ).length,
    [applications],
  );

  const pendingTaskCount = Math.max(tasks.length - completedTaskCount, 0);
  const canSubmitApplication = hasWorkflowStatus(currentApplication?.status, 'DRAFT');
  const canApproveApplication = hasWorkflowStatus(currentApplication?.status, 'APPROVING');
  const canRejectApplication = hasWorkflowStatus(currentApplication?.status, 'APPROVING');
  const canConfirmApplication =
    hasWorkflowStatus(currentApplication?.status, 'APPROVED') && pendingTaskCount === 0;

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

    setPendingAction('create');
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
    } finally {
      setPendingAction(null);
    }
  };

  const handleSubmitApplication = async () => {
    if (!currentApplication) return;

    setPendingAction('submit');
    try {
      await submitOnboardingApplication(currentApplication.id);
      toast.success('入职申请已提交');
      await loadApplicationList(currentApplication.id);
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || '提交入职申请失败');
    } finally {
      setPendingAction(null);
    }
  };

  const handleApproveApplication = async () => {
    if (!currentApplication) return;

    setPendingAction('approve');
    try {
      await approveOnboarding(currentApplication.id);
      toast.success('入职申请已审批通过');
      await loadApplicationList(currentApplication.id);
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || '审批入职申请失败');
    } finally {
      setPendingAction(null);
    }
  };

  const handleRejectApplication = async () => {
    if (!currentApplication) return;

    setPendingAction('reject');
    try {
      await rejectOnboarding(currentApplication.id);
      toast.success('入职申请已驳回');
      await loadCandidateAvailability();
      await loadApplicationList(currentApplication.id);
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || '驳回入职申请失败');
    } finally {
      setPendingAction(null);
    }
  };

  const handleCompleteTask = async (taskId: number) => {
    if (!currentApplication) return;

    setPendingAction(`task-${taskId}`);
    try {
      await completeOnboardingTask(taskId, taskRemarks[taskId]);
      toast.success('任务已完成');
      setTaskRemarks((prev) => ({ ...prev, [taskId]: '' }));
      await loadApplicationList(currentApplication.id);
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || '入职任务完成失败');
    } finally {
      setPendingAction(null);
    }
  };

  const handleConfirmApplication = async () => {
    if (!currentApplication) return;
    if (!confirmDate) {
      toast.error('请选择实际入职日期');
      return;
    }

    setPendingAction('confirm');
    try {
      await confirmOnboarding(currentApplication.id, confirmDate);
      toast.success('已确认入职');
      await loadBootstrapData();
      await loadCandidateAvailability();
      await loadApplicationList(currentApplication.id);
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || '确认入职失败');
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="min-w-0">
        <div className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
          <UserRoundPlus className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-300" />
          Onboarding Flow
        </div>
        <h1 className="mt-1.5 text-[26px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          入职办理
        </h1>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          候选人来源 {loading ? '--' : availableCandidates.length}
        </span>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          申请列表 {listLoading ? '--' : applications.length}
        </span>
        <span className="rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-xs text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-200">
          待推进 {listLoading ? '--' : actionableApplicationCount}
        </span>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          当前剩余任务 {currentApplication ? pendingTaskCount : '--'}
        </span>

        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => {
            void loadBootstrapData();
            void loadCandidateAvailability();
            void loadApplicationList(currentApplication?.id);
          }}>
            <RefreshCcw
              size={14}
              className={`mr-1.5 ${loading || listLoading || detailLoading ? 'animate-spin' : ''}`}
            />
            刷新当前数据
          </Button>
          <Button size="sm" onClick={handleOpenCreateDialog}>
            <FilePlus2 size={14} className="mr-1.5" />
            新建入职申请
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
                  placeholder="搜索申请编号、姓名或手机号"
                  value={applicationKeyword}
                  onChange={(event) => setApplicationKeyword(event.target.value)}
                />
              </div>

              <div className="w-full sm:w-40">
                <Select value={applicationStatus} onValueChange={setApplicationStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {onboardingStatusOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex w-full flex-shrink-0 flex-wrap items-center justify-end gap-3 lg:w-auto">
              <Button
                variant="outline"
                onClick={() => {
                  setApplicationKeyword('');
                  setApplicationStatus(ALL_STATUS_VALUE);
                  void loadApplicationList(undefined, '', ALL_STATUS_VALUE);
                }}
              >
                重置筛选
              </Button>
              <Button onClick={() => void loadApplicationList(currentApplication?.id)}>
                查询申请
              </Button>
            </div>
          </div>
        )}
        table={(
          <div className="grid min-h-[680px] grid-cols-1 xl:grid-cols-[340px_minmax(0,1fr)]">
            <aside className="min-w-0 border-b border-slate-200 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-900/20 xl:border-b-0 xl:border-r">
              <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">申请列表</div>
                <div className="mt-1 text-xs leading-6 text-slate-500 dark:text-slate-400">
                  左侧按真实接口筛选与切换申请，右侧持续办理当前单据。
                </div>
              </div>

              <div className="space-y-3 overflow-y-auto p-4">
                {listLoading ? (
                  <InlineState
                    title="正在加载入职申请列表..."
                    className="py-12"
                  />
                ) : applications.length === 0 ? (
                  <InlineState
                    title="当前筛选条件下暂无入职申请"
                    className="py-12"
                  />
                ) : (
                  applications.map((item) => {
                    const active = currentApplication?.id === item.id;

                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={[
                          'w-full rounded-xl border px-4 py-4 text-left transition',
                          active
                            ? 'border-cyan-200 bg-cyan-50 shadow-sm dark:border-cyan-900 dark:bg-cyan-950/20'
                            : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950/88 dark:hover:bg-slate-900/70',
                        ].join(' ')}
                        onClick={() => void loadApplicationDetail(item.id)}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                              {item.applicationNo}
                            </div>
                            <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                              {item.name} / {item.phone}
                            </div>
                          </div>
                          <span
                            className={[
                              'shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium',
                              onboardingStatusClass(item.status),
                            ].join(' ')}
                          >
                            {item.statusDesc || item.status}
                          </span>
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
                          <span>{item.deptName || '-'} / {item.postName || '-'}</span>
                          <span>{toDateInputValue(item.expectedDate) || '-'}</span>
                        </div>
                        <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                          {item.employeeId ? `已生成员工 ${item.employeeId}` : '尚未生成员工档案'}
                        </div>
                      </button>
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
                    查看当前申请的状态、组织归属和入职结果，并在这里继续推进审批与确认入职。
                  </div>
                </div>
                {currentApplication ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!canSubmitApplication || Boolean(pendingAction)}
                      onClick={() => void handleSubmitApplication()}
                    >
                      {pendingAction === 'submit' ? '提交中...' : '提交申请'}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!canApproveApplication || Boolean(pendingAction)}
                      onClick={() => void handleApproveApplication()}
                    >
                      {pendingAction === 'approve' ? '处理中...' : '审批通过'}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!canRejectApplication || Boolean(pendingAction)}
                      onClick={() => void handleRejectApplication()}
                    >
                      {pendingAction === 'reject' ? '处理中...' : '驳回申请'}
                    </Button>
                    <Input
                      type="date"
                      value={confirmDate}
                      onChange={(event) => setConfirmDate(event.target.value)}
                      className="h-9 w-[168px]"
                    />
                    <Button
                      size="sm"
                      disabled={!canConfirmApplication || Boolean(pendingAction)}
                      onClick={() => void handleConfirmApplication()}
                    >
                      {pendingAction === 'confirm' ? '确认中...' : '确认入职'}
                    </Button>
                  </div>
                ) : null}
              </div>

              {!currentApplication ? (
                <InlineState
                  title="请选择一条入职申请"
                  className="py-20"
                />
              ) : (
                <div className="flex flex-1 flex-col gap-4 p-4">
                  <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
                    <DetailRow label="申请编号" value={currentApplication.applicationNo} />
                    <DetailRow
                      label="申请状态"
                      value={(
                        <span
                          className={[
                            'inline-flex rounded-full border px-2 py-0.5 text-xs font-medium',
                            onboardingStatusClass(currentApplication.status),
                          ].join(' ')}
                        >
                          {currentApplication.statusDesc || currentApplication.status}
                        </span>
                      )}
                    />
                    <DetailRow label="关联员工" value={currentApplication.employeeId || '-'} />
                    <DetailRow
                      label="姓名 / 电话"
                      value={`${currentApplication.name} / ${currentApplication.phone}`}
                    />
                    <DetailRow
                      label="部门 / 岗位 / 职位"
                      value={`${currentApplication.deptName || '-'} / ${currentApplication.postName || '-'} / ${currentApplication.positionName || '-'}`}
                    />
                    <DetailRow
                      label="预计入职日期"
                      value={toDateInputValue(currentApplication.expectedDate) || '-'}
                    />
                    <DetailRow
                      label="创建时间"
                      value={formatDateTime(currentApplication.createTime)}
                    />
                    <DetailRow
                      label="流程实例 ID"
                      value={currentApplication.processInstanceId || '-'}
                    />
                  </div>

                  {detailLoading ? (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
                      正在加载申请详情...
                    </div>
                  ) : null}

                  <div className="rounded-xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm leading-6 text-cyan-800 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-200">
                    审批通过后后端会自动生成 4 项入职任务；任务全部完成后才能确认入职。确认入职时会新建员工档案，员工初始状态为试用期，并回写申请上的员工 ID。
                  </div>

                  {hasWorkflowStatus(currentApplication.status, 'APPROVED') && pendingTaskCount > 0 ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                      当前申请还有 {pendingTaskCount} 项入职任务未完成，暂不能确认入职。
                    </div>
                  ) : null}

                  <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
                    <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
                      <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                        <ClipboardList className="h-4 w-4 text-cyan-600 dark:text-cyan-300" />
                        入职任务
                      </div>
                      <div className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                        {tasks.length} 项任务
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <Table className="min-w-[980px]">
                        <TableHeader className="bg-slate-50/80 dark:bg-slate-900/60">
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
                          {tasks.length === 0 ? (
                            <TableStateRow
                              colSpan={6}
                              title={currentApplication ? '当前申请暂无任务' : '先加载申请，再查看对应入职任务'}
                            />
                          ) : (
                            tasks.map((item) => {
                              const completed = isTaskCompleted(item.status);
                              const taskActionKey = `task-${item.id}`;

                              return (
                                <TableRow key={item.id}>
                                  <TableCell>
                                    <div className="font-medium text-slate-900 dark:text-slate-100">
                                      {item.taskName}
                                    </div>
                                    <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                                      {item.taskTypeDesc || item.taskType}
                                    </div>
                                    {item.taskDescription ? (
                                      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                        {item.taskDescription}
                                      </div>
                                    ) : null}
                                  </TableCell>
                                  <TableCell>{item.assigneeName || '-'}</TableCell>
                                  <TableCell>
                                    <span
                                      className={[
                                        'inline-flex rounded-full border px-2 py-0.5 text-xs font-medium',
                                        taskStatusClass(item.status),
                                      ].join(' ')}
                                    >
                                      {item.statusDesc || item.status}
                                    </span>
                                  </TableCell>
                                  <TableCell>{formatDateTime(item.completedTime)}</TableCell>
                                  <TableCell className="min-w-[240px]">
                                    <Input
                                      placeholder="可选填写办理备注"
                                      disabled={completed || Boolean(pendingAction)}
                                      value={taskRemarks[item.id] ?? item.remark ?? ''}
                                      onChange={(event) =>
                                        setTaskRemarks((prev) => ({
                                          ...prev,
                                          [item.id]: event.target.value,
                                        }))
                                      }
                                    />
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <Button
                                      size="sm"
                                      variant={completed ? 'outline' : 'default'}
                                      disabled={completed || Boolean(pendingAction)}
                                      onClick={() => void handleCompleteTask(item.id)}
                                    >
                                      {pendingAction === taskActionKey
                                        ? '提交中...'
                                        : completed
                                          ? '已完成'
                                          : '完成任务'}
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              );
                            })
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      />

      <BaseDialog
        open={createDialogOpen}
        title="新建入职申请"
        onClose={resetCreateForm}
        maxWidthClassName="max-w-4xl"
        footer={(
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={resetCreateForm}>
              取消
            </Button>
            <Button disabled={pendingAction === 'create'} onClick={() => void handleCreateApplication()}>
              {pendingAction === 'create' ? '创建中...' : '创建申请'}
            </Button>
          </div>
        )}
      >
        <div className="space-y-4">
          <DialogSection
            title="候选人来源"
          >
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">候选人来源</Label>
              <Select
                value={createForm.candidateId ? String(createForm.candidateId) : EMPTY_VALUE}
                onValueChange={(value) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    candidateId: value === EMPTY_VALUE ? undefined : Number(value),
                  }))
                }
              >
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="可选：从候选人带入" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={EMPTY_VALUE}>手工创建</SelectItem>
                  {availableCandidates.map((item) => (
                    <SelectItem key={item.id} value={String(item.id)}>
                      {item.name} / {item.phone} / {item.statusDesc || item.status || '-'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                已存在未拒绝入职单的候选人会自动从这里剔除，避免重复建单。
              </div>
            </div>
          </DialogSection>

          <DialogSection
            title="基础信息"
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">姓名</Label>
                <Input
                  value={createForm.name}
                  onChange={(event) =>
                    setCreateForm((prev) => ({ ...prev, name: event.target.value }))
                  }
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">性别</Label>
                <Select
                  value={createForm.gender || 'MALE'}
                  onValueChange={(value) =>
                    setCreateForm((prev) => ({ ...prev, gender: value }))
                  }
                >
                  <SelectTrigger className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MALE">男</SelectItem>
                    <SelectItem value="FEMALE">女</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">手机号</Label>
                <Input
                  inputMode="numeric"
                  maxLength={11}
                  placeholder="请输入 11 位手机号"
                  value={createForm.phone}
                  onChange={(event) =>
                    setCreateForm((prev) => ({
                      ...prev,
                      phone: event.target.value.replace(/\s+/g, ''),
                    }))
                  }
                  className="h-11"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">邮箱</Label>
                <Input
                  type="email"
                  placeholder="请输入邮箱地址"
                  value={createForm.email || ''}
                  onChange={(event) =>
                    setCreateForm((prev) => ({ ...prev, email: event.target.value.trim() }))
                  }
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">预计入职日期</Label>
                <Input
                  type="date"
                  value={createForm.expectedDate}
                  onChange={(event) =>
                    setCreateForm((prev) => ({ ...prev, expectedDate: event.target.value }))
                  }
                  className="h-11"
                />
              </div>
            </div>
          </DialogSection>

          <DialogSection
            title="组织信息"
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">部门</Label>
                <Select
                  value={createForm.deptId ? String(createForm.deptId) : undefined}
                  onValueChange={(value) =>
                    setCreateForm((prev) => ({ ...prev, deptId: Number(value) }))
                  }
                >
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="请选择部门" />
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
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">岗位</Label>
                <Select
                  value={createForm.postId ? String(createForm.postId) : undefined}
                  onValueChange={(value) =>
                    setCreateForm((prev) => ({ ...prev, postId: Number(value) }))
                  }
                >
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="请选择岗位" />
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
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">职位</Label>
                <Select
                  value={createForm.positionId ? String(createForm.positionId) : EMPTY_VALUE}
                  onValueChange={(value) =>
                    setCreateForm((prev) => ({
                      ...prev,
                      positionId: value === EMPTY_VALUE ? undefined : Number(value),
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
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  职位选项会随岗位联动，避免提交无效的岗位与职位组合。
                </div>
              </div>
            </div>
          </DialogSection>
        </div>
      </BaseDialog>
    </div>
  );
};

export default HrOnboardingPage;
