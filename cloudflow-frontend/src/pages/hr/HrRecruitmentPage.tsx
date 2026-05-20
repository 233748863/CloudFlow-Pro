import React, { useEffect, useMemo, useState } from 'react';
import {
  BriefcaseBusiness,
  CalendarRange,
  Plus,
  RefreshCcw,
  Search,
  UserRoundSearch,
} from 'lucide-react';
import { toast } from 'sonner';
import { getErrorMessage } from '@/utils/errorMessage';
import { BaseDialog } from '@/components/common/BaseDialog';
import FileUpload from '@/components/FileUpload';
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
import { enumLabel, formatDateValue, formatDateTimeValue, formatMoneyValue, optionLabel, optionOrIdLabel } from './hrShared';
import { getAttachmentRawValue } from '@/utils/attachment';

type RecruitmentTab = 'request' | 'candidate' | 'interview' | 'offer';

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

const requestStatusTone: Record<string, string> = {
  DRAFT: 'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300',
  APPROVING: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200',
  RECRUITING: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200',
  COMPLETED: 'border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300',
  CANCELLED: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200',
};

const requestStatusLabels: Record<string, string> = {
  DRAFT: '草稿',
  APPROVING: '审批中',
  RECRUITING: '招聘中',
  COMPLETED: '已完成',
  CANCELLED: '已取消',
};

const candidateStatusTone: Record<string, string> = {
  NEW: 'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300',
  SCREENING: 'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-200',
  INTERVIEW: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200',
  OFFER: 'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-200',
  HIRED: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200',
  REJECTED: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200',
};

const candidateStatusLabels: Record<string, string> = {
  NEW: '新简历',
  SCREENING: '筛选中',
  INTERVIEW: '面试中',
  OFFER: 'Offer阶段',
  HIRED: '已录用',
  REJECTED: '已拒绝',
};

const interviewStatusTone: Record<string, string> = {
  SCHEDULED: 'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-200',
  COMPLETED: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200',
  CANCELLED: 'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300',
};

const interviewRoundLabels: Record<string, string> = {
  FIRST: '初试',
  SECOND: '复试',
  FINAL: '终面',
};

const interviewTypeLabels: Record<string, string> = {
  PHONE: '电话面试',
  VIDEO: '视频面试',
  ONSITE: '现场面试',
};

const interviewStatusLabels: Record<string, string> = {
  SCHEDULED: '已排期',
  COMPLETED: '已完成',
  CANCELLED: '已取消',
};

