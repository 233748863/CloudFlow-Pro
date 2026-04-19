import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Download,
  Eye,
  Edit,
  Plus,
  RotateCcw,
  Search,
  Send,
  Clock3,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  HrLeaveTypeOption,
  leaveApplicationApi,
  LeaveApplication,
  LeaveApplicationForm,
} from '@/services/api/leaveApplication';
import { useHrSelfServiceEligibility } from '@/hooks/useHrSelfServiceEligibility';
import { buildExcelFileName, downloadBlob } from '@/utils/download';
import { getErrorMessage } from '@/utils/errorMessage';
import { toBackendDateString } from '@/utils/dateFormat';
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
import { ProcessTrace } from '@/components/ProcessTrace';
import { TableRowActions } from '@/components/ui/table-row-actions';
import {
  WorkspaceBackdrop,
  WorkspaceHeroMetricsSection,
  WorkspaceInlineState,
  WorkspacePageContent,
  WorkspacePaginationBar,
  WorkspaceResultCard,
  WorkspaceTableStateRow,
  WorkspaceWorkbenchCard,
  workspaceGlassSurfaceClassName,
} from '@/components/workspace';

interface LeaveApplicationDraftForm {
  leaveTypeId?: number;
  startValue: string;
  endValue: string;
  reason: string;
}

const statusMap: Record<string, string> = {
  DRAFT: '草稿',
  APPROVING: '审批中',
  APPROVED: '已通过',
  REJECTED: '已拒绝',
  CANCELLED: '已撤销',
};

const unitMap: Record<string, string> = {
  DAY: '天',
  HOUR: '小时',
};

const formatDateCN = (date: Date) => {
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  return `${date.getMonth() + 1}月${date.getDate()}日 ${weekdays[date.getDay()]}`;
};

const toDateValue = (date: Date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const toDateTimeValue = (date: Date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  const hour = `${date.getHours()}`.padStart(2, '0');
  const minute = `${date.getMinutes()}`.padStart(2, '0');
  return `${year}-${month}-${day}T${hour}:${minute}`;
};

const buildEmptyForm = (type?: HrLeaveTypeOption): LeaveApplicationDraftForm => {
  const now = new Date();
  const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);

  if (type?.unit === 'HOUR') {
    return {
      leaveTypeId: type.id,
      startValue: toDateTimeValue(now),
      endValue: toDateTimeValue(oneHourLater),
      reason: '',
    };
  }

  const today = toDateValue(now);
  return {
    leaveTypeId: type?.id,
    startValue: today,
    endValue: today,
    reason: '',
  };
};

const buildDateTimeRange = (
  type: HrLeaveTypeOption | undefined,
  form: LeaveApplicationDraftForm,
) => {
  if (!type) {
    return { startTime: '', endTime: '' };
  }

  if (type.unit === 'HOUR') {
    return {
      startTime: toBackendDateString(form.startValue),
      endTime: toBackendDateString(form.endValue),
    };
  }

  return {
    startTime: `${form.startValue} 09:00:00`,
    endTime: `${form.endValue} 18:00:00`,
  };
};

const calculateDuration = (
  type: HrLeaveTypeOption | undefined,
  form: LeaveApplicationDraftForm,
) => {
  if (!type || !form.startValue || !form.endValue) {
    return 0;
  }

  if (type.unit === 'HOUR') {
    const start = new Date(form.startValue).getTime();
    const end = new Date(form.endValue).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      return 0;
    }
    return Math.round(((end - start) / 3600000) * 10) / 10;
  }

  const start = new Date(`${form.startValue}T00:00:00`).getTime();
  const end = new Date(`${form.endValue}T00:00:00`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return 0;
  }
  return Math.floor((end - start) / 86400000) + 1;
};

const formatDuration = (item: LeaveApplication) =>
  `${item.duration}${unitMap[item.unit || ''] || item.unit || ''}`;

