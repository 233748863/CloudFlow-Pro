import React, { useEffect, useMemo, useState } from 'react';
import {
  BriefcaseBusiness,
  CalendarRange,
  Check,
  CircleX,
  FileSearch,
  Flag,
  Plus,
  RefreshCcw,
  Send,
  UserCheck,
  UserRoundSearch,
} from 'lucide-react';
import { toast } from 'sonner';
import { getErrorMessage } from '@/utils/errorMessage';
import { BaseDialog } from '@/components/common/BaseDialog';
import FileUpload from '@/components/FileUpload';
import {
  Button,
  DatePicker,
  DeptSelector,
  Input,
  Label,
  PositionSelector,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from '@/components/common';
import {
  Candidate,
  CandidatePayload,
  DeptTreeNode,
  Interview,
  InterviewSchedulePayload,
  Offer,
  OfferPayload,
  PositionOption,
  RecruitmentRequest,
  RecruitmentRequestPayload,
  acceptOffer,
  approveRecruitmentRequest,
  approveOffer,
  cancelRecruitmentRequest,
  completeRecruitmentRequest,
  convertOfferToOnboarding,
  createCandidate,
  createOffer,
  createRecruitmentRequest,
  getDeptTreeOptions,
  getPositionOptions,
  listCandidates,
  listInterviews,
  listOffers,
  listRecruitmentRequests,
  rejectOffer,
  scheduleInterview,
  sendOffer,
  submitOffer,
  submitRecruitmentRequest,
  updateCandidateStatus,
} from '@/services/api/hr';
import { getMeetingRooms } from '@/services/api/schedule';
import { MeetingRoom } from '@/types';
import { formatDateValue, formatDateTimeValue, formatMoneyValue, optionLabel, optionOrIdLabel } from './hrShared';
import { getAttachmentRawValue } from '@/utils/attachment';
import HrRecruitmentChannelPanel from './components/HrRecruitmentChannelPanel';
import HrResumeParsePanel from './components/HrResumeParsePanel';
import { listRecruitmentChannels, type RecruitmentChannel } from '@/services/api/hr/recruitment';
import { DictBadge } from '@/components/common/DictBadge';
import { useDict } from '@/hooks/useDict';
import { TablePageLayout, InnerTableSurface } from '@/components/layout/TablePageLayout';

type RecruitmentTab = 'request' | 'candidate' | 'interview' | 'offer' | 'channel';

const normalizeRows = <T,>(data: unknown): T[] => {
  if (!data) return [];
  if (Array.isArray(data)) return data as T[];
  if (Array.isArray((data as { records?: unknown[] }).records)) {
    return (data as { records: T[] }).records;
  }
  if (Array.isArray((data as { rows?: unknown[] }).rows)) {
    return (data as { rows: T[] }).rows;
  }
  return [];
};

const flattenDeptTree = (
  nodes: DeptTreeNode[] = [],
  prefix = '',
): Array<{ label: string; value: number }> => {
  const result: Array<{ label: string; value: number }> = [];
  nodes.forEach((node) => {
    result.push({
      label: prefix ? `${prefix} / ${node.deptName}` : node.deptName,
      value: node.deptId,
    });
    if (node.children?.length) {
      result.push(
        ...flattenDeptTree(
          node.children,
          prefix ? `${prefix} / ${node.deptName}` : node.deptName,
        ),
      );
    }
  });
  return result;
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
  resumeAttachmentUrls: '',
  source: 'WEBSITE',
};

const interviewFormDefault: InterviewSchedulePayload = {
  candidateId: 0,
  interviewRound: 'FIRST',
  interviewType: 'VIDEO',
  interviewTime: '',
  interviewEndTime: '',
  location: '',
  meetingRoomId: undefined,
  interviewerIds: [],
};

const offerFormDefault: OfferPayload = {
  candidateId: 0,
  positionId: 0,
  salary: 20000,
  expectedArrivalDate: '',
  expireDate: '',
  offerContent: '',
};

const splitAttachmentUrls = (value?: string[] | string) => {
  const list = Array.isArray(value)
    ? value.map((item) => String(item).trim()).filter(Boolean)
    : String(value || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  return list.map((item) => getAttachmentRawValue(item)).filter(Boolean);
};

const toBackendDateTime = (value?: string) => {
  if (!value) return '';
  const normalized = value.replace('T', ' ');
  return normalized.length === 16 ? `${normalized}:00` : normalized;
};

const isMeetingRoomAvailable = (room: MeetingRoom) => String(room.status) === '1';

const getRoomId = (room: MeetingRoom) => Number(room.roomId);

const getRoomSnapshot = (room?: MeetingRoom) => {
  if (!room) return '';
  return room.location ? `${room.name} / ${room.location}` : room.name;
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
    <div className="admin-source-stat-icon mb-3 h-10 w-10 border border-cyan-100 bg-[#effbfe] text-[#0d95b5] dark:border-cyan-900/60 dark:bg-cyan-950/30 dark:text-cyan-200">
      <BriefcaseBusiness className="h-4 w-4" />
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
    <td colSpan={colSpan} className="px-4 py-10">
      <InlineState
        title={title}
        className={loading ? 'py-6' : 'py-4'}
      />
    </td>
  </tr>
);

const DialogSection = ({
  title,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) => (
  <InnerTableSurface className="admin-recruitment-surface" wrapperClassName="admin-recruitment-surface-wrapper">
    <div className="admin-recruitment-surface-head">
      <div>
        <strong>{title}</strong>
      </div>
    </div>
    <div className="admin-recruitment-surface-body">{children}</div>
  </InnerTableSurface>
);

export const HrRecruitmentPage: React.FC = () => {
  const [requests, setRequests] = useState<RecruitmentRequest[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [deptOptions, setDeptOptions] = useState<Array<{ label: string; value: number }>>([]);
  const [positionOptions, setPositionOptions] = useState<PositionOption[]>([]);
  const [meetingRooms, setMeetingRooms] = useState<MeetingRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [activeTab, setActiveTab] = useState<RecruitmentTab>('request');
  const [requestDialog, setRequestDialog] = useState(false);
  const [candidateDialog, setCandidateDialog] = useState(false);
  const [channels, setChannels] = useState<RecruitmentChannel[]>([]);
  const [interviewDialog, setInterviewDialog] = useState(false);
  const [offerDialog, setOfferDialog] = useState(false);
  const [rejectCandidateId, setRejectCandidateId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [requestForm, setRequestForm] = useState<RecruitmentRequestPayload>(requestFormDefault);
  const [candidateForm, setCandidateForm] = useState<CandidatePayload>(candidateFormDefault);
  const [interviewForm, setInterviewForm] = useState<InterviewSchedulePayload>(interviewFormDefault);
  const [offerForm, setOfferForm] = useState<OfferPayload>(offerFormDefault);
  const [resumePanel, setResumePanel] = useState<{ open: boolean; candidate?: Candidate }>({ open: false });
  const candidateStatusDict = useDict('hr_candidate_status');
  const sourceDict = useDict('hr_candidate_source');
  const interviewRoundDict = useDict('hr_interview_round');
  const interviewTypeDict = useDict('hr_interview_type');

  const loadData = async () => {
    setLoading(true);
    try {
      const [requestRes, candidateRes, interviewRes, offerRes, deptRes, positionRes, roomRes] = await Promise.all([
        listRecruitmentRequests({ pageNum: 1, pageSize: 50 }),
        listCandidates({ pageNum: 1, pageSize: 50 }),
        listInterviews(),
        listOffers(),
        getDeptTreeOptions(),
        getPositionOptions(),
        getMeetingRooms(),
      ]);
      setRequests(normalizeRows<RecruitmentRequest>(requestRes));
      setCandidates(normalizeRows<Candidate>(candidateRes));
      setInterviews(normalizeRows<Interview>(interviewRes));
      setOffers(normalizeRows<Offer>(offerRes));
      setDeptOptions(flattenDeptTree(Array.isArray(deptRes) ? deptRes : []));
      setPositionOptions(Array.isArray(positionRes) ? positionRes : []);
      setMeetingRooms(Array.isArray(roomRes) ? roomRes : []);
    } catch (error) {
      console.error(error);
      toast.error(getErrorMessage(error, '招聘数据加载失败'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const list = await listRecruitmentChannels({ status: 'ACTIVE' });
        setChannels(list || []);
      } catch (err) {
        console.warn('加载招聘渠道失败', err);
      }
    })();
  }, []);

  useEffect(() => {
    if (positionOptions.length && !requestForm.positionId) {
      setRequestForm((prev) => ({ ...prev, positionId: positionOptions[0].id }));
    }
  }, [positionOptions, requestForm.positionId]);

  const filteredRequests = useMemo(
    () =>
      requests.filter((item) =>
        [item.requestNo, item.positionName, item.deptName, item.jobRequirements]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(keyword.toLowerCase())),
      ),
    [requests, keyword],
  );

  const recruitingRequests = useMemo(
    () => requests.filter((item) => item.status === 'RECRUITING'),
    [requests],
  );

  const interviewableRequestIds = useMemo(
    () => new Set(recruitingRequests.map((item) => item.id)),
    [recruitingRequests],
  );

  const filteredCandidates = useMemo(
    () =>
      candidates.filter((item) =>
        [item.name, item.phone, item.email, item.positionName, item.statusDesc]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(keyword.toLowerCase())),
      ),
    [candidates, keyword],
  );

  const filteredOffers = useMemo(
    () =>
      offers.filter((item) =>
        [item.offerNo, item.candidateName, item.positionName, item.statusDesc]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(keyword.toLowerCase())),
      ),
    [offers, keyword],
  );

  const interviewableCandidates = useMemo(
    () =>
      candidates.filter(
        (item) =>
          interviewableRequestIds.has(item.requestId)
          && ['NEW', 'SCREENING', 'INTERVIEW'].includes(item.status),
      ),
    [candidates, interviewableRequestIds],
  );

  const availableMeetingRooms = useMemo(
    () => meetingRooms.filter(isMeetingRoomAvailable),
    [meetingRooms],
  );

  const offerableCandidates = useMemo(
    () => candidates.filter((item) => ['INTERVIEW', 'OFFER'].includes(String(item.status || '').toUpperCase())),
    [candidates],
  );

  const selectedMeetingRoom = useMemo(
    () => availableMeetingRooms.find((room) => getRoomId(room) === interviewForm.meetingRoomId),
    [availableMeetingRooms, interviewForm.meetingRoomId],
  );

  const positionSelectOptions = useMemo(
    () => positionOptions.map((item) => ({ label: item.positionName || item.positionCode || String(item.id), value: item.id })),
    [positionOptions],
  );

  const candidateSelectOptions = useMemo(
    () => candidates.map((item) => ({ label: `${item.name} / ${item.positionName || optionLabel(positionSelectOptions, item.positionId)}`, value: item.id })),
    [candidates, positionSelectOptions],
  );

  useEffect(() => {
    if (recruitingRequests.length && !candidateForm.requestId) {
      setCandidateForm((prev) => ({ ...prev, requestId: recruitingRequests[0].id }));
      return;
    }

    if (
      candidateForm.requestId
      && !recruitingRequests.some((item) => item.id === candidateForm.requestId)
    ) {
      setCandidateForm((prev) => ({ ...prev, requestId: recruitingRequests[0]?.id || 0 }));
    }
  }, [candidateForm.requestId, recruitingRequests]);

  useEffect(() => {
    if (interviewableCandidates.length && !interviewForm.candidateId) {
      setInterviewForm((prev) => ({ ...prev, candidateId: interviewableCandidates[0].id }));
      return;
    }

    if (
      interviewForm.candidateId
      && !interviewableCandidates.some((item) => item.id === interviewForm.candidateId)
    ) {
      setInterviewForm((prev) => ({ ...prev, candidateId: interviewableCandidates[0]?.id || 0 }));
    }
  }, [interviewForm.candidateId, interviewableCandidates]);

  useEffect(() => {
    if (offerableCandidates.length && !offerForm.candidateId) {
      const candidate = offerableCandidates[0];
      setOfferForm((prev) => ({
        ...prev,
        candidateId: candidate.id,
        positionId: candidate.positionId || prev.positionId || 0,
      }));
      return;
    }

    if (
      offerForm.candidateId
      && !offerableCandidates.some((item) => item.id === offerForm.candidateId)
    ) {
      const candidate = offerableCandidates[0];
      setOfferForm((prev) => ({
        ...prev,
        candidateId: candidate?.id || 0,
        positionId: candidate?.positionId || prev.positionId || 0,
      }));
    }
  }, [offerForm.candidateId, offerableCandidates]);

  const closeRequestDialog = () => {
    setRequestDialog(false);
    setRequestForm(requestFormDefault);
  };

  const closeCandidateDialog = () => {
    setCandidateDialog(false);
    setCandidateForm(candidateFormDefault);
  };

  const closeInterviewDialog = () => {
    setInterviewDialog(false);
    setInterviewForm(interviewFormDefault);
  };

  const closeOfferDialog = () => {
    setOfferDialog(false);
    setOfferForm(offerFormDefault);
  };

  const handleCreateRequest = async () => {
    setSubmitting(true);
    try {
      await createRecruitmentRequest(requestForm);
      toast.success('招聘需求已创建');
      closeRequestDialog();
      await loadData();
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || '招聘需求创建失败');
    } finally {
      setSubmitting(false);
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
    setSubmitting(true);
    try {
      const resumeAttachmentUrls = splitAttachmentUrls(candidateForm.resumeAttachmentUrls);
      await createCandidate({
        ...candidateForm,
        resumeAttachmentUrls,
      });
      toast.success('候选人已录入');
      closeCandidateDialog();
      await loadData();
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || '候选人创建失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleScheduleInterview = async () => {
    const interviewTime = toBackendDateTime(interviewForm.interviewTime);
    const interviewEndTime = toBackendDateTime(interviewForm.interviewEndTime);
    if (!interviewTime || !interviewEndTime) {
      toast.error('请选择面试开始和结束时间');
      return;
    }
    if (new Date(interviewEndTime.replace(' ', 'T')).getTime() <= new Date(interviewTime.replace(' ', 'T')).getTime()) {
      toast.error('面试结束时间必须晚于开始时间');
      return;
    }

    setSubmitting(true);
    try {
      await scheduleInterview({
        ...interviewForm,
        interviewTime,
        interviewEndTime,
        location: interviewForm.meetingRoomId ? undefined : interviewForm.location,
      });
      toast.success('面试已安排');
      closeInterviewDialog();
      await loadData();
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || '面试安排失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateOffer = async () => {
    if (!offerForm.candidateId) {
      toast.error('请选择候选人');
      return;
    }

    setSubmitting(true);
    try {
      await createOffer({
        ...offerForm,
        expectedDate: offerForm.expectedArrivalDate,
        expiryDate: offerForm.expireDate,
      });
      toast.success('Offer已创建');
      closeOfferDialog();
      await loadData();
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || 'Offer创建失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOfferAction = async (id: number, action: 'submit' | 'approve' | 'send' | 'accept' | 'reject' | 'convert') => {
    try {
      if (action === 'submit') await submitOffer(id);
      if (action === 'approve') await approveOffer(id);
      if (action === 'send') await sendOffer(id);
      if (action === 'accept') await acceptOffer(id);
      if (action === 'reject') await rejectOffer(id);
      if (action === 'convert') await convertOfferToOnboarding(id);
      toast.success(action === 'convert' ? '已转入入职办理' : 'Offer状态已更新');
      await loadData();
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || 'Offer操作失败');
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

    setSubmitting(true);
    try {
      await updateCandidateStatus(rejectCandidateId, 'REJECTED', rejectReason.trim());
      toast.success('候选人已标记为拒绝');
      setRejectCandidateId(null);
      setRejectReason('');
      await loadData();
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || '候选人状态更新失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as RecruitmentTab)} className="contents">
        <section className="admin-source-page admin-hr-recruitment-page">
          <TablePageLayout
            actions={
              <>
                <header className="admin-source-header">
                  <div>
                    <p className="admin-source-kicker">RECRUITMENT</p>
                    <h2>招聘管理</h2>
                    <span>维护招聘需求、候选人、面试安排、Offer 和招聘渠道</span>
                  </div>
                  <div className="admin-source-controls">
                    <Button variant="outline" size="sm" onClick={() => void loadData()}>
                      <RefreshCcw size={14} className={`mr-1.5 ${loading ? 'animate-spin' : ''}`} />
                      刷新
                    </Button>
                  </div>
                </header>
                <section className="admin-source-stat-grid">
                  <article className="card admin-source-stat admin-source-tone-blue">
                    <div className="admin-source-stat-icon"><BriefcaseBusiness size={18} /></div>
                    <div><p>需求</p><strong>{loading ? '--' : requests.length}</strong><span>招聘需求总数</span></div>
                  </article>
                  <article className="card admin-source-stat admin-source-tone-green">
                    <div className="admin-source-stat-icon"><UserRoundSearch size={18} /></div>
                    <div><p>候选人</p><strong>{loading ? '--' : candidates.length}</strong><span>简历和推进记录</span></div>
                  </article>
                  <article className="card admin-source-stat admin-source-tone-violet">
                    <div className="admin-source-stat-icon"><CalendarRange size={18} /></div>
                    <div><p>面试</p><strong>{loading ? '--' : interviews.length}</strong><span>已安排面试</span></div>
                  </article>
                  <article className="card admin-source-stat admin-source-tone-amber">
                    <div className="admin-source-stat-icon"><Send size={18} /></div>
                    <div><p>Offer</p><strong>{loading ? '--' : offers.length}</strong><span>录用推进</span></div>
                  </article>
                </section>
              </>
            }
            filters={
              <>
                <section className="card admin-users-toolbar">
                  <div className="admin-users-filter-grid">
                    <label>
                      <span className="input-label">搜索</span>
                      <div className="admin-source-search-field">
                        <FileSearch size={16} />
                        <Input
                          className="h-[42px]"
                          type="search"
                          value={keyword}
                          onChange={(event) => setKeyword(event.target.value)}
                          placeholder="搜索需求编号、岗位、候选人、邮箱或状态"
                        />
                      </div>
                    </label>
                  </div>
                  <div className="admin-users-toolbar-actions">
                    <Button size="sm" onClick={() => setRequestDialog(true)}>
                      <Plus size={14} className="mr-1.5" />新建需求
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setCandidateDialog(true)}>
                      <UserRoundSearch size={14} className="mr-1.5" />新建候选人
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setInterviewDialog(true)}>
                      <CalendarRange size={14} className="mr-1.5" />安排面试
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setOfferDialog(true)}>
                      <Plus size={14} className="mr-1.5" />新建Offer
                    </Button>
                  </div>
                </section>
                <section className="card admin-users-toolbar">
                  <TabsList className="admin-source-tabs w-full justify-start lg:w-auto">
                    <TabsTrigger value="request" className="flex-1 lg:flex-none">
                      招聘需求
                    </TabsTrigger>
                    <TabsTrigger value="candidate" className="flex-1 lg:flex-none">
                      候选人
                    </TabsTrigger>
                    <TabsTrigger value="interview" className="flex-1 lg:flex-none">
                      面试安排
                    </TabsTrigger>
                    <TabsTrigger value="offer" className="flex-1 lg:flex-none">
                      Offer
                    </TabsTrigger>
                    <TabsTrigger value="channel" className="flex-1 lg:flex-none">
                      招聘渠道
                    </TabsTrigger>
                  </TabsList>
                </section>
              </>
            }
            table={
              <>
                <TabsContent value="request" className="mt-0">
            <InnerTableSurface className="flex min-h-0 flex-1 flex-col">
              <div className="admin-recruitment-table-head">
                <div>
                  <strong>招聘需求</strong>
                  <span>创建、提交、审批和关闭招聘需求都在这一组主表里推进。</span>
                </div>
                <span className="admin-users-filter-count">{loading ? '同步中' : `${filteredRequests.length} 条`}</span>
              </div>
          
              <div className="admin-horizontal-scroll">
                <table className="unity-data-table admin-source-table min-w-[980px]">
                  <thead>
                    <tr>
                      <th>需求编号</th>
                      <th>部门</th>
                      <th>岗位</th>
                      <th>招聘人数</th>
                      <th>已录用</th>
                      <th>状态</th>
                      <th className="text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <TableStateRow
                        colSpan={7}
                        title="正在加载招聘需求..."
                        loading
                      />
                    ) : filteredRequests.length === 0 ? (
                      <TableStateRow
                        colSpan={7}
                        title="暂无招聘需求"
                      />
                    ) : (
                      filteredRequests.map((item) => (
                        <tr key={item.id}>
                          <td><strong>{item.requestNo}</strong></td>
                          <td>{item.deptName || '-'}</td>
                          <td>{item.positionName || '-'}</td>
                          <td>{item.headcount}</td>
                          <td>{item.hiredCount}</td>
                          <td>
                            <DictBadge dictType="hr_recruit_request_status" value={String(item.status ?? '')} fallback={item.statusDesc || '-'} />
                          </td>
                          <td>
                            <div className="admin-users-row-actions">
                              <button
                                type="button"
                                title="提交"
                                disabled={item.status !== 'DRAFT'}
                                onClick={() => void handleSubmitRequest(item.id)}
                              >
                                <Send size={15} />
                              </button>
                              <button
                                type="button"
                                title="审批通过"
                                disabled={item.status !== 'APPROVING'}
                                onClick={() => void handleApproveRequest(item.id)}
                              >
                                <Check size={15} />
                              </button>
                              <button
                                type="button"
                                title="完成"
                                disabled={item.status !== 'RECRUITING'}
                                onClick={() => void handleCompleteRequest(item.id)}
                              >
                                <Flag size={15} />
                              </button>
                              <button
                                type="button"
                                className="danger"
                                title="取消"
                                disabled={item.status === 'COMPLETED' || item.status === 'CANCELLED'}
                                onClick={() => void handleCancelRequest(item.id)}
                              >
                                <CircleX size={15} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </InnerTableSurface>
          </TabsContent>
          
          <TabsContent value="candidate" className="mt-0">
            <InnerTableSurface className="flex min-h-0 flex-1 flex-col">
              <div className="admin-recruitment-table-head">
                <div>
                  <strong>候选人</strong>
                  <span>候选人只在招聘链路内推进，到 Offer 或入职阶段后转由后续模块继续处理。</span>
                </div>
                <span className="admin-users-filter-count">{loading ? '同步中' : `${filteredCandidates.length} 条`}</span>
              </div>
          
              <div className="admin-horizontal-scroll">
                <table className="unity-data-table admin-source-table min-w-[960px]">
                  <thead>
                    <tr>
                      <th>候选人</th>
                      <th>手机号</th>
                      <th>来源</th>
                      <th>岗位</th>
                      <th>状态</th>
                      <th className="text-right">推进</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <TableStateRow
                        colSpan={6}
                        title="正在加载候选人记录..."
                        loading
                      />
                    ) : filteredCandidates.length === 0 ? (
                      <TableStateRow
                        colSpan={6}
                        title="暂无候选人记录"
                      />
                    ) : (
                      filteredCandidates.map((item) => (
                        <tr key={item.id}>
                          <td>
                            <div className="admin-users-identity">
                              <div>
                                <strong>{item.name}</strong>
                                <small>{item.email || '-'}</small>
                              </div>
                            </div>
                          </td>
                          <td>{item.phone}</td>
                          <td>{item.sourceDesc || sourceDict.getLabel(String(item.source ?? ''))}</td>
                          <td>{item.positionName || '-'}</td>
                          <td>
                            <DictBadge dictType="hr_candidate_status" value={String(item.status ?? '')} fallback={item.statusDesc || '-'} />
                          </td>
                          <td>
                            <div className="admin-users-row-actions">
                              <button
                                type="button"
                                title="简历解析"
                                onClick={() => setResumePanel({ open: true, candidate: item })}
                              >
                                <FileSearch size={15} />
                              </button>
                              {['OFFER', 'HIRED'].includes(item.status) ? (
                                <div className="w-[180px] text-right text-xs text-slate-500 dark:text-slate-400">
                                  请在 Offer 或员工异动中继续推进
                                </div>
                              ) : (
                                <Select
                                  value={item.status}
                                  onValueChange={(value) => handleCandidateStatusChange(item.id, value)}
                                >
                                  <SelectTrigger className="w-[148px]">
                                    <SelectValue placeholder="更新状态" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {editableCandidateStatuses.map((status) => (
                                      <SelectItem key={status} value={status}>
                                        {candidateStatusDict.getLabel(status)}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </InnerTableSurface>
          </TabsContent>
          
          <TabsContent value="interview" className="mt-0">
            <InnerTableSurface className="flex min-h-0 flex-1 flex-col">
              <div className="admin-recruitment-table-head">
                <div>
                  <strong>面试安排</strong>
                  <span>所有已排期面试统一在这里复核时间、地点和当前状态。</span>
                </div>
                <span className="admin-users-filter-count">{loading ? '同步中' : `${interviews.length} 条`}</span>
              </div>
          
              <div className="admin-horizontal-scroll">
                <table className="unity-data-table admin-source-table min-w-[860px]">
                  <thead>
                    <tr>
                      <th>候选人</th>
                      <th>轮次</th>
                      <th>形式</th>
                      <th>时间</th>
                      <th>地点</th>
                      <th>状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <TableStateRow
                        colSpan={6}
                        title="正在加载面试安排..."
                        loading
                      />
                    ) : interviews.length === 0 ? (
                      <TableStateRow
                        colSpan={6}
                        title="暂无面试安排"
                      />
                    ) : (
                      interviews.map((item) => (
                        <tr key={item.id}>
                          <td><strong>{item.candidateName || '-'}</strong></td>
                          <td>{item.interviewRoundName || interviewRoundDict.getLabel(String(item.interviewRound ?? ''))}</td>
                          <td>{item.interviewTypeName || interviewTypeDict.getLabel(String(item.interviewType ?? ''))}</td>
                          <td>
                            <div>{formatDateTimeValue(item.interviewTime)}</div>
                            {item.interviewEndTime ? (
                              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                至 {formatDateTimeValue(item.interviewEndTime)}
                              </div>
                            ) : null}
                          </td>
                          <td>{item.meetingRoomName || item.location || '-'}</td>
                          <td>
                            <DictBadge dictType="hr_interview_status" value={String(item.status ?? '')} fallback={item.statusName || item.statusDesc || '-'} />
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </InnerTableSurface>
          </TabsContent>
          
          <TabsContent value="offer" className="mt-0">
            <InnerTableSurface className="flex min-h-0 flex-1 flex-col">
              <div className="admin-recruitment-table-head">
                <div><strong>Offer</strong></div>
                <span className="admin-users-filter-count">{loading ? '同步中' : `${filteredOffers.length} 条`}</span>
              </div>
          
              <div className="admin-horizontal-scroll">
                <table className="unity-data-table admin-source-table min-w-[980px]">
                  <thead>
                    <tr>
                      <th>Offer编号</th>
                      <th>候选人</th>
                      <th>岗位</th>
                      <th>薪资</th>
                      <th>到岗日期</th>
                      <th>状态</th>
                      <th className="text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <TableStateRow colSpan={7} title="正在加载Offer..." loading />
                    ) : filteredOffers.length === 0 ? (
                      <TableStateRow colSpan={7} title="暂无Offer" />
                    ) : (
                      filteredOffers.map((item) => {
                        const status = String(item.status || '').toUpperCase();
                        return (
                          <tr key={item.id}>
                            <td><strong>{item.offerNo || '-'}</strong></td>
                            <td>{item.candidateName || optionOrIdLabel('候选人', candidateSelectOptions, item.candidateId)}</td>
                            <td>{item.positionName || optionOrIdLabel('职位', positionSelectOptions, item.positionId)}</td>
                            <td>{formatMoneyValue(item.salary)}</td>
                            <td>{formatDateValue(item.expectedArrivalDate || item.expectedDate)}</td>
                            <td>
                              <DictBadge dictType="hr_offer_status" value={String(item.status ?? '')} fallback={item.statusDesc || '-'} />
                            </td>
                            <td>
                              <div className="admin-users-row-actions">
                                <button type="button" title="提交" disabled={status !== 'DRAFT'} onClick={() => void handleOfferAction(item.id, 'submit')}>
                                  <Send size={15} />
                                </button>
                                <button type="button" title="通过" disabled={status !== 'APPROVING'} onClick={() => void handleOfferAction(item.id, 'approve')}>
                                  <Check size={15} />
                                </button>
                                <button type="button" title="发送" disabled={status !== 'APPROVED'} onClick={() => void handleOfferAction(item.id, 'send')}>
                                  <Send size={15} />
                                </button>
                                <button type="button" title="接受" disabled={status !== 'SENT'} onClick={() => void handleOfferAction(item.id, 'accept')}>
                                  <UserCheck size={15} />
                                </button>
                                <button type="button" className="danger" title="拒绝" disabled={!['SENT', 'APPROVING'].includes(status)} onClick={() => void handleOfferAction(item.id, 'reject')}>
                                  <CircleX size={15} />
                                </button>
                                <button type="button" title="转入职" disabled={status !== 'ACCEPTED'} onClick={() => void handleOfferAction(item.id, 'convert')}>
                                  <Flag size={15} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </InnerTableSurface>
          </TabsContent>
          
          <TabsContent value="channel" className="mt-0">
            <HrRecruitmentChannelPanel onClose={() => setActiveTab('request')} />
          </TabsContent>
              </>
            }
          />
        </section>
      </Tabs>

      <BaseDialog
        open={requestDialog}
        title="新建招聘需求"
        onClose={closeRequestDialog}
        maxWidthClassName="max-w-3xl"
        bodyClassName="admin-dialog-stack"
        footer={(
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={closeRequestDialog}>
              取消
            </Button>
            <Button disabled={submitting} onClick={() => void handleCreateRequest()}>
              {submitting ? '创建中...' : '创建需求'}
            </Button>
          </div>
        )}
      >
        <DialogSection title="需求信息">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div className="admin-dialog-field">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">部门</Label>
                <DeptSelector
                  single
                  value={requestForm.deptId ?? null}
                  onChange={(id) => setRequestForm((prev) => ({ ...prev, deptId: id ?? 0 }))}
                  placeholder="请选择部门"
                />
              </div>
              <div className="admin-dialog-field">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">职位</Label>
                <PositionSelector
                  single
                  deptId={requestForm.deptId ?? null}
                  value={requestForm.positionId ?? null}
                  onChange={(id) => setRequestForm((prev) => ({ ...prev, positionId: id ?? 0 }))}
                  placeholder="请选择职位"
                />
              </div>
              <div className="admin-dialog-field">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">招聘人数</Label>
                <Input
                  type="number"
                  min={1}
                  value={requestForm.headcount}
                  onChange={(event) =>
                    setRequestForm((prev) => ({
                      ...prev,
                      headcount: Number(event.target.value) || 1,
                    }))
                  }
                  className="h-11"
                />
              </div>
              <div className="admin-dialog-field">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">期望到岗日期</Label>
                <DatePicker
                  type="date"
                  value={requestForm.expectedDate || ''}
                  onChange={(event) =>
                    setRequestForm((prev) => ({ ...prev, expectedDate: event.target.value }))
                  }
                  className="h-11"
                />
              </div>
              <div className="admin-dialog-field">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">薪资下限</Label>
                <Input
                  type="number"
                  value={requestForm.salaryMin || ''}
                  onChange={(event) =>
                    setRequestForm((prev) => ({
                      ...prev,
                      salaryMin: Number(event.target.value) || undefined,
                    }))
                  }
                  className="h-11"
                />
              </div>
              <div className="admin-dialog-field">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">薪资上限</Label>
                <Input
                  type="number"
                  value={requestForm.salaryMax || ''}
                  onChange={(event) =>
                    setRequestForm((prev) => ({
                      ...prev,
                      salaryMax: Number(event.target.value) || undefined,
                    }))
                  }
                  className="h-11"
                />
              </div>
              <div className="admin-dialog-field xl:col-span-3">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">任职要求</Label>
                <Textarea
                  rows={4}
                  value={requestForm.jobRequirements || ''}
                  onChange={(event) =>
                    setRequestForm((prev) => ({ ...prev, jobRequirements: event.target.value }))
                  }
                />
              </div>
            </div>
          </DialogSection>
      </BaseDialog>

      <BaseDialog
        open={candidateDialog}
        title="录入候选人"
        onClose={closeCandidateDialog}
        maxWidthClassName="max-w-3xl"
        bodyClassName="admin-dialog-stack"
        footer={(
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={closeCandidateDialog}>
              取消
            </Button>
            <Button
              disabled={submitting || !recruitingRequests.length || !candidateForm.requestId}
              onClick={() => void handleCreateCandidate()}
            >
              {submitting ? '录入中...' : '录入候选人'}
            </Button>
          </div>
        )}
      >
        {!recruitingRequests.length ? (
            <div className="admin-recruitment-alert">
              当前没有“招聘中”的需求。请先在需求列表完成提交和审批通过，再录入候选人。
            </div>
          ) : null}
          <DialogSection title="候选人信息">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div className="admin-dialog-field xl:col-span-3">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">关联招聘需求</Label>
                <Select
                  value={candidateForm.requestId ? String(candidateForm.requestId) : undefined}
                  onValueChange={(value) =>
                    setCandidateForm((prev) => ({ ...prev, requestId: Number(value) }))
                  }
                >
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="请选择需求" />
                  </SelectTrigger>
                  <SelectContent>
                    {recruitingRequests.map((item) => (
                      <SelectItem key={item.id} value={String(item.id)}>
                        {item.requestNo} / {item.positionName || item.positionId}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="admin-dialog-field">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">姓名</Label>
                <Input
                  value={candidateForm.name}
                  onChange={(event) =>
                    setCandidateForm((prev) => ({ ...prev, name: event.target.value }))
                  }
                  className="h-11"
                />
              </div>
              <div className="admin-dialog-field">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">性别</Label>
                <Select
                  value={candidateForm.gender || 'MALE'}
                  onValueChange={(value) =>
                    setCandidateForm((prev) => ({ ...prev, gender: value }))
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
              <div className="admin-dialog-field">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">手机号</Label>
                <Input
                  value={candidateForm.phone}
                  onChange={(event) =>
                    setCandidateForm((prev) => ({ ...prev, phone: event.target.value }))
                  }
                  className="h-11"
                />
              </div>
              <div className="admin-dialog-field">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">邮箱</Label>
                <Input
                  value={candidateForm.email || ''}
                  onChange={(event) =>
                    setCandidateForm((prev) => ({ ...prev, email: event.target.value }))
                  }
                  className="h-11"
                />
              </div>
              <div className="admin-dialog-field">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">来源</Label>
                <Select
                  value={candidateForm.source || 'WEBSITE'}
                  onValueChange={(value) =>
                    setCandidateForm((prev) => ({ ...prev, source: value }))
                  }
                >
                  <SelectTrigger className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {sourceDict.getOptions().map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="admin-dialog-field">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">招聘渠道</Label>
                <Select
                  value={candidateForm.channelId ? String(candidateForm.channelId) : '__NONE__'}
                  onValueChange={(value) =>
                    setCandidateForm((prev) => ({
                      ...prev,
                      channelId: value === '__NONE__' ? undefined : Number(value),
                    }))
                  }
                >
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="选择渠道(可选)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__NONE__">未指定渠道</SelectItem>
                    {channels.map((ch) => (
                      <SelectItem key={ch.id} value={String(ch.id)}>
                        {ch.channelName}（{ch.channelCode}）
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="admin-dialog-field xl:col-span-3">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">简历附件</Label>
                <FileUpload
                  value={Array.isArray(candidateForm.resumeAttachmentUrls)
                    ? candidateForm.resumeAttachmentUrls.join(',')
                    : candidateForm.resumeAttachmentUrls || ''}
                  onChange={(urls) =>
                    setCandidateForm((prev) => ({ ...prev, resumeAttachmentUrls: urls }))
                  }
                  maxCount={5}
                  accept=".pdf,.doc,.docx"
                  hint="支持 PDF、DOC、DOCX 简历文件"
                />
              </div>
            </div>
          </DialogSection>
      </BaseDialog>

      <BaseDialog
        open={interviewDialog}
        title="安排面试"
        onClose={closeInterviewDialog}
        maxWidthClassName="max-w-3xl"
        bodyClassName="admin-dialog-stack"
        footer={(
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={closeInterviewDialog}>
              取消
            </Button>
            <Button
              disabled={
                submitting
                || !interviewableCandidates.length
                || !interviewForm.candidateId
                || !interviewForm.interviewTime
                || !interviewForm.interviewEndTime
              }
              onClick={() => void handleScheduleInterview()}
            >
              {submitting ? '提交中...' : '安排面试'}
            </Button>
          </div>
        )}
      >
        {!interviewableCandidates.length ? (
            <div className="admin-recruitment-alert">
              当前没有可安排面试的候选人。只有“招聘中”需求下且状态为新简历、筛选中、面试中的候选人才能继续安排面试。
            </div>
          ) : null}
          <DialogSection title="面试信息">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div className="admin-dialog-field xl:col-span-3">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">候选人</Label>
                <Select
                  value={interviewForm.candidateId ? String(interviewForm.candidateId) : undefined}
                  onValueChange={(value) =>
                    setInterviewForm((prev) => ({ ...prev, candidateId: Number(value) }))
                  }
                >
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="请选择候选人" />
                  </SelectTrigger>
                  <SelectContent>
                    {interviewableCandidates.map((item) => (
                      <SelectItem key={item.id} value={String(item.id)}>
                        {item.name} / {item.positionName || '-'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="admin-dialog-field">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">轮次</Label>
                <Select
                  value={interviewForm.interviewRound}
                  onValueChange={(value) =>
                    setInterviewForm((prev) => ({ ...prev, interviewRound: value }))
                  }
                >
                  <SelectTrigger className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {interviewRoundDict.getOptions().map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="admin-dialog-field">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">面试形式</Label>
                <Select
                  value={interviewForm.interviewType}
                  onValueChange={(value) =>
                    setInterviewForm((prev) => ({ ...prev, interviewType: value }))
                  }
                >
                  <SelectTrigger className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {interviewTypeDict.getOptions().map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="admin-dialog-field">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">开始时间</Label>
                <DatePicker
                  type="datetime-local"
                  value={interviewForm.interviewTime}
                  onChange={(event) =>
                    setInterviewForm((prev) => ({ ...prev, interviewTime: event.target.value }))
                  }
                  className="h-11"
                />
              </div>
              <div className="admin-dialog-field">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">结束时间</Label>
                <DatePicker
                  type="datetime-local"
                  value={interviewForm.interviewEndTime}
                  onChange={(event) =>
                    setInterviewForm((prev) => ({ ...prev, interviewEndTime: event.target.value }))
                  }
                  className="h-11"
                />
              </div>
              <div className="admin-dialog-field xl:col-span-3">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">会议室</Label>
                <Select
                  value={interviewForm.meetingRoomId ? String(interviewForm.meetingRoomId) : 'none'}
                  onValueChange={(value) =>
                    setInterviewForm((prev) => ({
                      ...prev,
                      meetingRoomId: value === 'none' ? undefined : Number(value),
                      location: value === 'none' ? prev.location : '',
                    }))
                  }
                >
                  <SelectTrigger className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">不预订会议室</SelectItem>
                    {availableMeetingRooms.map((room) => (
                      <SelectItem key={room.roomId} value={String(room.roomId)}>
                        {getRoomSnapshot(room)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {selectedMeetingRoom ? (
                <div className="admin-dialog-field xl:col-span-3">
                  <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">地点快照</Label>
                  <Input value={getRoomSnapshot(selectedMeetingRoom)} readOnly className="h-11 bg-[var(--cf-surface-muted)] dark:bg-slate-900" />
                </div>
              ) : (
                <div className="admin-dialog-field xl:col-span-3">
                  <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">地点 / 链接</Label>
                  <Input
                    value={interviewForm.location || ''}
                    placeholder="会议室 / Teams 链接"
                    onChange={(event) =>
                      setInterviewForm((prev) => ({ ...prev, location: event.target.value }))
                    }
                    className="h-11"
                  />
                </div>
              )}
            </div>
          </DialogSection>
      </BaseDialog>

      <BaseDialog
        open={offerDialog}
        title="新建Offer"
        onClose={closeOfferDialog}
        maxWidthClassName="max-w-3xl"
        bodyClassName="admin-dialog-stack"
        footer={(
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={closeOfferDialog}>
              取消
            </Button>
            <Button
              disabled={submitting || !offerableCandidates.length || !offerForm.candidateId}
              onClick={() => void handleCreateOffer()}
            >
              {submitting ? '提交中...' : '创建Offer'}
            </Button>
          </div>
        )}
      >
        {!offerableCandidates.length ? (
            <div className="admin-recruitment-alert">
              当前没有可发 Offer 的候选人。
            </div>
          ) : null}
          <DialogSection title="Offer信息">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div className="admin-dialog-field xl:col-span-3">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">候选人</Label>
                <Select
                  value={offerForm.candidateId ? String(offerForm.candidateId) : undefined}
                  onValueChange={(value) => {
                    const candidate = offerableCandidates.find((item) => item.id === Number(value));
                    setOfferForm((prev) => ({
                      ...prev,
                      candidateId: Number(value),
                      positionId: candidate?.positionId || prev.positionId || 0,
                    }));
                  }}
                >
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="请选择候选人" />
                  </SelectTrigger>
                  <SelectContent>
                    {offerableCandidates.map((item) => (
                      <SelectItem key={item.id} value={String(item.id)}>
                        {item.name} / {item.positionName || '-'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="admin-dialog-field">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">职位</Label>
                <PositionSelector
                  single
                  value={offerForm.positionId ?? null}
                  onChange={(id) => setOfferForm((prev) => ({ ...prev, positionId: id ?? 0 }))}
                  placeholder="请选择职位"
                />
              </div>
              <div className="admin-dialog-field">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">薪资</Label>
                <Input
                  type="number"
                  value={offerForm.salary || ''}
                  onChange={(event) =>
                    setOfferForm((prev) => ({ ...prev, salary: Number(event.target.value) || 0 }))
                  }
                  className="h-11"
                />
              </div>
              <div className="admin-dialog-field">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">预计到岗</Label>
                <DatePicker
                  type="date"
                  value={offerForm.expectedArrivalDate || ''}
                  onChange={(event) =>
                    setOfferForm((prev) => ({ ...prev, expectedArrivalDate: event.target.value }))
                  }
                  className="h-11"
                />
              </div>
              <div className="admin-dialog-field">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">有效期至</Label>
                <DatePicker
                  type="date"
                  value={offerForm.expireDate || ''}
                  onChange={(event) =>
                    setOfferForm((prev) => ({ ...prev, expireDate: event.target.value }))
                  }
                  className="h-11"
                />
              </div>
              <div className="admin-dialog-field xl:col-span-3">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Offer内容</Label>
                <Textarea
                  rows={4}
                  value={offerForm.offerContent || ''}
                  onChange={(event) =>
                    setOfferForm((prev) => ({ ...prev, offerContent: event.target.value }))
                  }
                />
              </div>
            </div>
          </DialogSection>
      </BaseDialog>

      <BaseDialog
        open={rejectCandidateId !== null}
        title="填写拒绝原因"
        onClose={() => {
          setRejectCandidateId(null);
          setRejectReason('');
        }}
        maxWidthClassName="max-w-xl"
        footer={(
          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setRejectCandidateId(null);
                setRejectReason('');
              }}
            >
              取消
            </Button>
            <Button disabled={submitting} onClick={() => void handleRejectCandidate()}>
              {submitting ? '提交中...' : '确认拒绝'}
            </Button>
          </div>
        )}
        bodyClassName="admin-dialog-stack"
      >
        <div className="admin-dialog-field">
          <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">拒绝原因</Label>
          <Textarea
            rows={4}
            value={rejectReason}
            onChange={(event) => setRejectReason(event.target.value)}
            placeholder="请输入候选人拒绝原因"
          />
        </div>
      </BaseDialog>

      <HrResumeParsePanel
        open={resumePanel.open}
        candidateId={resumePanel.candidate?.id ?? null}
        candidateName={resumePanel.candidate?.name}
        defaultResumeUrl={Array.isArray(resumePanel.candidate?.resumeAttachmentUrls)
          ? resumePanel.candidate?.resumeAttachmentUrls.join(',')
          : (resumePanel.candidate?.resumeAttachmentUrls as string | undefined)}
        onClose={() => setResumePanel({ open: false })}
      />
    </>
  );
};

export default HrRecruitmentPage;
