import React, { useEffect, useMemo, useState } from 'react';
import { ClipboardList, FilePlus2, Search, UserRoundPlus } from 'lucide-react';
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
} from '@/components/ui';
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
  submitOnboardingApplication,
} from '@/services/api/hr';
import { flattenDeptTree, hasWorkflowStatus, normalizeRows, toDateInputValue } from './hrShared';

const EMPTY_VALUE = '__empty__';

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

const onboardingStatusClass = (status?: string) => {
  if (!status) return 'bg-slate-100 text-slate-700';
  if (/(CONFIRM|COMPLETE|SUCCESS)/i.test(status)) return 'bg-emerald-50 text-emerald-700';
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
  const [deptOptions, setDeptOptions] = useState<Array<{ label: string; value: number }>>([]);
  const [postOptions, setPostOptions] = useState<PostOption[]>([]);
  const [positionOptions, setPositionOptions] = useState<PositionOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createForm, setCreateForm] = useState<OnboardingApplicationPayload>(defaultCreateForm);
  const [applicationIdInput, setApplicationIdInput] = useState('');
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
      const postList = normalizeRows<PostOption>(postRes);
      const positionList = Array.isArray(positionRes) ? positionRes : [];

      setCandidates(candidateList);
      setDeptOptions(flattenDeptTree(Array.isArray(deptRes) ? deptRes : []));
      setPostOptions(postList);
      setPositionOptions(positionList);

      setCreateForm(prev => ({
        ...prev,
        deptId: prev.deptId || 0,
        postId: prev.postId || postList[0]?.postId || 0,
        positionId: prev.positionId || positionList[0]?.id,
      }));
    } catch (error) {
      console.error(error);
      toast.error('入职基础数据加载失败');
    } finally {
      setLoading(false);
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
      setApplicationIdInput(String(applicationId));
      setConfirmDate(prev => prev || toDateInputValue(applicationRes.expectedDate));
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
  }, []);

  useEffect(() => {
    if (!deptOptions.length || !postOptions.length) return;

    setCreateForm(prev => ({
      ...prev,
      deptId: prev.deptId || deptOptions[0]?.value || 0,
      postId: prev.postId || postOptions[0]?.postId || 0,
      positionId: prev.positionId || positionOptions[0]?.id,
    }));
  }, [deptOptions, postOptions, positionOptions]);

  useEffect(() => {
    if (!createForm.candidateId) return;

    const matchedCandidate = candidates.find(item => item.id === createForm.candidateId);
    if (!matchedCandidate) return;

    // 从招聘链路带入候选人时，自动回填基础信息，方便直接验证招聘到入职的真实链路。
    setCreateForm(prev => ({
      ...prev,
      name: matchedCandidate.name,
      gender: matchedCandidate.gender || prev.gender || 'MALE',
      phone: matchedCandidate.phone,
      email: matchedCandidate.email || '',
      positionId: matchedCandidate.positionId || prev.positionId,
    }));
  }, [candidates, createForm.candidateId]);

  const completedTaskCount = useMemo(
    () => tasks.filter(item => isTaskCompleted(item.status)).length,
    [tasks],
  );

  const pendingTaskCount = Math.max(tasks.length - completedTaskCount, 0);
  const canSubmitApplication = hasWorkflowStatus(currentApplication?.status, 'DRAFT');
  const canApproveApplication = hasWorkflowStatus(currentApplication?.status, 'APPROVING');
  const canConfirmApplication = hasWorkflowStatus(currentApplication?.status, 'APPROVED') && pendingTaskCount === 0;

  const resetCreateForm = () => {
    setCreateForm({
      ...defaultCreateForm,
      deptId: deptOptions[0]?.value || 0,
      postId: postOptions[0]?.postId || 0,
      positionId: positionOptions[0]?.id,
    });
    setCreateDialogOpen(false);
  };

  const handleLoadApplication = async () => {
    const applicationId = Number(applicationIdInput);
    if (!applicationId) {
      toast.error('请输入有效的申请 ID');
      return;
    }

    await loadApplicationDetail(applicationId);
  };

  const handleCreateApplication = async () => {
    try {
      const applicationId = await createOnboardingApplication({
        ...createForm,
        candidateId: createForm.candidateId || undefined,
        positionId: createForm.positionId || undefined,
      });

      toast.success(`入职申请已创建，申请 ID：${applicationId}`);
      setConfirmDate(createForm.expectedDate);
      resetCreateForm();
      await loadApplicationDetail(applicationId);
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
      await loadApplicationDetail(currentApplication.id);
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
      await loadApplicationDetail(currentApplication.id);
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || '审批入职申请失败');
    }
  };

  const handleCompleteTask = async (taskId: number) => {
    if (!currentApplication) return;

    try {
      await completeOnboardingTask(taskId, taskRemarks[taskId]);
      toast.success('任务已完成');
      setTaskRemarks(prev => ({ ...prev, [taskId]: '' }));
      await loadApplicationDetail(currentApplication.id);
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
      await loadApplicationDetail(currentApplication.id);
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || '确认入职失败');
    }
  };

  return (
    <div className="space-y-6">
      <Card className="rounded-3xl border-white/80 bg-white/70 p-8 shadow-[0_12px_40px_rgba(15,23,42,0.06)] backdrop-blur-xl">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
              <UserRoundPlus size={14} />
              Onboarding Flow
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">入职办理中心</h1>
            <p className="mt-2 text-sm text-slate-500">按后端真实能力完成入职申请、任务办理和确认入职，不依赖移动端入口。</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button className="rounded-2xl" onClick={() => setCreateDialogOpen(true)}>
              <FilePlus2 size={16} className="mr-2" />
              新建入职申请
            </Button>
            <Button
              variant="outline"
              className="rounded-2xl"
              onClick={() => {
                if (currentApplication) {
                  void loadApplicationDetail(currentApplication.id);
                  return;
                }
                void loadBootstrapData();
              }}
            >
              刷新当前数据
            </Button>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="rounded-3xl border-white/80 bg-white/70 p-6 backdrop-blur-xl">
          <div className="text-sm font-medium text-slate-500">候选人来源</div>
          <div className="mt-3 text-3xl font-bold tracking-tight text-slate-900">{loading ? '--' : candidates.length}</div>
          <div className="mt-2 text-xs text-slate-400">可直接从招聘候选人带入基础信息</div>
        </Card>
        <Card className="rounded-3xl border-white/80 bg-white/70 p-6 backdrop-blur-xl">
          <div className="text-sm font-medium text-slate-500">当前申请任务数</div>
          <div className="mt-3 text-3xl font-bold tracking-tight text-slate-900">{currentApplication ? tasks.length : '--'}</div>
          <div className="mt-2 text-xs text-slate-400">当前打开的申请对应办理任务</div>
        </Card>
        <Card className="rounded-3xl border-white/80 bg-white/70 p-6 backdrop-blur-xl">
          <div className="text-sm font-medium text-slate-500">待完成任务</div>
          <div className="mt-3 text-3xl font-bold tracking-tight text-slate-900">{currentApplication ? pendingTaskCount : '--'}</div>
          <div className="mt-2 text-xs text-slate-400">{currentApplication ? `${completedTaskCount} 项已完成` : '先加载一个申请查看任务进度'}</div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <Card className="rounded-3xl border-white/80 bg-white/70 p-6 backdrop-blur-xl">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-slate-900">申请检索</h2>
            <p className="mt-1 text-sm text-slate-500">当前后端按申请 ID 查询详情和任务，这里直接按真实接口联调。</p>
          </div>
          <div className="space-y-4">
            <div>
              <Label>申请 ID</Label>
              <div className="mt-2 flex gap-3">
                <div className="relative flex-1">
                  <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input
                    className="pl-10"
                    placeholder="输入申请 ID"
                    value={applicationIdInput}
                    onChange={event => setApplicationIdInput(event.target.value)}
                  />
                </div>
                <Button onClick={() => void handleLoadApplication()}>查询</Button>
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              新建申请后会自动回填当前申请 ID，便于继续提交流程、完成任务和确认入职。
            </div>
            {currentApplication && (
              <div className="rounded-2xl border border-sky-100 bg-sky-50/80 p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">当前申请</div>
                <div className="mt-3 text-base font-semibold text-slate-900">{currentApplication.applicationNo}</div>
                <div className="mt-1 text-sm text-slate-500">{currentApplication.name} / {currentApplication.phone}</div>
                <div className={`mt-3 inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${onboardingStatusClass(currentApplication.status)}`}>
                  {currentApplication.statusDesc || currentApplication.status}
                </div>
              </div>
            )}
          </div>
        </Card>

        <Card className="rounded-3xl border-white/80 bg-white/70 p-6 backdrop-blur-xl">
          <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">申请详情</h2>
              <p className="mt-1 text-sm text-slate-500">查看当前申请的状态、组织归属和入职结果。</p>
            </div>
            {currentApplication && (
              <div className="flex flex-wrap gap-3">
                <Button variant="outline" disabled={!canSubmitApplication} onClick={handleSubmitApplication}>提交申请</Button>
                <Button variant="outline" disabled={!canApproveApplication} onClick={handleApproveApplication}>审批通过</Button>
                <div className="flex gap-2">
                  <Input type="date" value={confirmDate} onChange={event => setConfirmDate(event.target.value)} />
                  <Button disabled={!canConfirmApplication} onClick={handleConfirmApplication}>确认入职</Button>
                </div>
              </div>
            )}
          </div>

          {!currentApplication && (
            <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50/80 px-6 py-16 text-center text-sm text-slate-500">
              输入申请 ID 或先创建一条入职申请后，这里会展示真实详情与办理动作。
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
            </div>
          )}

          {detailLoading && (
            <div className="mt-4 text-sm text-slate-400">正在加载申请详情...</div>
          )}
          {currentApplication && hasWorkflowStatus(currentApplication.status, 'APPROVED') && pendingTaskCount > 0 && (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              当前申请还有 {pendingTaskCount} 项入职任务未完成，暂不能确认入职。
            </div>
          )}
        </Card>
      </div>

      <Card className="rounded-3xl border-white/80 bg-white/70 p-6 backdrop-blur-xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">入职任务</h2>
            <p className="mt-1 text-sm text-slate-500">任务列表直接取后端入职任务接口，完成后立即刷新状态。</p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
            <ClipboardList size={14} />
            {currentApplication ? `${tasks.length} 项任务` : '等待加载申请'}
          </div>
        </div>
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
            {!tasks.length && (
              <TableRow>
                <TableCell colSpan={6} className="py-12 text-center text-slate-400">
                  {currentApplication ? '当前申请暂无任务' : '先加载申请，再查看对应入职任务'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      {createDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-3xl border border-white/80 bg-white p-6 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">新建入职申请</h2>
                <p className="mt-1 text-sm text-slate-500">支持手工创建，也支持从招聘候选人带入基础信息。</p>
              </div>
              <Button variant="ghost" onClick={resetCreateForm}>关闭</Button>
            </div>

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
                    {candidates.map(item => (
                      <SelectItem key={item.id} value={String(item.id)}>
                        {item.name} / {item.phone} / {item.positionName || '-'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                <Input value={createForm.phone} onChange={event => setCreateForm(prev => ({ ...prev, phone: event.target.value }))} />
              </div>
              <div>
                <Label>邮箱</Label>
                <Input value={createForm.email || ''} onChange={event => setCreateForm(prev => ({ ...prev, email: event.target.value }))} />
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
                    {positionOptions.map(option => (
                      <SelectItem key={option.id} value={String(option.id)}>
                        {option.positionName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
          </div>
        </div>
      )}
    </div>
  );
};

export default HrOnboardingPage;
