import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Calendar,
  ClipboardList,
  Download,
  Eye,
  Plus,
  RotateCcw,
  Send,
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
import { BaseDialog } from '@/components/common/BaseDialog';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { Pagination } from '@/components/common/Pagination';
import { TablePageLayout } from '@/components/layout/TablePageLayout';
import { ProcessTrace } from '@/components/ProcessTrace';
import {
  Button,
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

interface LeaveApplicationDraftForm {
  leaveTypeId?: number;
  startValue: string;
  endValue: string;
  reason: string;
}

interface InlineStateProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  className?: string;
}

interface TableStateRowProps {
  colSpan: number;
  title: string;
  description?: string;
  icon?: React.ReactNode;
  loading?: boolean;
}

interface DetailFieldProps {
  label: string;
  value: React.ReactNode;
}

interface ConfirmState {
  type: 'submit' | 'cancel';
  id: number;
  title: string;
  message: string;
  confirmText: string;
}

const ALL_FILTER_VALUE = '__all__';

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

const InlineState: React.FC<InlineStateProps> = ({
  title,
  icon,
  className,
}) => (
  <div className={['flex flex-col items-center justify-center px-6 py-10 text-center', className].filter(Boolean).join(' ')}>
    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500">
      {icon || <ClipboardList className="h-4 w-4" />}
    </div>
    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
  </div>
);

const TableStateRow: React.FC<TableStateRowProps> = ({
  colSpan,
  title,
  icon,
  loading = false,
}) => (
  <tr className="hover:bg-transparent">
    <td colSpan={colSpan} className="px-4 py-16">
      <div className="flex flex-col items-center justify-center text-center">
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500">
          {loading ? <ClipboardList className="h-4 w-4 animate-pulse" /> : icon || <ClipboardList className="h-4 w-4" />}
        </div>
        <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
      </div>
    </td>
  </tr>
);