const sourceLabels: Record<string, string> = {
  WEBSITE: '官网',
  REFERRAL: '内推',
  HEADHUNTER: '猎头',
  CAMPUS: '校招',
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

const offerStatusTone: Record<string, string> = {
  DRAFT: 'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300',
  APPROVING: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200',
  APPROVED: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200',
  SENT: 'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-200',
  ACCEPTED: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200',
  REJECTED: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200',
};

const offerStatusLabels: Record<string, string> = {
  DRAFT: '草稿',
  APPROVING: '审批中',
  APPROVED: '已审批',
  SENT: '已发送',
  ACCEPTED: '已接受',
  REJECTED: '已拒绝',
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
    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500">
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
    <td colSpan={colSpan} className="px-4 py-14">
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
  <section className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-900/40">
    <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</div>
    </div>
    <div className="p-4">{children}</div>
  </section>
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
  const [interviewDialog, setInterviewDialog] = useState(false);
  const [offerDialog, setOfferDialog] = useState(false);
  const [rejectCandidateId, setRejectCandidateId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [requestForm, setRequestForm] = useState<RecruitmentRequestPayload>(requestFormDefault);
  const [candidateForm, setCandidateForm] = useState<CandidatePayload>(candidateFormDefault);
  const [interviewForm, setInterviewForm] = useState<InterviewSchedulePayload>(interviewFormDefault);
  const [offerForm, setOfferForm] = useState<OfferPayload>(offerFormDefault);

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
    <div className="space-y-4">
      <div className="min-w-0">
        <div className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
          <BriefcaseBusiness className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-300" />
          招聘中心
        </div>
        <h1 className="mt-1.5 text-[26px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          招聘与候选人
        </h1>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          需求 {loading ? '--' : requests.length}
        </span>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          招聘中 {loading ? '--' : recruitingRequests.length}
        </span>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          候选人 {loading ? '--' : candidates.length}
        </span>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          面试 {loading ? '--' : interviews.length}
        </span>
        <span className="rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-xs text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-200">
          可安排面试 {loading ? '--' : interviewableCandidates.length}
        </span>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          Offer {loading ? '--' : offers.length}
        </span>

        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => void loadData()}>
            <RefreshCcw size={14} className={`mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </Button>
          <Button size="sm" onClick={() => setRequestDialog(true)}>
            <Plus size={14} className="mr-1.5" />
            新建需求
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCandidateDialog(true)}>
            <UserRoundSearch size={14} className="mr-1.5" />
            新建候选人
          </Button>
          <Button variant="outline" size="sm" onClick={() => setInterviewDialog(true)}>
            <CalendarRange size={14} className="mr-1.5" />
            安排面试
          </Button>
          <Button variant="outline" size="sm" onClick={() => setOfferDialog(true)}>
            <Plus size={14} className="mr-1.5" />
            新建Offer
          </Button>
        </div>
      </div>

      <div className="flex flex-col justify-between gap-4 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/88 lg:flex-row lg:items-start">
        <div className="relative w-full lg:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
          <Input
            className="pl-10"
            placeholder="搜索需求编号、岗位、候选人、邮箱或状态"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
          />
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          <Button
            variant="outline"
            onClick={() => {
              setKeyword('');
            }}
          >
            重置搜索
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as RecruitmentTab)} className="space-y-4">
        <TabsList className="w-full justify-start overflow-x-auto lg:w-auto">
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
        </TabsList>

        <TabsContent value="request" className="space-y-0">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
              <div>
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">招聘需求</div>
                <div className="mt-1 text-xs leading-6 text-slate-500 dark:text-slate-400">
                  创建、提交、审批和关闭招聘需求都在这一组主表里推进。
                </div>
              </div>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                {loading ? '同步中' : `${filteredRequests.length} 条`}
              </span>
            </div>

            <div className="overflow-x-auto">
              <Table className="min-w-[980px]">
                <TableHeader className="bg-slate-50/80 dark:bg-slate-900/60">
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
                      <TableRow key={item.id}>
                        <TableCell className="font-medium text-slate-900 dark:text-slate-100">
                          {item.requestNo}
                        </TableCell>
                        <TableCell>{item.deptName || '-'}</TableCell>
                        <TableCell>{item.positionName || '-'}</TableCell>
                        <TableCell>{item.headcount}</TableCell>
                        <TableCell>{item.hiredCount}</TableCell>
                        <TableCell>
                          <span
                            className={[
                              'inline-flex rounded-full border px-2 py-0.5 text-xs font-medium',
                              requestStatusTone[item.status] || requestStatusTone.DRAFT,
                            ].join(' ')}
                          >
                            {item.statusDesc || enumLabel(requestStatusLabels, item.status)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-wrap justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={item.status !== 'DRAFT'}
                              onClick={() => void handleSubmitRequest(item.id)}
                            >
                              提交
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={item.status !== 'APPROVING'}
                              onClick={() => void handleApproveRequest(item.id)}
                            >
                              审批通过
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={item.status !== 'RECRUITING'}
                              onClick={() => void handleCompleteRequest(item.id)}
                            >
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
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="candidate" className="space-y-0">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
              <div>
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">候选人</div>
                <div className="mt-1 text-xs leading-6 text-slate-500 dark:text-slate-400">
                  候选人只在招聘链路内推进，到 Offer 或入职阶段后转由后续模块继续处理。
                </div>
              </div>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                {loading ? '同步中' : `${filteredCandidates.length} 条`}
              </span>
            </div>

            <div className="overflow-x-auto">
              <Table className="min-w-[960px]">
                <TableHeader className="bg-slate-50/80 dark:bg-slate-900/60">
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
                      <TableRow key={item.id}>
                        <TableCell>
                          <div className="font-medium text-slate-900 dark:text-slate-100">{item.name}</div>
                          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            {item.email || '-'}
                          </div>
                        </TableCell>
                        <TableCell>{item.phone}</TableCell>
                        <TableCell>{item.sourceDesc || enumLabel(sourceLabels, item.source)}</TableCell>
                        <TableCell>{item.positionName || '-'}</TableCell>
                        <TableCell>
                          <span
                            className={[
                              'inline-flex rounded-full border px-2 py-0.5 text-xs font-medium',
                              candidateStatusTone[item.status] || candidateStatusTone.NEW,
                            ].join(' ')}
                          >
                            {item.statusDesc || enumLabel(candidateStatusLabels, item.status)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          {['OFFER', 'HIRED'].includes(item.status) ? (
                            <div className="ml-auto w-[180px] text-right text-xs text-slate-500 dark:text-slate-400">
                              请在 Offer 或员工异动中继续推进
                            </div>
                          ) : (
                            <Select
                              value={item.status}
                              onValueChange={(value) => handleCandidateStatusChange(item.id, value)}
                            >
                              <SelectTrigger className="ml-auto w-[148px]">
                                <SelectValue placeholder="更新状态" />
                              </SelectTrigger>
                              <SelectContent>
                                {editableCandidateStatuses.map((status) => (
                                  <SelectItem key={status} value={status}>
                                    {status === 'NEW'
                                      ? '新简历'
                                      : status === 'SCREENING'
                                        ? '筛选中'
                                        : status === 'INTERVIEW'
                                          ? '面试中'
                                          : '已拒绝'}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="interview" className="space-y-0">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
              <div>
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">面试安排</div>
                <div className="mt-1 text-xs leading-6 text-slate-500 dark:text-slate-400">
                  所有已排期面试统一在这里复核时间、地点和当前状态。
                </div>
              </div>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                {loading ? '同步中' : `${interviews.length} 条`}
              </span>
            </div>

            <div className="overflow-x-auto">
              <Table className="min-w-[860px]">
                <TableHeader className="bg-slate-50/80 dark:bg-slate-900/60">
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
                      <TableRow key={item.id}>
                        <TableCell className="font-medium text-slate-900 dark:text-slate-100">
                          {item.candidateName || '-'}
                        </TableCell>
                        <TableCell>{item.interviewRoundName || enumLabel(interviewRoundLabels, item.interviewRound)}</TableCell>
                        <TableCell>{item.interviewTypeName || enumLabel(interviewTypeLabels, item.interviewType)}</TableCell>
                        <TableCell>
                          <div>{formatDateTimeValue(item.interviewTime)}</div>
                          {item.interviewEndTime ? (
                            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                              至 {formatDateTimeValue(item.interviewEndTime)}
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell>{item.meetingRoomName || item.location || '-'}</TableCell>
                        <TableCell>
                          <span
                            className={[
                              'inline-flex rounded-full border px-2 py-0.5 text-xs font-medium',
                              interviewStatusTone[item.status] || interviewStatusTone.SCHEDULED,
                            ].join(' ')}
                          >
                            {item.statusName || item.statusDesc || enumLabel(interviewStatusLabels, item.status)}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="offer" className="space-y-0">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Offer</div>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                {loading ? '同步中' : `${filteredOffers.length} 条`}
              </span>
            </div>

            <div className="overflow-x-auto">
              <Table className="min-w-[980px]">
                <TableHeader className="bg-slate-50/80 dark:bg-slate-900/60">
                  <TableRow>
                    <TableHead>Offer编号</TableHead>
                    <TableHead>候选人</TableHead>
                    <TableHead>岗位</TableHead>
                    <TableHead>薪资</TableHead>
                    <TableHead>到岗日期</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableStateRow colSpan={7} title="正在加载Offer..." loading />
                  ) : filteredOffers.length === 0 ? (
                    <TableStateRow colSpan={7} title="暂无Offer" />
                  ) : (
                    filteredOffers.map((item) => {
                      const status = String(item.status || '').toUpperCase();
                      return (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium text-slate-900 dark:text-slate-100">
                            {item.offerNo || '-'}
                          </TableCell>
                          <TableCell>{item.candidateName || optionOrIdLabel('候选人', candidateSelectOptions, item.candidateId)}</TableCell>
                          <TableCell>{item.positionName || optionOrIdLabel('职位', positionSelectOptions, item.positionId)}</TableCell>
                          <TableCell>{formatMoneyValue(item.salary)}</TableCell>
                          <TableCell>{formatDateValue(item.expectedArrivalDate || item.expectedDate)}</TableCell>
                          <TableCell>
                            <span
                              className={[
                                'inline-flex rounded-full border px-2 py-0.5 text-xs font-medium',
                                offerStatusTone[status] || offerStatusTone.DRAFT,
                              ].join(' ')}
                            >
                              {item.statusDesc || enumLabel(offerStatusLabels, item.status)}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex flex-wrap justify-end gap-2">
                              <Button size="sm" variant="outline" disabled={status !== 'DRAFT'} onClick={() => void handleOfferAction(item.id, 'submit')}>
                                提交
                              </Button>
                              <Button size="sm" variant="outline" disabled={status !== 'APPROVING'} onClick={() => void handleOfferAction(item.id, 'approve')}>
                                通过
                              </Button>
                              <Button size="sm" variant="outline" disabled={status !== 'APPROVED'} onClick={() => void handleOfferAction(item.id, 'send')}>
                                发送
                              </Button>
                              <Button size="sm" variant="outline" disabled={status !== 'SENT'} onClick={() => void handleOfferAction(item.id, 'accept')}>
                                接受
                              </Button>
                              <Button size="sm" variant="outline" disabled={!['SENT', 'APPROVING'].includes(status)} onClick={() => void handleOfferAction(item.id, 'reject')}>
                                拒绝
                              </Button>
                              <Button size="sm" variant="outline" disabled={status !== 'ACCEPTED'} onClick={() => void handleOfferAction(item.id, 'convert')}>
                                转入职
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <BaseDialog
        open={requestDialog}
        title="新建招聘需求"
        onClose={closeRequestDialog}
        maxWidthClassName="max-w-3xl"
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
        <div className="space-y-4">
          <DialogSection
            title="需求信息"
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">部门</Label>
                <Select
                  value={String(requestForm.deptId)}
                  onValueChange={(value) =>
                    setRequestForm((prev) => ({ ...prev, deptId: Number(value) }))
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
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">职位</Label>
                <Select
                  value={requestForm.positionId ? String(requestForm.positionId) : undefined}
                  onValueChange={(value) =>
                    setRequestForm((prev) => ({ ...prev, positionId: Number(value) }))
                  }
                >
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="请选择职位" />
                  </SelectTrigger>
                  <SelectContent>
                    {positionOptions.map((option) => (
                      <SelectItem key={option.id} value={String(option.id)}>
                        {option.positionName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
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
              <div className="space-y-2">
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
              <div className="space-y-2">
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
              <div className="space-y-2">
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
              <div className="space-y-2 xl:col-span-3">
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
        </div>
      </BaseDialog>

      <BaseDialog
        open={candidateDialog}
        title="录入候选人"
        onClose={closeCandidateDialog}
        maxWidthClassName="max-w-3xl"
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
        <div className="space-y-4">
          {!recruitingRequests.length ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              当前没有“招聘中”的需求。请先在需求列表完成提交和审批通过，再录入候选人。
            </div>
          ) : null}
          <DialogSection
            title="候选人信息"
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div className="space-y-2 xl:col-span-3">
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
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">姓名</Label>
                <Input
                  value={candidateForm.name}
                  onChange={(event) =>
                    setCandidateForm((prev) => ({ ...prev, name: event.target.value }))
                  }
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
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
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">手机号</Label>
                <Input
                  value={candidateForm.phone}
                  onChange={(event) =>
                    setCandidateForm((prev) => ({ ...prev, phone: event.target.value }))
                  }
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">邮箱</Label>
                <Input
                  value={candidateForm.email || ''}
                  onChange={(event) =>
                    setCandidateForm((prev) => ({ ...prev, email: event.target.value }))
                  }
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
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
                    <SelectItem value="WEBSITE">官网</SelectItem>
                    <SelectItem value="REFERRAL">内推</SelectItem>
                    <SelectItem value="HEADHUNTER">猎头</SelectItem>
                    <SelectItem value="CAMPUS">校招</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 xl:col-span-3">
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
        </div>
      </BaseDialog>

      <BaseDialog
        open={interviewDialog}
        title="安排面试"
        onClose={closeInterviewDialog}
        maxWidthClassName="max-w-3xl"
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
        <div className="space-y-4">
          {!interviewableCandidates.length ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              当前没有可安排面试的候选人。只有“招聘中”需求下且状态为新简历、筛选中、面试中的候选人才能继续安排面试。
            </div>
          ) : null}
          <DialogSection
            title="面试信息"
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div className="space-y-2 xl:col-span-3">
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
              <div className="space-y-2">
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
                    <SelectItem value="FIRST">初试</SelectItem>
                    <SelectItem value="SECOND">复试</SelectItem>
                    <SelectItem value="FINAL">终面</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
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
                    <SelectItem value="PHONE">电话面试</SelectItem>
                    <SelectItem value="VIDEO">视频面试</SelectItem>
                    <SelectItem value="ONSITE">现场面试</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
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
              <div className="space-y-2">
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
              <div className="space-y-2 xl:col-span-3">
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
                <div className="space-y-2 xl:col-span-3">
                  <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">地点快照</Label>
                  <Input value={getRoomSnapshot(selectedMeetingRoom)} readOnly className="h-11 bg-slate-50 dark:bg-slate-900" />
                </div>
              ) : (
                <div className="space-y-2 xl:col-span-3">
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
        </div>
      </BaseDialog>

      <BaseDialog
        open={offerDialog}
        title="新建Offer"
        onClose={closeOfferDialog}
        maxWidthClassName="max-w-3xl"
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
        <div className="space-y-4">
          {!offerableCandidates.length ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              当前没有可发 Offer 的候选人。
            </div>
          ) : null}
          <DialogSection title="Offer信息">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div className="space-y-2 xl:col-span-3">
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
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">职位</Label>
                <Select
                  value={offerForm.positionId ? String(offerForm.positionId) : undefined}
                  onValueChange={(value) =>
                    setOfferForm((prev) => ({ ...prev, positionId: Number(value) }))
                  }
                >
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="请选择职位" />
                  </SelectTrigger>
                  <SelectContent>
                    {positionOptions.map((option) => (
                      <SelectItem key={option.id} value={String(option.id)}>
                        {option.positionName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
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
              <div className="space-y-2">
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
              <div className="space-y-2">
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
              <div className="space-y-2 xl:col-span-3">
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
        </div>
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
      >
        <div className="space-y-2">
          <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">拒绝原因</Label>
          <Textarea
            rows={4}
            value={rejectReason}
            onChange={(event) => setRejectReason(event.target.value)}
            placeholder="请输入候选人拒绝原因"
          />
        </div>
      </BaseDialog>
    </div>
  );
};

export default HrRecruitmentPage;
