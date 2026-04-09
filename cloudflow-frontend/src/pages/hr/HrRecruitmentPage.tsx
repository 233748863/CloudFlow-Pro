import React, { useEffect, useMemo, useState } from 'react';
import { BriefcaseBusiness, CalendarRange, Plus, Search, UserRoundSearch } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Tabs, TabsContent, TabsList, TabsTrigger, Textarea } from '@/components/ui';
import { Candidate, CandidatePayload, DeptTreeNode, Interview, InterviewSchedulePayload, PositionOption, RecruitmentRequest, RecruitmentRequestPayload, listRecruitmentRequests, createRecruitmentRequest, listCandidates, createCandidate, updateCandidateStatus, listInterviews, scheduleInterview, getDeptTreeOptions, getPositionOptions, submitRecruitmentRequest, approveRecruitmentRequest, completeRecruitmentRequest, cancelRecruitmentRequest } from '@/services/api/hr';
import { WorkspaceDialogShell, WorkspaceHeroCard, WorkspaceSectionCard } from '@/components/workspace/WorkspacePanels';

const normalizeRows = <T,>(data: any): T[] => {
  if (!data) return [];
  if (Array.isArray(data)) return data as T[];
  if (Array.isArray(data.records)) return data.records as T[];
  if (Array.isArray(data.rows)) return data.rows as T[];
  return [];
};

const flattenDeptTree = (nodes: DeptTreeNode[] = [], prefix = ''): Array<{ label: string; value: number }> => {
  const result: Array<{ label: string; value: number }> = [];
  nodes.forEach(node => {
    result.push({ label: prefix ? `${prefix} / ${node.deptName}` : node.deptName, value: node.deptId });
    if (node.children?.length) {
      result.push(...flattenDeptTree(node.children, prefix ? `${prefix} / ${node.deptName}` : node.deptName));
    }
  });
  return result;
};

const requestStatusTone: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-700',
  APPROVING: 'bg-amber-50 text-amber-700',
  RECRUITING: 'bg-emerald-50 text-emerald-700',
  COMPLETED: 'bg-slate-100 text-slate-600',
  CANCELLED: 'bg-rose-50 text-rose-700',
};

const candidateStatusTone: Record<string, string> = {
  NEW: 'bg-slate-100 text-slate-700',
  SCREENING: 'bg-blue-50 text-blue-700',
  INTERVIEW: 'bg-amber-50 text-amber-700',
  OFFER: 'bg-pink-50 text-pink-700',
  HIRED: 'bg-emerald-50 text-emerald-700',
  REJECTED: 'bg-rose-50 text-rose-700',
};

const interviewStatusTone: Record<string, string> = {
  SCHEDULED: 'bg-blue-50 text-blue-700',
  COMPLETED: 'bg-emerald-50 text-emerald-700',
  CANCELLED: 'bg-slate-100 text-slate-700',
};

const editableCandidateStatuses = ['NEW', 'SCREENING', 'INTERVIEW', 'REJECTED'];

const requestFormDefault: RecruitmentRequestPayload = {
  deptId: 103,
  positionId: 0,
  headcount: 1,
  jobRequirements: '',
  salaryMin: 15000,
  salaryMax: 25000,
  expectedDate: '',
};

const candidateFormDefault: CandidatePayload = {
  requestId: 0,
  name: '',
  gender: 'MALE',
  phone: '',
  email: '',
  resumeUrl: '',
  source: 'WEBSITE',
};

const interviewFormDefault: InterviewSchedulePayload = {
  candidateId: 0,
  interviewRound: 'FIRST',
  interviewType: 'VIDEO',
  interviewTime: '',
  location: '',
  interviewerIds: [],
};