export const LeaveApplicationPage: React.FC = () => {
  const [list, setList] = useState<LeaveApplication[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<HrLeaveTypeOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingTypes, setLoadingTypes] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailRecord, setDetailRecord] = useState<LeaveApplication | null>(null);
  const [searchParams, setSearchParams] = useState({
    status: '',
    leaveTypeId: '',
    pageNum: 1,
    pageSize: 10,
  });
  const [total, setTotal] = useState(0);
  const {
    loading: eligibilityLoading,
    canStartSelfService,
    restrictionMessage,
  } = useHrSelfServiceEligibility();
  const [formData, setFormData] = useState<LeaveApplicationDraftForm>({
    startValue: '',
    endValue: '',
    reason: '',
  });

  useEffect(() => {
    void loadLeaveTypes();
  }, []);

  useEffect(() => {
    void fetchList();
  }, [searchParams]);

  const selectedType = useMemo(
    () => leaveTypes.find((item) => item.id === formData.leaveTypeId),
    [formData.leaveTypeId, leaveTypes],
  );
  const duration = useMemo(() => calculateDuration(selectedType, formData), [formData, selectedType]);

  const draftCount = list.filter((item) => item.status === 'DRAFT').length;
  const pendingCount = list.filter((item) => item.status === 'APPROVING').length;
  const approvedCount = list.filter((item) => item.status === 'APPROVED').length;
  const todayLabel = formatDateCN(new Date());
  const timeLabel = new Date().toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const currentStatusLabel = searchParams.status ? (statusMap[searchParams.status] || searchParams.status) : '全部状态';
  const currentTypeLabel = searchParams.leaveTypeId
    ? (leaveTypes.find((item) => String(item.id) === searchParams.leaveTypeId)?.leaveName || '指定类型')
    : '全部类型';
  const hasActiveFilters = Boolean(searchParams.status || searchParams.leaveTypeId);
  const totalPages = Math.max(1, Math.ceil(total / searchParams.pageSize));
  const glassModalShellClass = 'w-full rounded-2xl border border-slate-200 bg-white shadow-[0_22px_44px_rgba(15,23,42,0.14)]';
  const glassModalHeaderClass = 'sticky top-0 z-10 border-b border-slate-100 bg-white px-5 py-4';
  const glassModalSectionClass = 'rounded-2xl border border-slate-200 bg-slate-50 p-4';
  const glassModalLabelClass = 'mb-1.5 block text-sm font-medium text-slate-700';
  const glassModalInputClass = 'h-11 rounded-xl';
  const glassModalTextareaClass = 'min-h-[112px] rounded-xl';
  const glassModalFooterClass = 'sticky bottom-0 flex flex-wrap justify-end gap-3 border-t border-slate-100 bg-white px-5 py-4';
  const glassModalSelectContentClass = '';
  const glassDetailCardClass = 'rounded-2xl border border-slate-200 bg-slate-50 p-4';

  const renderDetailValue = (value?: string | number | null) => {
    if (value === null || value === undefined || value === '') {
      return '-';
    }
    return String(value);
  };

  const getActionHint = (status?: string) => {
    switch (status) {
      case 'DRAFT':
        return '草稿可继续补充时间区间后提交';
      case 'APPROVING':
        return '审批进行中，可查看流程进度';
      case 'APPROVED':
        return '审批完成，请留意交接与排班';
      case 'REJECTED':
        return '可调整时间或原因后重新发起';
      case 'CANCELLED':
        return '申请已撤销，可重新创建';
      default:
        return '当前记录可用于回看请假状态';
    }
  };

  const statusQuickFilters = [
    { label: '全部', value: '' },
    { label: '草稿', value: 'DRAFT' },
    { label: '审批中', value: 'APPROVING' },
    { label: '已通过', value: 'APPROVED' },
    { label: '已拒绝', value: 'REJECTED' },
    { label: '已撤销', value: 'CANCELLED' },
  ];

  const heroMetrics = useMemo(() => ([
    {
      label: '当前结果',
      value: `${total}`,
      hint: hasActiveFilters ? `${currentStatusLabel} · ${currentTypeLabel}` : '默认视图下全部请假申请',
      icon: <ClipboardList size={17} />,
    },
    {
      label: '待提交草稿',
      value: `${draftCount}`,
      hint: draftCount > 0 ? '建议优先确认时间区间和原因后提交' : '当前没有待提交草稿',
      icon: <Edit size={17} />,
    },
    {
      label: '审批中',
      value: `${pendingCount}`,
      hint: pendingCount > 0 ? '可继续查看流程节点与审批进度' : '当前没有审批中的申请',
      icon: <Clock3 size={17} />,
    },
    {
      label: '已通过',
      value: `${approvedCount}`,
      hint: approvedCount > 0 ? '便于快速回看已审批完成的请假记录' : '用于快速判断当前已通过申请数',
      icon: <CheckCircle2 size={17} />,
    },
  ]), [approvedCount, currentStatusLabel, currentTypeLabel, draftCount, hasActiveFilters, pendingCount, total]);

  const workspaceOverviewItems = [
    {
      label: '记录数',
      value: `${total} 条`,
    },
    {
      label: '状态',
      value: currentStatusLabel,
    },
    {
      label: '类型',
      value: currentTypeLabel,
    },
    {
      label: '视图',
      value: hasActiveFilters ? '筛选结果' : '默认视图',
    },
  ];

  const applyStatusFilter = (status: string) => {
    setSearchParams((prev) => ({ ...prev, status, pageNum: 1 }));
  };

  const handleResetFilters = () => {
    setSearchParams({
      status: '',
      leaveTypeId: '',
      pageNum: 1,
      pageSize: 10,
    });
  };

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

  const loadLeaveTypes = async () => {
    setLoadingTypes(true);
    try {
      const records = await leaveApplicationApi.listLeaveTypes();
      const enabledTypes = records.filter((item) => item.status !== 0);
      setLeaveTypes(enabledTypes);
      if (enabledTypes.length > 0) {
        setFormData((prev) => {
          if (prev.leaveTypeId) {
            return prev;
          }
          return buildEmptyForm(enabledTypes[0]);
        });
      }
    } catch (error) {
      toast.error(getErrorMessage(error, '获取请假类型失败'));
    } finally {
      setLoadingTypes(false);
    }
  };

  const fetchList = async () => {
    setLoading(true);
    try {
      const response = await leaveApplicationApi.list({
        pageNum: searchParams.pageNum,
        pageSize: searchParams.pageSize,
        status: searchParams.status || undefined,
        leaveTypeId: searchParams.leaveTypeId ? Number(searchParams.leaveTypeId) : undefined,
      });
      setList(response.records || response.rows || []);
      setTotal(response.total || 0);
    } catch (error) {
      toast.error(getErrorMessage(error, '获取请假申请列表失败'));
    } finally {
      setLoading(false);
    }
  };

  const openCreateDialog = () => {
    if (!ensureCanOperate()) {
      return;
    }
    const firstType = leaveTypes[0];
    setFormData(buildEmptyForm(firstType));
    setShowDialog(true);
  };

  const handleView = async (id: number) => {
    setShowDetail(true);
    setDetailLoading(true);
    try {
      const detail = await leaveApplicationApi.getInfo(id);
      setDetailRecord(detail);
    } catch (error) {
      setShowDetail(false);
      toast.error(getErrorMessage(error, '获取请假详情失败'));
    } finally {
      setDetailLoading(false);
    }
  };

  const handleLeaveTypeChange = (value: string) => {
    const nextType = leaveTypes.find((item) => item.id === Number(value));
    if (!nextType) {
      return;
    }

    // 请假暂未提供“草稿编辑”接口，创建时直接把控件值切到目标类型可提交格式，
    // 这样桌面端和移动端都统一走正式申请模型，不再保留旧兼容字段。
    setFormData((prev) => {
      if (nextType.unit === 'HOUR') {
        const hourForm = buildEmptyForm(nextType);
        return {
          ...prev,
          leaveTypeId: nextType.id,
          startValue: prev.startValue.includes('T') ? prev.startValue : hourForm.startValue,
          endValue: prev.endValue.includes('T') ? prev.endValue : hourForm.endValue,
        };
      }

      return {
        ...prev,
        leaveTypeId: nextType.id,
        startValue: prev.startValue ? prev.startValue.slice(0, 10) : buildEmptyForm(nextType).startValue,
        endValue: prev.endValue ? prev.endValue.slice(0, 10) : buildEmptyForm(nextType).endValue,
      };
    });
  };

  const validateForm = () => {
    if (!selectedType) {
      return '请选择请假类型';
    }
    if (!formData.startValue || !formData.endValue) {
      return selectedType.unit === 'HOUR'
        ? '请选择开始和结束时间'
        : '请选择开始和结束日期';
    }
    if (duration <= 0) {
      return selectedType.unit === 'HOUR'
        ? '结束时间必须晚于开始时间'
        : '结束日期不能早于开始日期';
    }
    if (formData.reason.trim().length < 2) {
      return '请输入请假原因，至少 2 个字符';
    }
    return null;
  };

  const buildPayload = (): LeaveApplicationForm | null => {
    const errorMessage = validateForm();
    if (errorMessage) {
      toast.error(errorMessage);
      return null;
    }

    if (!selectedType) {
      return null;
    }

    const { startTime, endTime } = buildDateTimeRange(selectedType, formData);
    return {
      leaveTypeId: selectedType.id,
      startTime,
      endTime,
      duration,
      unit: selectedType.unit || 'DAY',
      reason: formData.reason.trim(),
    };
  };

  const handleSaveDraft = async () => {
    if (!ensureCanOperate()) {
      return;
    }

    const payload = buildPayload();
    if (!payload) {
      return;
    }

    setSubmitting(true);
    try {
      await leaveApplicationApi.add(payload);
      toast.success('请假草稿已创建');
      setShowDialog(false);
      await fetchList();
    } catch (error) {
      toast.error(getErrorMessage(error, '创建请假草稿失败'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateAndSubmit = async () => {
    if (!ensureCanOperate()) {
      return;
    }

    const payload = buildPayload();
    if (!payload) {
      return;
    }

    setSubmitting(true);
    try {
      const createRes = await leaveApplicationApi.add(payload);
      if (!createRes?.id) {
        throw new Error('创建请假申请失败');
      }
      await leaveApplicationApi.submit(createRes.id);
      toast.success('请假申请已提交，等待审批');
      setShowDialog(false);
      await fetchList();
    } catch (error) {
      toast.error(getErrorMessage(error, '提交请假申请失败'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitDraft = async (id: number) => {
    if (!ensureCanOperate()) {
      return;
    }
    if (!confirm('确定提交这条请假草稿吗？')) {
      return;
    }
    try {
      await leaveApplicationApi.submit(id);
      toast.success('提交成功');
      await fetchList();
    } catch (error) {
      toast.error(getErrorMessage(error, '提交失败'));
    }
  };

  const handleCancel = async (id: number) => {
    if (!ensureCanOperate()) {
      return;
    }
    if (!confirm('确定撤销这条请假申请吗？')) {
      return;
    }
    try {
      await leaveApplicationApi.cancel(id);
      toast.success('撤销成功');
      await fetchList();
    } catch (error) {
      toast.error(getErrorMessage(error, '撤销失败'));
    }
  };

  const handleExport = async () => {
    try {
      const blob = await leaveApplicationApi.export({
        pageNum: 1,
        pageSize: 500,
        status: searchParams.status || undefined,
        leaveTypeId: searchParams.leaveTypeId ? Number(searchParams.leaveTypeId) : undefined,
      });
      const fileName = downloadBlob(blob, buildExcelFileName('请假申请'));
      toast.success(
        total > 0
          ? `已导出 ${total} 条请假申请，下载文件：${fileName}`
          : `已导出空结果，下载文件：${fileName}`,
      );
    } catch (error) {
      toast.error(getErrorMessage(error, '导出失败'));
    }
  };

  const getStatusBadge = (status: string) => {
    const config: Record<string, { bg: string; text: string }> = {
      DRAFT: { bg: 'bg-slate-100', text: 'text-slate-600' },
      APPROVING: { bg: 'bg-cyan-50', text: 'text-cyan-600' },
      APPROVED: { bg: 'bg-emerald-100', text: 'text-emerald-600' },
      REJECTED: { bg: 'bg-red-100', text: 'text-red-600' },
      CANCELLED: { bg: 'bg-slate-100', text: 'text-slate-500' },
    };
    const currentConfig = config[status] || config.DRAFT;
    return (
      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${currentConfig.bg} ${currentConfig.text}`}>
        {statusMap[status] || status}
      </span>
    );
  };

  return (
    <div className="relative min-h-screen pb-6">
      <WorkspaceBackdrop />
      <WorkspacePageContent>
        <WorkspaceHeroMetricsSection
          badge={(
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-slate-500">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-600">
                <Calendar size={14} />
                {todayLabel}
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-500">{timeLabel}</span>
            </div>
          )}
          title="请假申请"
          actions={(
            <div className="flex flex-wrap gap-2 xl:justify-end">
              <Button
                onClick={openCreateDialog}
                disabled={loadingTypes || eligibilityLoading || !canStartSelfService}
                className="h-9 rounded-xl px-4"
              >
                <Plus size={15} className="mr-2" />
                新建申请
              </Button>
              <Button
                variant="outline"
                onClick={handleExport}
                className="h-9 rounded-xl px-4"
              >
                <Download size={15} className="mr-2 text-slate-500" />
                导出结果
              </Button>
            </div>
          )}
          contentClassName="p-3.5 sm:p-4"
          metrics={heroMetrics}
        >
          {restrictionMessage ? (
            <div
              data-testid="hr-self-service-restriction"
              className="mb-2 rounded-2xl border border-amber-200 bg-amber-50 px-3.5 py-3.5 text-amber-900 shadow-sm"
            >
              <div className="flex items-start gap-3">
                <div className="rounded-xl border border-amber-200 bg-white p-2 text-amber-600">
                  <AlertCircle size={18} />
                </div>
                <div>
                  <div className="text-sm font-semibold">当前账号暂时不能继续发起 HR 自助流程</div>
                  <div className="mt-1 text-xs leading-6 text-amber-800">{restrictionMessage}</div>
                </div>
              </div>
            </div>
          ) : null}
        </WorkspaceHeroMetricsSection>

        <Card className={`${workspaceGlassSurfaceClassName} p-3`}>
          <div className="flex flex-col gap-3">
            <WorkspaceWorkbenchCard
              title="申请列表"
              total={total}
              hasActiveFilters={hasActiveFilters}
              overviewItems={workspaceOverviewItems}
              quickFilters={statusQuickFilters}
              activeQuickFilter={searchParams.status}
              onQuickFilterChange={applyStatusFilter}
              quickFilterAside={hasActiveFilters ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleResetFilters}
                  className="h-8 rounded-xl px-3.5"
                >
                  <RotateCcw size={15} className="mr-2" />
                  清空所有条件
                </Button>
              ) : (
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-400">
                  当前未应用额外筛选
                </span>
              )}
              filterBar={(
                <div className="grid grid-cols-1 gap-2.5 xl:grid-cols-[minmax(0,1fr)_auto_auto]">
                  <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
                    <Select
                      value={searchParams.status}
                      onValueChange={(value) =>
                        setSearchParams(prev => ({ ...prev, status: value, pageNum: 1 }))
                      }
                    >
                      <SelectTrigger className="h-10 rounded-xl">
                        <SelectValue placeholder="请选择状态" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">全部状态</SelectItem>
                        <SelectItem value="DRAFT">草稿</SelectItem>
                        <SelectItem value="APPROVING">审批中</SelectItem>
                        <SelectItem value="APPROVED">已通过</SelectItem>
                        <SelectItem value="REJECTED">已拒绝</SelectItem>
                        <SelectItem value="CANCELLED">已撤销</SelectItem>
                      </SelectContent>
                    </Select>

                    <Select
                      value={searchParams.leaveTypeId}
                      onValueChange={(value) =>
                        setSearchParams(prev => ({ ...prev, leaveTypeId: value, pageNum: 1 }))
                      }
                    >
                      <SelectTrigger className="h-10 rounded-xl">
                        <SelectValue placeholder="请选择请假类型" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">全部类型</SelectItem>
                        {leaveTypes.map((item) => (
                          <SelectItem key={item.id} value={String(item.id)}>
                            {item.leaveName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <Button
                    size="sm"
                    onClick={() => setSearchParams(prev => ({ ...prev, pageNum: 1 }))}
                    className="h-10 rounded-xl px-3.5"
                  >
                    <Search size={15} className="mr-2" />
                    应用筛选
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleResetFilters}
                    className="h-10 rounded-xl px-3.5"
                  >
                    <RotateCcw size={15} className="mr-2" />
                    清空条件
                  </Button>
                </div>
              )}
            />

            <WorkspaceResultCard total={total} description="轻玻璃视图下展示请假申请记录与当前操作">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <TableHeader className="sticky top-0 z-10 bg-white">
                    <tr>
                      <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">申请单号</TableHead>
                      <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">请假类型</TableHead>
                      <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">时间区间</TableHead>
                      <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">时长</TableHead>
                      <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">事由</TableHead>
                      <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">状态</TableHead>
                      <TableActionHead className="w-56 px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">当前操作</TableActionHead>
                    </tr>
                  </TableHeader>
                  <tbody className="divide-y divide-slate-100">
                    {loading ? (
                      <WorkspaceTableStateRow colSpan={7} type="loading" title="正在加载请假申请..." />
                    ) : list.length === 0 ? (
                      <WorkspaceTableStateRow
                        colSpan={7}
                        variant="glass"
                        icon={<ClipboardList size={26} />}
                        title={hasActiveFilters ? '当前条件下暂无记录' : '暂无请假申请'}
                        description={hasActiveFilters ? '试试切换状态、清空类型条件，或者直接新建一条请假申请。' : '创建新的请假申请后，这里会展示请假类型、起止时间、时长和审批状态。'}
                      />
                    ) : (
                      list.map((item) => (
                        <tr key={item.id} className="transition hover:bg-slate-50">
                          <td className="px-4 py-2.5 text-sm text-slate-900">{item.applicationNo || '-'}</td>
                          <td className="px-4 py-2.5 text-sm text-slate-600">{item.leaveTypeName || '-'}</td>
                          <td className="px-4 py-2.5 text-sm text-slate-600">
                            <div>{item.startTime}</div>
                            <div className="text-xs text-slate-400">{item.endTime}</div>
                          </td>
                          <td className="px-4 py-2.5 text-sm text-slate-600">{formatDuration(item)}</td>
                          <td className="max-w-sm truncate px-4 py-2.5 text-sm text-slate-600">{item.reason}</td>
                          <td className="px-4 py-2.5">{getStatusBadge(item.status || 'DRAFT')}</td>
                          <td className="px-4 py-2.5 whitespace-nowrap text-right">
                            <div className="flex flex-col items-end gap-1">
                              <TableRowActions
                                align="end"
                                className="gap-1"
                                actions={[
                                  {
                                    label: '详情',
                                    icon: <Eye size={14} />,
                                    onClick: () => void handleView(item.id!),
                                    tone: 'neutral',
                                    className: 'rounded-full border border-slate-200 bg-white px-2.5 hover:bg-slate-50',
                                  },
                                  {
                                    label: '提交',
                                    icon: <Send size={14} />,
                                    onClick: () => handleSubmitDraft(item.id!),
                                    hidden: item.status !== 'DRAFT',
                                    tone: 'primary',
                                    className: 'rounded-full border border-cyan-200 bg-cyan-50 px-2.5 text-cyan-700 hover:bg-cyan-100 hover:text-cyan-800',
                                  },
                                  {
                                    label: '撤销',
                                    icon: <RotateCcw size={14} />,
                                    onClick: () => handleCancel(item.id!),
                                    hidden: item.status !== 'APPROVING' && item.status !== 'APPROVED',
                                    tone: 'warning',
                                    className: 'rounded-full border border-amber-200 bg-amber-50 px-2.5 text-amber-700 hover:bg-amber-100 hover:text-amber-800',
                                  },
                                ]}
                              />
                              <span className="text-[10px] font-medium text-slate-400">{getActionHint(item.status)}</span>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <WorkspacePaginationBar
                total={total}
                pageNum={searchParams.pageNum}
                totalPages={totalPages}
                onPrev={() =>
                  setSearchParams(prev => ({
                    ...prev,
                    pageNum: Math.max(1, prev.pageNum - 1),
                  }))
                }
                onNext={() =>
                  setSearchParams(prev => ({
                    ...prev,
                    pageNum: prev.pageNum + 1,
                  }))
                }
                prevDisabled={searchParams.pageNum === 1}
                nextDisabled={searchParams.pageNum * searchParams.pageSize >= total}
              />
            </WorkspaceResultCard>
          </div>
        </Card>
      </WorkspacePageContent>

        {showDialog ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/32 p-4">
            <div className={`${glassModalShellClass} max-w-2xl`}>
              <div className={glassModalHeaderClass}>
                <div className="relative flex items-start justify-between gap-4">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600">
                      <Calendar size={14} />
                      请假申请表单
                    </div>
                    <h3 className="mt-4 text-2xl font-bold tracking-tight text-slate-900">新建请假申请</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-500">
                      保存草稿后可以稍后继续提交，直接提交会立即进入审批流程。
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowDialog(false)}
                    className="rounded-full border border-slate-200 bg-white text-slate-400 hover:bg-slate-50 hover:text-slate-700"
                  >
                    <X size={18} />
                  </Button>
                </div>
              </div>

              <div className="space-y-4 p-5">
                <section className={glassModalSectionClass}>
                  <div className="mb-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">请假类型</div>
                    <div className="mt-1 text-sm text-slate-500">先确认假种，系统会根据配置自动计算时长并判断是否占用额度。</div>
                  </div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <label className={glassModalLabelClass}>
                        请假类型 <span className="text-red-500">*</span>
                      </label>
                      <Select
                        value={formData.leaveTypeId ? String(formData.leaveTypeId) : ''}
                        onValueChange={handleLeaveTypeChange}
                      >
                        <SelectTrigger className={glassModalInputClass}>
                          <SelectValue placeholder="请选择请假类型" />
                        </SelectTrigger>
                        <SelectContent className={glassModalSelectContentClass}>
                          {leaveTypes.map((item) => (
                            <SelectItem key={item.id} className="rounded-xl" value={String(item.id)}>
                              {item.leaveName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                        Duration
                      </div>
                      <div className="mt-2 text-2xl font-bold text-slate-900">
                        {duration > 0 ? `${duration}${unitMap[selectedType?.unit || ''] || ''}` : '--'}
                      </div>
                      <div className="mt-2 text-xs leading-5 text-slate-400">
                        {selectedType?.needQuota ? '该假种会占用对应假期额度。' : '该假种不校验假期额度。'}
                      </div>
                    </div>
                  </div>
                </section>

                <section className={glassModalSectionClass}>
                  <div className="mb-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">时间安排</div>
                    <div className="mt-1 text-sm text-slate-500">填写起止时间区间，系统会按天或按小时自动换算本次请假时长。</div>
                  </div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <label className={glassModalLabelClass}>
                        {selectedType?.unit === 'HOUR' ? '开始时间' : '开始日期'}
                        <span className="text-red-500">*</span>
                      </label>
                      <DatePicker
                        className={glassModalInputClass}
                        type={selectedType?.unit === 'HOUR' ? 'datetime-local' : 'date'}
                        value={formData.startValue}
                        onChange={(event) =>
                          setFormData((prev) => ({ ...prev, startValue: event.target.value }))
                        }
                      />
                    </div>

                    <div>
                      <label className={glassModalLabelClass}>
                        {selectedType?.unit === 'HOUR' ? '结束时间' : '结束日期'}
                        <span className="text-red-500">*</span>
                      </label>
                      <DatePicker
                        className={glassModalInputClass}
                        type={selectedType?.unit === 'HOUR' ? 'datetime-local' : 'date'}
                        value={formData.endValue}
                        onChange={(event) =>
                          setFormData((prev) => ({ ...prev, endValue: event.target.value }))
                        }
                      />
                    </div>
                  </div>
                </section>

                <section className={glassModalSectionClass}>
                  <div className="mb-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">申请说明</div>
                    <div className="mt-1 text-sm text-slate-500">说明请假原因、工作交接和其他需要审批人了解的信息。</div>
                  </div>
                  <div>
                    <label className={glassModalLabelClass}>
                      请假原因 <span className="text-red-500">*</span>
                    </label>
                    <Textarea
                      className={glassModalTextareaClass}
                      value={formData.reason}
                      onChange={(event) =>
                        setFormData((prev) => ({ ...prev, reason: event.target.value }))
                      }
                      placeholder="请说明本次请假的原因、交接情况或其他需要审批人了解的信息。"
                    />
                  </div>
                </section>
              </div>

              <div className={glassModalFooterClass}>
                <Button variant="outline" onClick={() => setShowDialog(false)} className="rounded-xl px-5">
                  取消
                </Button>
                <Button
                  variant="outline"
                  onClick={handleSaveDraft}
                  disabled={submitting}
                  className="rounded-xl px-5"
                >
                  保存草稿
                </Button>
                <Button
                  onClick={handleCreateAndSubmit}
                  disabled={submitting}
                  className="rounded-xl px-5"
                >
                  <Send size={16} className="mr-2" />
                  直接提交
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        {showDetail ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/32 p-4" onClick={() => !detailLoading && setShowDetail(false)}>
            <div
              className={`flex max-h-[90vh] max-w-4xl flex-col ${glassModalShellClass}`}
              onClick={(event) => event.stopPropagation()}
            >
              <div className={glassModalHeaderClass}>
                <div className="relative flex items-start justify-between gap-4">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600">
                      <Eye size={14} />
                      申请详情
                    </div>
                    <h3 className="mt-4 text-2xl font-bold tracking-tight text-slate-900">{detailRecord?.applicationNo || '请假申请'}</h3>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-slate-500">
                      <span>{detailRecord?.leaveTypeName || '加载中'}</span>
                      {detailRecord ? getStatusBadge(detailRecord.status || 'DRAFT') : null}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowDetail(false)}
                    className="rounded-full border border-slate-200 bg-white text-slate-400 hover:bg-slate-50 hover:text-slate-700"
                  >
                    <X size={18} />
                  </Button>
                </div>
              </div>

              <div className="flex-1 space-y-5 overflow-y-auto p-5">
                {detailLoading || !detailRecord ? (
                  <WorkspaceInlineState type="loading" title="正在加载请假详情..." className="py-12" />
                ) : (
                  <>
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      <div className={glassDetailCardClass}>
                        <div className="text-xs font-medium text-slate-400">申请单号</div>
                        <div className="mt-2 text-sm font-semibold text-slate-900">{renderDetailValue(detailRecord.applicationNo)}</div>
                      </div>
                      <div className={glassDetailCardClass}>
                        <div className="text-xs font-medium text-slate-400">申请人</div>
                        <div className="mt-2 text-sm font-semibold text-slate-900">{renderDetailValue(detailRecord.employeeName)}</div>
                      </div>
                      <div className={glassDetailCardClass}>
                        <div className="text-xs font-medium text-slate-400">请假类型</div>
                        <div className="mt-2 text-sm font-semibold text-slate-900">{renderDetailValue(detailRecord.leaveTypeName)}</div>
                      </div>
                      <div className={glassDetailCardClass}>
                        <div className="text-xs font-medium text-slate-400">开始时间</div>
                        <div className="mt-2 text-sm font-semibold text-slate-900">{renderDetailValue(detailRecord.startTime)}</div>
                      </div>
                      <div className={glassDetailCardClass}>
                        <div className="text-xs font-medium text-slate-400">结束时间</div>
                        <div className="mt-2 text-sm font-semibold text-slate-900">{renderDetailValue(detailRecord.endTime)}</div>
                      </div>
                      <div className={glassDetailCardClass}>
                        <div className="text-xs font-medium text-slate-400">请假时长</div>
                        <div className="mt-2 text-sm font-semibold text-slate-900">{formatDuration(detailRecord)}</div>
                      </div>
                      <div className={glassDetailCardClass}>
                        <div className="text-xs font-medium text-slate-400">状态</div>
                        <div className="mt-2 text-sm font-semibold text-slate-900">{statusMap[detailRecord.status || 'DRAFT'] || detailRecord.status || '-'}</div>
                      </div>
                      <div className={glassDetailCardClass}>
                        <div className="text-xs font-medium text-slate-400">创建时间</div>
                        <div className="mt-2 text-sm font-semibold text-slate-900">{renderDetailValue(detailRecord.createTime)}</div>
                      </div>
                      <div className={glassDetailCardClass}>
                        <div className="text-xs font-medium text-slate-400">更新时间</div>
                        <div className="mt-2 text-sm font-semibold text-slate-900">{renderDetailValue(detailRecord.updateTime)}</div>
                      </div>
                    </div>

                    <div className={glassModalSectionClass}>
                      <div className="text-sm font-semibold text-slate-900">请假原因</div>
                      <div className="mt-3 whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-7 text-slate-600">
                        {detailRecord.reason || '-'}
                      </div>
                    </div>

                    <div className={glassModalSectionClass}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold text-slate-900">流程轨迹</div>
                        <div className="text-xs text-slate-400">
                          {detailRecord.processInstanceId ? `实例号：${detailRecord.processInstanceId}` : '草稿或未发起流程时暂无轨迹'}
                        </div>
                      </div>
                      <div className="mt-4">
                        {detailRecord.processInstanceId ? (
                          <ProcessTrace instanceId={detailRecord.processInstanceId} />
                        ) : (
                          <WorkspaceInlineState
                            type="info"
                            title="暂无流程轨迹"
                            description="当前记录还没有流程实例，提交审批后这里会显示完整轨迹。"
                            className="py-8"
                          />
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className={glassModalFooterClass}>
                <Button variant="outline" onClick={() => setShowDetail(false)} className="rounded-xl px-5">
                  关闭
                </Button>
              </div>
            </div>
          </div>
        ) : null}
    </div>
  );
};

export default LeaveApplicationPage;
