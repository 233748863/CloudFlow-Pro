import React, { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  ArrowRightLeft,
  BadgePlus,
  BriefcaseBusiness,
  CalendarClock,
  CalendarDays,
  FileSearch,
  Landmark,
  Layers3,
  LogOut,
  RefreshCcw,
  Search,
  Send,
  UserCog,
  UserRoundCheck,
  UserRoundPlus,
  Users,
  Wallet,
} from 'lucide-react';
import { TablePageLayout } from '@/components/layout/TablePageLayout';
import { Button, Input } from '@/components/ui';
import { cn } from '@/utils/cn';
import {
  Candidate,
  HrEmployee,
  Offer,
  OnboardingApplication,
  RecruitmentRequest,
  listCandidates,
  listEmployees,
  listOffers,
  listOnboardingApplications,
  listRecruitmentRequests,
} from '@/services/api/hr';

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

const statusPill = (
  text: string,
  tone: 'teal' | 'emerald' | 'slate' | 'amber' = 'slate',
) => {
  const toneClass = {
    teal: 'border-cyan-100 bg-cyan-50 text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-200',
    emerald:
      'border-emerald-100 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200',
    slate:
      'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300',
    amber:
      'border-amber-100 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200',
  }[tone];

  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${toneClass}`}>
      {text}
    </span>
  );
};

const employeeStatusTone = (status?: string) => {
  switch (status) {
    case 'REGULAR':
      return 'emerald';
    case 'PROBATION':
      return 'amber';
    case 'RESIGNED':
      return 'slate';
    default:
      return 'teal';
  }
};

const requestStatusTone = (status?: string) => {
  switch (status) {
    case 'RECRUITING':
      return 'emerald';
    case 'APPROVING':
      return 'amber';
    case 'COMPLETED':
      return 'slate';
    default:
      return 'teal';
  }
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
    if (!application.candidateId || application.status === 'REJECTED') return;

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

const formatDateLabel = (value?: string | null) => {
  if (!value) return '-';
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return value;
  return new Date(timestamp).toLocaleDateString('zh-CN');
};

const getLatestTimestamp = (value?: string | null) => {
  if (!value) return 0;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
};

type EntryTone = 'cyan' | 'amber' | 'emerald' | 'slate' | 'violet' | 'rose';

type ModuleEntry = {
  title: string;
  hint: string;
  path: string;
  meta?: string;
  keywords: string[];
  tone: EntryTone;
  icon: React.ReactNode;
};

const entryToneClass: Record<EntryTone, string> = {
  cyan: 'border-cyan-100 bg-cyan-50 text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-200',
  amber: 'border-amber-100 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200',
  emerald:
    'border-emerald-100 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200',
  slate:
    'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300',
  violet:
    'border-violet-100 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-200',
  rose: 'border-rose-100 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200',
};

const InlineState = ({ title }: { title: string }) => (
  <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500">
      <Users className="h-4 w-4" />
    </div>
    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
  </div>
);

const DirectoryEntryButton = ({
  entry,
  onOpen,
}: {
  entry: ModuleEntry;
  onOpen: (path: string) => void;
}) => (
  <button
    type="button"
    onClick={() => onOpen(entry.path)}
    className="group flex w-full items-start gap-3 rounded-xl border border-slate-200 px-4 py-4 text-left transition-colors hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900/40"
  >
    <span
      className={cn(
        'mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border',
        entryToneClass[entry.tone],
      )}
    >
      {entry.icon}
    </span>

    <span className="min-w-0 flex-1">
      <span className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          {entry.title}
        </span>
        {entry.meta ? (
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
            {entry.meta}
          </span>
        ) : null}
      </span>
      <span className="mt-1 block text-xs leading-5 text-slate-500 dark:text-slate-400">
        {entry.hint}
      </span>
    </span>

    <ArrowRight className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 dark:text-slate-500" />
  </button>
);

const MetricRow = ({
  title,
  helper,
  value,
  onOpen,
}: {
  title: string;
  helper: string;
  value: string;
  onOpen: () => void;
}) => (
  <button
    type="button"
    onClick={onOpen}
    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-900/40"
  >
    <span className="min-w-0">
      <span className="block text-sm font-medium text-slate-900 dark:text-slate-100">{title}</span>
      <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">{helper}</span>
    </span>
    <span className="flex items-center gap-2">
      <span className="text-base font-semibold text-slate-900 dark:text-slate-100">{value}</span>
      <ArrowRight className="h-4 w-4 text-slate-400 dark:text-slate-500" />
    </span>
  </button>
);

const ActivityRow = ({
  title,
  secondary,
  aside,
  onOpen,
}: {
  title: string;
  secondary: string;
  aside: React.ReactNode;
  onOpen: () => void;
}) => (
  <button
    type="button"
    onClick={onOpen}
    className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-900/40"
  >
    <span className="min-w-0 flex-1">
      <span className="block truncate text-sm font-medium text-slate-900 dark:text-slate-100">
        {title}
      </span>
      <span className="mt-1 block truncate text-xs text-slate-500 dark:text-slate-400">
        {secondary}
      </span>
    </span>
    <span className="flex items-center gap-2">
      {aside}
      <ArrowRight className="h-4 w-4 text-slate-400 dark:text-slate-500" />
    </span>
  </button>
);

export const HrDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const [employees, setEmployees] = useState<HrEmployee[]>([]);
  const [requests, setRequests] = useState<RecruitmentRequest[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [onboardingApplications, setOnboardingApplications] = useState<OnboardingApplication[]>([]);
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(true);

  const deferredKeyword = useDeferredValue(keyword.trim().toLowerCase());

  const loadData = async () => {
    setLoading(true);
    try {
      const [
        employeeRes,
        requestRes,
        candidateRes,
        offerRes,
        onboardingRes,
      ] = await Promise.allSettled([
        listEmployees(),
        listRecruitmentRequests({ pageNum: 1, pageSize: 50 }),
        listCandidates({ pageNum: 1, pageSize: 50 }),
        listOffers(),
        listOnboardingApplications(),
      ]);

      setEmployees(employeeRes.status === 'fulfilled' ? normalizeRows<HrEmployee>(employeeRes.value) : []);
      setRequests(requestRes.status === 'fulfilled' ? normalizeRows<RecruitmentRequest>(requestRes.value) : []);
      setCandidates(candidateRes.status === 'fulfilled' ? normalizeRows<Candidate>(candidateRes.value) : []);
      setOffers(offerRes.status === 'fulfilled' ? normalizeRows<Offer>(offerRes.value) : []);
      setOnboardingApplications(
        onboardingRes.status === 'fulfilled'
          ? normalizeRows<OnboardingApplication>(onboardingRes.value)
          : [],
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const onboardingMap = useMemo(
    () => buildOnboardingMap(onboardingApplications),
    [onboardingApplications],
  );

  const summary = useMemo(() => {
    const probationCount = employees.filter((item) => item.employeeStatus === 'PROBATION').length;
    const recruitingCount = requests.filter((item) =>
      ['DRAFT', 'APPROVING', 'RECRUITING'].includes(String(item.status).toUpperCase())).length;
    const interviewingCount = candidates.filter((item) =>
      ['SCREENING', 'INTERVIEW', 'OFFER'].includes(String(item.status).toUpperCase())).length;
    const activeOfferCount = offers.filter((item) =>
      ['APPROVING', 'APPROVED', 'SENT'].includes(String(item.status).toUpperCase())
      || (item.status === 'ACCEPTED' && !onboardingMap.has(item.candidateId))).length;
    const pendingOnboardingCount = onboardingApplications.filter((item) =>
      !['ONBOARDED', 'REJECTED'].includes(String(item.status).toUpperCase())).length;

    return {
      totalEmployees: employees.length,
      probationCount,
      recruitingCount,
      interviewingCount,
      activeOfferCount,
      pendingOnboardingCount,
    };
  }, [employees, requests, candidates, offers, onboardingApplications, onboardingMap]);

  const moduleGroups = useMemo(() => {
    const groups: Array<{ title: string; entries: ModuleEntry[] }> = [
      {
        title: '人员与组织',
        entries: [
          {
            title: '员工档案',
            hint: '员工、合同、证件与紧急联系人',
            path: '/hr/employees',
            meta: loading ? '--' : `${summary.totalEmployees} 人`,
            keywords: ['员工', '档案', '合同', '证件', '联系人'],
            tone: 'cyan',
            icon: <BadgePlus size={16} />,
          },
          {
            title: '编制管理',
            hint: '按部门或岗位维护编制、空缺与超编',
            path: '/hr/headcount',
            meta: '编制与空缺',
            keywords: ['编制', '空缺', '超编', '部门', '岗位'],
            tone: 'slate',
            icon: <Layers3 size={16} />,
          },
          {
            title: '薪酬管理',
            hint: '薪资结构、员工薪资、调薪与个税',
            path: '/hr/salary',
            meta: '薪资链路',
            keywords: ['薪酬', '薪资', '调薪', '个税', '社保'],
            tone: 'amber',
            icon: <Landmark size={16} />,
          },
          {
            title: '假期额度',
            hint: '年度额度、额度桶与手工调整',
            path: '/hr/leave/quota',
            meta: '额度与调整',
            keywords: ['假期', '额度', '年假', '调额'],
            tone: 'emerald',
            icon: <Wallet size={16} />,
          },
        ],
      },
      {
        title: '招聘与录用',
        entries: [
          {
            title: '招聘中心',
            hint: '需求、候选人、面试与推进节奏',
            path: '/hr/recruitment',
            meta: loading ? '--' : `${summary.recruitingCount} 条在招`,
            keywords: ['招聘', '候选人', '面试', '需求'],
            tone: 'emerald',
            icon: <BriefcaseBusiness size={16} />,
          },
          {
            title: 'Offer 管理',
            hint: '审批、发放、接受与入职转换',
            path: '/hr/offer',
            meta: loading ? '--' : `${summary.activeOfferCount} 条待推进`,
            keywords: ['offer', '录用', '发放', '审批'],
            tone: 'amber',
            icon: <Send size={16} />,
          },
          {
            title: '入职办理',
            hint: '申请、任务、资料与入职确认',
            path: '/hr/onboarding',
            meta: loading ? '--' : `${summary.pendingOnboardingCount} 条待处理`,
            keywords: ['入职', '办理', '任务', '资料'],
            tone: 'cyan',
            icon: <UserRoundPlus size={16} />,
          },
          {
            title: '转正申请',
            hint: '试用期跟踪、评估与转正审批',
            path: '/hr/probation',
            meta: loading ? '--' : `${summary.probationCount} 名试用期`,
            keywords: ['转正', '试用期', '评估', '审批'],
            tone: 'amber',
            icon: <UserRoundCheck size={16} />,
          },
        ],
      },
      {
        title: '异动与离任',
        entries: [
          {
            title: '调动管理',
            hint: '部门、岗位、职位异动',
            path: '/hr/transfer',
            meta: '异动办理',
            keywords: ['调动', '调岗', '岗位', '部门'],
            tone: 'violet',
            icon: <ArrowRightLeft size={16} />,
          },
          {
            title: '离职办理',
            hint: '离职申请、交接与确认',
            path: '/hr/resignation',
            meta: '交接链路',
            keywords: ['离职', '交接', '离任'],
            tone: 'rose',
            icon: <LogOut size={16} />,
          },
        ],
      },
      {
        title: '员工自助',
        entries: [
          {
            title: '补卡申请',
            hint: '异常打卡补录与审批',
            path: '/hr/attendance/supplement',
            meta: '考勤补录',
            keywords: ['补卡', '考勤', '打卡'],
            tone: 'slate',
            icon: <CalendarClock size={16} />,
          },
          {
            title: '加班申请',
            hint: '加班时段、补偿方式与审批',
            path: '/hr/overtime/applications',
            meta: '工时与补偿',
            keywords: ['加班', '工时', '补偿'],
            tone: 'amber',
            icon: <UserCog size={16} />,
          },
          {
            title: '请假申请',
            hint: '假期类型、时段与流程',
            path: '/hr/leave/application',
            meta: '请假链路',
            keywords: ['请假', '休假', '假期'],
            tone: 'emerald',
            icon: <CalendarDays size={16} />,
          },
        ],
      },
    ];

    if (!deferredKeyword) return groups;

    return groups
      .map((group) => ({
        ...group,
        entries: group.entries.filter((entry) =>
          [entry.title, entry.hint, entry.meta, ...entry.keywords]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
            .includes(deferredKeyword)),
      }))
      .filter((group) => group.entries.length > 0);
  }, [deferredKeyword, loading, summary]);

  const totalModuleCount = useMemo(
    () => moduleGroups.reduce((count, group) => count + group.entries.length, 0),
    [moduleGroups],
  );

  const focusRows = useMemo(
    () => [
      {
        title: '员工在册',
        helper: '进入员工档案',
        value: loading ? '--' : String(summary.totalEmployees),
        path: '/hr/employees',
      },
      {
        title: '试用期员工',
        helper: '进入转正链路',
        value: loading ? '--' : String(summary.probationCount),
        path: '/hr/probation',
      },
      {
        title: '在招需求',
        helper: '进入招聘中心',
        value: loading ? '--' : String(summary.recruitingCount),
        path: '/hr/recruitment',
      },
      {
        title: '待推进 Offer',
        helper: '进入 Offer 管理',
        value: loading ? '--' : String(summary.activeOfferCount),
        path: '/hr/offer',
      },
      {
        title: '待入职',
        helper: '进入入职办理',
        value: loading ? '--' : String(summary.pendingOnboardingCount),
        path: '/hr/onboarding',
      },
    ],
    [loading, summary],
  );

  const recentEmployees = useMemo(
    () =>
      [...employees]
        .sort((a, b) => {
          const timeDiff =
            getLatestTimestamp(b.updateTime || b.createTime || b.hireDate)
            - getLatestTimestamp(a.updateTime || a.createTime || a.hireDate);
          if (timeDiff !== 0) return timeDiff;
          return b.id - a.id;
        })
        .slice(0, 5),
    [employees],
  );

  const recentRequests = useMemo(
    () =>
      [...requests]
        .sort((a, b) => {
          const timeDiff =
            getLatestTimestamp(b.updateTime || b.createTime || b.expectedDate)
            - getLatestTimestamp(a.updateTime || a.createTime || a.expectedDate);
          if (timeDiff !== 0) return timeDiff;
          return b.id - a.id;
        })
        .slice(0, 5),
    [requests],
  );

  return (
    <TablePageLayout
      className="gap-4"
      filters={(
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-1 flex-wrap items-center gap-3">
              <div className="relative w-full xl:w-80">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                <Input
                  className="pl-10"
                  placeholder="搜索 HR 模块、入口或事项"
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                />
              </div>

              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                入口 {loading ? '--' : totalModuleCount}
              </span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                招聘 {loading ? '--' : summary.recruitingCount}
              </span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                候选人 {loading ? '--' : summary.interviewingCount}
              </span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                Offer {loading ? '--' : summary.activeOfferCount}
              </span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                待入职 {loading ? '--' : summary.pendingOnboardingCount}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => void loadData()}>
                <RefreshCcw size={14} className={cn('mr-1.5', loading && 'animate-spin')} />
                刷新
              </Button>
              <Button variant="outline" size="sm" onClick={() => navigate('/hr/employees')}>
                员工档案
              </Button>
              <Button size="sm" onClick={() => navigate('/hr/recruitment')}>
                招聘中心
              </Button>
            </div>
          </div>
        </div>
      )}
      table={(
        <div className="grid min-h-[640px] gap-0 xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.95fr)]">
          <div className="min-w-0 xl:border-r xl:border-slate-200 dark:xl:border-slate-800">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">模块入口</div>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                {loading ? '同步中' : `${totalModuleCount} 个入口`}
              </span>
            </div>

            {moduleGroups.length === 0 ? (
              <InlineState title="没有匹配的模块入口" />
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {moduleGroups.map((group) => (
                  <section key={group.title} className="p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                        {group.title}
                      </div>
                      <div className="text-xs text-slate-400 dark:text-slate-500">
                        {group.entries.length} 个入口
                      </div>
                    </div>

                    <div className="grid gap-3 2xl:grid-cols-2">
                      {group.entries.map((entry) => (
                        <DirectoryEntryButton
                          key={entry.path}
                          entry={entry}
                          onOpen={(path) => navigate(path)}
                        />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </div>

          <div className="min-w-0 divide-y divide-slate-200 dark:divide-slate-800">
            <section>
              <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">当前关注</div>
                <span className="text-xs text-slate-500 dark:text-slate-400">按链路进入</span>
              </div>
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {focusRows.map((item) => (
                  <MetricRow
                    key={item.title}
                    title={item.title}
                    helper={item.helper}
                    value={item.value}
                    onOpen={() => navigate(item.path)}
                  />
                ))}
              </div>
            </section>

            <section>
              <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">最近员工</div>
                <Button variant="outline" size="sm" onClick={() => navigate('/hr/employees')}>
                  查看员工
                </Button>
              </div>

              {loading ? (
                <InlineState title="正在同步员工数据" />
              ) : recentEmployees.length === 0 ? (
                <InlineState title="暂无员工记录" />
              ) : (
                <div className="divide-y divide-slate-200 dark:divide-slate-800">
                  {recentEmployees.map((item) => (
                    <ActivityRow
                      key={item.id}
                      title={`${item.name} · ${item.employeeNo}`}
                      secondary={`${item.deptName || '未分配部门'} · ${formatDateLabel(item.hireDate || item.updateTime || item.createTime)}`}
                      aside={statusPill(item.employeeStatus || 'UNKNOWN', employeeStatusTone(item.employeeStatus))}
                      onOpen={() => navigate('/hr/employees')}
                    />
                  ))}
                </div>
              )}
            </section>

            <section>
              <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">招聘推进</div>
                <Button variant="outline" size="sm" onClick={() => navigate('/hr/recruitment')}>
                  查看招聘
                </Button>
              </div>

              {loading ? (
                <InlineState title="正在同步招聘数据" />
              ) : recentRequests.length === 0 ? (
                <InlineState title="暂无招聘需求" />
              ) : (
                <div className="divide-y divide-slate-200 dark:divide-slate-800">
                  {recentRequests.map((item) => (
                    <ActivityRow
                      key={item.id}
                      title={`${item.requestNo} · ${item.positionName || '未配置岗位'}`}
                      secondary={`需求 ${item.headcount} 人 · ${formatDateLabel(item.expectedDate || item.updateTime || item.createTime)}`}
                      aside={statusPill(item.statusDesc || item.status, requestStatusTone(item.status))}
                      onOpen={() => navigate('/hr/recruitment')}
                    />
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      )}
    />
  );
};

export default HrDashboardPage;
