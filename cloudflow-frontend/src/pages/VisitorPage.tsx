import React, { useEffect, useMemo, useState } from 'react';
import {
  UserCheck,
  Plus,
  Search,
  RotateCcw,
  X,
  LogIn,
  LogOut,
  CheckCircle,
  XCircle,
  Calendar,
  Building2,
  Users
} from 'lucide-react';
import { toast } from 'sonner';
import { visitorApi, Visitor } from '../services/api/visitor';
import { getErrorMessage } from '@/utils/errorMessage';
import {
  Button,
  Card,
  DatePicker,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableActionHead,
  TableHeader,
  TableRow,
  Textarea
} from '@/components/ui';
import { TableRowActions } from '@/components/ui/table-row-actions';
import {
  WorkspaceHeroCard,
  WorkspacePaginationBar,
  WorkspaceResultCard,
  WorkspaceWorkbenchCard,
} from '@/components/workspace/WorkspacePanels';
import { WorkspaceBackdrop, WorkspaceTableStateRow } from '@/components/workspace/WorkspacePrimitives';

const STATUS_MAP: Record<string, string> = {
  PENDING: '待确认',
  CONFIRMED: '已确认',
  ARRIVED: '已到访',
  COMPLETED: '已离开',
  CANCELLED: '已取消',
};

const STATUS_QUICK_FILTERS = [
  { label: '全部', value: '' },
  { label: '待确认', value: 'PENDING' },
  { label: '已确认', value: 'CONFIRMED' },
  { label: '已到访', value: 'ARRIVED' },
  { label: '已离开', value: 'COMPLETED' },
  { label: '已取消', value: 'CANCELLED' },
];

const getStatusTone = (status: string) => {
  const config: Record<string, { bg: string; text: string }> = {
    PENDING: {
      bg: 'border-amber-100/80 bg-[linear-gradient(135deg,rgba(255,251,235,0.95),rgba(255,255,255,0.86))]',
      text: 'text-amber-700',
    },
    CONFIRMED: {
      bg: 'border-pink-100/80 bg-[linear-gradient(135deg,rgba(253,242,248,0.95),rgba(255,255,255,0.86))]',
      text: 'text-pink-600',
    },
    ARRIVED: {
      bg: 'border-emerald-100/80 bg-[linear-gradient(135deg,rgba(236,253,245,0.95),rgba(255,255,255,0.86))]',
      text: 'text-emerald-700',
    },
    COMPLETED: {
      bg: 'border-cyan-100/80 bg-[linear-gradient(135deg,rgba(236,254,255,0.95),rgba(255,255,255,0.86))]',
      text: 'text-cyan-700',
    },
    CANCELLED: {
      bg: 'border-slate-200/80 bg-[linear-gradient(135deg,rgba(248,250,252,0.96),rgba(255,255,255,0.86))]',
      text: 'text-slate-500',
    },
  };
  return config[status] || config.PENDING;
};

const formatDateCN = (date: Date) => {
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  return `${date.getMonth() + 1}月${date.getDate()}日 ${weekdays[date.getDay()]}`;
};

