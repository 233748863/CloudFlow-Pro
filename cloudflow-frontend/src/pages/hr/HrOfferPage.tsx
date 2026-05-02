import React, { useEffect, useMemo, useState } from 'react';
import {
  BriefcaseBusiness,
  FilePlus2,
  RefreshCcw,
  Search,
  Send,
  ShieldCheck,
  UserRoundPlus,
} from 'lucide-react';
import { toast } from 'sonner';
import { getErrorMessage } from '@/utils/errorMessage';
import { BaseDialog } from '@/components/common/BaseDialog';
import { TablePageLayout } from '@/components/layout/TablePageLayout';
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
  Textarea,
} from '@/components/common';
import {
  Candidate,
  Offer,
  OfferPayload,
  OnboardingApplication,
  PositionOption,
  acceptOffer,
  approveOffer,
  convertOfferToOnboarding,
  createOffer,
  getCandidate,
  getDeptTreeOptions,
  getOffer,
  getPositionOptions,
  listCandidates,
  listOffers,
  listOnboardingApplications,
  rejectOffer,
  sendOffer,
  submitOffer,
} from '@/services/api/hr';
import { formatDateTimeDisplay as formatDateTime } from '@/utils/dateFormat';
import {
  flattenDeptTree,
  hasWorkflowStatus,
  normalizeRows,
  toDateInputValue,
} from './hrShared';

const EMPTY_VALUE = '__empty__';
const ALL_STATUS_VALUE = '__all__';

const createDefaultForm = (): OfferPayload => ({
  candidateId: 0,
  deptId: 0,
  positionId: 0,
  salary: 0,
  expectedDate: '',
  expiryDate: '',
  offerContent: '',
});

const formatLocalDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const addDaysToDateValue = (value: string, days: number) => {
  if (!value) return '';

  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '';

  date.setDate(date.getDate() + days);
  return formatLocalDate(date);
};

const todayValue = () => formatLocalDate(new Date());