export const HrRecruitmentPage: React.FC = () => {
  const [requests, setRequests] = useState<RecruitmentRequest[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [deptOptions, setDeptOptions] = useState<Array<{ label: string; value: number }>>([]);
  const [positionOptions, setPositionOptions] = useState<PositionOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [requestDialog, setRequestDialog] = useState(false);
  const [candidateDialog, setCandidateDialog] = useState(false);
  const [interviewDialog, setInterviewDialog] = useState(false);
  const [rejectCandidateId, setRejectCandidateId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [requestForm, setRequestForm] = useState<RecruitmentRequestPayload>(requestFormDefault);
  const [candidateForm, setCandidateForm] = useState<CandidatePayload>(candidateFormDefault);
  const [interviewForm, setInterviewForm] = useState<InterviewSchedulePayload>(interviewFormDefault);

  const loadData = async () => {
    setLoading(true);
    try {
      const [requestRes, candidateRes, interviewRes, deptRes, positionRes] = await Promise.all([
        listRecruitmentRequests({ pageNum: 1, pageSize: 50 }),
        listCandidates({ pageNum: 1, pageSize: 50 }),
        listInterviews(),
        getDeptTreeOptions(),
        getPositionOptions(),
      ]);
      setRequests(normalizeRows<RecruitmentRequest>(requestRes));
      setCandidates(normalizeRows<Candidate>(candidateRes));
      setInterviews(normalizeRows<Interview>(interviewRes));
      setDeptOptions(flattenDeptTree(Array.isArray(deptRes) ? deptRes : []));
      setPositionOptions(Array.isArray(positionRes) ? positionRes : []);
    } catch (error) {
      console.error(error);
      toast.error('招聘数据加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    if (positionOptions.length && !requestForm.positionId) {
      setRequestForm(prev => ({ ...prev, positionId: positionOptions[0].id }));
    }
  }, [positionOptions, requestForm.positionId]);

  const filteredRequests = useMemo(
    () => requests.filter(item => [item.requestNo, item.positionName, item.deptName, item.jobRequirements].filter(Boolean).some(value => String(value).toLowerCase().includes(keyword.toLowerCase()))),
    [requests, keyword],
  );
  const recruitingRequests = useMemo(
    () => requests.filter(item => item.status === 'RECRUITING'),
    [requests],
  );
  const interviewableRequestIds = useMemo(
    () => new Set(recruitingRequests.map(item => item.id)),
    [recruitingRequests],
  );

  const filteredCandidates = useMemo(
    () => candidates.filter(item => [item.name, item.phone, item.email, item.positionName, item.statusDesc].filter(Boolean).some(value => String(value).toLowerCase().includes(keyword.toLowerCase()))),
    [candidates, keyword],
  );
  const interviewableCandidates = useMemo(
    () => candidates.filter(item => interviewableRequestIds.has(item.requestId) && ['NEW', 'SCREENING', 'INTERVIEW'].includes(item.status)),
    [candidates, interviewableRequestIds],
  );

  useEffect(() => {
    if (recruitingRequests.length && !candidateForm.requestId) {
      setCandidateForm(prev => ({ ...prev, requestId: recruitingRequests[0].id }));
      return;
    }

    if (candidateForm.requestId && !recruitingRequests.some(item => item.id === candidateForm.requestId)) {
      setCandidateForm(prev => ({ ...prev, requestId: recruitingRequests[0]?.id || 0 }));
    }
  }, [candidateForm.requestId, recruitingRequests]);

  useEffect(() => {
    if (interviewableCandidates.length && !interviewForm.candidateId) {
      setInterviewForm(prev => ({ ...prev, candidateId: interviewableCandidates[0].id }));
      return;
    }

    if (interviewForm.candidateId && !interviewableCandidates.some(item => item.id === interviewForm.candidateId)) {
      setInterviewForm(prev => ({ ...prev, candidateId: interviewableCandidates[0]?.id || 0 }));
    }
  }, [interviewForm.candidateId, interviewableCandidates]);

  const handleCreateRequest = async () => {
    try {
      await createRecruitmentRequest(requestForm);
      toast.success('招聘需求已创建');
      setRequestDialog(false);
      setRequestForm(requestFormDefault);
      await loadData();
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || '招聘需求创建失败');
    }
  };

  const handleSubmitRequest = async (id: number) => {
    try {
      await submitRecruitmentRequest(id);
      toast.success('招聘需求已提交');
      await loadData();
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || '招聘需求提交失败');
    }
  };

  const handleApproveRequest = async (id: number) => {
    try {
      await approveRecruitmentRequest(id);
      toast.success('招聘需求已审批通过');
      await loadData();
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || '招聘需求审批失败');
    }
  };

  const handleCompleteRequest = async (id: number) => {
    try {
      await completeRecruitmentRequest(id);
      toast.success('招聘需求已完成');
      await loadData();
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || '招聘需求完成失败');
    }
  };

  const handleCancelRequest = async (id: number) => {
    try {
      await cancelRecruitmentRequest(id);
      toast.success('招聘需求已取消');
      await loadData();
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || '招聘需求取消失败');
    }
  };

  const handleCreateCandidate = async () => {
    try {
      await createCandidate(candidateForm);
      toast.success('候选人已录入');
      setCandidateDialog(false);
      setCandidateForm(candidateFormDefault);
      await loadData();
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || '候选人创建失败');
    }
  };

  const handleScheduleInterview = async () => {
    try {
      await scheduleInterview(interviewForm);
      toast.success('面试已安排');
      setInterviewDialog(false);
      setInterviewForm(interviewFormDefault);
      await loadData();
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || '面试安排失败');
    }
  };

  const handleCandidateStatusChange = async (id: number, status: string) => {
    if (status === 'REJECTED') {
      setRejectCandidateId(id);
      setRejectReason('');
      return;
    }

    try {
      await updateCandidateStatus(id, status);
      toast.success('候选人状态已更新');
      await loadData();
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || '候选人状态更新失败');
    }
  };

  const handleRejectCandidate = async () => {
    if (!rejectCandidateId) return;
    if (!rejectReason.trim()) {
      toast.error('请输入拒绝原因');
      return;
    }

    try {
      await updateCandidateStatus(rejectCandidateId, 'REJECTED', rejectReason.trim());
      toast.success('候选人已标记为拒绝');
      setRejectCandidateId(null);
      setRejectReason('');
      await loadData();
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || '候选人状态更新失败');
    }
  };

  return (
    <div className="space-y-6">
      <WorkspaceHeroCard
        badge={(
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-600">
            <BriefcaseBusiness size={14} />
            Recruitment Hub
          </div>
        )}
        title="招聘与候选人中心"
        description="把招聘需求、候选人推进和面试安排放在一个桌面工作区。"
        actions={(
          <>
            <Button className="rounded-2xl" onClick={() => setRequestDialog(true)}>
              <Plus size={16} className="mr-2" />
              新建招聘需求
            </Button>
            <Button variant="outline" className="rounded-2xl" onClick={() => setCandidateDialog(true)}>
              <UserRoundSearch size={16} className="mr-2" />
              新建候选人
            </Button>
            <Button variant="outline" className="rounded-2xl" onClick={() => setInterviewDialog(true)}>
              <CalendarRange size={16} className="mr-2" />
              安排面试
            </Button>
          </>
        )}
      />

      <WorkspaceSectionCard
        title="搜索与检索"
        description="按需求编号、岗位、候选人、邮箱或状态快速过滤当前招聘工作台。"
        bodyClassName="mt-0"
      >
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input className="pl-10" placeholder="搜索需求编号、岗位、候选人、邮箱或状态" value={keyword} onChange={event => setKeyword(event.target.value)} />
        </div>
      </WorkspaceSectionCard>

      <Tabs defaultValue="request">
        <TabsList className="grid w-full grid-cols-3 rounded-2xl bg-white/70 p-1 backdrop-blur-xl">
          <TabsTrigger value="request">招聘需求</TabsTrigger>
          <TabsTrigger value="candidate">候选人</TabsTrigger>
          <TabsTrigger value="interview">面试安排</TabsTrigger>
        </TabsList>

        <TabsContent value="request" className="mt-4">
          <WorkspaceSectionCard
            title="招聘需求"
            description="创建、提交、审批和关闭招聘需求都在这一组主表里推进。"
            headerAside={<span className="rounded-full bg-white/82 px-3 py-1.5 text-[11px] font-medium text-slate-500 ring-1 ring-white/80 shadow-[0_8px_18px_rgba(15,23,42,0.04)]">共 {filteredRequests.length} 条</span>}
            bodyClassName="mt-0"
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>需求编号</TableHead>
                  <TableHead>部门</TableHead>
                  <TableHead>岗位</TableHead>
                  <TableHead>招聘人数</TableHead>
                  <TableHead>已录用</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRequests.map(item => (
                  <TableRow key={item.id}>
                    <TableCell className="font-semibold text-slate-900">{item.requestNo}</TableCell>
                    <TableCell>{item.deptName || '-'}</TableCell>
                    <TableCell>{item.positionName || '-'}</TableCell>
                    <TableCell>{item.headcount}</TableCell>
                    <TableCell>{item.hiredCount}</TableCell>
                    <TableCell><span className={`rounded-full px-2 py-1 text-xs font-medium ${requestStatusTone[item.status] || requestStatusTone.DRAFT}`}>{item.statusDesc || item.status}</span></TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" disabled={item.status !== 'DRAFT'} onClick={() => void handleSubmitRequest(item.id)}>
                          提交
                        </Button>
                        <Button size="sm" variant="outline" disabled={item.status !== 'APPROVING'} onClick={() => void handleApproveRequest(item.id)}>
                          审批通过
                        </Button>
                        <Button size="sm" variant="outline" disabled={item.status !== 'RECRUITING'} onClick={() => void handleCompleteRequest(item.id)}>
                          完成
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={item.status === 'COMPLETED' || item.status === 'CANCELLED'}
                          onClick={() => void handleCancelRequest(item.id)}
                        >
                          取消
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {!filteredRequests.length && !loading && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-12 text-center text-slate-400">暂无招聘需求</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </WorkspaceSectionCard>
        </TabsContent>

        <TabsContent value="candidate" className="mt-4">
          <WorkspaceSectionCard
            title="候选人"
            description="候选人状态只在招聘链路内推进，到 Offer 或入职阶段后转由后续模块继续处理。"
            headerAside={<span className="rounded-full bg-white/82 px-3 py-1.5 text-[11px] font-medium text-slate-500 ring-1 ring-white/80 shadow-[0_8px_18px_rgba(15,23,42,0.04)]">共 {filteredCandidates.length} 条</span>}
            bodyClassName="mt-0"
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>候选人</TableHead>
                  <TableHead>手机号</TableHead>
                  <TableHead>来源</TableHead>
                  <TableHead>岗位</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="text-right">推进</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCandidates.map(item => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div className="font-semibold text-slate-900">{item.name}</div>
                      <div className="text-xs text-slate-400">{item.email || '-'}</div>
                    </TableCell>
                    <TableCell>{item.phone}</TableCell>
                    <TableCell>{item.sourceDesc || item.source || '-'}</TableCell>
                    <TableCell>{item.positionName || '-'}</TableCell>
                    <TableCell><span className={`rounded-full px-2 py-1 text-xs font-medium ${candidateStatusTone[item.status] || candidateStatusTone.NEW}`}>{item.statusDesc || item.status}</span></TableCell>
                    <TableCell className="text-right">
                      {['OFFER', 'HIRED'].includes(item.status) ? (
                        <div className="ml-auto w-[160px] text-right text-xs text-slate-500">
                          请在 Offer / 入职模块继续推进
                        </div>
                      ) : (
                        <Select value={item.status} onValueChange={value => handleCandidateStatusChange(item.id, value)}>
                          <SelectTrigger className="ml-auto w-[140px]">
                            <SelectValue placeholder="更新状态" />
                          </SelectTrigger>
                          <SelectContent>
                            {editableCandidateStatuses.map(status => (
                              <SelectItem key={status} value={status}>
                                {status === 'NEW' ? '新简历' : status === 'SCREENING' ? '筛选中' : status === 'INTERVIEW' ? '面试中' : '已拒绝'}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {!filteredCandidates.length && !loading && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-12 text-center text-slate-400">暂无候选人记录</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </WorkspaceSectionCard>
        </TabsContent>

        <TabsContent value="interview" className="mt-4">
          <WorkspaceSectionCard
            title="面试安排"
            description="所有已排期面试统一在这里复核时间、地点和当前状态。"
            headerAside={<span className="rounded-full bg-white/82 px-3 py-1.5 text-[11px] font-medium text-slate-500 ring-1 ring-white/80 shadow-[0_8px_18px_rgba(15,23,42,0.04)]">共 {interviews.length} 条</span>}
            bodyClassName="mt-0"
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>候选人</TableHead>
                  <TableHead>轮次</TableHead>
                  <TableHead>形式</TableHead>
                  <TableHead>时间</TableHead>
                  <TableHead>地点</TableHead>
                  <TableHead>状态</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {interviews.map(item => (
                  <TableRow key={item.id}>
                    <TableCell className="font-semibold text-slate-900">{item.candidateName || '-'}</TableCell>
                    <TableCell>{item.interviewRoundName || item.interviewRound}</TableCell>
                    <TableCell>{item.interviewTypeName || item.interviewType}</TableCell>
                    <TableCell>{item.interviewTime}</TableCell>
                    <TableCell>{item.location || '-'}</TableCell>
                    <TableCell><span className={`rounded-full px-2 py-1 text-xs font-medium ${interviewStatusTone[item.status] || interviewStatusTone.SCHEDULED}`}>{item.statusName || item.status}</span></TableCell>
                  </TableRow>
                ))}
                {!interviews.length && !loading && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-12 text-center text-slate-400">暂无面试安排</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </WorkspaceSectionCard>
        </TabsContent>
      </Tabs>

      {requestDialog && (
        <WorkspaceDialogShell
          title="新建招聘需求"
          description="先明确部门、职位和招聘人数，后续候选人和面试都会挂在这条需求下。"
          onClose={() => setRequestDialog(false)}
          maxWidthClassName="max-w-2xl"
        >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <Label>部门</Label>
                <Select value={String(requestForm.deptId)} onValueChange={value => setRequestForm(prev => ({ ...prev, deptId: Number(value) }))}>
                  <SelectTrigger><SelectValue placeholder="请选择部门" /></SelectTrigger>
                  <SelectContent>{deptOptions.map(option => <SelectItem key={option.value} value={String(option.value)}>{option.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>职位</Label>
                <Select value={requestForm.positionId ? String(requestForm.positionId) : undefined} onValueChange={value => setRequestForm(prev => ({ ...prev, positionId: Number(value) }))}>
                  <SelectTrigger><SelectValue placeholder="请选择职位" /></SelectTrigger>
                  <SelectContent>{positionOptions.map(option => <SelectItem key={option.id} value={String(option.id)}>{option.positionName}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>招聘人数</Label><Input type="number" min={1} value={requestForm.headcount} onChange={event => setRequestForm(prev => ({ ...prev, headcount: Number(event.target.value) || 1 }))} /></div>
              <div><Label>期望到岗日期</Label><Input type="date" value={requestForm.expectedDate || ''} onChange={event => setRequestForm(prev => ({ ...prev, expectedDate: event.target.value }))} /></div>
              <div><Label>薪资下限</Label><Input type="number" value={requestForm.salaryMin || ''} onChange={event => setRequestForm(prev => ({ ...prev, salaryMin: Number(event.target.value) || undefined }))} /></div>
              <div><Label>薪资上限</Label><Input type="number" value={requestForm.salaryMax || ''} onChange={event => setRequestForm(prev => ({ ...prev, salaryMax: Number(event.target.value) || undefined }))} /></div>
              <div className="md:col-span-2"><Label>任职要求</Label><Input value={requestForm.jobRequirements || ''} onChange={event => setRequestForm(prev => ({ ...prev, jobRequirements: event.target.value }))} /></div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="outline" onClick={() => setRequestDialog(false)}>取消</Button>
              <Button onClick={handleCreateRequest}>创建需求</Button>
            </div>
        </WorkspaceDialogShell>
      )}

      {candidateDialog && (
        <WorkspaceDialogShell
          title="录入候选人"
          description="候选人会绑定到招聘需求，后续面试、Offer 和入职会沿用这条候选人主线。"
          onClose={() => setCandidateDialog(false)}
          maxWidthClassName="max-w-2xl"
        >
            {!recruitingRequests.length && (
              <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                当前没有“招聘中”的需求。请先在需求列表完成提交和审批通过，再录入候选人。
              </div>
            )}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <Label>关联招聘需求</Label>
                <Select value={candidateForm.requestId ? String(candidateForm.requestId) : undefined} onValueChange={value => setCandidateForm(prev => ({ ...prev, requestId: Number(value) }))}>
                  <SelectTrigger><SelectValue placeholder="请选择需求" /></SelectTrigger>
                  <SelectContent>{recruitingRequests.map(item => <SelectItem key={item.id} value={String(item.id)}>{item.requestNo} / {item.positionName || item.positionId}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>姓名</Label><Input value={candidateForm.name} onChange={event => setCandidateForm(prev => ({ ...prev, name: event.target.value }))} /></div>
              <div>
                <Label>性别</Label>
                <Select value={candidateForm.gender || 'MALE'} onValueChange={value => setCandidateForm(prev => ({ ...prev, gender: value }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="MALE">男</SelectItem><SelectItem value="FEMALE">女</SelectItem></SelectContent>
                </Select>
              </div>
              <div><Label>手机号</Label><Input value={candidateForm.phone} onChange={event => setCandidateForm(prev => ({ ...prev, phone: event.target.value }))} /></div>
              <div><Label>邮箱</Label><Input value={candidateForm.email || ''} onChange={event => setCandidateForm(prev => ({ ...prev, email: event.target.value }))} /></div>
              <div>
                <Label>来源</Label>
                <Select value={candidateForm.source || 'WEBSITE'} onValueChange={value => setCandidateForm(prev => ({ ...prev, source: value }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="WEBSITE">官网</SelectItem>
                    <SelectItem value="REFERRAL">内推</SelectItem>
                    <SelectItem value="HEADHUNTER">猎头</SelectItem>
                    <SelectItem value="CAMPUS">校招</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-2"><Label>简历链接</Label><Input value={candidateForm.resumeUrl || ''} onChange={event => setCandidateForm(prev => ({ ...prev, resumeUrl: event.target.value }))} /></div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="outline" onClick={() => setCandidateDialog(false)}>取消</Button>
              <Button disabled={!recruitingRequests.length || !candidateForm.requestId} onClick={handleCreateCandidate}>录入候选人</Button>
            </div>
        </WorkspaceDialogShell>
      )}

      {interviewDialog && (
        <WorkspaceDialogShell
          title="安排面试"
          description="只对当前可推进的候选人开放排期，时间和地点会直接进入面试记录。"
          onClose={() => setInterviewDialog(false)}
          maxWidthClassName="max-w-2xl"
        >
            {!interviewableCandidates.length && (
              <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                当前没有可安排面试的候选人。只有“招聘中”需求下且状态为新简历、筛选中、面试中的候选人才能继续安排面试。
              </div>
            )}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <Label>候选人</Label>
                <Select value={interviewForm.candidateId ? String(interviewForm.candidateId) : undefined} onValueChange={value => setInterviewForm(prev => ({ ...prev, candidateId: Number(value) }))}>
                  <SelectTrigger><SelectValue placeholder="请选择候选人" /></SelectTrigger>
                  <SelectContent>{interviewableCandidates.map(item => <SelectItem key={item.id} value={String(item.id)}>{item.name} / {item.positionName || '-'}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>轮次</Label>
                <Select value={interviewForm.interviewRound} onValueChange={value => setInterviewForm(prev => ({ ...prev, interviewRound: value }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="FIRST">初试</SelectItem><SelectItem value="SECOND">复试</SelectItem><SelectItem value="FINAL">终面</SelectItem></SelectContent>
                </Select>
              </div>
              <div>
                <Label>面试形式</Label>
                <Select value={interviewForm.interviewType} onValueChange={value => setInterviewForm(prev => ({ ...prev, interviewType: value }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="PHONE">电话面试</SelectItem><SelectItem value="VIDEO">视频面试</SelectItem><SelectItem value="ONSITE">现场面试</SelectItem></SelectContent>
                </Select>
              </div>
              <div><Label>面试时间</Label><Input type="datetime-local" value={interviewForm.interviewTime} onChange={event => setInterviewForm(prev => ({ ...prev, interviewTime: event.target.value }))} /></div>
              <div className="md:col-span-2"><Label>地点 / 链接</Label><Input value={interviewForm.location || ''} onChange={event => setInterviewForm(prev => ({ ...prev, location: event.target.value }))} placeholder="会议室 / Teams 链接" /></div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="outline" onClick={() => setInterviewDialog(false)}>取消</Button>
              <Button disabled={!interviewableCandidates.length || !interviewForm.candidateId || !interviewForm.interviewTime} onClick={handleScheduleInterview}>安排面试</Button>
            </div>
        </WorkspaceDialogShell>
      )}

      {rejectCandidateId !== null && (
        <WorkspaceDialogShell
          title="填写拒绝原因"
          description="候选人标记为“已拒绝”时，后端要求必须填写原因。"
          onClose={() => {
            setRejectCandidateId(null);
            setRejectReason('');
          }}
          maxWidthClassName="max-w-xl"
        >
            <div>
              <Label>拒绝原因</Label>
              <Textarea
                className="mt-2"
                rows={4}
                value={rejectReason}
                onChange={event => setRejectReason(event.target.value)}
                placeholder="请输入候选人拒绝原因"
              />
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setRejectCandidateId(null);
                  setRejectReason('');
                }}
              >
                取消
              </Button>
              <Button onClick={() => void handleRejectCandidate()}>确认拒绝</Button>
            </div>
        </WorkspaceDialogShell>
      )}
    </div>
  );
};

export default HrRecruitmentPage;
