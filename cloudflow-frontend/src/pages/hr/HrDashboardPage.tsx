import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRightLeft,
  BadgePlus,
  BriefcaseBusiness,
  FileSearch,
  Landmark,
  Layers3,
  LogOut,
  Send,
  ShieldCheck,
  UserCog,
  UserRoundCheck,
  UserRoundPlus,
  Users,
  Wallet,
} from 'lucide-react';
import {
  Button,
  Card,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import {
  HrEmployee,
  RecruitmentRequest,
  Candidate,
  Interview,
  Offer,
  OnboardingApplication,
  listEmployees,
  listRecruitmentRequests,
  listCandidates,
  listInterviews,
  listOffers,
  listOnboardingApplications,
} from '@/services/api/hr';

// 兼容后端不同分页返回结构，统一转成前端表格直接消费的数组。
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

// Offer 接受后不一定立刻入职，这里统一找到候选人最近一条有效入职申请。
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

const InlineState = ({
  title,
  description,
  className,
}: {
  title: string;
  description?: string;
  className?: string;
}) => (
  <div className={['flex flex-col items-center justify-center px-6 py-10 text-center', className].filter(Boolean).join(' ')}>
    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500">
      <Users className="h-4 w-4" />
    </div>
    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
    {description ? (
      <div className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">{description}</div>
    ) : null}
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
    <td colSpan={colSpan} className="px-4 py-16">
      <div className="flex flex-col items-center justify-center text-center">
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500">
          <Users className={`h-4 w-4 ${loading ? 'animate-pulse' : ''}`} />
        </div>
        <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
        {description ? (
          <div className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">{description}</div>
        ) : null}
      </div>
    </td>
  </tr>
);

type DashboardMetric = {
  label: string;
  value: number;
  hint: string;
  icon: React.ReactNode;
  tone: 'cyan' | 'amber' | 'emerald' | 'slate';
};

export const HrDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [employees, setEmployees] = useState<HrEmployee[]>([]);
  const [requests, setRequests] = useState<RecruitmentRequest[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [onboardingApplications, setOnboardingApplications] = useState<OnboardingApplication[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [
          employeeRes,
          requestRes,
          candidateRes,
          interviewRes,
          offerRes,
          onboardingRes,
        ] = await Promise.all([
          listEmployees(),
          listRecruitmentRequests({ pageNum: 1, pageSize: 50 }),
          listCandidates({ pageNum: 1, pageSize: 50 }),
          listInterviews(),
          listOffers(),
          listOnboardingApplications(),
        ]);
        setEmployees(normalizeRows<HrEmployee>(employeeRes));
        setRequests(normalizeRows<RecruitmentRequest>(requestRes));
        setCandidates(normalizeRows<Candidate>(candidateRes));
        setInterviews(normalizeRows<Interview>(interviewRes));
        setOffers(normalizeRows<Offer>(offerRes));
        setOnboardingApplications(normalizeRows<OnboardingApplication>(onboardingRes));
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const onboardingMap = useMemo(
    () => buildOnboardingMap(onboardingApplications),
    [onboardingApplications],
  );

  const metrics = useMemo<DashboardMetric[]>(() => {
    const regularCount = employees.filter((item) => item.employeeStatus === 'REGULAR').length;
    const probationCount = employees.filter((item) => item.employeeStatus === 'PROBATION').length;
    const recruitingCount = requests.filter((item) => ['DRAFT', 'APPROVING', 'RECRUITING'].includes(item.status)).length;
    const interviewingCount = candidates.filter((item) => ['SCREENING', 'INTERVIEW', 'OFFER'].includes(item.status)).length;
    const activeOfferCount = offers.filter((item) =>
      ['APPROVING', 'APPROVED', 'SENT'].includes(item.status)
      || (item.status === 'ACCEPTED' && !onboardingMap.has(item.candidateId))).length;
    const convertedOfferCount = offers.filter(
      (item) => item.status === 'ACCEPTED' && onboardingMap.has(item.candidateId),
    ).length;

    return [
      {
        label: '员工总数',
        value: employees.length,
        hint: `${regularCount} 名正式员工`,
        icon: <Users size={18} />,
        tone: 'cyan',
      },
      {
        label: '试用期员工',
        value: probationCount,
        hint: '重点关注转正与带教',
        icon: <UserCog size={18} />,
        tone: 'amber',
      },
      {
        label: '招聘需求',
        value: recruitingCount,
        hint: '正在推进中的招聘岗位',
        icon: <BriefcaseBusiness size={18} />,
        tone: 'emerald',
      },
      {
        label: '候选人 / 面试',
        value: interviewingCount,
        hint: `${interviews.length} 场面试记录`,
        icon: <FileSearch size={18} />,
        tone: 'slate',
      },
      {
        label: '待推进 Offer',
        value: activeOfferCount,
        hint: `已转入职 ${convertedOfferCount} 条`,
        icon: <Send size={18} />,
        tone: 'amber',
      },
    ];
  }, [employees, requests, candidates, interviews, offers, onboardingMap]);

  const quickLinks = [
    {
      title: '员工档案',
      description: '查看员工台账、状态和部门归属',
      path: '/hr/employees',
      icon: <BadgePlus size={16} />,
      tone: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-950/30 dark:text-cyan-200',
    },
    {
      title: '招聘中心',
      description: '推进需求、候选人和面试安排',
      path: '/hr/recruitment',
      icon: <BriefcaseBusiness size={16} />,
      tone: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-200',
    },
    {
      title: '编制管理',
      description: '维护编制、空缺和超编风险',
      path: '/hr/headcount',
      icon: <Layers3 size={16} />,
      tone: 'bg-sky-50 text-sky-700 dark:bg-sky-950/30 dark:text-sky-200',
    },
    {
      title: '薪酬管理',
      description: '处理薪资、调薪和结构配置',
      path: '/hr/salary',
      icon: <Landmark size={16} />,
      tone: 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-200',
    },
    {
      title: '假期额度',
      description: '查看额度桶与手工调整入口',
      path: '/hr/leave/quota',
      icon: <Wallet size={16} />,
      tone: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-200',
    },
    {
      title: 'Offer 管理',
      description: '推进审批、发送并转入入职流程',
      path: '/hr/offer',
      icon: <Send size={16} />,
      tone: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-200',
    },
    {
      title: '入职办理',
      description: '按申请列表办理入职和任务',
      path: '/hr/onboarding',
      icon: <UserRoundPlus size={16} />,
      tone: 'bg-sky-50 text-sky-700 dark:bg-sky-950/30 dark:text-sky-200',
    },
    {
      title: '转正申请',
      description: '围绕员工连续处理转正申请',
      path: '/hr/probation',
      icon: <UserRoundCheck size={16} />,
      tone: 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-200',
    },
    {
      title: '调岗管理',
      description: '推进调岗审批与生效',
      path: '/hr/transfer',
      icon: <ArrowRightLeft size={16} />,
      tone: 'bg-violet-50 text-violet-700 dark:bg-violet-950/30 dark:text-violet-200',
    },
    {
      title: '离职办理',
      description: '处理离职申请、交接和确认离职',
      path: '/hr/resignation',
      icon: <LogOut size={16} />,
      tone: 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-200',
    },
  ];

  const currentEmployeeRows = employees.slice(0, 6);
  const currentRequestRows = requests.slice(0, 6);

  return (
    <div className="space-y-4">
      <div className="min-w-0">
        <div className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
          <ShieldCheck className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-300" />
          HR Dashboard
        </div>
        <h1 className="mt-1.5 text-[26px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          人力资源工作台
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500 dark:text-slate-400">
          {user?.name
            ? `${user.name}，这里统一查看 HR 核心数据和高频入口，不再保留旧的 Workspace 仪表盘壳层。`
            : '这里统一查看 HR 核心数据和高频入口，不再保留旧的 Workspace 仪表盘壳层。'}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          员工 {loading ? '--' : employees.length}
        </span>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          招聘需求 {loading ? '--' : requests.length}
        </span>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          候选人 {loading ? '--' : candidates.length}
        </span>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          Offer {loading ? '--' : offers.length}
        </span>

        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate('/hr/employees')}>
            员工档案
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate('/hr/recruitment')}>
            招聘中心
          </Button>
          <Button size="sm" onClick={() => navigate('/hr/offer')}>
            Offer 管理
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        {metrics.map((metric) => (
          <Card key={metric.label} className="rounded-xl border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
            <div className="flex items-start gap-3">
              <div
                className={[
                  'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl',
                  metric.tone === 'cyan'
                    ? 'bg-cyan-50 text-cyan-700 dark:bg-cyan-950/30 dark:text-cyan-200'
                    : metric.tone === 'amber'
                      ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-200'
                      : metric.tone === 'emerald'
                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-200'
                        : 'bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-300',
                ].join(' ')}
              >
                {metric.icon}
              </div>
              <div className="min-w-0">
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {metric.label}
                </div>
                <div className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                  {loading ? '--' : metric.value}
                </div>
                <div className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                  {metric.hint}
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
        {quickLinks.map((item) => (
          <button
            key={item.title}
            type="button"
            onClick={() => navigate(item.path)}
            className="rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950/88 dark:hover:bg-slate-900/70"
          >
            <div className={`inline-flex rounded-xl p-2.5 ${item.tone}`}>
              {item.icon}
            </div>
            <div className="mt-4 text-base font-semibold text-slate-900 dark:text-slate-100">
              {item.title}
            </div>
            <div className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
              {item.description}
            </div>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card className="overflow-hidden rounded-xl border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
          <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">最新员工变更</div>
                <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">当前员工状态一眼可见</div>
              </div>
              <Button variant="outline" size="sm" onClick={() => navigate('/hr/employees')}>
                查看员工
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <Table className="min-w-[640px]">
              <TableHeader className="bg-slate-50/80 dark:bg-slate-900/60">
                <TableRow>
                  <TableHead>工号</TableHead>
                  <TableHead>姓名</TableHead>
                  <TableHead>部门</TableHead>
                  <TableHead>状态</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableStateRow colSpan={4} title="正在加载员工数据..." loading />
                ) : currentEmployeeRows.length === 0 ? (
                  <TableStateRow colSpan={4} title="暂无员工数据" />
                ) : (
                  currentEmployeeRows.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium text-slate-800 dark:text-slate-200">
                        {item.employeeNo}
                      </TableCell>
                      <TableCell>{item.name}</TableCell>
                      <TableCell>{item.deptName || '-'}</TableCell>
                      <TableCell>
                        {statusPill(item.employeeStatus || 'UNKNOWN', employeeStatusTone(item.employeeStatus) as 'teal' | 'emerald' | 'slate' | 'amber')}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </Card>

        <Card className="overflow-hidden rounded-xl border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
          <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">招聘推进看板</div>
                <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">需求和候选人推进节奏</div>
              </div>
              <Button variant="outline" size="sm" onClick={() => navigate('/hr/recruitment')}>
                查看招聘
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <Table className="min-w-[640px]">
              <TableHeader className="bg-slate-50/80 dark:bg-slate-900/60">
                <TableRow>
                  <TableHead>需求编号</TableHead>
                  <TableHead>岗位</TableHead>
                  <TableHead>人数</TableHead>
                  <TableHead>状态</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableStateRow colSpan={4} title="正在加载招聘需求..." loading />
                ) : currentRequestRows.length === 0 ? (
                  <TableStateRow colSpan={4} title="暂无招聘需求" />
                ) : (
                  currentRequestRows.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium text-slate-800 dark:text-slate-200">
                        {item.requestNo}
                      </TableCell>
                      <TableCell>{item.positionName || '-'}</TableCell>
                      <TableCell>{item.headcount}</TableCell>
                      <TableCell>
                        {statusPill(item.statusDesc || item.status, requestStatusTone(item.status) as 'teal' | 'emerald' | 'slate' | 'amber')}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>

      {!loading && employees.length === 0 && requests.length === 0 ? (
        <Card className="rounded-xl border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
          <InlineState
            title="HR 数据尚未准备完成"
            description="员工、招聘和 Offer 数据接入后，这里会显示核心统计和高频入口。"
            className="py-14"
          />
        </Card>
      ) : null}
    </div>
  );
};

export default HrDashboardPage;