const salaryFormatter = new Intl.NumberFormat('zh-CN', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const formatSalary = (value?: number | null) =>
  typeof value === 'number' && !Number.isNaN(value) ? `¥${salaryFormatter.format(value)}` : '-';

const offerStatusClass = (status?: string) => {
  if (!status) {
    return 'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300';
  }
  if (/(APPROVED|ACCEPTED)/i.test(status)) {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200';
  }
  if (/(APPROVING|SENT)/i.test(status)) {
    return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200';
  }
  if (/(REJECT|EXPIRE)/i.test(status)) {
    return 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200';
  }
  return 'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300';
};

const onboardingStatusPriority = (status?: string | null) => {
  if (status === 'ONBOARDED') return 4;
  if (status === 'APPROVED') return 3;
  if (status === 'APPROVING') return 2;
  if (status === 'DRAFT') return 1;
  return 0;
};

const buildOnboardingMap = (applications: OnboardingApplication[]) => {
  const result = new Map<number, OnboardingApplication>();

  applications.forEach((application) => {
    if (!application.candidateId || hasWorkflowStatus(application.status, 'REJECTED')) return;

    const current = result.get(application.candidateId);
    if (!current) {
      result.set(application.candidateId, application);
      return;
    }

    const nextPriority = onboardingStatusPriority(application.status);
    const currentPriority = onboardingStatusPriority(current.status);
    if (
      nextPriority > currentPriority
      || (nextPriority === currentPriority && application.id > current.id)
    ) {
      result.set(application.candidateId, application);
    }
  });

  return result;
};

const isOfferConverted = (offer?: Offer | null, onboarding?: OnboardingApplication | null) =>
  Boolean(offer && onboarding && hasWorkflowStatus(offer.status, 'ACCEPTED'));

const getOfferStatusMeta = (offer?: Offer | null, onboarding?: OnboardingApplication | null) => {
  if (isOfferConverted(offer, onboarding)) {
    return {
      label: '已转入职',
      className:
        'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-200',
    };
  }

  return {
    label: offer?.statusDesc || offer?.status || '-',
    className: offerStatusClass(offer?.status),
  };
};

const calcSuggestedSalary = (candidate?: Candidate | null) => {
  if (!candidate) return 0;

  const min = Number(candidate.salaryMin || 0);
  const max = Number(candidate.salaryMax || 0);
  if (min > 0 && max > 0) return Number(((min + max) / 2).toFixed(2));
  return max > 0 ? max : min > 0 ? min : 0;
};

const buildOfferContent = (
  candidate: Candidate,
  deptLabel: string,
  positionName: string,
  salary: number,
  expectedDate: string,
  expiryDate: string,
) =>
  [
    `候选人：${candidate.name}`,
    `拟录用部门：${deptLabel || candidate.deptName || '待确认'}`,
    `拟录用岗位：${positionName || candidate.positionName || '待确认'}`,
    `建议薪资：${formatSalary(salary)}`,
    `预计入职日期：${expectedDate || '待确认'}`,
    `Offer 有效期至：${expiryDate || '待确认'}`,
    '',
    '请在审批通过后发送正式录用通知，并同步入职准备事项。',
  ].join('\n');

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
      <ShieldCheck className="h-4 w-4" />
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

export const HrOfferPage: React.FC = () => {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [onboardingApplications, setOnboardingApplications] = useState<OnboardingApplication[]>([]);
  const [deptOptions, setDeptOptions] = useState<Array<{ label: string; value: number }>>([]);
  const [positionOptions, setPositionOptions] = useState<PositionOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState(ALL_STATUS_VALUE);
  const [selectedOfferId, setSelectedOfferId] = useState('');
  const [currentOffer, setCurrentOffer] = useState<Offer | null>(null);
  const [createForm, setCreateForm] = useState<OfferPayload>(createDefaultForm);

  const candidateMap = useMemo(
    () => new Map(candidates.map((candidate) => [candidate.id, candidate])),
    [candidates],
  );

  const positionMap = useMemo(
    () => new Map(positionOptions.map((position) => [position.id, position])),
    [positionOptions],
  );

  const onboardingMap = useMemo(
    () => buildOnboardingMap(onboardingApplications),
    [onboardingApplications],
  );

  const activeOfferCandidateIds = useMemo(
    () =>
      new Set(
        offers
          .filter((offer) =>
            hasWorkflowStatus(
              offer.status,
              'DRAFT',
              'APPROVING',
              'APPROVED',
              'SENT',
              'ACCEPTED',
            ),
          )
          .map((offer) => offer.candidateId),
      ),
    [offers],
  );

  const availableCandidates = useMemo(
    () =>
      candidates.filter(
        (candidate) =>
          hasWorkflowStatus(candidate.status, 'INTERVIEW')
          && !onboardingMap.has(candidate.id)
          && !activeOfferCandidateIds.has(candidate.id),
      ),
    [activeOfferCandidateIds, candidates, onboardingMap],
  );

  const loadBootstrapData = async () => {
    setLoading(true);
    try {
      const [offerRes, candidateRes, onboardingRes, deptRes, positionRes] = await Promise.all([
        listOffers(),
        listCandidates({ pageNum: 1, pageSize: 200 }),
        listOnboardingApplications(),
        getDeptTreeOptions(),
        getPositionOptions({ pageNum: 1, pageSize: 200 }),
      ]);

      setOffers(normalizeRows<Offer>(offerRes));
      setCandidates(normalizeRows<Candidate>(candidateRes));
      setOnboardingApplications(normalizeRows<OnboardingApplication>(onboardingRes));
      setDeptOptions(flattenDeptTree(Array.isArray(deptRes) ? deptRes : []));
      setPositionOptions(
        Array.isArray(positionRes) ? positionRes : normalizeRows<PositionOption>(positionRes),
      );
    } catch (error) {
      console.error(error);
      toast.error(getErrorMessage(error, 'Offer 页面基础数据加载失败'));
    } finally {
      setLoading(false);
    }
  };

  const loadOfferWorkspace = async (preservedId?: number) => {
    setListLoading(true);
    try {
      const [offerRes, candidateRes, onboardingRes] = await Promise.all([
        listOffers(),
        listCandidates({ pageNum: 1, pageSize: 200 }),
        listOnboardingApplications(),
      ]);
      const offerList = normalizeRows<Offer>(offerRes);
      setOffers(offerList);
      setCandidates(normalizeRows<Candidate>(candidateRes));
      setOnboardingApplications(normalizeRows<OnboardingApplication>(onboardingRes));

      const nextId =
        preservedId && offerList.some((item) => item.id === preservedId)
          ? preservedId
          : offerList[0]?.id;

      setSelectedOfferId(nextId ? String(nextId) : '');
      if (!nextId) {
        setCurrentOffer(null);
      }
    } catch (error) {
      console.error(error);
      toast.error(getErrorMessage(error, 'Offer 列表加载失败'));
    } finally {
      setListLoading(false);
    }
  };

  const loadOfferDetail = async (offerId: number) => {
    setDetailLoading(true);
    try {
      setCurrentOffer(await getOffer(offerId));
    } catch (error) {
      console.error(error);
      setCurrentOffer(null);
      toast.error(getErrorMessage(error, 'Offer 详情加载失败'));
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    void loadBootstrapData();
  }, []);

  useEffect(() => {
    if (!deptOptions.length && !positionOptions.length) return;

    const expectedDate = addDaysToDateValue(todayValue(), 7);
    const expiryDate = addDaysToDateValue(expectedDate, 7);

    setCreateForm((prev) => ({
      ...prev,
      deptId: prev.deptId || deptOptions[0]?.value || 0,
      positionId: prev.positionId || positionOptions[0]?.id || 0,
      expectedDate: prev.expectedDate || expectedDate,
      expiryDate: prev.expiryDate || expiryDate,
    }));
  }, [deptOptions, positionOptions]);

  useEffect(() => {
    if (!selectedOfferId) {
      setCurrentOffer(null);
      return;
    }

    void loadOfferDetail(Number(selectedOfferId));
  }, [selectedOfferId]);

  useEffect(() => {
    if (!offers.length) {
      setSelectedOfferId('');
      setCurrentOffer(null);
      return;
    }

    if (!selectedOfferId || !offers.some((item) => String(item.id) === selectedOfferId)) {
      setSelectedOfferId(String(offers[0].id));
    }
  }, [offers, selectedOfferId]);

  useEffect(() => {
    if (!createForm.candidateId || !deptOptions.length || !positionOptions.length) return;

    let cancelled = false;

    const fillFromCandidate = async () => {
      try {
        const candidate = await getCandidate(createForm.candidateId);
        if (cancelled) return;

        const deptId = candidate.deptId || deptOptions[0]?.value || 0;
        const positionId = candidate.positionId || positionOptions[0]?.id || 0;
        const expectedDate =
          toDateInputValue(candidate.expectedDate) || addDaysToDateValue(todayValue(), 7);
        const expiryDate =
          addDaysToDateValue(expectedDate, 7) || addDaysToDateValue(todayValue(), 14);
        const salary = calcSuggestedSalary(candidate);
        const deptLabel =
          deptOptions.find((item) => item.value === deptId)?.label || candidate.deptName || '';
        const positionName =
          positionMap.get(positionId)?.positionName || candidate.positionName || '';

        // 从候选人切入创建 Offer 时，优先回填可直接联调的真实业务字段。
        setCreateForm((prev) => ({
          ...prev,
          candidateId: candidate.id,
          deptId,
          positionId,
          salary,
          expectedDate,
          expiryDate,
          offerContent: buildOfferContent(
            candidate,
            deptLabel,
            positionName,
            salary,
            expectedDate,
            expiryDate,
          ),
        }));
      } catch (error) {
        console.error(error);
        toast.error('候选人详情加载失败，无法自动回填 Offer');
      }
    };

    void fillFromCandidate();
    return () => {
      cancelled = true;
    };
  }, [createForm.candidateId, deptOptions, positionMap, positionOptions]);

  const filteredOffers = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();

    return offers.filter((offer) => {
      if (statusFilter !== ALL_STATUS_VALUE && offer.status !== statusFilter) return false;
      if (!normalizedKeyword) return true;

      const candidate = candidateMap.get(offer.candidateId);
      return [
        offer.offerNo,
        offer.candidateName,
        candidate?.phone,
        offer.deptName,
        offer.positionName,
        offer.statusDesc,
        offer.status,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedKeyword));
    });
  }, [candidateMap, keyword, offers, statusFilter]);

  useEffect(() => {
    if (!filteredOffers.length) {
      setSelectedOfferId('');
      setCurrentOffer(null);
      return;
    }

    if (
      !selectedOfferId
      || !filteredOffers.some((item) => String(item.id) === selectedOfferId)
    ) {
      setSelectedOfferId(String(filteredOffers[0].id));
    }
  }, [filteredOffers, selectedOfferId]);

  const summary = useMemo(() => {
    const approvingCount = offers.filter((item) =>
      hasWorkflowStatus(item.status, 'APPROVING', 'APPROVED'),
    ).length;
    const sentCount = offers.filter((item) => hasWorkflowStatus(item.status, 'SENT')).length;
    const convertedCount = offers.filter((item) =>
      isOfferConverted(item, onboardingMap.get(item.candidateId)),
    ).length;
    const acceptedCount = offers.filter(
      (item) =>
        hasWorkflowStatus(item.status, 'ACCEPTED')
        && !isOfferConverted(item, onboardingMap.get(item.candidateId)),
    ).length;

    return {
      total: offers.length,
      approvingCount,
      sentCount,
      acceptedCount,
      convertedCount,
    };
  }, [offers, onboardingMap]);

  const selectedCandidate = currentOffer ? candidateMap.get(currentOffer.candidateId) : null;
  const selectedOnboarding = currentOffer
    ? onboardingMap.get(currentOffer.candidateId) || null
    : null;
  const offerAlreadyConverted = isOfferConverted(currentOffer, selectedOnboarding);
  const currentOfferStatusMeta = getOfferStatusMeta(currentOffer, selectedOnboarding);
  const canSubmit = hasWorkflowStatus(currentOffer?.status, 'DRAFT');
  const canApprove = hasWorkflowStatus(currentOffer?.status, 'APPROVING');
  const canSend = hasWorkflowStatus(currentOffer?.status, 'APPROVED');
  const canAccept = hasWorkflowStatus(currentOffer?.status, 'SENT');
  const canReject = hasWorkflowStatus(currentOffer?.status, 'APPROVING', 'SENT');
  const canConvert =
    hasWorkflowStatus(currentOffer?.status, 'ACCEPTED') && !offerAlreadyConverted;

  const resetCreateDialog = () => {
    const expectedDate = addDaysToDateValue(todayValue(), 7);
    const expiryDate = addDaysToDateValue(expectedDate, 7);

    setCreateForm({
      ...createDefaultForm(),
      deptId: deptOptions[0]?.value || 0,
      positionId: positionOptions[0]?.id || 0,
      expectedDate,
      expiryDate,
    });
    setCreateDialogOpen(false);
  };

  const handleCreateOffer = async () => {
    if (!createForm.candidateId || !createForm.deptId || !createForm.positionId) {
      toast.error('请先选择候选人、部门和岗位');
      return;
    }

    if (!createForm.expectedDate || !createForm.expiryDate) {
      toast.error('请填写预计入职日期和 Offer 有效期');
      return;
    }

    if (createForm.salary <= 0) {
      toast.error('请输入有效的薪资');
      return;
    }

    if (createForm.expiryDate < createForm.expectedDate) {
      toast.error('Offer 有效期不能早于预计入职日期');
      return;
    }

    setPendingAction('create');
    try {
      const id = await createOffer({
        ...createForm,
        offerContent: createForm.offerContent?.trim() || undefined,
      });

      toast.success(`Offer 已创建，ID：${id}`);
      resetCreateDialog();
      await loadOfferWorkspace(id);
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || '创建 Offer 失败');
    } finally {
      setPendingAction(null);
    }
  };

  const runOfferAction = async (
    actionKey: string,
    action: () => Promise<number | void>,
    successMessage: string,
    afterAction?: (result: number | void) => void,
  ) => {
    if (!currentOffer) return;

    setPendingAction(actionKey);
    try {
      const result = await action();
      afterAction?.(result);
      toast.success(successMessage);
      await loadOfferWorkspace(currentOffer.id);
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || 'Offer 操作失败');
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          Offer 总量 {loading ? '--' : summary.total}
        </span>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          待推进审批 {loading ? '--' : summary.approvingCount}
        </span>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          已发送 {loading ? '--' : summary.sentCount}
        </span>
        <span className="rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-xs text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-200">
          待转入职 {loading ? '--' : summary.acceptedCount}
        </span>
        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
          已转入职 {loading ? '--' : summary.convertedCount}
        </span>

        <div className="ml-auto flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (currentOffer) {
                void loadOfferWorkspace(currentOffer.id);
                return;
              }
              void loadBootstrapData();
            }}
          >
            <RefreshCcw
              size={14}
              className={`mr-1.5 ${loading || listLoading || detailLoading ? 'animate-spin' : ''}`}
            />
            刷新列表
          </Button>
          <Button size="sm" onClick={() => setCreateDialogOpen(true)}>
            <FilePlus2 size={14} className="mr-1.5" />
            新建 Offer
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
                  placeholder="搜索 Offer 编号、候选人、手机号、岗位"
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                />
              </div>

              <div className="w-full sm:w-40">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_STATUS_VALUE}>全部状态</SelectItem>
                    <SelectItem value="DRAFT">草稿</SelectItem>
                    <SelectItem value="APPROVING">审批中</SelectItem>
                    <SelectItem value="APPROVED">已通过</SelectItem>
                    <SelectItem value="SENT">已发送</SelectItem>
                    <SelectItem value="ACCEPTED">已接受</SelectItem>
                    <SelectItem value="REJECTED">已拒绝</SelectItem>
                    <SelectItem value="EXPIRED">已过期</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex w-full flex-shrink-0 flex-wrap items-center justify-end gap-3 lg:w-auto">
              <Button
                variant="outline"
                onClick={() => {
                  setKeyword('');
                  setStatusFilter(ALL_STATUS_VALUE);
                }}
              >
                重置筛选
              </Button>
            </div>
          </div>
        )}
        table={(
          <div className="grid min-h-[680px] grid-cols-1 xl:grid-cols-[340px_minmax(0,1fr)]">
            <aside className="min-w-0 border-b border-slate-200 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-900/20 xl:border-b-0 xl:border-r">
              <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Offer 列表</div>
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
                    可建 {availableCandidates.length}
                  </span>
                </div>
              </div>

              <div className="space-y-3 overflow-y-auto p-4">
                {loading || listLoading ? (
                  <InlineState
                    title="正在加载 Offer 列表..."
                    className="py-12"
                  />
                ) : filteredOffers.length === 0 ? (
                  <InlineState
                    title="当前筛选条件下没有 Offer 记录"
                    className="py-12"
                  />
                ) : (
                  filteredOffers.map((item) => {
                    const isActive = String(item.id) === selectedOfferId;
                    const candidate = candidateMap.get(item.candidateId);
                    const onboarding = onboardingMap.get(item.candidateId);
                    const statusMeta = getOfferStatusMeta(item, onboarding);

                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={[
                          'w-full rounded-xl border px-4 py-4 text-left transition',
                          isActive
                            ? 'border-emerald-200 bg-emerald-50 shadow-sm dark:border-emerald-900 dark:bg-emerald-950/20'
                            : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950/88 dark:hover:bg-slate-900/70',
                        ].join(' ')}
                        onClick={() => setSelectedOfferId(String(item.id))}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                              {item.offerNo}
                            </div>
                            <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                              {item.candidateName || `候选人 #${item.candidateId}`}
                            </div>
                            <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                              {(candidate?.phone || '-') + ' / ' + (item.positionName || '-')}
                            </div>
                          </div>
                          <span
                            className={[
                              'rounded-full border px-2 py-0.5 text-xs font-medium',
                              statusMeta.className,
                            ].join(' ')}
                          >
                            {statusMeta.label}
                          </span>
                        </div>
                        <div className="mt-3 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                          <span>{formatSalary(item.salary)}</span>
                          <span>预计入职 {toDateInputValue(item.expectedDate) || '-'}</span>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </aside>

            <div className="flex min-h-0 flex-col">
              <div className="flex flex-col gap-4 border-b border-slate-200 px-4 py-3 dark:border-slate-800 lg:flex-row lg:items-start lg:justify-between">
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Offer 详情</div>
                {currentOffer ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!canSubmit || Boolean(pendingAction)}
                      onClick={() =>
                        void runOfferAction(
                          'submit',
                          () => submitOffer(currentOffer.id),
                          'Offer 已提交审批',
                        )
                      }
                    >
                      {pendingAction === 'submit' ? '处理中...' : '提交审批'}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!canApprove || Boolean(pendingAction)}
                      onClick={() =>
                        void runOfferAction(
                          'approve',
                          () => approveOffer(currentOffer.id),
                          'Offer 已审批通过',
                        )
                      }
                    >
                      {pendingAction === 'approve' ? '处理中...' : '审批通过'}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!canSend || Boolean(pendingAction)}
                      onClick={() =>
                        void runOfferAction(
                          'send',
                          () => sendOffer(currentOffer.id),
                          'Offer 已发送给候选人',
                        )
                      }
                    >
                      {pendingAction === 'send' ? '处理中...' : '发送 Offer'}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!canAccept || Boolean(pendingAction)}
                      onClick={() =>
                        void runOfferAction(
                          'accept',
                          () => acceptOffer(currentOffer.id),
                          '候选人已接受 Offer',
                        )
                      }
                    >
                      {pendingAction === 'accept' ? '处理中...' : '接受 Offer'}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!canReject || Boolean(pendingAction)}
                      onClick={() =>
                        void runOfferAction(
                          'reject',
                          () => rejectOffer(currentOffer.id),
                          'Offer 已拒绝',
                        )
                      }
                    >
                      {pendingAction === 'reject' ? '处理中...' : '拒绝 Offer'}
                    </Button>
                    <Button
                      size="sm"
                      disabled={!canConvert || Boolean(pendingAction)}
                      onClick={() =>
                        void runOfferAction(
                          'convert',
                          () => convertOfferToOnboarding(currentOffer.id),
                          '已转入入职流程',
                          (result) => {
                            if (typeof result === 'number') {
                              toast.info(`入职申请 ID：${result}`);
                            }
                          },
                        )
                      }
                    >
                      {pendingAction === 'convert'
                        ? '处理中...'
                        : offerAlreadyConverted
                          ? '已转入职'
                          : '转入职'}
                    </Button>
                  </div>
                ) : null}
              </div>

              {!currentOffer ? (
                <InlineState
                  title="请选择一条 Offer"
                  className="py-20"
                />
              ) : (
                <div className="flex flex-1 flex-col gap-4 p-4">
                  {offerAlreadyConverted && selectedOnboarding ? (
                    <div className="rounded-xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-sky-700 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-200">
                      该 Offer 已生成入职申请 #{selectedOnboarding.id}，页面已锁定重复转入职操作。
                    </div>
                  ) : null}

                  <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
                    <DetailRow label="Offer 编号" value={currentOffer.offerNo} />
                    <DetailRow
                      label="当前状态"
                      value={(
                        <span
                          className={[
                            'inline-flex rounded-full border px-2 py-0.5 text-xs font-medium',
                            currentOfferStatusMeta.className,
                          ].join(' ')}
                        >
                          {currentOfferStatusMeta.label}
                        </span>
                      )}
                    />
                    <DetailRow
                      label="流程实例"
                      value={currentOffer.processInstanceId || '-'}
                    />
                    <DetailRow
                      label="候选人"
                      value={`${currentOffer.candidateName || '-'} / ${selectedCandidate?.phone || '-'}`}
                    />
                    <DetailRow
                      label="部门 / 岗位"
                      value={`${currentOffer.deptName || '-'} / ${currentOffer.positionName || '-'}`}
                    />
                    <DetailRow label="建议薪资" value={formatSalary(currentOffer.salary)} />
                    <DetailRow
                      label="预计入职日期"
                      value={toDateInputValue(currentOffer.expectedDate) || '-'}
                    />
                    <DetailRow
                      label="Offer 有效期"
                      value={toDateInputValue(currentOffer.expiryDate) || '-'}
                    />
                    <DetailRow
                      label="候选人状态"
                      value={selectedCandidate?.statusDesc || selectedCandidate?.status || '-'}
                    />
                    <DetailRow
                      label="入职申请"
                      value={
                        selectedOnboarding
                          ? `#${selectedOnboarding.id} / ${selectedOnboarding.statusDesc || selectedOnboarding.status || '-'}`
                          : '未生成'
                      }
                    />
                    <DetailRow
                      label="创建时间"
                      value={formatDateTime(currentOffer.createTime)}
                    />
                    <DetailRow
                      label="更新时间"
                      value={formatDateTime(currentOffer.updateTime)}
                    />
                  </div>

                  {detailLoading ? (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
                      正在加载 Offer 详情...
                    </div>
                  ) : null}

                  <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
                    <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
                      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Offer 内容</div>
                    </div>
                    <div className="whitespace-pre-wrap px-4 py-4 text-sm leading-6 text-slate-700 dark:text-slate-300">
                      {currentOffer.offerContent || '当前 Offer 未填写正文内容。'}
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
        title="新建 Offer"
        onClose={resetCreateDialog}
        maxWidthClassName="max-w-4xl"
        footer={(
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={resetCreateDialog}>
              取消
            </Button>
            <Button disabled={pendingAction === 'create'} onClick={() => void handleCreateOffer()}>
              {pendingAction === 'create' ? '创建中...' : '创建 Offer'}
            </Button>
          </div>
        )}
      >
        <div className="space-y-4">
          <DialogSection
            title="候选人"
          >
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">候选人</Label>
              <Select
                value={createForm.candidateId ? String(createForm.candidateId) : EMPTY_VALUE}
                onValueChange={(value) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    candidateId: value === EMPTY_VALUE ? 0 : Number(value),
                  }))
                }
              >
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="请选择候选人" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={EMPTY_VALUE}>请选择</SelectItem>
                  {availableCandidates.map((item) => (
                    <SelectItem key={item.id} value={String(item.id)}>
                      {[item.name, item.phone, item.positionName].filter(Boolean).join(' / ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </DialogSection>

          <DialogSection
            title="录用信息"
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
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
                  value={createForm.positionId ? String(createForm.positionId) : undefined}
                  onValueChange={(value) =>
                    setCreateForm((prev) => ({ ...prev, positionId: Number(value) }))
                  }
                >
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="请选择岗位" />
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
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">建议薪资</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={createForm.salary || ''}
                  onChange={(event) =>
                    setCreateForm((prev) => ({
                      ...prev,
                      salary: Number(event.target.value || 0),
                    }))
                  }
                  className="h-11"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">预计入职日期</Label>
                <DatePicker
                  type="date"
                  value={createForm.expectedDate}
                  onChange={(event) =>
                    setCreateForm((prev) => ({ ...prev, expectedDate: event.target.value }))
                  }
                  className="h-11"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Offer 有效期</Label>
                <DatePicker
                  type="date"
                  value={createForm.expiryDate}
                  onChange={(event) =>
                    setCreateForm((prev) => ({ ...prev, expiryDate: event.target.value }))
                  }
                  className="h-11"
                />
              </div>
            </div>
          </DialogSection>

          <DialogSection
            title="Offer 内容"
          >
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">正文</Label>
              <Textarea
                rows={10}
                value={createForm.offerContent || ''}
                onChange={(event) =>
                  setCreateForm((prev) => ({ ...prev, offerContent: event.target.value }))
                }
              />
            </div>
          </DialogSection>
        </div>
      </BaseDialog>
    </div>
  );
};

export default HrOfferPage;
