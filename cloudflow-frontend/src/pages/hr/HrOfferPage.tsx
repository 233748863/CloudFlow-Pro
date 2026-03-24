import React, { useEffect, useMemo, useState } from 'react';
import { BriefcaseBusiness, FilePlus2, Search, Send, ShieldCheck, UserRoundPlus } from 'lucide-react';
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
  Textarea,
} from '@/components/ui';
import {
  Candidate,
  Offer,
  OfferPayload,
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
  rejectOffer,
  sendOffer,
  submitOffer,
} from '@/services/api/hr';
import { flattenDeptTree, hasWorkflowStatus, normalizeRows, toDateInputValue } from './hrShared';

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
  if (!status) return 'bg-slate-100 text-slate-700';
  if (/(APPROVED|ACCEPTED)/i.test(status)) return 'bg-emerald-50 text-emerald-700';
  if (/(APPROVING|SENT)/i.test(status)) return 'bg-amber-50 text-amber-700';
  if (/(REJECT|EXPIRE)/i.test(status)) return 'bg-rose-50 text-rose-700';
  return 'bg-slate-100 text-slate-700';
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
) => [
  `候选人：${candidate.name}`,
  `拟录用部门：${deptLabel || candidate.deptName || '待确认'}`,
  `拟录用岗位：${positionName || candidate.positionName || '待确认'}`,
  `建议薪资：${formatSalary(salary)}`,
  `预计入职日期：${expectedDate || '待确认'}`,
  `Offer 有效期至：${expiryDate || '待确认'}`,
  '',
  '请在审批通过后发送正式录用通知，并同步入职准备事项。',
].join('\n');

