import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Clock,
  Download,
  Edit,
  Eye,
  Plus,
  RotateCcw,
  Send,
  Timer,
  Trash2,
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
} from '@/components/common';
import { TableRowActions } from '@/components/common/table-row-actions';

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
  type: 'delete' | 'submit' | 'cancel';
  id: number;
  title: string;
  message: string;
  confirmText: string;
  danger?: boolean;
}

const ALL_FILTER_VALUE = '__all__';

const emptyForm = (): OvertimeApplicationForm => ({
  overtimeType: 'WORKDAY',
  compensationType: 'PAYMENT',
  startTime: '',
  endTime: '',
  reason: '',
});

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

const InlineState: React.FC<InlineStateProps> = ({
  title,
  icon,
  className,
}) => (
  <div className={['flex flex-col items-center justify-center px-6 py-10 text-center', className].filter(Boolean).join(' ')}>
    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500">
      {icon || <Timer className="h-4 w-4" />}
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
          {loading ? <Timer className="h-4 w-4 animate-pulse" /> : icon || <Timer className="h-4 w-4" />}
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

const calculateDurationHours = (startTime: string, endTime: string) => {
  if (!startTime || !endTime) {
    return 0;
  }
  const start = new Date(startTime).getTime();
  const end = new Date(endTime).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return 0;
  }
  return Math.round(((end - start) / 3600000) * 10) / 10;
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
  const [showDetail, setShowDetail] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailRecord, setDetailRecord] = useState<OvertimeApplication | null>(null);
  const [current, setCurrent] = useState<OvertimeApplication | null>(null);
  const [formData, setFormData] = useState<OvertimeApplicationForm>(emptyForm);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
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
  const formDuration = useMemo(
    () => calculateDurationHours(formData.startTime, formData.endTime),
    [formData.endTime, formData.startTime],
  );
  const draftCount = list.filter((item) => item.status === 'DRAFT').length;
  const pendingCount = list.filter((item) => item.status === 'APPROVING').length;
  const approvedCount = list.filter((item) => item.status === 'APPROVED').length;
  const totalHours = list.reduce((sum, item) => sum + Number(item.duration || 0), 0);
  const currentStatusLabel = searchParams.status
    ? (statusMap[searchParams.status] || searchParams.status)
    : '全部状态';
  const currentTypeLabel = searchParams.overtimeType
    ? (overtimeTypeMap[searchParams.overtimeType] || searchParams.overtimeType)
    : '全部类型';
  const hasActiveFilters = Boolean(searchParams.status || searchParams.overtimeType);

  const statusQuickFilters = [
    { label: '全部', value: '' },
    { label: '草稿', value: 'DRAFT' },
    { label: '审批中', value: 'APPROVING' },
    { label: '已通过', value: 'APPROVED' },
    { label: '已驳回', value: 'REJECTED' },
    { label: '已取消', value: 'CANCELLED' },
  ];

  const renderDetailValue = (value?: string | number | null) => {
    if (value === null || value === undefined || value === '') {
      return '-';
    }
    return String(value);
  };

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

  const closeDialog = () => {
    setShowDialog(false);
    setCurrent(null);
    setFormData(emptyForm());
  };

  const closeDetailDialog = () => {
    setShowDetail(false);
    setDetailLoading(false);
    setDetailRecord(null);
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

  const handleView = async (id: number) => {
    setShowDetail(true);
    setDetailRecord(null);
    setDetailLoading(true);
    try {
      const detail = await overtimeApplicationApi.getInfo(id);
      setDetailRecord(detail);
    } catch (error) {
      closeDetailDialog();
      toast.error(getErrorMessage(error, '获取详情失败'));
    } finally {
      setDetailLoading(false);
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

    const duration = calculateDurationHours(formData.startTime, formData.endTime);
    if (duration <= 0) {
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
      closeDialog();
      await fetchList();
    } catch (error) {
      toast.error(getErrorMessage(error, '保存失败'));
    }
  };

  const openDeleteConfirm = (id: number) => {
    if (!ensureCanOperate()) {
      return;
    }
    setConfirmState({
      type: 'delete',
      id,
      title: '删除加班申请',
      message: '删除后当前草稿不可恢复。',
      confirmText: '删除',
      danger: true,
    });
  };

  const openSubmitConfirm = (id: number) => {
    if (!ensureCanOperate()) {
      return;
    }
    setConfirmState({
      type: 'submit',
      id,
      title: '提交加班申请',
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
      title: '撤销加班申请',
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
      if (currentState.type === 'delete') {
        await overtimeApplicationApi.remove([currentState.id]);
        toast.success('删除成功');
      } else if (currentState.type === 'submit') {
        await overtimeApplicationApi.submit(currentState.id);
        toast.success('提交成功');
      } else {
        await overtimeApplicationApi.cancel(currentState.id);
        toast.success('撤销成功');
      }
      await fetchList();
    } catch (error) {
      const messageMap: Record<ConfirmState['type'], string> = {
        delete: '删除失败',
        submit: '提交失败',
        cancel: '撤销失败',
      };
      toast.error(getErrorMessage(error, messageMap[currentState.type]));
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
          <Clock className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-300" />
          Overtime Applications
        </div>
        <h1 className="mt-1.5 text-[26px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          加班申请
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
                  value={searchParams.overtimeType || ALL_FILTER_VALUE}
                  onValueChange={(value) =>
                    setSearchParams((prev) => ({
                      ...prev,
                      overtimeType: value === ALL_FILTER_VALUE ? '' : value,
                      pageNum: 1,
                    }))
                  }
                >
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="按加班类型筛选" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_FILTER_VALUE}>全部类型</SelectItem>
                    <SelectItem value="WORKDAY">工作日</SelectItem>
                    <SelectItem value="WEEKEND">周末</SelectItem>
                    <SelectItem value="HOLIDAY">节假日</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {`共 ${total} 条 · 草稿 ${draftCount} · 审批中 ${pendingCount} · 已通过 ${approvedCount} · 累计 ${totalHours.toFixed(1)} h${hasActiveFilters ? ` · ${currentStatusLabel} · ${currentTypeLabel}` : ''}`}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSearchParams({ status: '', overtimeType: '', pageNum: 1, pageSize: 10 })}
              >
                <RotateCcw size={14} className="mr-1.5" />
                清空条件
              </Button>
              <Button variant="outline" size="sm" onClick={handleExport} disabled={loading}>
                <Download size={14} className="mr-1.5" />
                导出
              </Button>
              <Button size="sm" onClick={handleAdd} disabled={selfServiceLocked}>
                <Plus size={14} className="mr-1.5" />
                新建申请
              </Button>
            </div>
          </div>
        )}
        table={(
          <div className="flex min-h-[36rem] flex-col">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px]">
                <TableHeader className="sticky top-0 z-10 bg-white dark:bg-slate-950/95">
                  <tr>
                    <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                      申请单号
                    </TableHead>
                    <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                      加班类型
                    </TableHead>
                    <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                      时间区间
                    </TableHead>
                    <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                      时长
                    </TableHead>
                    <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                      补偿方式
                    </TableHead>
                    <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                      状态
                    </TableHead>
                    <TableActionHead className="w-56 px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                      当前操作
                    </TableActionHead>
                  </tr>
                </TableHeader>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {loading ? (
                    <TableStateRow colSpan={7} title="正在加载加班申请..." loading />
                  ) : list.length === 0 ? (
                    <TableStateRow
                      colSpan={7}
                      icon={<Timer className="h-4 w-4" />}
                      title={hasActiveFilters ? '当前条件下暂无记录' : '暂无加班申请'}
                    />
                  ) : (
                    list.map((item) => (
                      <tr key={item.id} className="transition hover:bg-slate-50 dark:hover:bg-slate-900/60">
                        <td className="px-4 py-2.5 text-sm text-slate-900 dark:text-slate-100">
                          {item.applicationNo || '-'}
                        </td>
                        <td className="px-4 py-2.5 text-sm text-slate-600 dark:text-slate-300">
                          {overtimeTypeMap[item.overtimeType] || item.overtimeType}
                        </td>
                        <td className="px-4 py-2.5 text-sm text-slate-600 dark:text-slate-300">
                          <div>{item.startTime || '-'}</div>
                          <div className="text-xs text-slate-400 dark:text-slate-500">{item.endTime || '-'}</div>
                        </td>
                        <td className="px-4 py-2.5 text-sm font-medium text-slate-900 dark:text-slate-100">
                          {item.duration ? `${item.duration} 小时` : '-'}
                        </td>
                        <td className="px-4 py-2.5 text-sm text-slate-600 dark:text-slate-300">
                          {compensationTypeMap[item.compensationType] || item.compensationType}
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
                                label: '编辑',
                                icon: <Edit size={14} />,
                                onClick: () => void handleEdit(item.id!),
                                tone: 'primary',
                                hidden: item.status !== 'DRAFT' || selfServiceLocked,
                                className: 'rounded-lg',
                              },
                              {
                                label: '提交',
                                icon: <Send size={14} />,
                                onClick: () => openSubmitConfirm(item.id!),
                                tone: 'success',
                                hidden: item.status !== 'DRAFT' || selfServiceLocked,
                                className: 'rounded-lg',
                              },
                              {
                                label: '删除',
                                icon: <Trash2 size={14} />,
                                onClick: () => openDeleteConfirm(item.id!),
                                tone: 'danger',
                                hidden: item.status !== 'DRAFT' || selfServiceLocked,
                                className: 'rounded-lg',
                              },
                              {
                                label: '撤销',
                                icon: <RotateCcw size={14} />,
                                onClick: () => openCancelConfirm(item.id!),
                                tone: 'warning',
                                hidden: !item.status || !['APPROVING', 'APPROVED'].includes(item.status) || selfServiceLocked,
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
        title={current ? '编辑加班申请' : '新建加班申请'}
        onClose={closeDialog}
        width="wide"
        footer={(
          <>
            <Button variant="outline" onClick={closeDialog}>
              取消
            </Button>
            <Button onClick={() => void handleSave()}>保存</Button>
          </>
        )}
      >
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                加班类型
              </label>
              <Select
                value={formData.overtimeType}
                onValueChange={(value) => setFormData((prev) => ({ ...prev, overtimeType: value }))}
              >
                <SelectTrigger className="h-11 rounded-xl">
                  <SelectValue placeholder="请选择加班类型" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="WORKDAY">工作日</SelectItem>
                  <SelectItem value="WEEKEND">周末</SelectItem>
                  <SelectItem value="HOLIDAY">节假日</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                补偿方式
              </label>
              <Select
                value={formData.compensationType}
                onValueChange={(value) =>
                  setFormData((prev) => ({ ...prev, compensationType: value }))
                }
              >
                <SelectTrigger className="h-11 rounded-xl">
                  <SelectValue placeholder="请选择补偿方式" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PAYMENT">加班费</SelectItem>
                  <SelectItem value="TIME_OFF">调休</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                开始时间
              </label>
              <DatePicker
                className="h-11 rounded-xl"
                type="datetime-local"
                value={formData.startTime}
                onChange={(event) =>
                  setFormData((prev) => ({ ...prev, startTime: event.target.value }))
                }
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                结束时间
              </label>
              <DatePicker
                className="h-11 rounded-xl"
                type="datetime-local"
                value={formData.endTime}
                onChange={(event) =>
                  setFormData((prev) => ({ ...prev, endTime: event.target.value }))
                }
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-500 dark:text-slate-400">
            <span>时长 {formDuration > 0 ? `${formDuration} 小时` : '--'}</span>
            <span>{overtimeTypeMap[formData.overtimeType] || '--'}</span>
            <span>{compensationTypeMap[formData.compensationType] || '--'}</span>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
              加班事由
            </label>
            <Textarea
              className="min-h-[120px] rounded-xl"
              value={formData.reason}
              onChange={(event) =>
                setFormData((prev) => ({ ...prev, reason: event.target.value }))
              }
            />
          </div>
        </div>
      </BaseDialog>

      <BaseDialog
        open={showDetail}
        title={detailRecord?.applicationNo || '加班详情'}
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
          <InlineState title="正在加载加班详情..." className="py-12" />
        ) : (
          <>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <DetailField label="申请单号" value={renderDetailValue(detailRecord.applicationNo)} />
              <DetailField label="申请人" value={renderDetailValue(detailRecord.employeeName)} />
              <DetailField label="加班类型" value={overtimeTypeMap[detailRecord.overtimeType] || detailRecord.overtimeType} />
              <DetailField label="补偿方式" value={compensationTypeMap[detailRecord.compensationType] || detailRecord.compensationType} />
              <DetailField label="开始时间" value={renderDetailValue(detailRecord.startTime)} />
              <DetailField label="结束时间" value={renderDetailValue(detailRecord.endTime)} />
              <DetailField label="加班时长" value={detailRecord.duration ? `${detailRecord.duration} 小时` : '-'} />
              <DetailField label="状态" value={statusMap[detailRecord.status || 'DRAFT'] || detailRecord.status || '-'} />
              <DetailField label="创建时间" value={renderDetailValue(detailRecord.createTime)} />
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/70">
              <div className="text-sm font-medium text-slate-900 dark:text-slate-100">加班事由</div>
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
        danger={confirmState?.danger}
        onConfirm={() => void handleConfirmAction()}
        onCancel={() => setConfirmState(null)}
      />
    </div>
  );
};

export default OvertimeApplicationPage;