/** 访客管理页面 */
export const VisitorPage: React.FC = () => {
  const [list, setList] = useState<Visitor[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchParams, setSearchParams] = useState({
    status: '',
    visitorName: '',
    visitDate: '',
    pageNum: 1,
    pageSize: 10
  });
  const [visitorNameInput, setVisitorNameInput] = useState('');
  const [visitDateInput, setVisitDateInput] = useState('');
  const [total, setTotal] = useState(0);
  const [showDialog, setShowDialog] = useState(false);
  const [formData, setFormData] = useState<Visitor>({
    visitorName: '',
    visitReason: '',
    hostId: 0,
    visitDate: ''
  });

  useEffect(() => {
    void fetchList();
  }, [searchParams]);

  const fetchList = async () => {
    setLoading(true);
    try {
      const res = await visitorApi.list(searchParams);
      if (res) {
        setList(res.records || res.rows || []);
        setTotal(res.total || 0);
      }
    } catch (error) {
      toast.error(getErrorMessage(error, '获取列表失败'));
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    setFormData({
      visitorName: '',
      visitReason: '',
      hostId: 0,
      visitDate: '',
      visitorPhone: '',
      visitorCompany: '',
      visitorCount: 1,
      visitArea: '',
      carPlate: '',
      hostName: ''
    });
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!formData.visitorName || !formData.visitReason || !formData.visitDate) {
      toast.error('请填写完整信息');
      return;
    }
    try {
      await visitorApi.add(formData);
      toast.success('预约成功');
      setShowDialog(false);
      void fetchList();
    } catch (error) {
      toast.error(getErrorMessage(error, '保存失败'));
    }
  };

  const handleConfirm = async (id: number) => {
    try {
      await visitorApi.confirm(id);
      toast.success('已确认');
      void fetchList();
    } catch (error) {
      toast.error(getErrorMessage(error, '操作失败'));
    }
  };

  const handleCheckIn = async (id: number) => {
    try {
      await visitorApi.checkIn(id);
      toast.success('已签到');
      void fetchList();
    } catch (error) {
      toast.error(getErrorMessage(error, '操作失败'));
    }
  };

  const handleCheckOut = async (id: number) => {
    try {
      await visitorApi.checkOut(id);
      toast.success('已签退');
      void fetchList();
    } catch (error) {
      toast.error(getErrorMessage(error, '操作失败'));
    }
  };

  const handleCancel = async (id: number) => {
    if (!confirm('确定取消？')) {
      return;
    }
    try {
      await visitorApi.cancel(id);
      toast.success('已取消');
      void fetchList();
    } catch (error) {
      toast.error(getErrorMessage(error, '操作失败'));
    }
  };

  const applySearch = () => {
    setSearchParams((prev) => ({
      ...prev,
      visitorName: visitorNameInput.trim(),
      visitDate: visitDateInput,
      pageNum: 1
    }));
  };

  const applyStatusFilter = (status: string) => {
    setSearchParams((prev) => ({
      ...prev,
      status,
      pageNum: 1
    }));
  };

  const handleResetFilters = () => {
    setVisitorNameInput('');
    setVisitDateInput('');
    setSearchParams({
      status: '',
      visitorName: '',
      visitDate: '',
      pageNum: 1,
      pageSize: 10
    });
  };

  const now = useMemo(() => new Date(), []);
  const todayLabel = useMemo(() => formatDateCN(now), [now]);
  const timeLabel = useMemo(() => now.toTimeString().slice(0, 5), [now]);
  const todayString = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const pendingCount = useMemo(() => list.filter(item => item.status === 'PENDING').length, [list]);
  const arrivedCount = useMemo(() => list.filter(item => item.status === 'ARRIVED').length, [list]);
  const completedCount = useMemo(() => list.filter(item => item.status === 'COMPLETED').length, [list]);
  const todayVisitCount = useMemo(() => list.filter(item => item.visitDate?.slice(0, 10) === todayString).length, [list, todayString]);
  const currentStatusLabel = searchParams.status ? (STATUS_MAP[searchParams.status] || searchParams.status) : '全部状态';
  const hasActiveFilters = Boolean(searchParams.status || searchParams.visitorName || searchParams.visitDate);
  const totalPages = Math.max(1, Math.ceil(total / searchParams.pageSize));

  const heroMetrics = useMemo(() => ([
    {
      label: '当前结果',
      value: `${total}`,
      hint: '默认视图下展示当前访客预约记录',
      panelClassName: 'border-slate-100/80 bg-[linear-gradient(135deg,rgba(248,250,252,0.95),rgba(255,255,255,0.82),rgba(239,246,255,0.75))] shadow-[0_16px_32px_rgba(15,23,42,0.06),inset_0_1px_0_rgba(255,255,255,0.76)]',
      iconWrapClassName: 'bg-white/88 text-slate-600 ring-1 ring-slate-100 shadow-[0_10px_22px_rgba(15,23,42,0.08)]',
      glowClassName: 'from-slate-100/90 via-sky-50/45 to-transparent',
      valueClassName: 'text-slate-950',
      hintClassName: 'text-slate-500',
      icon: <Users size={17} />,
    },
    {
      label: '待确认',
      value: `${pendingCount}`,
      hint: pendingCount > 0 ? '建议优先确认待来访预约' : '当前没有待确认的访客',
      panelClassName: 'border-amber-100/80 bg-[linear-gradient(135deg,rgba(255,251,235,0.95),rgba(255,255,255,0.82),rgba(255,247,237,0.78))] shadow-[0_16px_32px_rgba(245,158,11,0.08),inset_0_1px_0_rgba(255,255,255,0.76)]',
      iconWrapClassName: 'bg-white/88 text-amber-600 ring-1 ring-amber-100 shadow-[0_10px_22px_rgba(245,158,11,0.08)]',
      glowClassName: 'from-amber-100/90 via-orange-50/45 to-transparent',
      valueClassName: 'text-amber-700',
      hintClassName: 'text-slate-500',
      icon: <CheckCircle size={17} />,
    },
    {
      label: '今日来访',
      value: `${todayVisitCount}`,
      hint: arrivedCount > 0 ? `当前已有 ${arrivedCount} 位访客完成签到` : '今天还没有签到记录',
      panelClassName: 'border-pink-100/80 bg-[linear-gradient(135deg,rgba(253,242,248,0.95),rgba(255,255,255,0.82),rgba(255,241,242,0.8))] shadow-[0_16px_32px_rgba(236,72,153,0.08),inset_0_1px_0_rgba(255,255,255,0.76)]',
      iconWrapClassName: 'bg-white/88 text-pink-600 ring-1 ring-pink-100 shadow-[0_10px_22px_rgba(236,72,153,0.08)]',
      glowClassName: 'from-pink-100/90 via-rose-50/45 to-transparent',
      valueClassName: 'text-pink-600',
      hintClassName: 'text-slate-500',
      icon: <LogIn size={17} />,
    },
    {
      label: '已完成',
      value: `${completedCount}`,
      hint: completedCount > 0 ? '已完成签退的访客会沉淀在记录中' : '当前还没有完成签退的访客',
      panelClassName: 'border-emerald-100/80 bg-[linear-gradient(135deg,rgba(236,253,245,0.95),rgba(255,255,255,0.82),rgba(236,254,255,0.78))] shadow-[0_16px_32px_rgba(16,185,129,0.08),inset_0_1px_0_rgba(255,255,255,0.76)]',
      iconWrapClassName: 'bg-white/88 text-emerald-600 ring-1 ring-emerald-100 shadow-[0_10px_22px_rgba(16,185,129,0.08)]',
      glowClassName: 'from-emerald-100/90 via-cyan-50/45 to-transparent',
      valueClassName: 'text-emerald-700',
      hintClassName: 'text-slate-500',
      icon: <LogOut size={17} />,
    },
  ]), [arrivedCount, completedCount, pendingCount, todayVisitCount, total]);

  const workspaceOverviewItems = [
    {
      label: '记录数',
      value: `${total} 条`,
      toneClassName: 'border-white/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.84),rgba(248,250,252,0.72))] text-slate-900 shadow-[0_10px_24px_rgba(15,23,42,0.04),inset_0_1px_0_rgba(255,255,255,0.7)]',
    },
    {
      label: '状态',
      value: currentStatusLabel,
      toneClassName: 'border-white/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.84),rgba(248,250,252,0.72))] text-slate-900 shadow-[0_10px_24px_rgba(15,23,42,0.04),inset_0_1px_0_rgba(255,255,255,0.7)]',
    },
    {
      label: '访客',
      value: searchParams.visitorName || '全部',
      toneClassName: 'border-white/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.84),rgba(248,250,252,0.72))] text-slate-900 shadow-[0_10px_24px_rgba(15,23,42,0.04),inset_0_1px_0_rgba(255,255,255,0.7)]',
    },
    {
      label: '视图',
      value: hasActiveFilters ? '筛选结果' : '默认视图',
      toneClassName: hasActiveFilters
        ? 'border-pink-100/80 bg-[linear-gradient(135deg,rgba(253,242,248,0.9),rgba(255,255,255,0.82))] text-pink-600 shadow-[0_10px_24px_rgba(236,72,153,0.06),inset_0_1px_0_rgba(255,255,255,0.75)]'
        : 'border-white/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.84),rgba(248,250,252,0.72))] text-slate-900 shadow-[0_10px_24px_rgba(15,23,42,0.04),inset_0_1px_0_rgba(255,255,255,0.7)]',
    },
  ];

  const glassModalShellClass = 'w-full max-h-[90vh] overflow-y-auto rounded-[36px] border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.88),rgba(248,250,252,0.8))] p-0 shadow-[0_30px_80px_rgba(15,23,42,0.16),inset_0_1px_0_rgba(255,255,255,0.74)] backdrop-blur-2xl';
  const glassModalHeaderClass = 'sticky top-0 z-10 overflow-hidden border-b border-white/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(248,250,252,0.84))] px-6 pb-5 pt-6 backdrop-blur-2xl';
  const glassModalSectionClass = 'rounded-[26px] border border-white/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.84),rgba(248,250,252,0.72))] p-4 shadow-[0_16px_34px_rgba(15,23,42,0.04),inset_0_1px_0_rgba(255,255,255,0.72)] backdrop-blur-xl';
  const glassModalLabelClass = 'mb-1.5 block text-sm font-medium text-slate-700';
  const glassModalInputClass = 'h-12 rounded-[20px] border-white/85 bg-white/78 shadow-[0_10px_22px_rgba(15,23,42,0.04),inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur-md';
  const glassModalTextareaClass = 'min-h-28 rounded-[22px] border-white/85 bg-white/78 shadow-[0_10px_22px_rgba(15,23,42,0.04),inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur-md';
  const glassModalFooterClass = 'sticky bottom-0 flex justify-end gap-3 border-t border-white/75 bg-[linear-gradient(180deg,rgba(248,250,252,0.82),rgba(255,255,255,0.74))] px-6 py-5 backdrop-blur-2xl';

  return (
    <div className="relative min-h-screen pb-6">
      <WorkspaceBackdrop />

      <div className="relative z-10 space-y-3 px-4 py-4 md:px-6">
        <WorkspaceHeroCard
          badge={(
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-slate-500">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-pink-50 px-2.5 py-1 text-pink-600 ring-1 ring-pink-100">
                <UserCheck size={14} />
                {todayLabel}
              </span>
              <span className="rounded-full bg-white/80 px-2.5 py-1 ring-1 ring-slate-200/80">{timeLabel}</span>
            </div>
          )}
          title="访客预约"
          actions={(
            <div className="flex flex-wrap gap-2 xl:justify-end">
              <Button className="h-9 rounded-xl bg-pink-500 px-4 text-white shadow-[0_12px_22px_rgba(236,72,153,0.2)] hover:bg-pink-600" onClick={handleAdd}>
                <Plus size={15} className="mr-2" />
                新增预约
              </Button>
              <Button
                variant="outline"
                className="h-9 rounded-xl border-white/80 bg-white/85 px-4 shadow-[0_10px_18px_rgba(15,23,42,0.04)]"
                onClick={() => void fetchList()}
              >
                <RotateCcw size={15} className="mr-2 text-pink-500" />
                刷新数据
              </Button>
            </div>
          )}
          contentClassName="p-4 sm:p-5"
          glowClassName="bg-[radial-gradient(circle_at_top_right,rgba(244,114,182,0.14),transparent_55%),radial-gradient(circle_at_top_left,rgba(251,191,36,0.12),transparent_46%)]"
        >
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {heroMetrics.map((item) => (
              <div
                key={item.label}
                className={`group relative overflow-hidden rounded-[22px] border px-3.5 py-3 backdrop-blur-xl transition-transform duration-200 hover:-translate-y-0.5 ${item.panelClassName}`}
              >
                <div className={`pointer-events-none absolute inset-x-0 top-0 h-14 bg-gradient-to-br ${item.glowClassName}`} />
                <div className="pointer-events-none absolute inset-[1px] rounded-[21px] bg-[linear-gradient(180deg,rgba(255,255,255,0.52),rgba(255,255,255,0.12)_38%,transparent_100%)] opacity-80" />
                <div className="relative flex min-h-[82px] flex-col justify-between gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400/90">{item.label}</div>
                      <div className={`mt-1 text-[1.32rem] font-bold tracking-tight ${item.valueClassName}`}>{item.value}</div>
                    </div>
                    <div className={`rounded-[14px] p-2 backdrop-blur-md ${item.iconWrapClassName}`}>
                      {item.icon}
                    </div>
                  </div>
                  <div className={`max-w-full truncate text-[10px] leading-4 ${item.hintClassName}`}>{item.hint}</div>
                </div>
              </div>
            ))}
          </div>
        </WorkspaceHeroCard>

        <Card className="rounded-[28px] border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.8),rgba(248,250,252,0.72))] p-3.5 shadow-[0_18px_44px_rgba(15,23,42,0.05)] backdrop-blur-xl">
          <div className="flex flex-col gap-3">
            <WorkspaceWorkbenchCard
              title="预约列表"
              total={total}
              hasActiveFilters={hasActiveFilters}
              overviewItems={workspaceOverviewItems}
              quickFilters={STATUS_QUICK_FILTERS}
              activeQuickFilter={searchParams.status}
              onQuickFilterChange={applyStatusFilter}
              quickFilterAside={hasActiveFilters ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleResetFilters}
                  className="h-9 rounded-xl border-white/80 bg-white/74 px-4 shadow-[0_10px_18px_rgba(15,23,42,0.04)] hover:bg-white"
                >
                  <RotateCcw size={15} className="mr-2" />
                  清空所有条件
                </Button>
              ) : (
                <span className="rounded-full bg-white/82 px-3 py-1.5 text-[11px] font-medium text-slate-400 ring-1 ring-white/80 shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
                  当前未应用额外筛选
                </span>
              )}
              filterBar={(
                <div className="grid grid-cols-1 gap-2.5 xl:grid-cols-[minmax(0,1fr)_220px_auto_auto]">
                  <div className="relative">
                    <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <Input
                      type="text"
                      placeholder="按访客姓名搜索"
                      value={visitorNameInput}
                      onChange={(e) => setVisitorNameInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          applySearch();
                        }
                      }}
                      className="h-10 rounded-2xl border-white/85 bg-white/78 pl-10 pr-4 shadow-[0_10px_22px_rgba(15,23,42,0.04),inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur-md"
                    />
                  </div>

                  <DatePicker
                    variant="glass"
                    type="date"
                    value={visitDateInput}
                    onChange={(e) => setVisitDateInput(e.target.value)}
                  />

                  <Button
                    size="sm"
                    onClick={applySearch}
                    className="h-10 rounded-2xl bg-[linear-gradient(135deg,#f472b6,#ec4899)] px-4 text-white shadow-[0_12px_22px_rgba(236,72,153,0.22)] hover:bg-pink-600"
                  >
                    <Search size={15} className="mr-2" />
                    应用筛选
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleResetFilters}
                    className="h-10 rounded-2xl border-white/85 bg-white/74 px-4 shadow-[0_10px_18px_rgba(15,23,42,0.04)] hover:bg-white"
                  >
                    <RotateCcw size={15} className="mr-2" />
                    清空条件
                  </Button>
                </div>
              )}
            />

            <WorkspaceResultCard total={total} description="展示访客预约、通行码、来访状态和当前可执行动作">

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-white/72 backdrop-blur-xl">
                    <TableRow className="border-white/70 hover:bg-transparent">
                      <TableHead className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">访客姓名</TableHead>
                      <TableHead className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">单位</TableHead>
                      <TableHead className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">来访日期</TableHead>
                      <TableHead className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">被访人</TableHead>
                      <TableHead className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">来访事由</TableHead>
                      <TableHead className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">通行证</TableHead>
                      <TableHead className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">状态</TableHead>
                      <TableActionHead className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">当前操作</TableActionHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <WorkspaceTableStateRow
                        type="loading"
                        colSpan={8}
                        title="正在加载访客记录..."
                      />
                    ) : list.length === 0 ? (
                      <WorkspaceTableStateRow
                        colSpan={8}
                        icon={<UserCheck size={26} />}
                        title="暂无访客记录"
                        description="新增预约后，这里会展示被访人、通行证、签到签退和取消动作。"
                      />
                    ) : (
                      list.map((item) => {
                        const tone = getStatusTone(item.status || 'PENDING');
                        return (
                          <TableRow key={item.visitorId} className="border-white/60 transition hover:bg-white/55">
                            <TableCell className="px-4 py-4 align-top">
                              <div className="text-sm font-semibold text-slate-900">{item.visitorName}</div>
                              <div className="mt-1 text-[11px] text-slate-400">{item.visitorPhone || '未填写联系电话'}</div>
                            </TableCell>
                            <TableCell className="px-4 py-4 align-top text-sm text-slate-600">
                              <span className="inline-flex items-center gap-1">
                                <Building2 size={12} className="text-slate-400" />
                                {item.visitorCompany || '-'}
                              </span>
                            </TableCell>
                            <TableCell className="px-4 py-4 align-top text-sm text-slate-600">{item.visitDate}</TableCell>
                            <TableCell className="px-4 py-4 align-top text-sm text-slate-600">{item.hostName || '-'}</TableCell>
                            <TableCell className="px-4 py-4 align-top text-sm text-slate-600">
                              <span className="line-clamp-1 max-w-[180px]">{item.visitReason}</span>
                            </TableCell>
                            <TableCell className="px-4 py-4 align-top text-sm font-medium text-pink-600">
                              {item.passCode || '-'}
                            </TableCell>
                            <TableCell className="px-4 py-4 align-top">
                              <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium shadow-[0_8px_18px_rgba(15,23,42,0.04),inset_0_1px_0_rgba(255,255,255,0.7)] ${tone.bg} ${tone.text}`}>
                                {STATUS_MAP[item.status || 'PENDING'] || item.status}
                              </span>
                            </TableCell>
                            <TableCell className="px-4 py-4 align-top">
                              <TableRowActions
                                align="end"
                                actions={[
                                  {
                                    label: '确认',
                                    icon: <CheckCircle size={14} />,
                                    onClick: () => handleConfirm(item.visitorId!),
                                    tone: 'primary',
                                    hidden: item.status !== 'PENDING',
                                  },
                                  {
                                    label: '签到',
                                    icon: <LogIn size={14} />,
                                    onClick: () => handleCheckIn(item.visitorId!),
                                    tone: 'success',
                                    hidden: item.status !== 'PENDING' && item.status !== 'CONFIRMED',
                                  },
                                  {
                                    label: '签退',
                                    icon: <LogOut size={14} />,
                                    onClick: () => handleCheckOut(item.visitorId!),
                                    tone: 'warning',
                                    hidden: item.status !== 'ARRIVED',
                                  },
                                  {
                                    label: '取消',
                                    icon: <XCircle size={14} />,
                                    onClick: () => handleCancel(item.visitorId!),
                                    tone: 'danger',
                                    hidden: item.status !== 'PENDING' && item.status !== 'CONFIRMED',
                                  },
                                ]}
                              />
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>

              {total > 0 ? (
                <WorkspacePaginationBar
                  total={total}
                  pageNum={searchParams.pageNum}
                  totalPages={totalPages}
                  onPrev={() => setSearchParams((prev) => ({ ...prev, pageNum: Math.max(1, prev.pageNum - 1) }))}
                  onNext={() => setSearchParams((prev) => ({ ...prev, pageNum: prev.pageNum + 1 }))}
                  prevDisabled={searchParams.pageNum <= 1}
                  nextDisabled={searchParams.pageNum >= totalPages}
                />
              ) : null}
            </WorkspaceResultCard>
          </div>
        </Card>
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className={`${glassModalShellClass} max-w-3xl`}>
          <DialogHeader className={glassModalHeaderClass}>
            <div className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_top_right,rgba(244,114,182,0.14),transparent_56%)]" />
            <div className="relative flex items-start justify-between gap-4">
              <div>
                <DialogTitle className="flex items-center gap-2 text-[1.5rem] font-bold tracking-tight text-slate-950">
                  <UserCheck size={18} className="text-pink-500" />
                  新增访客预约
                </DialogTitle>
                <p className="mt-2 text-sm text-slate-500">填写来访人、单位、日期与被访人信息，形成完整预约记录。</p>
              </div>
              <button
                type="button"
                onClick={() => setShowDialog(false)}
                className="rounded-2xl bg-white/82 p-3 text-slate-400 shadow-[0_10px_22px_rgba(15,23,42,0.04)] ring-1 ring-white/80 transition hover:text-slate-600"
              >
                <X size={18} />
              </button>
            </div>
          </DialogHeader>

          <div className="space-y-4 px-6 py-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div className={glassModalSectionClass}>
                <Label className={glassModalLabelClass}>访客姓名</Label>
                <Input
                  type="text"
                  value={formData.visitorName}
                  onChange={e => setFormData({ ...formData, visitorName: e.target.value })}
                  placeholder="请输入访客姓名"
                  className={glassModalInputClass}
                />
              </div>
              <div className={glassModalSectionClass}>
                <Label className={glassModalLabelClass}>访客电话</Label>
                <Input
                  type="text"
                  value={formData.visitorPhone || ''}
                  onChange={e => setFormData({ ...formData, visitorPhone: e.target.value })}
                  placeholder="请输入电话"
                  className={glassModalInputClass}
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className={glassModalSectionClass}>
                <Label className={glassModalLabelClass}>访客单位</Label>
                <Input
                  type="text"
                  value={formData.visitorCompany || ''}
                  onChange={e => setFormData({ ...formData, visitorCompany: e.target.value })}
                  placeholder="请输入单位"
                  className={glassModalInputClass}
                />
              </div>
              <div className={glassModalSectionClass}>
                <Label className={glassModalLabelClass}>来访人数</Label>
                <Input
                  type="number"
                  value={formData.visitorCount || 1}
                  onChange={e => setFormData({ ...formData, visitorCount: parseInt(e.target.value, 10) || 1 })}
                  min="1"
                  className={glassModalInputClass}
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className={glassModalSectionClass}>
                <Label className={glassModalLabelClass}>来访日期</Label>
                <DatePicker
                  variant="glass"
                  type="date"
                  value={formData.visitDate}
                  onChange={e => setFormData({ ...formData, visitDate: e.target.value })}
                />
              </div>
              <div className={glassModalSectionClass}>
                <Label className={glassModalLabelClass}>车牌号</Label>
                <Input
                  type="text"
                  value={formData.carPlate || ''}
                  onChange={e => setFormData({ ...formData, carPlate: e.target.value })}
                  placeholder="选填"
                  className={glassModalInputClass}
                />
              </div>
            </div>

            <div className={glassModalSectionClass}>
              <Label className={glassModalLabelClass}>被访人姓名</Label>
              <Input
                type="text"
                value={formData.hostName || ''}
                onChange={e => setFormData({ ...formData, hostName: e.target.value })}
                placeholder="请输入被访人姓名"
                className={glassModalInputClass}
              />
            </div>

            <div className={glassModalSectionClass}>
              <Label className={glassModalLabelClass}>来访事由</Label>
              <Textarea
                className={glassModalTextareaClass}
                value={formData.visitReason}
                onChange={e => setFormData({ ...formData, visitReason: e.target.value })}
                placeholder="请输入来访事由"
              />
            </div>
          </div>

          <DialogFooter className={glassModalFooterClass}>
            <Button
              variant="outline"
              className="h-11 rounded-2xl border-white/85 bg-white/78 px-4 shadow-[0_10px_18px_rgba(15,23,42,0.04)]"
              onClick={() => setShowDialog(false)}
            >
              取消
            </Button>
            <Button
              className="h-11 rounded-2xl bg-[linear-gradient(135deg,#f472b6,#ec4899)] px-4 text-white shadow-[0_12px_22px_rgba(236,72,153,0.22)] hover:bg-pink-600"
              onClick={handleSave}
            >
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default VisitorPage;
