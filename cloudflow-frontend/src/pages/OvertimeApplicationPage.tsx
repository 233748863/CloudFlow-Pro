import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Download,
  Edit,
  Plus,
  RotateCcw,
  Search,
  Send,
  Timer,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  overtimeApplicationApi,
  OvertimeApplication,
  OvertimeApplicationForm,
} from '@/services/api/overtimeApplication';
import { useHrSelfServiceEligibility } from '@/hooks/useHrSelfServiceEligibility';
import { toBackendDateString, toLocalDatetimeString } from '@/utils/dateFormat';
import { buildExcelFileName, downloadBlob } from '@/utils/download';
import { getErrorMessage } from '@/utils/errorMessage';
import {
  Button,
  Card,
  DatePicker,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TableActionHead,
  TableHead,
  TableHeader,
  Textarea,
} from '@/components/ui';
import { TableRowActions } from '@/components/ui/table-row-actions';
import {
  WorkspaceBackdrop,
  WorkspaceEmptyPanel,
} from '@/components/workspace/WorkspacePrimitives';

const emptyForm = (): OvertimeApplicationForm => ({
  overtimeType: 'WORKDAY',
  compensationType: 'PAYMENT',
  startTime: '',
  endTime: '',
  reason: '',
});

const formatDateCN = (date: Date) => {
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  return `${date.getMonth() + 1}月${date.getDate()}日 ${weekdays[date.getDay()]}`;
};

const statusMap: Record<string, string> = {
  DRAFT: '草稿',
  APPROVING: '审批中',
  APPROVED: '已通过',
  REJECTED: '已驳回',
  CANCELLED: '已取消',
};

const overtimeTypeMap: Record<string, string> = {
  WORKDAY: '工作日',
  WEEKEND: '周末',
  HOLIDAY: '节假日',
};

const compensationTypeMap: Record<string, string> = {
  PAYMENT: '加班费',
  TIME_OFF: '调休',
};

