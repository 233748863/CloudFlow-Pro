import React, { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  BadgePlus,
  BriefcaseBusiness,
  CalendarClock,
  Landmark,
  Layers3,
  RefreshCcw,
  Search,
  Send,
  Target,
  UserRoundPlus,
  Users,
} from 'lucide-react';
import { Button, Input } from '@/components/common';
import { TablePageLayout, InnerTableSurface } from '@/components/layout/TablePageLayout';
import {
  Candidate,
  HrEmployee,
  Offer,
  OnboardingApplication,
  RecruitmentRequest,
  getHrEmployeeStatusLabel,
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
    if (nextPriority > currentPriority || (nextPriority === currentPriority && application.id > current.id)) {
      result.set(application.candidateId, application);
    }
  });

  return result;
};

type EntryTone = 'blue' | 'amber' | 'green' | 'violet' | 'slate';

interface ModuleEntry {
  title: string;
  hint: string;
  path: string;
  meta?: string;
  keywords: string[];
  tone: EntryTone;
  icon: React.ReactNode;
}

const toneClassName: Record<EntryTone, string> = {
  blue: 'border-cyan-100 bg-cyan-50 text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-200',
  amber: 'border-amber-100 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200',
  green: 'border-emerald-100 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200',
  violet: 'border-violet-100 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-200',
  slate: 'border-slate-200 bg-[var(--cf-surface-muted)] text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300',
};