const DetailField: React.FC<DetailFieldProps> = ({ label, value }) => (
  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 dark:border-slate-800 dark:bg-slate-900/70">
    <div className="text-[11px] font-medium text-slate-400 dark:text-slate-500">{label}</div>
    <div className="mt-1.5 text-sm font-medium text-slate-900 dark:text-slate-100">{value}</div>
  </div>
);

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
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
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
  const currentStatusLabel = searchParams.status
    ? (statusMap[searchParams.status] || searchParams.status)
    : '全部状态';
  const currentTypeLabel = searchParams.leaveTypeId
    ? (leaveTypes.find((item) => String(item.id) === searchParams.leaveTypeId)?.leaveName || '指定类型')
    : '全部类型';
  const hasActiveFilters = Boolean(searchParams.status || searchParams.leaveTypeId);
  const selfServiceLocked = loadingTypes || eligibilityLoading || !canStartSelfService;

  const statusQuickFilters = [
    { label: '全部', value: '' },
    { label: '草稿', value: 'DRAFT' },
    { label: '审批中', value: 'APPROVING' },
    { label: '已通过', value: 'APPROVED' },
    { label: '已拒绝', value: 'REJECTED' },
    { label: '已撤销', value: 'CANCELLED' },
  ];

  const renderDetailValue = (value?: string | number | null) => {
    if (value === null || value === undefined || value === '') {
      return '-';
    }
    return String(value);
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

  const closeCreateDialog = () => {
    if (submitting) {
      return;
    }
    setShowDialog(false);
  };

  const closeDetailDialog = () => {
    setShowDetail(false);
    setDetailLoading(false);
    setDetailRecord(null);
  };

  const handleView = async (id: number) => {
    setShowDetail(true);
    setDetailRecord(null);
    setDetailLoading(true);
    try {
      const detail = await leaveApplicationApi.getInfo(id);
      setDetailRecord(detail);
    } catch (error) {
      closeDetailDialog();
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

  const openSubmitConfirm = (id: number) => {
    if (!ensureCanOperate()) {
      return;
    }
    setConfirmState({
      type: 'submit',
      id,
      title: '提交请假草稿',
      message: '提交后将进入审批流程。',
      confirmText: '提交',
    });
  };

  const openCancelConfirm = (id: number) => {
    if (!ensureCanOperate()) {
      return;
    }
    setConfirmState({
      type: 'cancel',
      id,
      title: '撤销请假申请',
      message: '撤销后当前申请将结束流转。',
      confirmText: '撤销',
    });
  };

  const handleConfirmAction = async () => {
    if (!confirmState) {
      return;
    }

    const currentState = confirmState;
    setConfirmState(null);

    try {
      if (currentState.type === 'submit') {
        await leaveApplicationApi.submit(currentState.id);
        toast.success('提交成功');
      } else {
        await leaveApplicationApi.cancel(currentState.id);
        toast.success('撤销成功');
      }
      await fetchList();
    } catch (error) {
      toast.error(
        getErrorMessage(error, currentState.type === 'submit' ? '提交失败' : '撤销失败'),
      );
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
    const config: Record<string, string> = {
      DRAFT: 'border border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
      APPROVING: 'border border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-200',
      APPROVED: 'border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200',
      REJECTED: 'border border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200',
      CANCELLED: 'border border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400',
    };
    const className = config[status] || config.DRAFT;
    return (
      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${className}`}>
        {statusMap[status] || status}
      </span>
    );
  };

  return (
    <div className="space-y-4">
      <div className="min-w-0">
        <div className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
          <Calendar className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-300" />
          Leave Applications
        </div>
        <h1 className="mt-1.5 text-[26px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          请假申请
        </h1>
      </div>

      {restrictionMessage ? (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{restrictionMessage}</span>
        </div>
      ) : null}

      <TablePageLayout
        className="gap-4"
        filters={(
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
            <div className="flex flex-1 flex-wrap items-center gap-2">
              {statusQuickFilters.map((filter) => (
                <Button
                  key={filter.value || 'all'}
                  variant={searchParams.status === filter.value ? 'secondary' : 'outline'}
                  size="sm"
                  onClick={() => setSearchParams((prev) => ({ ...prev, status: filter.value, pageNum: 1 }))}
                >
                  {filter.label}
                </Button>
              ))}
              <div className="w-full sm:w-[220px]">
                <Select
                  value={searchParams.leaveTypeId || ALL_FILTER_VALUE}
                  onValueChange={(value) =>
                    setSearchParams((prev) => ({
                      ...prev,
                      leaveTypeId: value === ALL_FILTER_VALUE ? '' : value,
                      pageNum: 1,
                    }))
                  }
                >
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="按请假类型筛选" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_FILTER_VALUE}>全部类型</SelectItem>
                    {leaveTypes.map((item) => (
                      <SelectItem key={item.id} value={String(item.id)}>
                        {item.leaveName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {`共 ${total} 条 · 草稿 ${draftCount} · 审批中 ${pendingCount} · 已通过 ${approvedCount}${hasActiveFilters ? ` · ${currentStatusLabel} · ${currentTypeLabel}` : ''}`}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearchParams({
                    status: '',
                    leaveTypeId: '',
                    pageNum: 1,
                    pageSize: 10,
                  });
                }}
              >
                <RotateCcw size={14} className="mr-1.5" />
                清空条件
              </Button>
              <Button variant="outline" size="sm" onClick={handleExport} disabled={loading}>
                <Download size={14} className="mr-1.5" />
                导出
              </Button>
              <Button size="sm" onClick={openCreateDialog} disabled={selfServiceLocked}>
                <Plus size={14} className="mr-1.5" />
                新建申请
              </Button>
            </div>
          </div>
        )}
        table={(
          <div className="flex min-h-[36rem] flex-col">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px]">
                <TableHeader className="sticky top-0 z-10 bg-white dark:bg-slate-950/95">
                  <tr>
                    <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                      申请单号
                    </TableHead>
                    <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                      请假类型
                    </TableHead>
                    <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                      时间区间
                    </TableHead>
                    <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                      时长
                    </TableHead>
                    <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                      原因
                    </TableHead>
                    <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                      状态
                    </TableHead>
                    <TableActionHead className="w-40 px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                      当前操作
                    </TableActionHead>
                  </tr>
                </TableHeader>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {loading ? (
                    <TableStateRow colSpan={7} title="正在加载请假申请..." loading />
                  ) : list.length === 0 ? (
                    <TableStateRow
                      colSpan={7}
                      icon={<ClipboardList className="h-4 w-4" />}
                      title={hasActiveFilters ? '当前条件下暂无记录' : '暂无请假申请'}
                    />
                  ) : (
                    list.map((item) => (
                      <tr key={item.id} className="transition hover:bg-slate-50 dark:hover:bg-slate-900/60">
                        <td className="px-4 py-2.5 text-sm text-slate-900 dark:text-slate-100">
                          {item.applicationNo || '-'}
                        </td>
                        <td className="px-4 py-2.5 text-sm text-slate-600 dark:text-slate-300">
                          {item.leaveTypeName || '-'}
                        </td>
                        <td className="px-4 py-2.5 text-sm text-slate-600 dark:text-slate-300">
                          <div>{item.startTime || '-'}</div>
                          <div className="text-xs text-slate-400 dark:text-slate-500">{item.endTime || '-'}</div>
                        </td>
                        <td className="px-4 py-2.5 text-sm text-slate-600 dark:text-slate-300">
                          {formatDuration(item)}
                        </td>
                        <td className="max-w-sm truncate px-4 py-2.5 text-sm text-slate-600 dark:text-slate-300">
                          {item.reason || '-'}
                        </td>
                        <td className="px-4 py-2.5">{getStatusBadge(item.status || 'DRAFT')}</td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-right">
                          <TableRowActions
                            align="end"
                            className="gap-1"
                            iconOnly
                            actions={[
                              {
                                label: '详情',
                                icon: <Eye size={14} />,
                                onClick: () => void handleView(item.id!),
                                tone: 'neutral',
                                className: 'rounded-lg border border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950',
                              },
                              {
                                label: '提交',
                                icon: <Send size={14} />,
                                onClick: () => openSubmitConfirm(item.id!),
                                hidden: item.status !== 'DRAFT' || selfServiceLocked,
                                tone: 'primary',
                                className: 'rounded-lg',
                              },
                              {
                                label: '撤销',
                                icon: <RotateCcw size={14} />,
                                onClick: () => openCancelConfirm(item.id!),
                                hidden: (item.status !== 'APPROVING' && item.status !== 'APPROVED') || selfServiceLocked,
                                tone: 'warning',
                                className: 'rounded-lg',
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
          </div>
        )}
        pagination={(
          total > 0 ? (
            <Pagination
              total={total}
              page={searchParams.pageNum}
              pageSize={searchParams.pageSize}
              showPageSizeSelector={false}
              showJump={false}
              onPageChange={(page) => setSearchParams((prev) => ({ ...prev, pageNum: page }))}
              onPageSizeChange={(pageSize) =>
                setSearchParams((prev) => ({ ...prev, pageSize, pageNum: 1 }))
              }
            />
          ) : null
        )}
      />

      <BaseDialog
        open={showDialog}
        title="新建请假申请"
        onClose={closeCreateDialog}
        width="wide"
        footer={(
          <>
            <Button variant="outline" onClick={closeCreateDialog} disabled={submitting}>
              取消
            </Button>
            <Button variant="outline" onClick={() => void handleSaveDraft()} disabled={submitting}>
              保存草稿
            </Button>
            <Button onClick={() => void handleCreateAndSubmit()} disabled={submitting}>
              <Send size={16} className="mr-2" />
              直接提交
            </Button>
          </>
        )}
      >
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                请假类型
              </label>
              <Select
                value={formData.leaveTypeId ? String(formData.leaveTypeId) : undefined}
                onValueChange={handleLeaveTypeChange}
              >
                <SelectTrigger className="h-11 rounded-xl">
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

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                {selectedType?.unit === 'HOUR' ? '开始时间' : '开始日期'}
              </label>
              <DatePicker
                className="h-11 rounded-xl"
                type={selectedType?.unit === 'HOUR' ? 'datetime-local' : 'date'}
                value={formData.startValue}
                onChange={(event) =>
                  setFormData((prev) => ({ ...prev, startValue: event.target.value }))
                }
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                {selectedType?.unit === 'HOUR' ? '结束时间' : '结束日期'}
              </label>
              <DatePicker
                className="h-11 rounded-xl"
                type={selectedType?.unit === 'HOUR' ? 'datetime-local' : 'date'}
                value={formData.endValue}
                onChange={(event) =>
                  setFormData((prev) => ({ ...prev, endValue: event.target.value }))
                }
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-500 dark:text-slate-400">
            <span>时长 {duration > 0 ? `${duration}${unitMap[selectedType?.unit || ''] || ''}` : '--'}</span>
            <span>{unitMap[selectedType?.unit || ''] || '--'}</span>
            <span>{selectedType?.needQuota ? '占用额度' : '不校验额度'}</span>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
              请假原因
            </label>
            <Textarea
              className="min-h-[120px] rounded-xl"
              value={formData.reason}
              onChange={(event) =>
                setFormData((prev) => ({ ...prev, reason: event.target.value }))
              }
              placeholder="填写请假原因"
            />
          </div>
        </div>
      </BaseDialog>

      <BaseDialog
        open={showDetail}
        title={detailRecord?.applicationNo || '请假详情'}
        onClose={closeDetailDialog}
        width="wide"
        headerAside={detailRecord ? getStatusBadge(detailRecord.status || 'DRAFT') : null}
        bodyClassName="space-y-4"
        footer={(
          <Button variant="outline" onClick={closeDetailDialog}>
            关闭
          </Button>
        )}
      >
        {detailLoading || !detailRecord ? (
          <InlineState title="正在加载请假详情..." className="py-12" />
        ) : (
          <>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <DetailField label="申请单号" value={renderDetailValue(detailRecord.applicationNo)} />
              <DetailField label="申请人" value={renderDetailValue(detailRecord.employeeName)} />
              <DetailField label="请假类型" value={renderDetailValue(detailRecord.leaveTypeName)} />
              <DetailField label="开始时间" value={renderDetailValue(detailRecord.startTime)} />
              <DetailField label="结束时间" value={renderDetailValue(detailRecord.endTime)} />
              <DetailField label="请假时长" value={formatDuration(detailRecord)} />
              <DetailField label="状态" value={statusMap[detailRecord.status || 'DRAFT'] || detailRecord.status || '-'} />
              <DetailField label="创建时间" value={renderDetailValue(detailRecord.createTime)} />
              <DetailField label="更新时间" value={renderDetailValue(detailRecord.updateTime)} />
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/70">
              <div className="text-sm font-medium text-slate-900 dark:text-slate-100">请假原因</div>
              <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600 dark:text-slate-300">
                {detailRecord.reason || '-'}
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/70">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm font-medium text-slate-900 dark:text-slate-100">流程轨迹</div>
                {detailRecord.processInstanceId ? (
                  <div className="text-xs text-slate-500 dark:text-slate-400">{detailRecord.processInstanceId}</div>
                ) : null}
              </div>
              {detailRecord.processInstanceId ? (
                <ProcessTrace instanceId={detailRecord.processInstanceId} />
              ) : (
                <InlineState title="暂无流程轨迹" className="py-8" />
              )}
            </div>
          </>
        )}
      </BaseDialog>

      <ConfirmDialog
        open={Boolean(confirmState)}
        title={confirmState?.title || '确认操作'}
        message={confirmState?.message || ''}
        confirmText={confirmState?.confirmText || '确定'}
        onConfirm={() => void handleConfirmAction()}
        onCancel={() => setConfirmState(null)}
      />
    </div>
  );
};

export default LeaveApplicationPage;
