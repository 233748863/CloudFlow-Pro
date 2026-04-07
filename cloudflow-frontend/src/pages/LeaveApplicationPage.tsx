import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Calendar,
  ClipboardList,
  Download,
  Plus,
  RotateCcw,
  Search,
  Send,
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
import { TableRowActions } from '@/components/ui/table-row-actions';
import {
  WorkspaceBackdrop,
  WorkspaceEmptyPanel,
  WorkspaceSectionHeader,
} from '@/components/workspace/WorkspacePrimitives';

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
      APPROVING: { bg: 'bg-pink-50', text: 'text-pink-500' },
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
      <div className="space-y-6 px-4 py-4 md:px-6">
        <Card className="rounded-[28px] border border-white/65 bg-white/88 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
          <div className="space-y-6 p-6">
            <WorkspaceSectionHeader
              eyebrow="HR Self Service"
              title="请假申请"
            />

            <div className="grid gap-4 md:grid-cols-[1.35fr,0.65fr]">
              <div className="rounded-[28px] border border-slate-100 bg-[linear-gradient(135deg,rgba(244,114,182,0.08),rgba(255,255,255,0.96))] p-6 shadow-sm">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  申请工作区
                </div>
                <div className="mt-3 text-3xl font-bold tracking-tight text-slate-900">请假申请</div>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
                  先确认请假类型和时间区间，再选择保存草稿或直接提交审批。
                </p>

                {restrictionMessage ? (
                  <div
                    data-testid="hr-self-service-restriction"
                    className="mt-5 rounded-3xl border border-amber-200 bg-amber-50/90 px-4 py-4 text-amber-900"
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 rounded-full bg-white/90 p-2 text-amber-600 ring-1 ring-amber-200">
                        <AlertCircle size={16} />
                      </div>
                      <div>
                        <div className="text-sm font-semibold">当前账号暂时不能继续发起 HR 自助流程</div>
                        <div className="mt-1 text-xs leading-6 text-amber-800">{restrictionMessage}</div>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 md:grid-cols-1">
                {[
                  {
                    label: '待提交草稿',
                    value: `${draftCount} 条`,
                    hint: '创建后尚未送审的请假记录',
                    tone: 'bg-slate-100 text-slate-700',
                  },
                  {
                    label: '审批中',
                    value: `${pendingCount} 条`,
                    hint: '已经进入流程等待处理',
                    tone: 'bg-pink-50 text-pink-600',
                  },
                  {
                    label: '已通过',
                    value: `${approvedCount} 条`,
                    hint: '已经审批通过的请假申请',
                    tone: 'bg-emerald-100 text-emerald-600',
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="rounded-[24px] border border-slate-100 bg-white/92 p-4 shadow-sm"
                  >
                    <div className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${item.tone}`}>
                      {item.label}
                    </div>
                    <div className="mt-4 text-2xl font-bold text-slate-900">{item.value}</div>
                    <div className="mt-2 text-xs leading-5 text-slate-400">{item.hint}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-[1fr,auto] md:items-center">
              <div className="rounded-[24px] border border-slate-100 bg-white/85 p-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500">
                  <span className="inline-flex items-center gap-2 rounded-full bg-pink-50 px-3 py-1 text-pink-600">
                    <Calendar size={16} />
                    {todayLabel}
                  </span>
                  <span>当前时间 {timeLabel}</span>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <Button
                  variant="outline"
                  onClick={handleExport}
                  className="rounded-2xl border-slate-200 bg-white/90"
                >
                  <Download size={16} className="mr-2" />
                  导出
                </Button>
                <Button
                  onClick={openCreateDialog}
                  disabled={loadingTypes || eligibilityLoading || !canStartSelfService}
                  className="rounded-2xl bg-pink-500 text-white hover:bg-pink-600"
                >
                  <Plus size={16} className="mr-2" />
                  新建请假申请
                </Button>
              </div>
            </div>

            <div className="rounded-[24px] border border-slate-100 bg-white/85 p-4 shadow-sm">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                <Select
                  value={searchParams.status}
                  onValueChange={(value) =>
                    setSearchParams((prev) => ({ ...prev, status: value, pageNum: 1 }))
                  }
                >
                  <SelectTrigger className="h-12 rounded-2xl">
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
                    setSearchParams((prev) => ({ ...prev, leaveTypeId: value, pageNum: 1 }))
                  }
                >
                  <SelectTrigger className="h-12 rounded-2xl">
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

                <Button
                  onClick={() => setSearchParams((prev) => ({ ...prev, pageNum: 1 }))}
                  className="h-12 rounded-2xl bg-pink-500 text-white hover:bg-pink-600"
                >
                  <Search size={16} className="mr-2" />
                  搜索
                </Button>

                <Button
                  variant="outline"
                  onClick={() =>
                    setSearchParams({
                      status: '',
                      leaveTypeId: '',
                      pageNum: 1,
                      pageSize: 10,
                    })
                  }
                  className="h-12 rounded-2xl"
                >
                  <RotateCcw size={16} className="mr-2" />
                  重置
                </Button>
              </div>
            </div>

            <div className="overflow-hidden rounded-[28px] border border-slate-100 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <TableHeader className="sticky top-0 z-10">
                    <tr>
                      <TableHead>申请单号</TableHead>
                      <TableHead>请假类型</TableHead>
                      <TableHead>时间区间</TableHead>
                      <TableHead>时长</TableHead>
                      <TableHead>事由</TableHead>
                      <TableHead>状态</TableHead>
                      <TableActionHead className="w-56">操作</TableActionHead>
                    </tr>
                  </TableHeader>
                  <tbody className="divide-y divide-slate-100">
                    {loading ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                          <div className="mx-auto h-6 w-6 animate-spin rounded-full border-b-2 border-pink-500" />
                        </td>
                      </tr>
                    ) : list.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-0 py-0">
                          <WorkspaceEmptyPanel
                            icon={<ClipboardList size={26} />}
                            title="暂无请假申请"
                            description="创建新的请假申请后，这里会展示请假类型、起止时间、时长和审批状态。"
                          />
                        </td>
                      </tr>
                    ) : (
                      list.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-50/80">
                          <td className="px-4 py-3 text-sm text-slate-900">{item.applicationNo || '-'}</td>
                          <td className="px-4 py-3 text-sm text-slate-600">{item.leaveTypeName || '-'}</td>
                          <td className="px-4 py-3 text-sm text-slate-600">
                            <div>{item.startTime}</div>
                            <div className="text-xs text-slate-400">{item.endTime}</div>
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-600">{formatDuration(item)}</td>
                          <td className="max-w-sm truncate px-4 py-3 text-sm text-slate-600">{item.reason}</td>
                          <td className="px-4 py-3">{getStatusBadge(item.status || 'DRAFT')}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-right">
                            <TableRowActions
                              align="end"
                              actions={[
                                {
                                  label: '提交',
                                  icon: <Send size={14} />,
                                  onClick: () => handleSubmitDraft(item.id!),
                                  hidden: item.status !== 'DRAFT',
                                  tone: 'primary',
                                },
                                {
                                  label: '撤销',
                                  icon: <RotateCcw size={14} />,
                                  onClick: () => handleCancel(item.id!),
                                  hidden: item.status !== 'APPROVING' && item.status !== 'APPROVED',
                                  tone: 'warning',
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

        {showDialog ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/28 p-4 backdrop-blur-sm">
            <div className="w-full max-w-2xl rounded-[32px] border border-white/80 bg-white/95 shadow-[0_28px_72px_rgba(15,23,42,0.18)] backdrop-blur-xl">
              <div className="sticky top-0 z-10 border-b border-slate-100 bg-white/95 px-6 pb-5 pt-6">
                <div className="absolute inset-x-0 top-0 h-28 bg-[radial-gradient(circle_at_top_right,rgba(244,114,182,0.16),transparent_70%)]" />
                <div className="relative flex items-start justify-between gap-4">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full bg-pink-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-pink-600 ring-1 ring-pink-100">
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
                    className="rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  >
                    <X size={18} />
                  </Button>
                </div>
              </div>

              <div className="space-y-4 p-6">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      请假类型 <span className="text-red-500">*</span>
                    </label>
                    <Select
                      value={formData.leaveTypeId ? String(formData.leaveTypeId) : ''}
                      onValueChange={handleLeaveTypeChange}
                    >
                      <SelectTrigger className="h-12 rounded-2xl">
                        <SelectValue placeholder="请选择请假类型" />
                      </SelectTrigger>
                      <SelectContent>
                        {leaveTypes.map((item) => (
                          <SelectItem key={item.id} value={String(item.id)}>
                            {item.leaveName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="rounded-2xl border border-slate-100 bg-slate-50/80 px-4 py-3">
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

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      {selectedType?.unit === 'HOUR' ? '开始时间' : '开始日期'}
                      <span className="text-red-500">*</span>
                    </label>
                    <DatePicker
                      type={selectedType?.unit === 'HOUR' ? 'datetime-local' : 'date'}
                      value={formData.startValue}
                      onChange={(event) =>
                        setFormData((prev) => ({ ...prev, startValue: event.target.value }))
                      }
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      {selectedType?.unit === 'HOUR' ? '结束时间' : '结束日期'}
                      <span className="text-red-500">*</span>
                    </label>
                    <DatePicker
                      type={selectedType?.unit === 'HOUR' ? 'datetime-local' : 'date'}
                      value={formData.endValue}
                      onChange={(event) =>
                        setFormData((prev) => ({ ...prev, endValue: event.target.value }))
                      }
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    请假原因 <span className="text-red-500">*</span>
                  </label>
                  <Textarea
                    className="h-28 rounded-2xl"
                    value={formData.reason}
                    onChange={(event) =>
                      setFormData((prev) => ({ ...prev, reason: event.target.value }))
                    }
                    placeholder="请说明本次请假的原因、交接情况或其他需要审批人了解的信息。"
                  />
                </div>
              </div>

              <div className="sticky bottom-0 flex flex-wrap justify-end gap-3 border-t border-slate-100 bg-slate-50/80 px-6 py-5">
                <Button variant="outline" onClick={() => setShowDialog(false)} className="rounded-2xl">
                  取消
                </Button>
                <Button
                  variant="outline"
                  onClick={handleSaveDraft}
                  disabled={submitting}
                  className="rounded-2xl"
                >
                  保存草稿
                </Button>
                <Button
                  onClick={handleCreateAndSubmit}
                  disabled={submitting}
                  className="rounded-2xl bg-pink-500 text-white hover:bg-pink-600"
                >
                  <Send size={16} className="mr-2" />
                  直接提交
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default LeaveApplicationPage;
