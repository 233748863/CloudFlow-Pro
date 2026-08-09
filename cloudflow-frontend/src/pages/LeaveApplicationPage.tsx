import React, { useEffect, useMemo, useState } from 'react';
import { getConfigIntSync } from '../hooks/useSystemConfig';
import { SYS_PAGE_DEFAULT_PAGE_SIZE } from '../constants/sysConfig';
import { useWorkflowRefresh } from '@/hooks/useWorkflowRefresh';
import {
  AlertCircle,
  Calendar,
  ClipboardList,
  Download,
  Edit,
  Eye,
  Plus,
  RefreshCw,
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
import { formatDateTimeDisplay, toBackendDateString } from '@/utils/dateFormat';
import { BaseDialog } from '@/components/common/BaseDialog';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { ListResultFooter } from '@/components/common/ListResultFooter';
import { ProcessTrace } from '@/components/ProcessTrace';
import {
  Button,
  DatePicker,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@/components/common';
import { useDict } from '@/hooks/useDict';
import { DictBadge } from '@/components/common/DictBadge';
import { InnerTableSurface, TablePageLayout } from '@/components/layout/TablePageLayout';

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


const InlineState: React.FC<InlineStateProps> = ({
  title,
  icon,
  className,
}) => (
  <div className={['flex flex-col items-center justify-center px-6 py-10 text-center', className].filter(Boolean).join(' ')}>
    <div className="admin-source-stat-icon mb-3">
      {icon || <ClipboardList className="h-4 w-4" />}
    </div>
    <div className="text-sm font-medium text-cf-title">{title}</div>
  </div>
);

const TableStateRow: React.FC<TableStateRowProps> = ({
  colSpan,
  title,
  icon,
  loading = false,
}) => (
  <tr className="hover:bg-transparent">
    <td colSpan={colSpan} className="px-4 py-10">
      <div className="flex flex-col items-center justify-center text-center">
        <div className="admin-source-stat-icon mb-3">
          {loading ? <ClipboardList className="h-4 w-4" /> : icon || <ClipboardList className="h-4 w-4" />}
        </div>
        <div className="text-sm font-medium text-cf-title">{title}</div>
      </div>
    </td>
  </tr>
);

const DetailField: React.FC<DetailFieldProps> = ({ label, value }) => (
  <div className="border-b border-slate-200 pb-3 dark:border-slate-800">
    <div className="text-[11px] font-medium text-cf-faint">{label}</div>
    <div className="mt-1.5 text-sm leading-6 text-cf-title">{value}</div>
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

export const LeaveApplicationPage: React.FC = () => {
  const statusDict = useDict('hr_leave_status');
  const unitDict = useDict('hr_leave_unit');
  const formatDuration = (item: LeaveApplication) =>
    `${item.duration}${unitDict.getLabel(item.unit || '') || ''}`;
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
    pageSize: getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10),
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

  useEffect(() => {
    void loadLeaveTypes();
  }, []);

  useEffect(() => {
    void fetchList();
  }, [searchParams]);

  useWorkflowRefresh(fetchList, 'LEAVE');

  const selectedType = useMemo(
    () => leaveTypes.find((item) => item.id === formData.leaveTypeId),
    [formData.leaveTypeId, leaveTypes],
  );
  const duration = useMemo(() => calculateDuration(selectedType, formData), [formData, selectedType]);

  const draftCount = list.filter((item) => item.status === 'DRAFT').length;
  const pendingCount = list.filter((item) => item.status === 'APPROVING').length;
  const approvedCount = list.filter((item) => item.status === 'APPROVED').length;
  const currentStatusLabel = searchParams.status
    ? (statusDict.getLabel(searchParams.status) || '未配置状态')
    : '全部状态';
  const currentTypeLabel = searchParams.leaveTypeId
    ? (leaveTypes.find((item) => String(item.id) === searchParams.leaveTypeId)?.leaveName || '指定类型')
    : '全部类型';
  const hasActiveFilters = Boolean(searchParams.status || searchParams.leaveTypeId);
  const resultSummary = hasActiveFilters ? `${currentStatusLabel} / ${currentTypeLabel}` : '全部请假';
  const totalPages = Math.max(1, Math.ceil(total / searchParams.pageSize));
  const selfServiceLocked = loadingTypes || eligibilityLoading || !canStartSelfService;
  const metrics = [
    { label: '请假申请', value: String(total), meta: `当前页 ${list.length}`, icon: <ClipboardList size={18} />, tone: 'blue' },
    { label: '草稿', value: String(draftCount), meta: '待提交', icon: <Edit size={18} />, tone: 'amber' },
    { label: '审批中', value: String(pendingCount), meta: '流程流转', icon: <Send size={18} />, tone: 'violet' },
    { label: '已通过', value: String(approvedCount), meta: '已归档', icon: <Calendar size={18} />, tone: 'green' },
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

  const getStatusBadge = (status: string) => (
    <DictBadge dictType="hr_leave_status" value={String(status || 'DRAFT')} />
  );

  const pageActions = (
    <div className="grid gap-5">
      <header className="admin-source-header">
        <div>
          <p className="admin-source-kicker">LEAVE APPLICATIONS</p>
          <h2>请假申请</h2>
          <span>跟踪请假类型、时间区间、时长、审批状态和流程轨迹</span>
        </div>
        <div className="admin-source-controls">
          <Button variant="outline" size="sm" onClick={() => void fetchList()} disabled={loading}>
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            刷新
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport} disabled={loading}>
            <Download size={16} />
            导出
          </Button>
          <Button size="sm" onClick={openCreateDialog} disabled={selfServiceLocked}>
            <Plus size={16} />
            新建申请
          </Button>
        </div>
      </header>

      {restrictionMessage ? (
        <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{restrictionMessage}</span>
        </div>
      ) : null}

      <section className="admin-source-stat-grid">
        {metrics.map((metric) => (
          <article key={metric.label} className={`card admin-source-stat admin-source-tone-${metric.tone}`}>
            <div className="admin-source-stat-icon">{metric.icon}</div>
            <div>
              <p>{metric.label}</p>
              <strong>{metric.value}</strong>
              <span>{metric.meta}</span>
            </div>
          </article>
        ))}
      </section>
    </div>
  );

  const pageFilters = (
    <section className="card admin-users-toolbar">
      <div className="admin-oa-filter-grid">
        <label>
          <span className="input-label">状态</span>
          <Select value={searchParams.status || ALL_FILTER_VALUE} onValueChange={(value) => setSearchParams((prev) => ({ ...prev, status: value === ALL_FILTER_VALUE ? '' : value, pageNum: 1 }))}>
            <SelectTrigger className="h-[42px]"><SelectValue placeholder="全部状态" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_FILTER_VALUE}>全部状态</SelectItem>
              {statusDict.getOptions().map((filter) => <SelectItem key={filter.value} value={filter.value}>{filter.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </label>
        <label>
          <span className="input-label">请假类型</span>
          <Select value={searchParams.leaveTypeId || ALL_FILTER_VALUE} onValueChange={(value) => setSearchParams((prev) => ({ ...prev, leaveTypeId: value === ALL_FILTER_VALUE ? '' : value, pageNum: 1 }))}>
            <SelectTrigger className="h-[42px]"><SelectValue placeholder="全部类型" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_FILTER_VALUE}>全部类型</SelectItem>
              {leaveTypes.map((item) => <SelectItem key={item.id} value={String(item.id)}>{item.leaveName}</SelectItem>)}
            </SelectContent>
          </Select>
        </label>
        <div className="admin-users-toolbar-actions">
          <Button variant="outline" size="sm" onClick={() => setSearchParams({ status: '', leaveTypeId: '', pageNum: 1, pageSize: getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10) })} disabled={!hasActiveFilters}>
            <RotateCcw size={14} />重置
          </Button>
        </div>
      </div>
    </section>
  );

  const pageTable = (
    <InnerTableSurface>
      <table className="unity-data-table admin-source-table min-w-[980px]">
          <thead>
            <tr>
              <th>申请单号</th>
              <th>请假类型</th>
              <th>时间区间</th>
              <th>时长</th>
              <th>原因</th>
              <th>状态</th>
              <th className="text-right">当前操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableStateRow colSpan={7} title="正在加载请假申请..." loading />
            ) : list.length === 0 ? (
              <TableStateRow colSpan={7} icon={<ClipboardList className="h-4 w-4" />} title={hasActiveFilters ? '当前条件下暂无记录' : '暂无请假申请'} />
            ) : (
              list.map((item) => (
                <tr key={item.id}>
                  <td><strong>{item.applicationNo || '-'}</strong></td>
                  <td>{item.leaveTypeName || '-'}</td>
                  <td>
                    <div>{formatDateTimeDisplay(item.startTime)}</div>
                    <div className="mt-1 text-xs text-cf-subtle">{formatDateTimeDisplay(item.endTime)}</div>
                  </td>
                  <td>{formatDuration(item)}</td>
                  <td><div className="max-w-sm truncate">{item.reason || '-'}</div></td>
                  <td>{getStatusBadge(item.status || 'DRAFT')}</td>
                  <td>
                    <div className="admin-users-row-actions">
                      <button type="button" data-tooltip="详情" aria-label="详情" onClick={() => void handleView(item.id!)}><Eye size={15} /></button>
                      {item.status === 'DRAFT' && !selfServiceLocked ? <button type="button" data-tooltip="提交" aria-label="提交" onClick={() => openSubmitConfirm(item.id!)}><Send size={15} /></button> : null}
                      {(item.status === 'APPROVING' || item.status === 'APPROVED') && !selfServiceLocked ? <button type="button" data-tooltip="撤销" aria-label="撤销" onClick={() => openCancelConfirm(item.id!)}><RotateCcw size={15} /></button> : null}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
      </table>
    </InnerTableSurface>
  );

  const pagePagination = (
    <ListResultFooter
      total={total}
      page={searchParams.pageNum}
      pageSize={searchParams.pageSize}
      summary={resultSummary}
      onPageChange={(page) => setSearchParams((prev) => ({ ...prev, pageNum: page }))}
      onPageSizeChange={(pageSize) => setSearchParams((prev) => ({ ...prev, pageSize, pageNum: 1 }))}
    />
  );

  return (
    <>
      <section className="admin-source-page oa-approval-page leave-application-page">
        <TablePageLayout
          actions={pageActions}
          filters={pageFilters}
          table={pageTable}
          pagination={pagePagination}
        />
      </section>

      <BaseDialog
        open={showDialog}
        title="新建请假申请"
        onClose={closeCreateDialog}
        width="wide"
        bodyClassName="admin-dialog-stack"
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
        <div className="admin-dialog-stack">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="admin-dialog-field">
              <Label>请假类型</Label>
              <Select
                value={formData.leaveTypeId ? String(formData.leaveTypeId) : undefined}
                onValueChange={handleLeaveTypeChange}
              >
                <SelectTrigger className="h-11">
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

            <div className="admin-dialog-field">
              <Label>{selectedType?.unit === 'HOUR' ? '开始时间' : '开始日期'}</Label>
              <DatePicker
                className="h-11"
                type={selectedType?.unit === 'HOUR' ? 'datetime-local' : 'date'}
                value={formData.startValue}
                onChange={(event) =>
                  setFormData((prev) => ({ ...prev, startValue: event.target.value }))
                }
              />
            </div>

            <div className="admin-dialog-field">
              <Label>{selectedType?.unit === 'HOUR' ? '结束时间' : '结束日期'}</Label>
              <DatePicker
                className="h-11"
                type={selectedType?.unit === 'HOUR' ? 'datetime-local' : 'date'}
                value={formData.endValue}
                onChange={(event) =>
                  setFormData((prev) => ({ ...prev, endValue: event.target.value }))
                }
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-cf-subtle">
            <span>时长 {duration > 0 ? `${duration}${unitDict.getLabel(selectedType?.unit || '') || ''}` : '--'}</span>
            <span>{unitDict.getLabel(selectedType?.unit || '') || '--'}</span>
            <span>{selectedType?.needQuota ? '占用额度' : '不校验额度'}</span>
          </div>

          <div className="admin-dialog-field">
            <Label>请假原因</Label>
            <Textarea
              className="min-h-[120px]"
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
        bodyClassName="admin-dialog-stack"
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
              <DetailField label="开始时间" value={formatDateTimeDisplay(detailRecord.startTime)} />
              <DetailField label="结束时间" value={formatDateTimeDisplay(detailRecord.endTime)} />
              <DetailField label="请假时长" value={formatDuration(detailRecord)} />
              <DetailField label="状态" value={statusDict.getLabel(detailRecord.status || 'DRAFT') || '-'} />
              <DetailField label="创建时间" value={formatDateTimeDisplay(detailRecord.createTime)} />
              <DetailField label="更新时间" value={formatDateTimeDisplay(detailRecord.updateTime)} />
            </div>

            <section className="table-scroll-container admin-inner-table-surface admin-source-panel">
              <div className="admin-source-panel-head">
                <div>
                  <h3>请假原因</h3>
                </div>
              </div>
              <div className="whitespace-pre-wrap text-sm leading-6 text-cf-muted">
                {detailRecord.reason || '-'}
              </div>
            </section>

            <section className="table-scroll-container admin-inner-table-surface admin-source-panel">
              <div className="admin-source-panel-head">
                <div>
                  <h3>流程轨迹</h3>
                </div>
                {detailRecord.processInstanceId ? (
                  <div className="text-xs text-cf-subtle">{detailRecord.processInstanceId}</div>
                ) : null}
              </div>
              <div>
                {detailRecord.processInstanceId ? (
                  <ProcessTrace instanceId={detailRecord.processInstanceId} />
                ) : (
                  <InlineState title="暂无流程轨迹" className="py-6" />
                )}
              </div>
            </section>
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
    </>
  );
};

export default LeaveApplicationPage;