export const OvertimeApplicationPage: React.FC = () => {
  const [list, setList] = useState<OvertimeApplication[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchParams, setSearchParams] = useState({
    status: '',
    overtimeType: '',
    pageNum: 1,
    pageSize: 10,
  });
  const [total, setTotal] = useState(0);
  const [showDialog, setShowDialog] = useState(false);
  const [current, setCurrent] = useState<OvertimeApplication | null>(null);
  const [formData, setFormData] = useState<OvertimeApplicationForm>(emptyForm);
  const {
    loading: eligibilityLoading,
    canStartSelfService,
    restrictionMessage,
  } = useHrSelfServiceEligibility();

  useEffect(() => {
    void fetchList();
  }, [searchParams]);

  const ensureCanOperate = () => {
    if (eligibilityLoading) {
      toast.error('正在校验当前员工状态，请稍后再试');
      return false;
    }
    if (!canStartSelfService) {
      toast.error(restrictionMessage || '当前账号暂时不能发起 HR 自助流程');
      return false;
    }
    return true;
  };

  const selfServiceLocked = eligibilityLoading || !canStartSelfService;

  const fetchList = async () => {
    setLoading(true);
    try {
      const response = await overtimeApplicationApi.list(searchParams);
      setList(response.records || response.rows || []);
      setTotal(response.total || 0);
    } catch (error) {
      toast.error(getErrorMessage(error, '获取列表失败'));
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    if (!ensureCanOperate()) {
      return;
    }
    setCurrent(null);
    setFormData(emptyForm());
    setShowDialog(true);
  };

  const handleEdit = async (id: number) => {
    if (!ensureCanOperate()) {
      return;
    }
    try {
      const detail = await overtimeApplicationApi.getInfo(id);
      setCurrent(detail);
      setFormData({
        id: detail.id,
        overtimeType: detail.overtimeType,
        compensationType: detail.compensationType,
        startTime: toLocalDatetimeString(detail.startTime),
        endTime: toLocalDatetimeString(detail.endTime),
        reason: detail.reason,
      });
      setShowDialog(true);
    } catch (error) {
      toast.error(getErrorMessage(error, '获取详情失败'));
    }
  };

  const handleSave = async () => {
    if (!ensureCanOperate()) {
      return;
    }
    if (!formData.startTime || !formData.endTime || !formData.reason.trim()) {
      toast.error('请完整填写加班申请信息');
      return;
    }

    const start = new Date(formData.startTime).getTime();
    const end = new Date(formData.endTime).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      toast.error('结束时间必须晚于开始时间');
      return;
    }

    try {
      const payload: OvertimeApplicationForm = {
        ...formData,
        startTime: toBackendDateString(formData.startTime),
        endTime: toBackendDateString(formData.endTime),
      };

      if (current?.id) {
        await overtimeApplicationApi.edit(payload);
        toast.success('更新成功');
      } else {
        await overtimeApplicationApi.add(payload);
        toast.success('创建成功');
      }
      setShowDialog(false);
      await fetchList();
    } catch (error) {
      toast.error(getErrorMessage(error, '保存失败'));
    }
  };

  const handleDelete = async (ids: number[]) => {
    if (!ensureCanOperate()) {
      return;
    }
    if (!confirm('确定删除这条加班申请吗？')) {
      return;
    }
    try {
      await overtimeApplicationApi.remove(ids);
      toast.success('删除成功');
      await fetchList();
    } catch (error) {
      toast.error(getErrorMessage(error, '删除失败'));
    }
  };

  const handleSubmit = async (id: number) => {
    if (!ensureCanOperate()) {
      return;
    }
    if (!confirm('确定提交这条加班申请吗？')) {
      return;
    }
    try {
      await overtimeApplicationApi.submit(id);
      toast.success('提交成功');
      await fetchList();
    } catch (error) {
      toast.error(getErrorMessage(error, '提交失败'));
    }
  };

  const handleExport = async () => {
    try {
      const blob = await overtimeApplicationApi.export(searchParams);
      const fileName = downloadBlob(blob, buildExcelFileName('加班申请'));
      toast.success(
        total > 0
          ? `已导出 ${total} 条加班申请，下载文件：${fileName}`
          : `已导出空结果，下载文件：${fileName}`,
      );
    } catch (error) {
      toast.error(getErrorMessage(error, '导出失败'));
    }
  };

  const getStatusBadge = (status: string) => {
    const config: Record<string, { bg: string; text: string }> = {
      DRAFT: { bg: 'bg-slate-100', text: 'text-slate-600' },
      APPROVING: { bg: 'bg-pink-50', text: 'text-pink-500' },
      APPROVED: { bg: 'bg-emerald-100', text: 'text-emerald-600' },
      REJECTED: { bg: 'bg-red-100', text: 'text-red-600' },
      CANCELLED: { bg: 'bg-gray-100', text: 'text-gray-600' },
    };
    const currentConfig = config[status] || config.DRAFT;
    return (
      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${currentConfig.bg} ${currentConfig.text}`}>
        {statusMap[status] || status}
      </span>
    );
  };

  const todayLabel = formatDateCN(new Date());
  const timeLabel = new Date().toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const draftCount = list.filter((item) => item.status === 'DRAFT').length;
  const pendingCount = list.filter((item) => item.status === 'APPROVING').length;
  const approvedCount = list.filter((item) => item.status === 'APPROVED').length;
  const totalHours = list.reduce((sum, item) => sum + Number(item.duration || 0), 0);
  const currentStatusLabel = searchParams.status ? (statusMap[searchParams.status] || searchParams.status) : '全部状态';
  const currentTypeLabel = searchParams.overtimeType ? (overtimeTypeMap[searchParams.overtimeType] || searchParams.overtimeType) : '全部类型';
  const hasActiveFilters = Boolean(searchParams.status || searchParams.overtimeType);

  const statusQuickFilters = [
    { label: '全部', value: '' },
    { label: '草稿', value: 'DRAFT' },
    { label: '审批中', value: 'APPROVING' },
    { label: '已通过', value: 'APPROVED' },
    { label: '已驳回', value: 'REJECTED' },
    { label: '已取消', value: 'CANCELLED' },
  ];

  const heroMetrics = useMemo(() => ([
    {
      label: '当前结果',
      value: `${total}`,
      hint: hasActiveFilters ? `${currentStatusLabel} · ${currentTypeLabel}` : '默认视图下全部加班申请',
      panelClassName: 'border-slate-200/75 bg-[linear-gradient(135deg,rgba(255,255,255,0.86),rgba(248,250,252,0.78))] shadow-[0_16px_32px_rgba(15,23,42,0.06),inset_0_1px_0_rgba(255,255,255,0.72)]',
      iconWrapClassName: 'bg-white/82 text-slate-700 ring-1 ring-slate-200/85 shadow-[0_10px_22px_rgba(15,23,42,0.06)]',
      valueClassName: 'text-slate-950',
      hintClassName: 'text-slate-500',
      glowClassName: 'from-slate-100/95 via-slate-50/40 to-transparent',
      icon: <Timer size={17} />,
    },
    {
      label: '待提交草稿',
      value: `${draftCount}`,
      hint: draftCount > 0 ? '建议优先补齐时间段和事由后提交' : '当前没有待提交草稿',
      panelClassName: 'border-amber-100/80 bg-[linear-gradient(135deg,rgba(255,251,235,0.95),rgba(255,255,255,0.82),rgba(255,247,237,0.82))] shadow-[0_16px_32px_rgba(245,158,11,0.08),inset_0_1px_0_rgba(255,255,255,0.75)]',
      iconWrapClassName: 'bg-white/88 text-amber-700 ring-1 ring-amber-100 shadow-[0_10px_22px_rgba(245,158,11,0.08)]',
      valueClassName: 'text-slate-950',
      hintClassName: 'text-slate-600',
      glowClassName: 'from-amber-100/90 via-orange-50/45 to-transparent',
      icon: <Edit size={17} />,
    },
    {
      label: '审批中',
      value: `${pendingCount}`,
      hint: pendingCount > 0 ? '可继续查看流程进度和审批节点' : '当前没有审批中的申请',
      panelClassName: 'border-pink-100/80 bg-[linear-gradient(135deg,rgba(253,242,248,0.95),rgba(255,255,255,0.82),rgba(255,241,242,0.8))] shadow-[0_16px_32px_rgba(236,72,153,0.08),inset_0_1px_0_rgba(255,255,255,0.76)]',
      iconWrapClassName: 'bg-white/88 text-pink-600 ring-1 ring-pink-100 shadow-[0_10px_22px_rgba(236,72,153,0.08)]',
      valueClassName: 'text-slate-950',
      hintClassName: 'text-slate-600',
      glowClassName: 'from-pink-100/90 via-rose-50/45 to-transparent',
      icon: <Clock size={17} />,
    },
    {
      label: '累计加班时长',
      value: `${totalHours.toFixed(1)} h`,
      hint: approvedCount > 0 ? `已通过 ${approvedCount} 条，便于快速估算投入` : '用于快速判断当前加班总量',
      panelClassName: 'border-emerald-100/80 bg-[linear-gradient(135deg,rgba(236,253,245,0.95),rgba(255,255,255,0.82),rgba(236,254,255,0.78))] shadow-[0_16px_32px_rgba(16,185,129,0.08),inset_0_1px_0_rgba(255,255,255,0.76)]',
      iconWrapClassName: 'bg-white/88 text-emerald-600 ring-1 ring-emerald-100 shadow-[0_10px_22px_rgba(16,185,129,0.08)]',
      valueClassName: 'text-slate-950',
      hintClassName: 'text-slate-600',
      glowClassName: 'from-emerald-100/90 via-cyan-50/45 to-transparent',
      icon: <CheckCircle2 size={17} />,
    },
  ]), [approvedCount, currentStatusLabel, currentTypeLabel, draftCount, hasActiveFilters, pendingCount, total, totalHours]);

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
      label: '类型',
      value: currentTypeLabel,
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

  const applyStatusFilter = (status: string) => {
    setSearchParams(prev => ({ ...prev, status, pageNum: 1 }));
  };

  const handleResetFilters = () => {
    setSearchParams({ status: '', overtimeType: '', pageNum: 1, pageSize: 10 });
  };

  return (
    <div className="relative min-h-screen pb-6">
      <WorkspaceBackdrop />

      <div className="relative z-10 space-y-3">
        <Card className="overflow-hidden rounded-[30px] border-white/80 bg-white/78 shadow-[0_20px_60px_rgba(15,23,42,0.05)] backdrop-blur-xl">
          <div className="relative p-4 sm:p-5">
            <div className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_top_right,rgba(244,114,182,0.14),transparent_55%)]" />
            <div className="absolute -right-14 top-4 h-32 w-32 rounded-full bg-pink-200/25 blur-3xl" />
            <div className="absolute bottom-0 left-1/3 h-16 w-16 rounded-full bg-amber-100/50 blur-2xl" />

            <div className="relative space-y-3">
              <div className="flex flex-col gap-2.5 xl:flex-row xl:items-center xl:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-slate-500">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-pink-50 px-2.5 py-1 text-pink-600 ring-1 ring-pink-100">
                      <Clock size={14} />
                      {todayLabel}
                    </span>
                    <span className="rounded-full bg-white/80 px-2.5 py-1 ring-1 ring-slate-200/80">{timeLabel}</span>
                  </div>
                  <h1 className="mt-3 text-[1.9rem] font-bold tracking-tight text-slate-950 sm:text-[2.15rem]">加班申请</h1>
                </div>

                <div className="flex flex-wrap gap-2 xl:justify-end">
                  <Button
                    className="h-9 rounded-xl bg-pink-500 px-4 text-white shadow-[0_12px_22px_rgba(236,72,153,0.2)] hover:bg-pink-600"
                    onClick={handleAdd}
                    disabled={selfServiceLocked}
                  >
                    <Plus size={15} className="mr-2" />
                    新建申请
                  </Button>
                  <Button
                    variant="outline"
                    className="h-9 rounded-xl bg-white/85 px-4"
                    onClick={handleExport}
                  >
                    <Download size={15} className="mr-2 text-pink-500" />
                    导出结果
                  </Button>
                </div>
              </div>

              {restrictionMessage && (
                <div
                  data-testid="hr-self-service-restriction"
                  className="rounded-[24px] border border-amber-200/90 bg-[linear-gradient(180deg,rgba(255,251,235,0.96),rgba(255,247,237,0.88))] px-4 py-4 text-amber-900 shadow-[0_12px_26px_rgba(245,158,11,0.08)]"
                >
                  <div className="flex items-start gap-3">
                    <div className="rounded-2xl bg-white/80 p-2 text-amber-600 ring-1 ring-amber-200">
                      <AlertCircle size={18} />
                    </div>
                    <div>
                      <div className="text-sm font-semibold">当前账号暂时不能继续发起 HR 自助流程</div>
                      <div className="mt-1 text-xs leading-6 text-amber-800">{restrictionMessage}</div>
                    </div>
                  </div>
                </div>
              )}

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
            </div>
          </div>
        </Card>

        <Card className="rounded-[28px] border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.8),rgba(248,250,252,0.72))] p-3.5 shadow-[0_18px_44px_rgba(15,23,42,0.05)] backdrop-blur-xl">
          <div className="flex flex-col gap-3">
            <div className="overflow-hidden rounded-[26px] border border-white/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(248,250,252,0.84))] shadow-[0_16px_34px_rgba(15,23,42,0.04),inset_0_1px_0_rgba(255,255,255,0.72)] backdrop-blur-xl">
              <div className="relative px-4 py-4">
                <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[radial-gradient(circle_at_top_left,rgba(244,114,182,0.09),transparent_60%)]" />
                <div className="flex flex-col gap-5">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">记录</div>
                      <div className="mt-2 text-[1.65rem] font-bold tracking-tight text-slate-950">申请列表</div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                      <span className="rounded-full bg-white/82 px-3 py-1.5 text-[11px] font-medium text-slate-500 ring-1 ring-white/80 shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
                        {hasActiveFilters ? '已应用筛选' : '默认视图'}
                      </span>
                      <span className="rounded-full bg-white/82 px-3 py-1.5 text-[11px] font-medium text-slate-500 ring-1 ring-white/80 shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
                        共 {total} 条
                      </span>
                    </div>
                  </div>

                  <div className="grid gap-3 pt-2 sm:grid-cols-2 xl:grid-cols-4">
                    {workspaceOverviewItems.map((item) => (
                      <div
                        key={item.label}
                        className={`rounded-[18px] border px-3.5 py-2.5 shadow-sm ${item.toneClassName}`}
                      >
                        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">{item.label}</div>
                        <div className="mt-1.5 text-sm font-semibold tracking-tight">{item.value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="border-t border-white/70 bg-[linear-gradient(180deg,rgba(248,250,252,0.76),rgba(255,255,255,0.72))] px-4 py-4 backdrop-blur-xl">
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                    <div className="inline-flex flex-wrap items-center gap-1 rounded-[20px] bg-white/78 p-1 ring-1 ring-white/80 shadow-[0_10px_24px_rgba(15,23,42,0.04)] backdrop-blur-md">
                      {statusQuickFilters.map((item) => {
                        const active = searchParams.status === item.value;
                        return (
                          <button
                            key={item.value || 'ALL'}
                            type="button"
                            onClick={() => applyStatusFilter(item.value)}
                            className={[
                              'rounded-[16px] px-3 py-1.5 text-[11px] font-medium transition',
                              active
                                ? 'bg-[linear-gradient(135deg,#f472b6,#ec4899)] text-white shadow-[0_10px_20px_rgba(236,72,153,0.24)]'
                                : 'text-slate-600 hover:bg-white/88 hover:text-pink-600',
                            ].join(' ')}
                          >
                            {item.label}
                          </button>
                        );
                      })}
                    </div>

                    {hasActiveFilters ? (
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
                  </div>

                  <div className="grid grid-cols-1 gap-2.5 xl:grid-cols-[minmax(0,1fr)_auto_auto]">
                    <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
                      <Select
                        value={searchParams.status}
                        onValueChange={(value) =>
                          setSearchParams({ ...searchParams, status: value, pageNum: 1 })
                        }
                      >
                        <SelectTrigger className="h-10 rounded-2xl border-white/85 bg-white/78 shadow-[0_10px_22px_rgba(15,23,42,0.04),inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur-md">
                          <SelectValue placeholder="请选择状态" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">全部状态</SelectItem>
                          <SelectItem value="DRAFT">草稿</SelectItem>
                          <SelectItem value="APPROVING">审批中</SelectItem>
                          <SelectItem value="APPROVED">已通过</SelectItem>
                          <SelectItem value="REJECTED">已驳回</SelectItem>
                          <SelectItem value="CANCELLED">已取消</SelectItem>
                        </SelectContent>
                      </Select>

                      <Select
                        value={searchParams.overtimeType}
                        onValueChange={(value) =>
                          setSearchParams({ ...searchParams, overtimeType: value, pageNum: 1 })
                        }
                      >
                        <SelectTrigger className="h-10 rounded-2xl border-white/85 bg-white/78 shadow-[0_10px_22px_rgba(15,23,42,0.04),inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur-md">
                          <SelectValue placeholder="请选择加班类型" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">全部类型</SelectItem>
                          <SelectItem value="WORKDAY">工作日</SelectItem>
                          <SelectItem value="WEEKEND">周末</SelectItem>
                          <SelectItem value="HOLIDAY">节假日</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <Button
                      size="sm"
                      onClick={() => setSearchParams({ ...searchParams, pageNum: 1 })}
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
                </div>
              </div>
            </div>

            <div className="overflow-hidden rounded-[26px] border border-white/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(248,250,252,0.84))] shadow-[0_16px_34px_rgba(15,23,42,0.04),inset_0_1px_0_rgba(255,255,255,0.72)] backdrop-blur-xl">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/70 bg-[linear-gradient(180deg,rgba(248,250,252,0.82),rgba(255,255,255,0.68))] px-4 py-3 backdrop-blur-xl">
                <div>
                  <div className="text-sm font-semibold text-slate-900">当前结果</div>
                  <div className="mt-1 text-[11px] text-slate-400">轻玻璃视图下展示加班申请记录与当前操作</div>
                </div>
                <span className="rounded-full bg-white/82 px-3 py-1.5 text-[11px] font-medium text-slate-500 ring-1 ring-white/80 shadow-[0_8px_18px_rgba(15,23,42,0.04)]">共 {total} 条</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <TableHeader className="sticky top-0 z-10 bg-white/72 backdrop-blur-xl">
                    <tr>
                      <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">申请单号</TableHead>
                      <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">加班类型</TableHead>
                      <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">开始时间</TableHead>
                      <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">结束时间</TableHead>
                      <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">时长(h)</TableHead>
                      <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">补偿方式</TableHead>
                      <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">状态</TableHead>
                      <TableActionHead className="w-56 px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">当前操作</TableActionHead>
                    </tr>
                  </TableHeader>
                  <tbody className="divide-y divide-white/70">
                    {loading ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-10 text-center text-slate-500">
                          <div className="mx-auto h-6 w-6 animate-spin rounded-full border-b-2 border-pink-500" />
                        </td>
                      </tr>
                    ) : list.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-0 py-0">
                          <WorkspaceEmptyPanel
                            variant="glass"
                            icon={<Timer size={26} />}
                            title={hasActiveFilters ? '当前条件下暂无记录' : '暂无加班申请'}
                            description={hasActiveFilters ? '试试切换状态、清空类型条件，或者直接新建一条加班申请。' : '创建新的加班记录后，这里会展示时段、时长、补偿方式和审批状态。'}
                          />
                        </td>
                      </tr>
                    ) : (
                      list.map((item) => (
                        <tr key={item.id} className="bg-white/36 transition hover:bg-white/70">
                          <td className="px-4 py-2.5 text-sm text-slate-900">{item.applicationNo}</td>
                          <td className="px-4 py-2.5 text-sm text-slate-600">
                            {overtimeTypeMap[item.overtimeType] || item.overtimeType}
                          </td>
                          <td className="px-4 py-2.5 text-sm text-slate-600">{item.startTime}</td>
                          <td className="px-4 py-2.5 text-sm text-slate-600">{item.endTime}</td>
                          <td className="px-4 py-2.5 text-sm font-medium text-slate-900">
                            {item.duration ?? '-'}
                          </td>
                          <td className="px-4 py-2.5 text-sm text-slate-600">
                            {compensationTypeMap[item.compensationType] || item.compensationType}
                          </td>
                          <td className="px-4 py-2.5">{getStatusBadge(item.status || 'DRAFT')}</td>
                          <td className="px-4 py-2.5 whitespace-nowrap text-right">
                            <TableRowActions
                              align="end"
                              actions={[
                                {
                                  label: '编辑',
                                  icon: <Edit size={14} />,
                                  onClick: () => handleEdit(item.id!),
                                  tone: 'primary',
                                  hidden: item.status !== 'DRAFT' || selfServiceLocked,
                                },
                                {
                                  label: '提交',
                                  icon: <Send size={14} />,
                                  onClick: () => handleSubmit(item.id!),
                                  tone: 'success',
                                  hidden: item.status !== 'DRAFT' || selfServiceLocked,
                                },
                                {
                                  label: '删除',
                                  icon: <Trash2 size={14} />,
                                  onClick: () => handleDelete([item.id!]),
                                  tone: 'danger',
                                  hidden: item.status !== 'DRAFT' || selfServiceLocked,
                                },
                              ]}
                            />
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between border-t border-slate-100 px-4 py-4">
                <span className="text-sm text-slate-600">共 {total} 条</span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() =>
                      setSearchParams((prev) => ({
                        ...prev,
                        pageNum: Math.max(1, prev.pageNum - 1),
                      }))
                    }
                    disabled={searchParams.pageNum === 1}
                    className="rounded-xl"
                  >
                    上一页
                  </Button>
                  <span className="px-3 py-2 text-sm text-slate-600">第 {searchParams.pageNum} 页</span>
                  <Button
                    variant="outline"
                    onClick={() =>
                      setSearchParams((prev) => ({
                        ...prev,
                        pageNum: prev.pageNum + 1,
                      }))
                    }
                    disabled={searchParams.pageNum * searchParams.pageSize >= total}
                    className="rounded-xl"
                  >
                    下一页
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {showDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/28 p-4 backdrop-blur-sm">
            <div className="w-full max-w-lg rounded-[32px] border border-white/80 bg-white/95 shadow-[0_28px_72px_rgba(15,23,42,0.18)] backdrop-blur-xl">
              <div className="sticky top-0 z-10 border-b border-slate-100 bg-white/95 px-6 pb-5 pt-6">
                <div className="absolute inset-x-0 top-0 h-28 bg-[radial-gradient(circle_at_top_right,rgba(244,114,182,0.16),transparent_70%)]" />
                <div className="relative flex items-start justify-between gap-4">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full bg-pink-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-pink-600 ring-1 ring-pink-100">
                      <Timer size={14} />
                      加班申请表单
                    </div>
                    <h3 className="mt-4 text-2xl font-bold tracking-tight text-slate-900">
                      {current ? '编辑加班申请' : '新建加班申请'}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-slate-500">
                      填写加班类型、时间区间、补偿方式和事由后提交审批。
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowDialog(false)}
                    className="rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  >
                    <X size={18} />
                  </Button>
                </div>
              </div>

              <div className="space-y-4 p-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      加班类型 <span className="text-red-500">*</span>
                    </label>
                    <Select
                      value={formData.overtimeType}
                      onValueChange={(value) => setFormData({ ...formData, overtimeType: value })}
                    >
                      <SelectTrigger className="h-12 rounded-2xl">
                        <SelectValue placeholder="请选择" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="WORKDAY">工作日</SelectItem>
                        <SelectItem value="WEEKEND">周末</SelectItem>
                        <SelectItem value="HOLIDAY">节假日</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      补偿方式 <span className="text-red-500">*</span>
                    </label>
                    <Select
                      value={formData.compensationType}
                      onValueChange={(value) =>
                        setFormData({ ...formData, compensationType: value })
                      }
                    >
                      <SelectTrigger className="h-12 rounded-2xl">
                        <SelectValue placeholder="请选择" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PAYMENT">加班费</SelectItem>
                        <SelectItem value="TIME_OFF">调休</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      开始时间 <span className="text-red-500">*</span>
                    </label>
                    <DatePicker
                      type="datetime-local"
                      value={formData.startTime}
                      onChange={(event) =>
                        setFormData({ ...formData, startTime: event.target.value })
                      }
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      结束时间 <span className="text-red-500">*</span>
                    </label>
                    <DatePicker
                      type="datetime-local"
                      value={formData.endTime}
                      onChange={(event) =>
                        setFormData({ ...formData, endTime: event.target.value })
                      }
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    加班事由 <span className="text-red-500">*</span>
                  </label>
                  <Textarea
                    className="h-28 rounded-2xl"
                    value={formData.reason}
                    onChange={(event) =>
                      setFormData({ ...formData, reason: event.target.value })
                    }
                    placeholder="请说明本次加班的业务背景和处理事项。"
                  />
                </div>
              </div>

              <div className="sticky bottom-0 flex justify-end gap-3 border-t border-slate-100 bg-slate-50/80 px-6 py-5">
                <Button variant="outline" onClick={() => setShowDialog(false)} className="rounded-2xl">
                  取消
                </Button>
                <Button onClick={handleSave} className="rounded-2xl bg-pink-500 text-white hover:bg-pink-600">
                  保存
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default OvertimeApplicationPage;
