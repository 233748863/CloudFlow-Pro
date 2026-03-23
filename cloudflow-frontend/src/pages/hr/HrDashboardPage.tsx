import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRightLeft, BadgePlus, BriefcaseBusiness, FileSearch, LogOut, ShieldCheck, UserCog, UserRoundCheck, UserRoundPlus, Users } from 'lucide-react';
import { Card, Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { HrEmployee, RecruitmentRequest, Candidate, Interview, listEmployees, listRecruitmentRequests, listCandidates, listInterviews } from '@/services/api/hr';

const normalizeRows = <T,>(data: any): T[] => {
  if (!data) return [];
  if (Array.isArray(data)) return data as T[];
  if (Array.isArray(data.records)) return data.records as T[];
  if (Array.isArray(data.rows)) return data.rows as T[];
  return [];
};

const statusPill = (text: string, tone: 'pink' | 'emerald' | 'slate' | 'amber' = 'slate') => {
  const toneClass = {
    pink: 'bg-pink-50 text-pink-700 border-pink-100',
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
      return 'pink';
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
      return 'pink';
  }
};

export const HrDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [employees, setEmployees] = useState<HrEmployee[]>([]);
  const [requests, setRequests] = useState<RecruitmentRequest[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [employeeRes, requestRes, candidateRes, interviewRes] = await Promise.all([
          listEmployees(),
          listRecruitmentRequests({ pageNum: 1, pageSize: 50 }),
          listCandidates({ pageNum: 1, pageSize: 50 }),
          listInterviews(),
        ]);
        setEmployees(normalizeRows<HrEmployee>(employeeRes));
        setRequests(normalizeRows<RecruitmentRequest>(requestRes));
        setCandidates(normalizeRows<Candidate>(candidateRes));
        setInterviews(normalizeRows<Interview>(interviewRes));
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const metrics = useMemo(() => {
    const regularCount = employees.filter(item => item.employeeStatus === 'REGULAR').length;
    const probationCount = employees.filter(item => item.employeeStatus === 'PROBATION').length;
    const recruitingCount = requests.filter(item => ['DRAFT', 'APPROVING', 'RECRUITING'].includes(item.status)).length;
    const interviewingCount = candidates.filter(item => ['SCREENING', 'INTERVIEW', 'OFFER'].includes(item.status)).length;
    return [
      { label: '员工总数', value: employees.length, icon: <Users size={20} />, hint: `${regularCount} 名正式员工`, tone: 'pink' as const },
      { label: '试用期员工', value: probationCount, icon: <UserCog size={20} />, hint: '重点关注转正与带教', tone: 'amber' as const },
      { label: '招聘需求', value: recruitingCount, icon: <BriefcaseBusiness size={20} />, hint: '正在推进中的招聘岗位', tone: 'emerald' as const },
      { label: '候选人 / 面试', value: interviewingCount, icon: <FileSearch size={20} />, hint: `${interviews.length} 场面试记录`, tone: 'slate' as const },
    ];
  }, [employees, requests, candidates, interviews]);

  const workflowCards = [
    {
      title: '入职办理',
      description: '创建入职申请、按申请 ID 拉详情、完成任务并确认入职',
      path: '/hr/onboarding',
      icon: <UserRoundPlus size={18} />,
      tone: 'bg-sky-50 text-sky-600',
    },
    {
      title: '转正申请',
      description: '按员工查看转正申请，提交流程并发送提醒',
      path: '/hr/probation',
      icon: <UserRoundCheck size={18} />,
      tone: 'bg-amber-50 text-amber-600',
    },
    {
      title: '调岗管理',
      description: '围绕员工联调目标部门、岗位、生效日和调岗原因',
      path: '/hr/transfer',
      icon: <ArrowRightLeft size={18} />,
      tone: 'bg-violet-50 text-violet-600',
    },
    {
      title: '离职办理',
      description: '处理离职申请、面谈、交接清单和确认离职',
      path: '/hr/resignation',
      icon: <LogOut size={18} />,
      tone: 'bg-rose-50 text-rose-600',
    },
  ];

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden rounded-3xl border-white/80 bg-white/70 p-8 shadow-[0_12px_40px_rgba(15,23,42,0.06)] backdrop-blur-xl">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-pink-50 px-3 py-1 text-xs font-semibold text-pink-600">
              <ShieldCheck size={14} />
              HR Desktop
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">人力资源工作台</h1>
            <p className="mt-2 text-sm text-slate-500">
              {user?.name ? `${user.name}，` : ''}先把 HR 桌面端的核心数据和工作流真正接起来。
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button size="lg" className="rounded-2xl" onClick={() => navigate('/hr/employees')}>
              <BadgePlus size={18} className="mr-2" />
              员工档案
            </Button>
            <Button variant="outline" size="lg" className="rounded-2xl" onClick={() => navigate('/hr/recruitment')}>
              <BriefcaseBusiness size={18} className="mr-2" />
              招聘中心
            </Button>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metrics.map(metric => (
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
                      : 'bg-slate-100 text-slate-500'
              }`}>
                {metric.icon}
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
        {workflowCards.map(item => (
          <Card key={item.title} className="rounded-3xl border-white/80 bg-white/70 p-6 backdrop-blur-xl">
            <div className="flex h-full flex-col">
              <div className={`inline-flex w-fit rounded-2xl p-3 ${item.tone}`}>
                {item.icon}
              </div>
              <h2 className="mt-5 text-lg font-semibold text-slate-900">{item.title}</h2>
              <p className="mt-2 flex-1 text-sm leading-6 text-slate-500">{item.description}</p>
              <Button className="mt-5 rounded-2xl" variant="outline" onClick={() => navigate(item.path)}>
                进入流程
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card className="rounded-3xl border-white/80 bg-white/70 p-6 backdrop-blur-xl">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">最新员工变更</h2>
              <p className="text-sm text-slate-500">当前员工状态一眼可见</p>
            </div>
            <Button variant="outline" onClick={() => navigate('/hr/employees')}>查看员工</Button>
          </div>
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
              {!employees.length && (
                <TableRow>
                  <TableCell colSpan={4} className="py-10 text-center text-slate-400">暂无员工数据</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>

        <Card className="rounded-3xl border-white/80 bg-white/70 p-6 backdrop-blur-xl">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">招聘推进看板</h2>
              <p className="text-sm text-slate-500">需求和候选人推进节奏</p>
            </div>
            <Button variant="outline" onClick={() => navigate('/hr/recruitment')}>查看招聘</Button>
          </div>
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
              {!requests.length && (
                <TableRow>
                  <TableCell colSpan={4} className="py-10 text-center text-slate-400">暂无招聘需求</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      </div>
    </div>
  );
};

export default HrDashboardPage;