export const HrOfferPage: React.FC = () => {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [deptOptions, setDeptOptions] = useState<Array<{ label: string; value: number }>>([]);
  const [positionOptions, setPositionOptions] = useState<PositionOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState(ALL_STATUS_VALUE);
  const [selectedOfferId, setSelectedOfferId] = useState('');
  const [currentOffer, setCurrentOffer] = useState<Offer | null>(null);
  const [createForm, setCreateForm] = useState<OfferPayload>(createDefaultForm);

  const candidateMap = useMemo(
    () => new Map(candidates.map(candidate => [candidate.id, candidate])),
    [candidates],
  );

  const positionMap = useMemo(
    () => new Map(positionOptions.map(position => [position.id, position])),
    [positionOptions],
  );

  const availableCandidates = useMemo(
    () => candidates.filter(candidate => hasWorkflowStatus(candidate.status, 'INTERVIEW')),
    [candidates],
  );

  const loadOfferList = async (preservedId?: number) => {
    setListLoading(true);
    try {
      const offerRes = await listOffers();
      const offerList = normalizeRows<Offer>(offerRes);
      setOffers(offerList);

      const nextId = preservedId && offerList.some(item => item.id === preservedId)
        ? preservedId
        : offerList[0]?.id;

      setSelectedOfferId(nextId ? String(nextId) : '');
      if (!nextId) {
        setCurrentOffer(null);
      }
    } catch (error) {
      console.error(error);
      toast.error('Offer 列表加载失败');
    } finally {
      setListLoading(false);
    }
  };

  const loadBootstrapData = async () => {
    setLoading(true);
    try {
      const [offerRes, candidateRes, deptRes, positionRes] = await Promise.all([
        listOffers(),
        listCandidates({ pageNum: 1, pageSize: 200 }),
        getDeptTreeOptions(),
        getPositionOptions({ pageNum: 1, pageSize: 200 }),
      ]);

      setOffers(normalizeRows<Offer>(offerRes));
      setCandidates(normalizeRows<Candidate>(candidateRes));
      setDeptOptions(flattenDeptTree(Array.isArray(deptRes) ? deptRes : []));
      setPositionOptions(Array.isArray(positionRes) ? positionRes : normalizeRows<PositionOption>(positionRes));
    } catch (error) {
      console.error(error);
      toast.error('Offer 页面基础数据加载失败');
    } finally {
      setLoading(false);
    }
  };

  const loadOfferDetail = async (offerId: number) => {
    setDetailLoading(true);
    try {
      setCurrentOffer(await getOffer(offerId));
    } catch (error) {
      console.error(error);
      setCurrentOffer(null);
      toast.error('Offer 详情加载失败');
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

    setCreateForm(prev => ({
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

    if (!selectedOfferId || !offers.some(item => String(item.id) === selectedOfferId)) {
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
        const expectedDate = toDateInputValue(candidate.expectedDate) || addDaysToDateValue(todayValue(), 7);
        const expiryDate = addDaysToDateValue(expectedDate, 7) || addDaysToDateValue(todayValue(), 14);
        const salary = calcSuggestedSalary(candidate);
        const deptLabel = deptOptions.find(item => item.value === deptId)?.label || candidate.deptName || '';
        const positionName = positionMap.get(positionId)?.positionName || candidate.positionName || '';

        // 从候选人切入创建 Offer 时，优先回填可直接联调的真实业务字段。
        setCreateForm(prev => ({
          ...prev,
          candidateId: candidate.id,
          deptId,
          positionId,
          salary,
          expectedDate,
          expiryDate,
          offerContent: buildOfferContent(candidate, deptLabel, positionName, salary, expectedDate, expiryDate),
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

    return offers.filter(offer => {
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
        .some(value => String(value).toLowerCase().includes(normalizedKeyword));
    });
  }, [candidateMap, keyword, offers, statusFilter]);

  useEffect(() => {
    if (!filteredOffers.length) {
      setCurrentOffer(null);
      return;
    }

    if (!selectedOfferId || !filteredOffers.some(item => String(item.id) === selectedOfferId)) {
      setSelectedOfferId(String(filteredOffers[0].id));
    }
  }, [filteredOffers, selectedOfferId]);

  const offerMetrics = useMemo(() => {
    const approvingCount = offers.filter(item => hasWorkflowStatus(item.status, 'APPROVING', 'APPROVED')).length;
    const sentCount = offers.filter(item => hasWorkflowStatus(item.status, 'SENT')).length;
    const acceptedCount = offers.filter(item => hasWorkflowStatus(item.status, 'ACCEPTED')).length;

    return [
      { label: 'Offer 总量', value: offers.length, hint: '当前已创建的录用通知', tone: 'pink' as const, icon: <BriefcaseBusiness size={18} /> },
      { label: '待推进审批', value: approvingCount, hint: '审批中与待发送的 Offer', tone: 'amber' as const, icon: <ShieldCheck size={18} /> },
      { label: '已发送', value: sentCount, hint: '候选人可确认的 Offer', tone: 'sky' as const, icon: <Send size={18} /> },
      { label: '待转入职', value: acceptedCount, hint: '候选人已接受，可转入职', tone: 'emerald' as const, icon: <UserRoundPlus size={18} /> },
    ];
  }, [offers]);

  const selectedCandidate = currentOffer ? candidateMap.get(currentOffer.candidateId) : null;
  const canSubmit = hasWorkflowStatus(currentOffer?.status, 'DRAFT');
  const canApprove = hasWorkflowStatus(currentOffer?.status, 'APPROVING');
  const canSend = hasWorkflowStatus(currentOffer?.status, 'APPROVED');
  const canAccept = hasWorkflowStatus(currentOffer?.status, 'SENT');
  const canReject = hasWorkflowStatus(currentOffer?.status, 'APPROVING', 'SENT');
  const canConvert = hasWorkflowStatus(currentOffer?.status, 'ACCEPTED');

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

    try {
      const id = await createOffer({
        ...createForm,
        offerContent: createForm.offerContent?.trim() || undefined,
      });

      toast.success(`Offer 已创建，ID：${id}`);
      resetCreateDialog();
      await loadOfferList(id);
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || '创建 Offer 失败');
    }
  };

  const runOfferAction = async (
    action: () => Promise<number | void>,
    successMessage: string,
    afterAction?: (result: number | void) => void,
  ) => {
    if (!currentOffer) return;

    setActionLoading(true);
    try {
      const result = await action();
      afterAction?.(result);
      toast.success(successMessage);
      await loadOfferList(currentOffer.id);
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || 'Offer 操作失败');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="rounded-3xl border-white/80 bg-white/70 p-8 shadow-[0_12px_40px_rgba(15,23,42,0.06)] backdrop-blur-xl">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
              <ShieldCheck size={14} />
              Offer Flow
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Offer 管理中心</h1>
            <p className="mt-2 text-sm text-slate-500">
              直接按真实后端状态机推进 Offer 的创建、审批、发送、接受和转入职，不绕工作流回调壳子。
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button className="rounded-2xl" onClick={() => setCreateDialogOpen(true)}>
              <FilePlus2 size={16} className="mr-2" />
              新建 Offer
            </Button>
            <Button
              variant="outline"
              className="rounded-2xl"
              onClick={() => {
                if (currentOffer) {
                  void loadOfferList(currentOffer.id);
                  return;
                }

                void loadBootstrapData();
              }}
            >
              刷新列表
            </Button>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {offerMetrics.map(metric => (
          <Card key={metric.label} className="rounded-3xl border-white/80 bg-white/70 p-6 backdrop-blur-xl">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-sm font-medium text-slate-500">{metric.label}</div>
                <div className="mt-3 text-3xl font-bold tracking-tight text-slate-900">{loading ? '--' : metric.value}</div>
                <div className="mt-2 text-xs text-slate-400">{metric.hint}</div>
              </div>
              <div className={`rounded-2xl p-3 ${
                metric.tone === 'pink'
                  ? 'bg-pink-50 text-pink-500'
                  : metric.tone === 'amber'
                    ? 'bg-amber-50 text-amber-500'
                    : metric.tone === 'emerald'
                      ? 'bg-emerald-50 text-emerald-500'
                      : 'bg-sky-50 text-sky-500'
              }`}>
                {metric.icon}
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <Card className="rounded-3xl border-white/80 bg-white/70 p-6 backdrop-blur-xl">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-slate-900">Offer 列表</h2>
            <p className="mt-1 text-sm text-slate-500">按候选人、状态和关键词筛选后，直接点选进入详情联调。</p>
          </div>

          <div className="space-y-4">
            <div className="relative">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                className="pl-10"
                placeholder="搜索 Offer 编号、候选人、手机号、岗位"
                value={keyword}
                onChange={event => setKeyword(event.target.value)}
              />
            </div>

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

            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/80 p-4 text-sm text-emerald-700">
              当前可直接创建 Offer 的候选人 {availableCandidates.length} 名，建议优先使用招聘链路里的面试通过候选人进行联调。
            </div>

            <div className="space-y-3">
              {filteredOffers.map(item => {
                const isActive = String(item.id) === selectedOfferId;
                const candidate = candidateMap.get(item.candidateId);

                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`w-full rounded-2xl border px-4 py-4 text-left transition ${
                      isActive
                        ? 'border-emerald-200 bg-emerald-50/80 shadow-sm'
                        : 'border-slate-200 bg-white/80 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                    onClick={() => setSelectedOfferId(String(item.id))}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">{item.offerNo}</div>
                        <div className="mt-1 text-sm text-slate-600">{item.candidateName || `候选人 #${item.candidateId}`}</div>
                        <div className="mt-1 text-xs text-slate-400">
                          {(candidate?.phone || '-') + ' / ' + (item.positionName || '-')}
                        </div>
                      </div>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${offerStatusClass(item.status)}`}>
                        {item.statusDesc || item.status}
                      </span>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                      <span>{formatSalary(item.salary)}</span>
                      <span>预计入职 {toDateInputValue(item.expectedDate) || '-'}</span>
                    </div>
                  </button>
                );
              })}

              {!filteredOffers.length && !listLoading && (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-12 text-center text-sm text-slate-500">
                  当前筛选条件下没有 Offer 记录。
                </div>
              )}

              {(loading || listLoading) && (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-12 text-center text-sm text-slate-500">
                  正在加载 Offer 列表...
                </div>
              )}
            </div>
          </div>
        </Card>

        <div className="space-y-6">
          <Card className="rounded-3xl border-white/80 bg-white/70 p-6 backdrop-blur-xl">
            <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Offer 详情</h2>
                <p className="mt-1 text-sm text-slate-500">详情与动作都走真实接口，适合直接验证状态流转和入职衔接。</p>
              </div>

              {currentOffer && (
                <div className="flex flex-wrap gap-3">
                  <Button variant="outline" disabled={!canSubmit || actionLoading} onClick={() => void runOfferAction(() => submitOffer(currentOffer.id), 'Offer 已提交审批')}>
                    提交审批
                  </Button>
                  <Button variant="outline" disabled={!canApprove || actionLoading} onClick={() => void runOfferAction(() => approveOffer(currentOffer.id), 'Offer 已审批通过')}>
                    审批通过
                  </Button>
                  <Button variant="outline" disabled={!canSend || actionLoading} onClick={() => void runOfferAction(() => sendOffer(currentOffer.id), 'Offer 已发送给候选人')}>
                    发送 Offer
                  </Button>
                  <Button variant="outline" disabled={!canAccept || actionLoading} onClick={() => void runOfferAction(() => acceptOffer(currentOffer.id), '候选人已接受 Offer')}>
                    接受 Offer
                  </Button>
                  <Button variant="outline" disabled={!canReject || actionLoading} onClick={() => void runOfferAction(() => rejectOffer(currentOffer.id), 'Offer 已拒绝')}>
                    拒绝 Offer
                  </Button>
                  <Button
                    disabled={!canConvert || actionLoading}
                    onClick={() => void runOfferAction(
                      () => convertOfferToOnboarding(currentOffer.id),
                      '已转入入职流程',
                      result => {
                        if (typeof result === 'number') {
                          toast.info(`入职申请 ID：${result}`);
                        }
                      },
                    )}
                  >
                    转入职
                  </Button>
                </div>
              )}
            </div>

            {!currentOffer && !detailLoading && (
              <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50/80 px-6 py-16 text-center text-sm text-slate-500">
                从左侧选择一条 Offer，或者先创建一条新的 Offer 记录。
              </div>
            )}

            {currentOffer && (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                  <div className="text-xs text-slate-400">Offer 编号</div>
                  <div className="mt-2 font-semibold text-slate-900">{currentOffer.offerNo}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                  <div className="text-xs text-slate-400">当前状态</div>
                  <div className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${offerStatusClass(currentOffer.status)}`}>
                    {currentOffer.statusDesc || currentOffer.status}
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                  <div className="text-xs text-slate-400">流程实例</div>
                  <div className="mt-2 break-all text-sm font-semibold text-slate-900">{currentOffer.processInstanceId || '-'}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                  <div className="text-xs text-slate-400">候选人</div>
                  <div className="mt-2 font-semibold text-slate-900">{currentOffer.candidateName || '-'}</div>
                  <div className="mt-1 text-sm text-slate-500">{selectedCandidate?.phone || '-'}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                  <div className="text-xs text-slate-400">部门 / 岗位</div>
                  <div className="mt-2 font-semibold text-slate-900">{currentOffer.deptName || '-'}</div>
                  <div className="mt-1 text-sm text-slate-500">{currentOffer.positionName || '-'}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                  <div className="text-xs text-slate-400">建议薪资</div>
                  <div className="mt-2 font-semibold text-slate-900">{formatSalary(currentOffer.salary)}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                  <div className="text-xs text-slate-400">预计入职日期</div>
                  <div className="mt-2 font-semibold text-slate-900">{toDateInputValue(currentOffer.expectedDate) || '-'}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                  <div className="text-xs text-slate-400">Offer 有效期</div>
                  <div className="mt-2 font-semibold text-slate-900">{toDateInputValue(currentOffer.expiryDate) || '-'}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                  <div className="text-xs text-slate-400">候选人状态</div>
                  <div className="mt-2 font-semibold text-slate-900">{selectedCandidate?.statusDesc || selectedCandidate?.status || '-'}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 md:col-span-2 xl:col-span-3">
                  <div className="text-xs text-slate-400">Offer 内容</div>
                  <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                    {currentOffer.offerContent || '当前 Offer 未填写正文内容。'}
                  </div>
                </div>
              </div>
            )}

            {detailLoading && (
              <div className="mt-4 text-sm text-slate-400">正在加载 Offer 详情...</div>
            )}
          </Card>

          <Card className="rounded-3xl border-white/80 bg-white/70 p-6 backdrop-blur-xl">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-slate-900">联调提示</h2>
              <p className="mt-1 text-sm text-slate-500">这页的动作顺序严格贴合后端状态机，点不动通常就意味着后端状态不允许。</p>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 text-sm text-slate-600">
                建议链路：创建 Offer → 提交审批 → 审批通过 → 发送 → 接受 → 转入职。
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 text-sm text-slate-600">
                如果发送或接受时报过期，优先检查 Offer 有效期是否早于当前日期。
              </div>
            </div>
          </Card>
        </div>
      </div>

      {createDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-3xl border border-white/80 bg-white p-6 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">新建 Offer</h2>
                <p className="mt-1 text-sm text-slate-500">优先从面试通过候选人自动回填，减少联调时手工补数据的成本。</p>
              </div>
              <Button variant="ghost" onClick={resetCreateDialog}>关闭</Button>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <Label>候选人</Label>
                <Select
                  value={createForm.candidateId ? String(createForm.candidateId) : EMPTY_VALUE}
                  onValueChange={value => setCreateForm(prev => ({
                    ...prev,
                    candidateId: value === EMPTY_VALUE ? 0 : Number(value),
                  }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="请选择候选人" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={EMPTY_VALUE}>请选择</SelectItem>
                    {availableCandidates.map(item => (
                      <SelectItem key={item.id} value={String(item.id)}>
                        {[item.name, item.phone, item.positionName].filter(Boolean).join(' / ')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>部门</Label>
                <Select
                  value={createForm.deptId ? String(createForm.deptId) : undefined}
                  onValueChange={value => setCreateForm(prev => ({ ...prev, deptId: Number(value) }))}
                >
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
                <Select
                  value={createForm.positionId ? String(createForm.positionId) : undefined}
                  onValueChange={value => setCreateForm(prev => ({ ...prev, positionId: Number(value) }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="请选择岗位" />
                  </SelectTrigger>
                  <SelectContent>
                    {positionOptions.map(option => (
                      <SelectItem key={option.id} value={String(option.id)}>
                        {option.positionName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>建议薪资</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={createForm.salary || ''}
                  onChange={event => setCreateForm(prev => ({
                    ...prev,
                    salary: Number(event.target.value || 0),
                  }))}
                />
              </div>

              <div>
                <Label>预计入职日期</Label>
                <Input
                  type="date"
                  value={createForm.expectedDate}
                  onChange={event => setCreateForm(prev => ({ ...prev, expectedDate: event.target.value }))}
                />
              </div>

              <div className="md:col-span-2">
                <Label>Offer 有效期</Label>
                <Input
                  type="date"
                  value={createForm.expiryDate}
                  onChange={event => setCreateForm(prev => ({ ...prev, expiryDate: event.target.value }))}
                />
              </div>

              <div className="md:col-span-2">
                <Label>Offer 内容</Label>
                <Textarea
                  rows={10}
                  value={createForm.offerContent || ''}
                  onChange={event => setCreateForm(prev => ({ ...prev, offerContent: event.target.value }))}
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <Button variant="outline" onClick={resetCreateDialog}>取消</Button>
              <Button onClick={() => void handleCreateOffer()}>创建 Offer</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HrOfferPage;