const statusPill = (text?: string, tone: EntryTone = 'slate') => (
  <span className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-medium ${toneClassName[tone]}`}>
    {text || '-'}
  </span>
);

const InlineState = ({ title }: { title: string }) => (
  <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-md border border-cyan-100 bg-[#effbfe] text-[#0d95b5] dark:border-cyan-900/60 dark:bg-cyan-950/30 dark:text-cyan-200">
      <Users className="h-4 w-4" />
    </div>
    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
  </div>
);

const DirectoryEntryButton = ({ entry, onOpen }: { entry: ModuleEntry; onOpen: (path: string) => void }) => (
  <button
    type="button"
    onClick={() => onOpen(entry.path)}
    className="cf-side-link cf-side-link-sm group w-full items-start gap-3 py-3 text-left"
  >
    <span className={`admin-source-stat-icon mt-0.5 h-9 w-9 flex-shrink-0 border ${toneClassName[entry.tone]}`}>
      {entry.icon}
    </span>
    <span className="min-w-0 flex-1">
      <span className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{entry.title}</span>
        {entry.meta ? <span className="badge badge-gray">{entry.meta}</span> : null}
      </span>
      <span className="mt-1 block text-xs leading-5 text-slate-500 dark:text-slate-400">{entry.hint}</span>
    </span>
    <ArrowRight className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 dark:text-slate-500" />
  </button>
);

const MetricRow = ({ title, helper, value, onOpen }: { title: string; helper: string; value: string; onOpen: () => void }) => (
  <button
    type="button"
    onClick={onOpen}
    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--cf-surface-muted)] dark:hover:bg-slate-900/40"
  >
    <span className="min-w-0">
      <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</span>
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
    className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--cf-surface-muted)] dark:hover:bg-slate-900/40"
  >
    <span className="min-w-0 flex-1">
      <span className="block truncate text-sm font-medium text-slate-900 dark:text-slate-100">{title}</span>
      <span className="mt-1 block truncate text-xs text-slate-500 dark:text-slate-400">{secondary}</span>
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
      const [employeeRes, requestRes, candidateRes, offerRes, onboardingRes] = await Promise.allSettled([
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
        onboardingRes.status === 'fulfilled' ? normalizeRows<OnboardingApplication>(onboardingRes.value) : [],
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
            tone: 'blue',
            icon: <BadgePlus size={16} />,
          },
          {
            title: '组织编制',
            hint: '职位族、职级、职位与编制',
            path: '/hr/organization',
            meta: '组织与编制',
            keywords: ['组织', '编制', '职位族', '职级', '职位'],
            tone: 'slate',
            icon: <Layers3 size={16} />,
          },
          {
            title: '薪酬福利',
            hint: '薪资结构、员工薪资、调薪、社保与个税',
            path: '/hr/compensation',
            meta: '薪福链路',
            keywords: ['薪酬', '福利', '调薪', '个税', '社保'],
            tone: 'amber',
            icon: <Landmark size={16} />,
          },
          {
            title: '绩效管理',
            hint: '目标树、类目分解、进度填报与归档',
            path: '/hr/performance',
            meta: '目标绩效',
            keywords: ['绩效', '目标', '销售额', '类目', '评分'],
            tone: 'blue',
            icon: <Target size={16} />,
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
            tone: 'green',
            icon: <BriefcaseBusiness size={16} />,
          },
          {
            title: '招聘录用',
            hint: '需求、候选人、面试、Offer 与入职转换',
            path: '/hr/recruitment',
            meta: loading ? '--' : `${summary.activeOfferCount} 条待推进`,
            keywords: ['offer', '录用', '发放', '审批'],
            tone: 'amber',
            icon: <Send size={16} />,
          },
          {
            title: '员工异动',
            hint: '入职、转正、调岗、离职统一办理',
            path: '/hr/lifecycle',
            meta: loading ? '--' : `${summary.pendingOnboardingCount} 条待处理`,
            keywords: ['入职', '转正', '调岗', '离职'],
            tone: 'blue',
            icon: <UserRoundPlus size={16} />,
          },
          {
            title: '考勤休假',
            hint: '规则、排班、打卡、额度与申请',
            path: '/hr/attendance',
            meta: loading ? '--' : `${summary.probationCount} 名试用期`,
            keywords: ['考勤', '休假', '排班', '额度'],
            tone: 'amber',
            icon: <CalendarClock size={16} />,
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
      { title: '员工在册', helper: '进入员工档案', value: loading ? '--' : String(summary.totalEmployees), path: '/hr/employees' },
      { title: '试用期员工', helper: '进入员工异动', value: loading ? '--' : String(summary.probationCount), path: '/hr/lifecycle' },
      { title: '在招需求', helper: '进入招聘中心', value: loading ? '--' : String(summary.recruitingCount), path: '/hr/recruitment' },
      { title: '待推进录用', helper: '进入招聘录用', value: loading ? '--' : String(summary.activeOfferCount), path: '/hr/recruitment' },
      { title: '待入职', helper: '进入员工异动', value: loading ? '--' : String(summary.pendingOnboardingCount), path: '/hr/lifecycle' },
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

  const pageActions = (
    <div className="grid gap-5">
      <header className="admin-source-header">
        <div>
          <p className="admin-source-kicker">HR COMMAND CENTER</p>
          <h2>人力资源工作台</h2>
          <span>统一进入员工、组织、招聘、异动、考勤和薪酬业务。</span>
        </div>
        <div className="admin-source-controls">
          <Button variant="outline" size="sm" onClick={() => void loadData()}>
            <RefreshCcw size={14} className={loading ? 'animate-spin' : ''} />
            刷新
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate('/hr/employees')}>
            员工档案
          </Button>
          <Button size="sm" onClick={() => navigate('/hr/recruitment')}>
            招聘中心
          </Button>
        </div>
      </header>

      <section className="admin-source-stat-grid">
        <article className="card admin-source-stat admin-source-tone-blue">
          <span className="admin-source-stat-icon"><Users size={18} /></span>
          <div><p>员工在册</p><strong>{loading ? '--' : summary.totalEmployees}</strong><span>员工档案总数</span></div>
        </article>
        <article className="card admin-source-stat admin-source-tone-amber">
          <span className="admin-source-stat-icon"><BriefcaseBusiness size={18} /></span>
          <div><p>在招需求</p><strong>{loading ? '--' : summary.recruitingCount}</strong><span>招聘需求推进中</span></div>
        </article>
        <article className="card admin-source-stat admin-source-tone-violet">
          <span className="admin-source-stat-icon"><UserRoundPlus size={18} /></span>
          <div><p>待入职</p><strong>{loading ? '--' : summary.pendingOnboardingCount}</strong><span>入职流程待处理</span></div>
        </article>
        <article className="card admin-source-stat admin-source-tone-green">
          <span className="admin-source-stat-icon"><Send size={18} /></span>
          <div><p>待推进录用</p><strong>{loading ? '--' : summary.activeOfferCount}</strong><span>Offer 与录用链路</span></div>
        </article>
      </section>
    </div>
  );

  const pageFilters = (
      <section className="card admin-users-toolbar">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <label className="admin-dialog-field w-full xl:w-80">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">模块搜索</span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
              <Input
                className="cf-control pl-10"
                placeholder="搜索 HR 模块、入口或事项"
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
              />
            </div>
          </label>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="badge badge-gray">入口 {loading ? '--' : totalModuleCount}</span>
            <span className="badge badge-gray">候选人 {loading ? '--' : summary.interviewingCount}</span>
            <span className="badge badge-gray">试用期 {loading ? '--' : summary.probationCount}</span>
          </div>
        </div>
      </section>
  );

  const pageContent = (
      <InnerTableSurface className="flex min-h-0 flex-1 flex-col" wrapperClassName="flex min-h-0 flex-col">
        <div className="flex min-h-0 flex-col">
          <div className="min-w-0">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">模块入口</div>
              <span className="badge badge-gray">{loading ? '同步中' : `${totalModuleCount} 个入口`}</span>
            </div>
            {moduleGroups.length === 0 ? (
              <InlineState title="没有匹配的模块入口" />
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {moduleGroups.map((group) => (
                  <section key={group.title} className="p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{group.title}</div>
                      <div className="text-xs text-slate-400 dark:text-slate-500">{group.entries.length} 个入口</div>
                    </div>
                    <div className="grid gap-3 2xl:grid-cols-2">
                      {group.entries.map((entry) => (
                        <DirectoryEntryButton key={entry.path} entry={entry} onOpen={(path) => navigate(path)} />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </div>

          <div className="grid min-w-0 divide-y divide-slate-200 border-t border-slate-200 dark:divide-slate-800 dark:border-slate-800 lg:grid-cols-3 lg:divide-x lg:divide-y-0">
            <section>
              <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">当前关注</div>
                <span className="text-xs text-slate-500 dark:text-slate-400">按链路进入</span>
              </div>
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {focusRows.map((item) => (
                  <MetricRow key={item.title} title={item.title} helper={item.helper} value={item.value} onOpen={() => navigate(item.path)} />
                ))}
              </div>
            </section>

            <section>
              <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">最近员工</div>
                <Button variant="outline" size="sm" onClick={() => navigate('/hr/employees')}>查看员工</Button>
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
                      aside={statusPill(getHrEmployeeStatusLabel(item.employeeStatus), 'blue')}
                      onOpen={() => navigate('/hr/employees')}
                    />
                  ))}
                </div>
              )}
            </section>

            <section>
              <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">招聘推进</div>
                <Button variant="outline" size="sm" onClick={() => navigate('/hr/recruitment')}>查看招聘</Button>
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
                      title={`${item.requestNo || item.requisitionNo || item.id} · ${item.positionName || item.title || '未配置岗位'}`}
                      secondary={`需求 ${item.headcount || 0} 人 · ${formatDateLabel(item.expectedDate || item.updateTime || item.createTime)}`}
                      aside={statusPill(item.statusDesc || item.status, 'green')}
                      onOpen={() => navigate('/hr/recruitment')}
                    />
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      </InnerTableSurface>
  );

  return (
    <section className="admin-source-page">
      <TablePageLayout
        actions={pageActions}
        filters={pageFilters}
        table={pageContent}
      />
    </section>
  );
};

export default HrDashboardPage;
