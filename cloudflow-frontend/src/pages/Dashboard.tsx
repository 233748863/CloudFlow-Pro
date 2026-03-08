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
    { label: '待办审批', value: pendingCount, icon: <ClipboardCheck size={22} />, grad: 'from-orange-500 to-amber-500', sh: 'shadow-orange-200/60', bg: 'bg-orange-50', tc: 'text-orange-600', path: '/tasks', desc: '需要您处理' },
    { label: '我的申请', value: myAppsCount, icon: <FileText size={22} />, grad: 'from-blue-500 to-cyan-500', sh: 'shadow-blue-200/60', bg: 'bg-blue-50', tc: 'text-blue-600', path: '/my-apps', desc: '已发起的流程' },
    { label: '抄送我的', value: copyCount, icon: <MailOpen size={22} />, grad: 'from-violet-500 to-purple-500', sh: 'shadow-violet-200/60', bg: 'bg-violet-50', tc: 'text-violet-600', path: '/my-copies', desc: '知会给您的' },
    { label: '已完成', value: doneCount, icon: <CheckCheck size={22} />, grad: 'from-emerald-500 to-teal-500', sh: 'shadow-emerald-200/60', bg: 'bg-emerald-50', tc: 'text-emerald-600', path: '/tasks', desc: '已审批完成' },
  ];

  const shortcuts = [
    { label: '发起流程', icon: <PlayCircle size={20} />, path: '/workplace', c: 'text-pink-600', bg: 'bg-pink-50', hb: 'hover:bg-pink-100' },
    { label: '我的日程', icon: <CalendarDays size={20} />, path: '/schedule', c: 'text-blue-600', bg: 'bg-blue-50', hb: 'hover:bg-blue-100' },
    { label: '会议预约', icon: <Users size={20} />, path: '/meeting-room', c: 'text-indigo-600', bg: 'bg-indigo-50', hb: 'hover:bg-indigo-100' },
    { label: '公告中心', icon: <Megaphone size={20} />, path: '/announcement', c: 'text-rose-600', bg: 'bg-rose-50', hb: 'hover:bg-rose-100' },
    { label: '报销申请', icon: <CreditCard size={20} />, path: '/expense/claim', c: 'text-amber-600', bg: 'bg-amber-50', hb: 'hover:bg-amber-100' },
    { label: '出差申请', icon: <Briefcase size={20} />, path: '/office/business-trip', c: 'text-teal-600', bg: 'bg-teal-50', hb: 'hover:bg-teal-100' },
    { label: '用车申请', icon: <Car size={20} />, path: '/admin/vehicle/booking', c: 'text-cyan-600', bg: 'bg-cyan-50', hb: 'hover:bg-cyan-100' },
    { label: '考勤打卡', icon: <UserCheck size={20} />, path: '/admin/attendance/checkin', c: 'text-green-600', bg: 'bg-green-50', hb: 'hover:bg-green-100' },
    { label: '加班申请', icon: <Timer size={20} />, path: '/office/overtime', c: 'text-orange-600', bg: 'bg-orange-50', hb: 'hover:bg-orange-100' },
    { label: '通讯录', icon: <Building2 size={20} />, path: '/office/contact', c: 'text-slate-600', bg: 'bg-slate-50', hb: 'hover:bg-slate-100' },
  ];

  const stMap: Record<string, { l: string; c: string; b: string }> = {
    PENDING: { l: '待审批', c: 'text-orange-700', b: 'bg-orange-50 border-orange-200' },
    RUNNING: { l: '进行中', c: 'text-blue-700', b: 'bg-blue-50 border-blue-200' },
    APPROVED: { l: '已通过', c: 'text-emerald-700', b: 'bg-emerald-50 border-emerald-200' },
    REJECTED: { l: '已驳回', c: 'text-red-700', b: 'bg-red-50 border-red-200' },
    COMPLETED: { l: '已完成', c: 'text-emerald-700', b: 'bg-emerald-50 border-emerald-200' },
    CANCELLED: { l: '已取消', c: 'text-slate-700', b: 'bg-slate-50 border-slate-200' },
  };
  const badge = (st: string) => {
    const cf = stMap[st] || { l: st || '未知', c: 'text-slate-600', b: 'bg-slate-50 border-slate-200' };
    return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cf.b} ${cf.c}`}>{cf.l}</span>;
  };

  return (
    <div className="space-y-6 animate-fade-in pb-6">
      {/* 欢迎横幅 */}
      <Card className="relative overflow-hidden border-none shadow-lg shadow-pink-200/40">
        <div className="absolute inset-0 bg-gradient-to-br from-pink-500 via-rose-500 to-orange-400" />
        <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/10 rounded-full" />
        <div className="absolute -bottom-8 -left-8 w-32 h-32 bg-white/5 rounded-full" />
        <div className="absolute top-1/2 right-1/4 w-20 h-20 bg-white/5 rounded-full" />
        <div className="relative p-6 sm:p-8">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-pink-100 text-sm">
                <Calendar size={14} /><span>{dateStr}</span>
                {timeStr && <><span className="opacity-50">·</span><span>{timeStr}</span></>}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-white/80">{greeting.icon}</span>
                <h2 className="text-2xl sm:text-3xl font-bold text-white">{greeting.text}，{user.name}</h2>
              </div>
              <p className="text-pink-100 text-sm mt-1">
                {pendingCount > 0
                  ? <>您有 <span className="font-bold text-white text-base">{pendingCount}</span> 个审批任务待处理</>
                  : <>暂无待办事项，一切运行正常 <Sparkles size={14} className="inline ml-1" /></>}
                {user.deptName && <span className="opacity-70"> · {user.deptName}</span>}
              </p>
            </div>
            <div className="hidden sm:flex flex-col gap-2">
              {pendingCount > 0 && (
                <Button className="bg-white/20 border border-white/30 text-white hover:bg-white/30 backdrop-blur-sm flex items-center gap-1.5" onClick={() => navigate('/tasks')}>
                  去处理 <ArrowRight size={14} />
                </Button>
              )}
              <Button className="bg-white/10 border border-white/20 text-white/90 hover:bg-white/20 backdrop-blur-sm flex items-center gap-1.5 text-sm" onClick={() => navigate('/workplace')}>
                <PlayCircle size={14} /> 发起流程
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(c => (
          <Card key={c.label} className={`relative overflow-hidden p-5 hover:shadow-lg ${c.sh} transition-all duration-300 cursor-pointer group border-none`} onClick={() => navigate(c.path)}>
            <div className={`absolute -top-4 -right-4 w-16 h-16 rounded-full bg-gradient-to-br ${c.grad} opacity-10 group-hover:opacity-20 transition-opacity`} />
            <div className="flex justify-between items-start relative">
              <div>
                <p className="text-sm text-slate-500 font-medium">{c.label}</p>
                <h3 className="text-3xl font-bold text-slate-800 mt-1">{c.value}</h3>
                <p className="text-xs text-slate-400 mt-1">{c.desc}</p>
              </div>
              <div className={`p-2.5 rounded-xl ${c.bg} ${c.tc} group-hover:scale-110 transition-transform duration-300`}>{c.icon}</div>
            </div>
          </Card>
        ))}
      </div>

      {/* 快捷入口 */}
      <Card className="p-5 border-none shadow-sm">
        <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2 mb-4">
          <Activity size={16} className="text-pink-500" /> 快捷入口
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {shortcuts.map(i => (
            <button key={i.label} onClick={() => navigate(i.path)} className={`flex flex-col items-center gap-2 p-3 rounded-xl ${i.hb} transition-all duration-200 text-center group`}>
              <div className={`p-2.5 rounded-xl ${i.bg} ${i.c} group-hover:scale-110 transition-transform duration-200`}>{i.icon}</div>
              <span className="text-xs font-medium text-slate-600">{i.label}</span>
            </button>
          ))}
        </div>
      </Card>

      {/* 主内容区域 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 左栏 */}
        <div className="lg:col-span-2 space-y-6">
          {/* 待办审批 */}
          <Card className="border-none shadow-sm overflow-hidden">
            <div className="flex items-center justify-between p-5 pb-3">
              <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <div className="w-1 h-4 bg-orange-500 rounded-full" /> 待办审批
                {pendingCount > 0 && <span className="ml-1 px-1.5 py-0.5 text-xs font-bold bg-orange-100 text-orange-600 rounded-full">{pendingCount}</span>}
              </h3>
              <button onClick={() => navigate('/tasks')} className="text-xs text-slate-400 hover:text-pink-500 flex items-center gap-0.5 transition-colors">查看全部 <ChevronRight size={14} /></button>
            </div>
            {lt ? <Skeleton /> : pendingTasks.length > 0 ? (
              <div className="divide-y divide-slate-50">
                {pendingTasks.map((t, i) => (
                  <div key={t.id || i} className="flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50/80 cursor-pointer transition-colors group" onClick={() => navigate('/tasks')}>
                    <div className="w-7 h-7 rounded-full bg-orange-50 text-orange-500 flex items-center justify-center text-xs font-bold shrink-0">{i + 1}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-700 truncate group-hover:text-pink-600 transition-colors">{t.processName || t.title || t.instanceName || '审批任务'}</p>
                      <p className="text-xs text-slate-400 mt-0.5 truncate">{t.startUserName || t.creatorName || '发起人未知'}{t.createTime && <span className="ml-2">{relTime(t.createTime)}</span>}</p>
                    </div>
                    {badge(t.status || 'PENDING')}
                    <ChevronRight size={14} className="text-slate-300 group-hover:text-pink-400 shrink-0" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                <CheckCircle2 size={36} className="text-emerald-300 mb-2" />
                <p className="text-sm">暂无待办审批，太棒了！</p>
              </div>
            )}
          </Card>

          {/* 最近申请 */}
          <Card className="border-none shadow-sm overflow-hidden">
            <div className="flex items-center justify-between p-5 pb-3">
              <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <div className="w-1 h-4 bg-blue-500 rounded-full" /> 最近申请
              </h3>
              <button onClick={() => navigate('/my-apps')} className="text-xs text-slate-400 hover:text-pink-500 flex items-center gap-0.5 transition-colors">查看全部 <ChevronRight size={14} /></button>
            </div>
            {la ? <Skeleton /> : recentApps.length > 0 ? (
              <div className="divide-y divide-slate-50">
                {recentApps.map((a, i) => (
                  <div key={a.id || i} className="flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50/80 cursor-pointer transition-colors group" onClick={() => navigate('/my-apps')}>
                    <div className="w-7 h-7 rounded-full bg-blue-50 text-blue-500 flex items-center justify-center shrink-0"><FileSearch size={14} /></div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-700 truncate group-hover:text-pink-600 transition-colors">{a.processName || a.title || a.instanceName || '流程申请'}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{a.createTime && relTime(a.createTime)}</p>
                    </div>
                    {badge(a.status || 'RUNNING')}
                    <ChevronRight size={14} className="text-slate-300 group-hover:text-pink-400 shrink-0" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                <FileText size={36} className="text-blue-200 mb-2" />
                <p className="text-sm">暂无申请记录</p>
                <button onClick={() => navigate('/workplace')} className="mt-2 text-xs text-pink-500 hover:text-pink-600 flex items-center gap-1"><PlayCircle size={12} /> 去发起流程</button>
              </div>
            )}
          </Card>
        </div>

        {/* 右栏 */}
        <div className="space-y-6">
          {/* 公告通知 - 常驻显示，带已读/未读标记 */}
          <Card className="border-none shadow-sm overflow-hidden">
            <div className="flex items-center justify-between p-5 pb-3">
              <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <div className="w-1 h-4 bg-rose-500 rounded-full" /> 公告通知
                {announcements.filter(n => !readAnnouncementIds.has(String(n.announcementId || n.id))).length > 0 && (
                  <span className="px-1.5 py-0.5 text-xs font-bold bg-rose-100 text-rose-600 rounded-full">
                    {announcements.filter(n => !readAnnouncementIds.has(String(n.announcementId || n.id))).length}
                  </span>
                )}
              </h3>
              <button onClick={() => navigate('/announcement')} className="text-xs text-slate-400 hover:text-pink-500 flex items-center gap-0.5 transition-colors">更多 <ChevronRight size={14} /></button>
            </div>
            {lan ? <Skeleton /> : announcements.length > 0 ? (
              <div className="divide-y divide-slate-50">
                {announcements.map((n, i) => {
                  // 兼容不同的ID字段名：announcementId 或 id
                  const nId = String(n.announcementId || n.id);
                  const isRead = readAnnouncementIds.has(nId);
                  return (
                    <div
                      key={n.announcementId || n.id || i}
                      className={`flex items-start gap-3 px-5 py-3 hover:bg-slate-50/80 cursor-pointer transition-colors group ${isRead ? 'opacity-60' : ''}`}
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
                      <div className="mt-1 shrink-0 relative">
                        <Bell size={14} className={isRead ? 'text-slate-300' : 'text-rose-400'} />
                        {!isRead && <span className="absolute -top-1 -right-1 w-2 h-2 bg-rose-500 rounded-full" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm truncate group-hover:text-pink-600 transition-colors ${isRead ? 'font-normal text-slate-500' : 'font-medium text-slate-700'}`}>
                          {n.title || '公告'}
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-2">
                          {n.createTime ? relTime(n.createTime) : ''}
                          {isRead && <span className="text-slate-300">已读</span>}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-slate-400">
                <Megaphone size={32} className="text-rose-200 mb-2" />
                <p className="text-sm">暂无公告通知</p>
                <p className="text-xs text-slate-300 mt-1">新公告发布后将在此显示</p>
              </div>
            )}
          </Card>

          {/* 今日日程 */}
          <Card className="border-none shadow-sm overflow-hidden">
            <div className="flex items-center justify-between p-5 pb-3">
              <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <div className="w-1 h-4 bg-blue-500 rounded-full" /> 今日日程
              </h3>
              <button onClick={() => navigate('/schedule')} className="text-xs text-slate-400 hover:text-pink-500 flex items-center gap-0.5 transition-colors">更多 <ChevronRight size={14} /></button>
            </div>
            {ls ? <Skeleton /> : schedules.length > 0 ? (
              <div className="divide-y divide-slate-50">
                {schedules.map((sc, i) => (
                  <div key={sc.id || i} className="flex items-start gap-3 px-5 py-3 hover:bg-slate-50/80 cursor-pointer transition-colors group" onClick={() => navigate('/schedule')}>
                    <div className="mt-0.5 shrink-0"><CircleDot size={14} className="text-blue-400" /></div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-700 truncate group-hover:text-pink-600 transition-colors">{sc.title || sc.content || '日程'}</p>
                      <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1"><Clock size={10} />{sc.startTime || ''}{sc.endTime ? ` - ${sc.endTime}` : ''}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-slate-400">
                <CalendarDays size={32} className="text-blue-200 mb-2" />
                <p className="text-sm">今日暂无日程</p>
                <button onClick={() => navigate('/schedule')} className="mt-2 text-xs text-pink-500 hover:text-pink-600 flex items-center gap-1"><CalendarDays size={12} /> 添加日程</button>
              </div>
            )}
          </Card>

          {/* 工作概览 */}
          <Card className="border-none shadow-sm p-5">
            <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2 mb-4">
              <div className="w-1 h-4 bg-emerald-500 rounded-full" /> 工作概览
            </h3>
            <div className="space-y-3">
              {[
                { label: '待办审批', val: pendingCount, total: Math.max(pendingCount + doneCount, 1), color: 'bg-orange-500' },
                { label: '已完成', val: doneCount, total: Math.max(pendingCount + doneCount, 1), color: 'bg-emerald-500' },
                { label: '我的申请', val: myAppsCount, total: Math.max(myAppsCount, 1), color: 'bg-blue-500' },
              ].map(item => (
                <div key={item.label}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-500">{item.label}</span>
                    <span className="text-slate-700 font-medium">{item.val}</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full ${item.color} rounded-full transition-all duration-500`} style={{ width: `${Math.min((item.val / item.total) * 100, 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};
