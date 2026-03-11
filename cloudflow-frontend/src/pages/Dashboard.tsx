import React, { useState, useEffect } from 'react';
import { Button, Card } from '@/components/ui';
import {
  CheckCircle2, FileText, PlayCircle, MailOpen, Calendar, Megaphone, ArrowRight, Users,
  Car, Building2, ClipboardCheck, ChevronRight, Briefcase, CreditCard, UserCheck,
  CalendarDays, Activity, Timer, CheckCheck, FileSearch, Sparkles, Sun, Moon, CloudSun,
  Sunrise, Clock, Bell, CircleDot
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import request from '../services/api/request';

// 提取分页总数
function extractTotal(res: unknown): number {
  if (res && typeof res === 'object') {
    const obj = res as Record<string, unknown>;
    if (typeof obj.total === 'number') return obj.total;
  }
  return 0;
}

// 提取对象中的数字字段
function extractNumberByKey(res: unknown, key: string): number {
  if (res && typeof res === 'object') {
    const obj = res as Record<string, unknown>;
    const value = obj[key];
    if (typeof value === 'number') return value;
  }
  return 0;
}

// 提取列表数据
function extractRows(res: unknown): any[] {
  if (res && typeof res === 'object') {
    const obj = res as Record<string, unknown>;
    if (Array.isArray(obj.rows)) return obj.rows;
    if (Array.isArray(obj.records)) return obj.records;
    if (Array.isArray(obj.data)) return obj.data; // 支持 data 字段
    if (Array.isArray(res)) return res as any[];
  }
  return [];
}

// 问候语
function getGreetingInfo(): { text: string; icon: React.ReactNode } {
  const h = new Date().getHours();
  if (h < 6) return { text: '夜深了', icon: <Moon size={20} /> };
  if (h < 9) return { text: '早上好', icon: <Sunrise size={20} /> };
  if (h < 12) return { text: '上午好', icon: <Sun size={20} /> };
  if (h < 14) return { text: '中午好', icon: <CloudSun size={20} /> };
  if (h < 18) return { text: '下午好', icon: <Sun size={20} /> };
  if (h < 22) return { text: '晚上好', icon: <Moon size={20} /> };
  return { text: '夜深了', icon: <Moon size={20} /> };
}

// 中文日期
function formatDateCN(d: Date): string {
  const w = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  return `${d.getMonth() + 1}月${d.getDate()}日 ${w[d.getDay()]}`;
}

// 相对时间
function relTime(s: string): string {
  if (!s) return '';
  const m = Math.floor((Date.now() - new Date(s).getTime()) / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return `${m}分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}小时前`;
  const d = Math.floor(h / 24);
  return d < 7 ? `${d}天前` : `${Math.floor(d / 7)}周前`;
}

// 骨架屏
const Skeleton = () => (
  <div className="space-y-3 p-4">
    {[1, 2, 3].map(i => (
      <div key={i} className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-slate-100 animate-pulse shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-3/4 bg-slate-100 rounded animate-pulse" />
          <div className="h-4 w-1/2 bg-slate-100 rounded animate-pulse" />
        </div>
      </div>
    ))}
  </div>
);

export const Dashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [greeting, setGreeting] = useState(getGreetingInfo());
  const [dateStr, setDateStr] = useState(formatDateCN(new Date()));
  const [timeStr, setTimeStr] = useState('');
  const [pendingCount, setPendingCount] = useState(0);
  const [myAppsCount, setMyAppsCount] = useState(0);
  const [copyCount, setCopyCount] = useState(0);
  const [doneCount, setDoneCount] = useState(0);
  const [pendingTasks, setPendingTasks] = useState<any[]>([]);
  const [recentApps, setRecentApps] = useState<any[]>([]);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [readAnnouncementIds, setReadAnnouncementIds] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('read_announcements');
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch { return new Set(); }
  });
  const [lt, setLt] = useState(true);
  const [la, setLa] = useState(true);
  const [lan, setLan] = useState(true);
  const [ls, setLs] = useState(true);

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setTimeStr(now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }));
      setDateStr(formatDateCN(now));
      setGreeting(getGreetingInfo());
    };
    tick();
    const t = setInterval(tick, 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!user) return;
    const s = { silent: true };
    request.get('/workflow/todo', { params: { pageNum: 1, pageSize: 5 }, ...s })
      .then(r => { setPendingCount(extractTotal(r)); setPendingTasks(extractRows(r).slice(0, 5)); })
      .catch(() => { setPendingCount(0); setPendingTasks([]); }).finally(() => setLt(false));
    request.get('/workflow/my-instances', { params: { pageNum: 1, pageSize: 5 }, ...s })
      .then(r => { setMyAppsCount(extractTotal(r)); setRecentApps(extractRows(r).slice(0, 5)); })
      .catch(() => { setMyAppsCount(0); setRecentApps([]); }).finally(() => setLa(false));
    request.get('/workflow/copy/list', { params: { pageNum: 1, pageSize: 5 }, ...s })
      .then(r => setCopyCount(extractTotal(r))).catch(() => setCopyCount(0));
    request.get('/workflow/tasks/count', { ...s })
      .then(r => setDoneCount(extractNumberByKey(r, 'doneCount'))).catch(() => setDoneCount(0));
    // 公告列表 - 使用 my-list 接口获取当前用户的公告（常驻显示）
    request.get('/oa/announcement/my-list', { ...s })
      .then(r => setAnnouncements(extractRows(r).slice(0, 6)))
      .catch(() => setAnnouncements([]))
      .finally(() => setLan(false));
    const today = new Date().toISOString().split('T')[0];
    request.get('/oa/schedule/my-events', { params: { start: today, end: today }, ...s })
      .then(r => setSchedules(extractRows(r).slice(0, 5))).catch(() => setSchedules([])).finally(() => setLs(false));
  }, [user]);

  if (!user) return null;

  const stats = [
    { label: '待办审批', value: pendingCount, icon: <ClipboardCheck size={24} />, bg: 'bg-gradient-to-br from-pink-100 to-pink-50', tc: 'text-pink-600', path: '/tasks', desc: '需要您处理' },
    { label: '我的申请', value: myAppsCount, icon: <FileText size={24} />, bg: 'bg-gradient-to-br from-slate-100 to-slate-50', tc: 'text-slate-600', path: '/my-apps', desc: '已发起的流程' },
    { label: '抄送我的', value: copyCount, icon: <MailOpen size={24} />, bg: 'bg-gradient-to-br from-slate-100 to-slate-50', tc: 'text-slate-600', path: '/my-copies', desc: '知会给您的' },
    { label: '已完成', value: doneCount, icon: <CheckCheck size={24} />, bg: 'bg-gradient-to-br from-slate-100 to-slate-50', tc: 'text-slate-600', path: '/tasks', desc: '已审批完成' },
  ];

  const shortcuts = [
    { label: '发起流程', icon: <PlayCircle size={20} />, path: '/workplace' },
    { label: '我的日程', icon: <CalendarDays size={20} />, path: '/schedule' },
    { label: '会议预约', icon: <Users size={20} />, path: '/meeting-room' },
    { label: '公告中心', icon: <Megaphone size={20} />, path: '/announcement' },
    { label: '报销申请', icon: <CreditCard size={20} />, path: '/expense/claim' },
    { label: '出差申请', icon: <Briefcase size={20} />, path: '/office/business-trip' },
    { label: '用车申请', icon: <Car size={20} />, path: '/admin/vehicle/booking' },
    { label: '考勤打卡', icon: <UserCheck size={20} />, path: '/admin/attendance/checkin' },
    { label: '加班申请', icon: <Timer size={20} />, path: '/office/overtime' },
    { label: '通讯录', icon: <Building2 size={20} />, path: '/office/contact' },
  ];

  const stMap: Record<string, { l: string; c: string; b: string }> = {
    PENDING: { l: '待审批', c: 'text-amber-600', b: 'bg-amber-50 border-amber-200' },
    RUNNING: { l: '进行中', c: 'text-blue-600', b: 'bg-blue-50 border-blue-200' },
    APPROVED: { l: '已通过', c: 'text-emerald-600', b: 'bg-emerald-50 border-emerald-200' },
    REJECTED: { l: '已驳回', c: 'text-rose-600', b: 'bg-rose-50 border-rose-200' },
    COMPLETED: { l: '已完成', c: 'text-emerald-600', b: 'bg-emerald-50 border-emerald-200' },
    CANCELLED: { l: '已取消', c: 'text-slate-500', b: 'bg-slate-50 border-slate-200' },
  };
  const badge = (st: string) => {
    const cf = stMap[st] || { l: st || '未知', c: 'text-slate-600', b: 'bg-slate-50 border-slate-200' };
    return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cf.b} ${cf.c}`}>{cf.l}</span>;
  };

  return (
    <div className="relative min-h-screen">
      {/* 氛围背景装饰，仅页面内不可交互 */}
      <div className="fixed inset-0 pointer-events-none z-[-1] overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-pink-300/20 rounded-full blur-[100px]" />
        <div className="absolute top-[20%] right-[-10%] w-[50%] h-[50%] bg-blue-300/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] left-[20%] w-[40%] h-[40%] bg-purple-300/10 rounded-full blur-[100px]" />
        <div className="absolute inset-0 bg-slate-50/40 backdrop-blur-[1px]" />
      </div>

      <div className="space-y-6 animate-fade-in pb-6 px-1 relative z-10">
        {/* 欢迎横幅 Widget 风格 */}
        <Card className="relative overflow-hidden border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] bg-white/60 backdrop-blur-2xl rounded-3xl group">
          <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-gradient-to-l from-white/40 to-transparent pointer-events-none" />
          <div className="absolute -top-32 -right-32 w-80 h-80 bg-pink-100/50 rounded-full blur-3xl pointer-events-none transition-transform duration-1000 group-hover:scale-110" />
          <div className="absolute -bottom-24 left-[20%] w-60 h-60 bg-indigo-100/40 rounded-full blur-3xl pointer-events-none transition-transform duration-1000 delay-100 group-hover:scale-110" />
          
          <div className="relative p-6 sm:p-8">
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-slate-500 text-sm font-medium">
                  <Calendar size={14} className="text-pink-500" /><span>{dateStr}</span>
                  {timeStr && <><span className="opacity-50">·</span><span>{timeStr}</span></>}
                </div>
                <div className="flex items-center gap-2 py-1">
                  <span className="text-pink-500 drop-shadow-sm">{greeting.icon}</span>
                  <h2 className="text-2xl sm:text-3xl font-bold text-slate-800 tracking-tight">{greeting.text}，{user.name}</h2>
                </div>
                <p className="text-slate-500 mt-1">
                  {pendingCount > 0
                    ? <>您有 <span className="font-bold text-pink-600 text-lg px-1">{pendingCount}</span> 个审批任务待处理</>
                    : <>暂无待办事项，一切运行正常 <Sparkles size={16} className="inline ml-1 text-amber-400" /></>}
                  {user.deptName && <span className="mx-3 text-slate-300 font-light">|</span>}
                  {user.deptName && <span className="text-slate-600 font-medium">{user.deptName}</span>}
                </p>
              </div>
              <div className="hidden sm:flex items-center gap-4">
                {pendingCount > 0 && (
                  <Button className="bg-pink-500 hover:bg-pink-600 text-white shadow-[0_4px_14px_rgba(236,72,153,0.3)] hover:shadow-[0_6px_20px_rgba(236,72,153,0.4)] rounded-2xl px-6 h-11 flex items-center gap-2 transition-all duration-300 hover:-translate-y-0.5 active:scale-95" onClick={() => navigate('/tasks')}>
                    去处理 <ArrowRight size={16} />
                  </Button>
                )}
                <Button variant="outline" className="border-white/80 bg-white/50 backdrop-blur-md text-slate-700 hover:text-pink-600 hover:bg-white/90 shadow-sm rounded-2xl px-6 h-11 flex items-center gap-2 transition-all duration-300 hover:-translate-y-0.5 active:scale-95" onClick={() => navigate('/workplace')}>
                  <PlayCircle size={16} className="text-pink-500" /> 发起流程
                </Button>
              </div>
            </div>
          </div>
        </Card>

        {/* 统计卡片 毛玻璃 */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map(c => (
            <Card key={c.label} className="relative overflow-hidden p-5 bg-white/50 backdrop-blur-xl border border-white/80 shadow-[0_4px_24px_rgb(0,0,0,0.02)] hover:shadow-[0_12px_32px_rgb(0,0,0,0.06)] hover:border-white/100 hover:bg-white/70 rounded-3xl transition-all duration-500 hover:-translate-y-1 cursor-pointer group">
              <div className="flex justify-between items-start relative">
                <div className="flex flex-col h-full justify-between">
                  <p className="text-sm text-slate-500 font-medium group-hover:text-slate-700 transition-colors">{c.label}</p>
                  <h3 className="text-3xl font-extrabold text-slate-800 mt-3 mb-1 tracking-tight">{c.value}</h3>
                  <p className="text-xs text-slate-400 font-medium">{c.desc}</p>
                </div>
                <div className={`relative p-3.5 rounded-[1.25rem] ${c.bg} ${c.tc} shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_2px_10px_rgba(0,0,0,0.02)] group-hover:scale-110 group-hover:bg-white group-hover:shadow-[0_6px_20px_rgb(0,0,0,0.08)] transition-all duration-500 ease-out z-10`}>
                  {c.icon}
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* 快捷入口 - App Icon 风格 */}
        <Card className="p-5 border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] bg-white/50 backdrop-blur-xl rounded-3xl">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-4 px-1 tracking-tight">
            <Activity size={18} className="text-pink-500" /> 快捷入口
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {shortcuts.map(i => (
              <Button
                key={i.label}
                variant="ghost"
                onClick={() => navigate(i.path)}
                className="flex flex-col items-center justify-center gap-3 p-4 h-auto rounded-[1.5rem] bg-transparent hover:bg-white/60 border border-transparent hover:border-white/80 hover:shadow-[0_8px_20px_rgb(0,0,0,0.04)] active:scale-[0.96] transition-all duration-400 ease-out text-center group"
              >
                <div className="p-4 rounded-[1.25rem] bg-white text-slate-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_2px_8px_rgba(0,0,0,0.04)] group-hover:text-pink-500 group-hover:scale-110 group-hover:shadow-[0_6px_20px_rgba(236,72,153,0.15)] transition-all duration-400 ease-out">
                  {i.icon}
                </div>
                <span className="text-xs font-semibold text-slate-600 group-hover:text-slate-800 transition-colors">{i.label}</span>
              </Button>
            ))}
          </div>
        </Card>

        {/* 主内容区域 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 左栏 */}
          <div className="lg:col-span-2 space-y-6">
            {/* 待办审批 */}
            <Card className="border border-white/80 shadow-[0_8px_30px_rgb(0,0,0,0.04)] bg-white/60 backdrop-blur-xl rounded-3xl overflow-hidden">
              <div className="flex items-center justify-between p-6 pb-2">
                <h3 className="text-[15px] font-bold text-slate-800 flex items-center gap-2.5 tracking-tight">
                  <div className="w-1.5 h-5 bg-gradient-to-b from-pink-400 to-pink-600 rounded-full shadow-sm" /> 待办审批
                  {pendingCount > 0 && <span className="ml-1 px-2 py-0.5 text-xs font-bold bg-pink-100/80 text-pink-600 rounded-full shadow-sm">{pendingCount}</span>}
                </h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate('/tasks')}
                  className="text-xs font-medium text-slate-400 hover:text-pink-600 flex items-center gap-0.5 transition-colors group h-auto p-0 hover:bg-transparent"
                >
                  查看全部 <ChevronRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
                </Button>
              </div>
              {lt ? <Skeleton /> : pendingTasks.length > 0 ? (
                <div className="p-3 space-y-1">
                  {pendingTasks.map((t, i) => (
                    <div key={t.id || i} className="flex items-center gap-4 px-4 py-3.5 rounded-2xl hover:bg-white border border-transparent hover:border-white hover:shadow-[0_4px_20px_rgb(0,0,0,0.04)] hover:scale-[1.01] active:scale-[0.99] cursor-pointer transition-all duration-300 ease-out group" onClick={() => navigate('/tasks')}>
                      <div className="w-9 h-9 rounded-xl bg-slate-100/50 text-slate-500 group-hover:bg-pink-50 group-hover:text-pink-500 shadow-sm flex items-center justify-center text-xs font-bold shrink-0 transition-colors">{i + 1}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[15px] font-semibold text-slate-700 truncate group-hover:text-pink-600 transition-colors">{t.processName || t.title || t.instanceName || '审批任务'}</p>
                        <p className="text-xs font-medium text-slate-400 mt-1 truncate">{t.startUserName || t.creatorName || '发起人未知'}{t.createTime && <span className="ml-2 font-normal opacity-80">{relTime(t.createTime)}</span>}</p>
                      </div>
                      {badge(t.status || 'PENDING')}
                      <ChevronRight size={16} className="text-slate-300 group-hover:text-pink-400 shrink-0 ml-1" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                  <CheckCircle2 size={44} className="text-emerald-300 mb-3 drop-shadow-sm" />
                  <p className="text-sm font-medium">暂无待办审批，太棒了！</p>
                </div>
              )}
            </Card>

            {/* 最近申请 */}
            <Card className="border border-white/80 shadow-[0_8px_30px_rgb(0,0,0,0.04)] bg-white/60 backdrop-blur-xl rounded-3xl overflow-hidden">
              <div className="flex items-center justify-between p-6 pb-2">
                <h3 className="text-[15px] font-bold text-slate-800 flex items-center gap-2.5 tracking-tight">
                  <div className="w-1.5 h-5 bg-gradient-to-b from-slate-400 to-slate-600 rounded-full shadow-sm" /> 最近申请
                </h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate('/my-apps')}
                  className="text-xs font-medium text-slate-400 hover:text-pink-600 flex items-center gap-0.5 transition-colors group h-auto p-0 hover:bg-transparent"
                >
                  查看全部 <ChevronRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
                </Button>
              </div>
              {la ? <Skeleton /> : recentApps.length > 0 ? (
                <div className="p-3 space-y-1">
                  {recentApps.map((a, i) => (
                    <div key={a.id || i} className="flex items-center gap-4 px-4 py-3.5 rounded-2xl hover:bg-white border border-transparent hover:border-white hover:shadow-[0_4px_20px_rgb(0,0,0,0.04)] hover:scale-[1.01] active:scale-[0.99] cursor-pointer transition-all duration-300 ease-out group" onClick={() => navigate('/my-apps')}>
                      <div className="w-9 h-9 rounded-xl bg-slate-100/50 text-slate-500 group-hover:bg-pink-50 group-hover:text-pink-500 shadow-sm flex items-center justify-center shrink-0 transition-colors"><FileSearch size={16} /></div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[15px] font-semibold text-slate-700 truncate group-hover:text-pink-600 transition-colors">{a.processName || a.title || a.instanceName || '流程申请'}</p>
                        <p className="text-xs font-medium text-slate-400 mt-1">{a.createTime && relTime(a.createTime)}</p>
                      </div>
                      {badge(a.status || 'RUNNING')}
                      <ChevronRight size={16} className="text-slate-300 group-hover:text-pink-400 shrink-0 ml-1" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                  <FileText size={44} className="text-slate-300 mb-3 drop-shadow-sm" />
                  <p className="text-sm font-medium">暂无申请记录</p>
                  <Button
                    variant="ghost"
                    onClick={() => navigate('/workplace')}
                    className="mt-3 text-sm font-semibold text-pink-500 hover:text-pink-600 flex items-center gap-1.5 transition-colors px-4 py-2 rounded-xl hover:bg-pink-50 active:scale-95"
                  >
                    <PlayCircle size={14} /> 去发起流程
                  </Button>
                </div>
              )}
            </Card>
          </div>

          {/* 右栏 */}
          <div className="space-y-6">
            {/* 公告通知 - 常驻显示，带已读/未读标记 */}
            <Card className="border border-white/80 shadow-[0_8px_30px_rgb(0,0,0,0.04)] bg-white/60 backdrop-blur-xl rounded-3xl overflow-hidden">
              <div className="flex items-center justify-between p-6 pb-2">
                <h3 className="text-[15px] font-bold text-slate-800 flex items-center gap-2.5 tracking-tight">
                  <div className="w-1.5 h-5 bg-gradient-to-b from-rose-400 to-rose-600 rounded-full shadow-sm" /> 公告通知
                  {announcements.filter(n => !readAnnouncementIds.has(String(n.announcementId || n.id))).length > 0 && (
                    <span className="px-2 py-0.5 text-xs font-bold bg-rose-100/80 text-rose-600 rounded-full shadow-sm">
                      {announcements.filter(n => !readAnnouncementIds.has(String(n.announcementId || n.id))).length}
                    </span>
                  )}
                </h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate('/announcement')}
                  className="text-xs font-medium text-slate-400 hover:text-pink-600 flex items-center gap-0.5 transition-colors group h-auto p-0 hover:bg-transparent"
                >
                  更多 <ChevronRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
                </Button>
              </div>
              {lan ? <Skeleton /> : announcements.length > 0 ? (
                <div className="p-3 space-y-1">
                  {announcements.map((n, i) => {
                    // 兼容不同的ID字段名：announcementId 或 id
                    const nId = String(n.announcementId || n.id);
                    const isRead = readAnnouncementIds.has(nId);
                    return (
                      <div
                        key={n.announcementId || n.id || i}
                        className={`flex items-start gap-4 px-4 py-3 rounded-2xl hover:bg-white border border-transparent hover:border-white hover:shadow-[0_4px_15px_rgb(0,0,0,0.03)] hover:scale-[1.01] active:scale-[0.99] cursor-pointer transition-all duration-300 ease-out group ${isRead ? 'opacity-60 saturate-50' : ''}`}
                        onClick={() => {
                          // 标记为已读
                          if (!isRead) {
                            const newSet = new Set(readAnnouncementIds);
                            newSet.add(nId);
                            setReadAnnouncementIds(newSet);
                            try { localStorage.setItem('read_announcements', JSON.stringify([...newSet])); } catch {}
                          }
                          navigate('/announcement');
                        }}
                      >
                        <div className="mt-1 shrink-0 relative p-2 rounded-xl bg-slate-50 group-hover:bg-pink-50 transition-colors">
                          <Bell size={16} className={isRead ? 'text-slate-400' : 'text-pink-500 group-hover:scale-110 group-hover:rotate-12 transition-all duration-300'} />
                          {!isRead && <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-rose-500 border-2 border-white rounded-full shadow-sm animate-pulse" />}
                        </div>
                        <div className="flex-1 min-w-0 py-0.5">
                          <p className={`text-[14px] truncate transition-colors ${isRead ? 'font-medium text-slate-500' : 'font-bold text-slate-800 group-hover:text-pink-600'}`}>
                            {n.title || '公告'}
                          </p>
                          <p className="text-xs font-medium text-slate-400 mt-1 flex items-center gap-2">
                            {n.createTime ? relTime(n.createTime) : ''}
                            {isRead && <span className="text-slate-300 font-normal">已读</span>}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                  <Megaphone size={40} className="text-slate-300 mb-3 drop-shadow-sm" />
                  <p className="text-sm font-medium">暂无公告通知</p>
                  <p className="text-xs text-slate-300 mt-1">新公告发布后将在此显示</p>
                </div>
              )}
            </Card>

            {/* 今日日程 */}
            <Card className="border border-white/80 shadow-[0_8px_30px_rgb(0,0,0,0.04)] bg-white/60 backdrop-blur-xl rounded-3xl overflow-hidden">
              <div className="flex items-center justify-between p-6 pb-2">
                <h3 className="text-[15px] font-bold text-slate-800 flex items-center gap-2.5 tracking-tight">
                  <div className="w-1.5 h-5 bg-gradient-to-b from-blue-300 to-blue-500 rounded-full shadow-sm" /> 今日日程
                </h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate('/schedule')}
                  className="text-xs font-medium text-slate-400 hover:text-pink-600 flex items-center gap-0.5 transition-colors group h-auto p-0 hover:bg-transparent"
                >
                  更多 <ChevronRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
                </Button>
              </div>
              {ls ? <Skeleton /> : schedules.length > 0 ? (
                <div className="p-3 space-y-1">
                  {schedules.map((sc, i) => (
                    <div key={sc.id || i} className="flex items-start gap-4 px-4 py-3 rounded-2xl hover:bg-white border border-transparent hover:border-white hover:shadow-[0_4px_15px_rgb(0,0,0,0.03)] hover:scale-[1.01] active:scale-[0.99] cursor-pointer transition-all duration-300 ease-out group" onClick={() => navigate('/schedule')}>
                      <div className="mt-1 shrink-0 p-1.5 rounded-lg bg-blue-50 text-blue-400 group-hover:bg-blue-100 group-hover:text-blue-500 transition-colors">
                        <CircleDot size={12} className="group-hover:animate-pulse" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-bold text-slate-700 truncate group-hover:text-blue-600 transition-colors">{sc.title || sc.content || '日程'}</p>
                        <p className="text-xs font-medium text-slate-400 mt-1 flex items-center gap-1.5"><Clock size={12} />{sc.startTime || ''}{sc.endTime ? ` - ${sc.endTime}` : ''}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                  <CalendarDays size={40} className="text-slate-300 mb-3 drop-shadow-sm" />
                  <p className="text-sm font-medium">今日暂无日程</p>
                  <Button
                    variant="ghost"
                    onClick={() => navigate('/schedule')}
                    className="mt-3 text-sm font-semibold text-blue-500 hover:text-blue-600 flex items-center gap-1.5 px-4 py-2 rounded-xl hover:bg-blue-50 active:scale-95 transition-colors"
                  >
                    <CalendarDays size={14} /> 添加日程
                  </Button>
                </div>
              )}
            </Card>

            {/* 工作概览 */}
            <Card className="border border-white/80 shadow-[0_8px_30px_rgb(0,0,0,0.04)] bg-white/60 backdrop-blur-xl rounded-3xl p-6">
              <h3 className="text-[15px] font-bold text-slate-800 flex items-center gap-2.5 mb-5 tracking-tight">
                <div className="w-1.5 h-5 bg-gradient-to-b from-slate-400 to-slate-600 rounded-full shadow-sm" /> 工作概览
              </h3>
              <div className="space-y-4">
                {[
                  { label: '待办审批', val: pendingCount, total: Math.max(pendingCount + doneCount, 1), grad: 'bg-gradient-to-r from-pink-400 to-pink-500' },
                  { label: '已完成', val: doneCount, total: Math.max(pendingCount + doneCount, 1), grad: 'bg-gradient-to-r from-slate-600 to-slate-800' },
                  { label: '我的申请', val: myAppsCount, total: Math.max(myAppsCount, 1), grad: 'bg-gradient-to-r from-slate-400 to-slate-500' },
                ].map(item => (
                  <div key={item.label} className="group">
                    <div className="flex justify-between text-[13px] mb-1.5 font-medium">
                      <span className="text-slate-500 group-hover:text-slate-700 transition-colors">{item.label}</span>
                      <span className="text-slate-800 font-bold">{item.val}</span>
                    </div>
                    <div className="h-2.5 bg-slate-100/80 rounded-full overflow-hidden shadow-inner">
                      <div className={`h-full ${item.grad} rounded-full transition-all duration-1000 ease-out shadow-sm`} style={{ width: `${Math.min((item.val / item.total) * 100, 100)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};
