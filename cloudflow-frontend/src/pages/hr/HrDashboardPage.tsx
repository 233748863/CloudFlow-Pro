import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRightLeft, BadgePlus, BriefcaseBusiness, FileSearch, Landmark, Layers3, LogOut, Send, ShieldCheck, UserCog, UserRoundCheck, UserRoundPlus, Users, Wallet } from 'lucide-react';
import { Card, Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui';
import { WorkspaceHeroCard, WorkspaceMetricCard, WorkspaceSectionCard } from '@/components/workspace/WorkspacePanels';
import { WorkspaceBackdrop, WorkspacePageContent, WorkspaceTableStateRow } from '@/components/workspace/WorkspacePrimitives';
import { useAuth } from '@/context/AuthContext';
import { HrEmployee, RecruitmentRequest, Candidate, Interview, Offer, OnboardingApplication, listEmployees, listRecruitmentRequests, listCandidates, listInterviews, listOffers, listOnboardingApplications } from '@/services/api/hr';

const normalizeRows = <T,>(data: any): T[] => {
  if (!data) return [];
  if (Array.isArray(data)) return data as T[];
  if (Array.isArray(data.records)) return data.records as T[];
  if (Array.isArray(data.rows)) return data.rows as T[];
  return [];
};

const statusPill = (text: string, tone: 'teal' | 'emerald' | 'slate' | 'amber' = 'slate') => {
  const toneClass = {
    teal: 'bg-cyan-50 text-cyan-700 border-cyan-100',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    slate: 'bg-slate-100 text-slate-700 border-slate-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-100',
  }[tone];
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${toneClass}`}>{text}</span>;
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

  applications.forEach(application => {
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
        const [employeeRes, requestRes, candidateRes, interviewRes, offerRes, onboardingRes] = await Promise.all([
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

  const metrics = useMemo(() => {
    const regularCount = employees.filter(item => item.employeeStatus === 'REGULAR').length;
    const probationCount = employees.filter(item => item.employeeStatus === 'PROBATION').length;
    const recruitingCount = requests.filter(item => ['DRAFT', 'APPROVING', 'RECRUITING'].includes(item.status)).length;
    const interviewingCount = candidates.filter(item => ['SCREENING', 'INTERVIEW', 'OFFER'].includes(item.status)).length;
    const activeOfferCount = offers.filter(item =>
      ['APPROVING', 'APPROVED', 'SENT'].includes(item.status)
      || (item.status === 'ACCEPTED' && !onboardingMap.has(item.candidateId)),
    ).length;
    const convertedOfferCount = offers.filter(item => item.status === 'ACCEPTED' && onboardingMap.has(item.candidateId)).length;
    return [
      { label: '员工总数', value: employees.length, icon: <Users size={20} />, hint: `${regularCount} 名正式员工`, tone: 'teal' as const },
      { label: '试用期员工', value: probationCount, icon: <UserCog size={20} />, hint: '重点关注转正与带教', tone: 'amber' as const },
      { label: '招聘需求', value: recruitingCount, icon: <BriefcaseBusiness size={20} />, hint: '正在推进中的招聘岗位', tone: 'emerald' as const },
      { label: '候选人 / 面试', value: interviewingCount, icon: <FileSearch size={20} />, hint: `${interviews.length} 场面试记录`, tone: 'slate' as const },
      { label: '待推进 Offer', value: activeOfferCount, icon: <Send size={20} />, hint: `已转入职 ${convertedOfferCount} 条`, tone: 'amber' as const },
    ];
  }, [employees, requests, candidates, interviews, offers, onboardingMap]);

  const workflowCards = [
    {
      title: '编制管理',
      description: '维护部门和岗位的核定编制、空缺人数与超编风险',
      path: '/hr/headcount',
      icon: <Layers3 size={18} />,
      tone: 'bg-sky-50 text-sky-600',
    },
    {
      title: '薪酬管理',
      description: '联调薪资项目、薪资结构、员工现薪和调薪申请的桌面端入口',
      path: '/hr/salary',
      icon: <Landmark size={18} />,
      tone: 'bg-amber-50 text-amber-600',
    },
    {
      title: '假期额度',
      description: '统一查看员工年度额度、调休额度桶和手工调整入口，适合做跨年调休和余额校准。',
      path: '/hr/leave/quota',
      icon: <Wallet size={18} />,
      tone: 'bg-emerald-50 text-emerald-600',
    },
    {
      title: 'Offer 管理',
      description: '创建 Offer、推进审批和发送，并在候选人接受后转入入职流程',
      path: '/hr/offer',
      icon: <Send size={18} />,
      tone: 'bg-emerald-50 text-emerald-600',
    },
    {
      title: '入职办理',
      description: '按申请列表持续办理入职、完成任务并确认入职',
      path: '/hr/onboarding',
      icon: <UserRoundPlus size={18} />,
      tone: 'bg-sky-50 text-sky-600',
    },
    {
      title: '转正申请',
      description: '围绕员工连续处理转正申请、审批和驳回',
      path: '/hr/probation',
      icon: <UserRoundCheck size={18} />,
      tone: 'bg-amber-50 text-amber-600',
    },
    {
      title: '调岗管理',
      description: '围绕员工连续推进调岗申请、审批和生效',
      path: '/hr/transfer',
      icon: <ArrowRightLeft size={18} />,
      tone: 'bg-violet-50 text-violet-600',
    },
    {
      title: '离职办理',
      description: '围绕员工处理离职申请、面谈、交接和确认离职',
      path: '/hr/resignation',
      icon: <LogOut size={18} />,
      tone: 'bg-rose-50 text-rose-600',
    },
  ];

  return (
    <div className="relative min-h-screen pb-6">
      <WorkspaceBackdrop />
      <WorkspacePageContent className="space-y-6">
      <WorkspaceHeroCard
        badge={(
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-700">
            <ShieldCheck size={14} className="text-cyan-600" />
            HR Desktop
          </div>
        )}
        title="人力资源工作台"
        description={user?.name ? `${user.name}，先把 HR 桌面端的核心数据和工作流真正接起来。` : '先把 HR 桌面端的核心数据和工作流真正接起来。'}
        actions={(
          <>
            <Button size="lg" className="rounded-lg px-4" onClick={() => navigate('/hr/employees')}>
              <BadgePlus size={18} className="mr-2" />
              员工档案
            </Button>
            <Button variant="outline" size="lg" className="rounded-lg px-4" onClick={() => navigate('/hr/offer')}>
              <Send size={18} className="mr-2" />
              Offer 管理
            </Button>
            <Button variant="outline" size="lg" className="rounded-lg px-4" onClick={() => navigate('/hr/recruitment')}>
              <BriefcaseBusiness size={18} className="mr-2" />
              招聘中心
            </Button>
            <Button variant="outline" size="lg" className="rounded-lg px-4" onClick={() => navigate('/hr/headcount')}>
              <Layers3 size={18} className="mr-2" />
              编制管理
            </Button>
            <Button variant="outline" size="lg" className="rounded-lg px-4" onClick={() => navigate('/hr/salary')}>
              <Landmark size={18} className="mr-2" />
              薪酬管理
            </Button>
            <Button variant="outline" size="lg" className="rounded-lg px-4" onClick={() => navigate('/hr/leave/quota')}>
              <Wallet size={18} className="mr-2" />
              假期额度
            </Button>
          </>
        )}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        {metrics.map(metric => (
          <WorkspaceMetricCard
            key={metric.label}
            label={metric.label}
            value={loading ? '--' : metric.value}
            hint={metric.hint}
            aside={(
              <div className={`rounded-xl p-3 ${
                metric.tone === 'teal'
                  ? 'bg-cyan-50 text-cyan-600'
                  : metric.tone === 'amber'
                    ? 'bg-amber-50 text-amber-500'
                    : metric.tone === 'emerald'
                      ? 'bg-emerald-50 text-emerald-500'
                      : 'bg-slate-100 text-slate-500'
              }`}>
                {metric.icon}
              </div>
            )}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {workflowCards.map(item => (
          <Card key={item.title} className="rounded-xl border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex h-full flex-col">
              <div className={`inline-flex w-fit rounded-xl p-2.5 ${item.tone}`}>
                {item.icon}
              </div>
              <h2 className="mt-4 text-lg font-semibold text-slate-900">{item.title}</h2>
              <p className="mt-2 flex-1 text-sm leading-6 text-slate-500">{item.description}</p>
              <Button className="mt-4 rounded-lg" variant="outline" onClick={() => navigate(item.path)}>
                进入流程
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <WorkspaceSectionCard
          title="最新员工变更"
          description="当前员工状态一眼可见"
          headerAside={<Button variant="outline" onClick={() => navigate('/hr/employees')}>查看员工</Button>}
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>工号</TableHead>
                <TableHead>姓名</TableHead>
                <TableHead>部门</TableHead>
                <TableHead>状态</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.slice(0, 6).map(item => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium text-slate-800">{item.employeeNo}</TableCell>
                  <TableCell>{item.name}</TableCell>
                  <TableCell>{item.deptName || '-'}</TableCell>
                  <TableCell>{statusPill(item.employeeStatus || 'UNKNOWN', employeeStatusTone(item.employeeStatus) as any)}</TableCell>
                </TableRow>
              ))}
              {loading && <WorkspaceTableStateRow colSpan={4} type="loading" title="正在加载员工数据..." />}
              {!employees.length && !loading && <WorkspaceTableStateRow colSpan={4} title="暂无员工数据" />}
            </TableBody>
          </Table>
        </WorkspaceSectionCard>

        <WorkspaceSectionCard
          title="招聘推进看板"
          description="需求和候选人推进节奏"
          headerAside={<Button variant="outline" onClick={() => navigate('/hr/recruitment')}>查看招聘</Button>}
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>需求编号</TableHead>
                <TableHead>岗位</TableHead>
                <TableHead>人数</TableHead>
                <TableHead>状态</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.slice(0, 6).map(item => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium text-slate-800">{item.requestNo}</TableCell>
                  <TableCell>{item.positionName || '-'}</TableCell>
                  <TableCell>{item.headcount}</TableCell>
                  <TableCell>{statusPill(item.statusDesc || item.status, requestStatusTone(item.status) as any)}</TableCell>
                </TableRow>
              ))}
              {loading && <WorkspaceTableStateRow colSpan={4} type="loading" title="正在加载招聘需求..." />}
              {!requests.length && !loading && <WorkspaceTableStateRow colSpan={4} title="暂无招聘需求" />}
            </TableBody>
          </Table>
        </WorkspaceSectionCard>
      </div>
      </WorkspacePageContent>
    </div>
  );
};

export default HrDashboardPage;
