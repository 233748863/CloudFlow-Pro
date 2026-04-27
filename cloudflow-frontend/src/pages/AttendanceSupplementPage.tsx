import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  CalendarClock,
  ClipboardCheck,
  Download,
  Edit,
  Eye,
  Plus,
  RotateCcw,
  Send,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  attendanceSupplementApi,
  AttendanceSupplement,
  AttendanceSupplementForm,
} from '@/services/api/attendanceSupplement';
import { useHrSelfServiceEligibility } from '@/hooks/useHrSelfServiceEligibility';
import { formatDateTimeDisplay } from '@/utils/dateFormat';
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
  type: 'delete' | 'submit';
  id: number;
  title: string;
  message: string;
  confirmText: string;
  danger?: boolean;
}

const ALL_FILTER_VALUE = '__all__';

const emptyForm = (): AttendanceSupplementForm => ({
  attendanceDate: '',
  checkType: 'CHECK_IN',
  checkTime: '09:00',
  reason: '',
});

const toTimeValue = (value?: string) => {
  if (!value) {
    return '';
  }
  const matched = value.match(/(\d{2}:\d{2})/);
  return matched ? matched[1] : value;
};

const statusMap: Record<string, string> = {
  MISSING: '草稿',
  APPROVING: '审批中',
  SUPPLEMENT: '已补录',
  REJECTED: '已驳回',
};

const checkTypeMap: Record<string, string> = {
  CHECK_IN: '签到',
  CHECK_OUT: '签退',
};

const InlineState: React.FC<InlineStateProps> = ({
  title,
  icon,
  className,
}) => (
  <div className={['flex flex-col items-center justify-center px-6 py-10 text-center', className].filter(Boolean).join(' ')}>
    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500">
      {icon || <ClipboardCheck className="h-4 w-4" />}
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
          {loading ? <ClipboardCheck className="h-4 w-4 animate-pulse" /> : icon || <ClipboardCheck className="h-4 w-4" />}
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

export const AttendanceSupplementPage: React.FC = () => {
  const [list, setList] = useState<AttendanceSupplement[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchParams, setSearchParams] = useState({
    status: '',
    checkType: '',
    pageNum: 1,
    pageSize: 10,
  });
  const [total, setTotal] = useState(0);
  const [showDialog, setShowDialog] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailRecord, setDetailRecord] = useState<AttendanceSupplement | null>(null);
  const [current, setCurrent] = useState<AttendanceSupplement | null>(null);
  const [formData, setFormData] = useState<AttendanceSupplementForm>(emptyForm);
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
  const draftCount = list.filter((item) => item.status === 'MISSING').length;
  const pendingCount = list.filter((item) => item.status === 'APPROVING').length;
  const approvedCount = list.filter((item) => item.status === 'SUPPLEMENT').length;
  const currentStatusLabel = searchParams.status
    ? (statusMap[searchParams.status] || searchParams.status)
    : '全部状态';
  const currentTypeLabel = searchParams.checkType
    ? (checkTypeMap[searchParams.checkType] || searchParams.checkType)
    : '全部类型';
  const hasActiveFilters = Boolean(searchParams.status || searchParams.checkType);
  const totalPages = Math.max(1, Math.ceil(total / searchParams.pageSize));

  const statusQuickFilters = [
    { label: '全部', value: '' },
    { label: '草稿', value: 'MISSING' },
    { label: '审批中', value: 'APPROVING' },
    { label: '已补录', value: 'SUPPLEMENT' },
    { label: '已驳回', value: 'REJECTED' },
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
      const response = await attendanceSupplementApi.list(searchParams);
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
      const detail = await attendanceSupplementApi.getInfo(id);
      setCurrent(detail);
      setFormData({
        id: detail.id,
        attendanceDate: detail.attendanceDate,
        checkType: detail.checkType,
        checkTime: toTimeValue(detail.checkTime),
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
      const detail = await attendanceSupplementApi.getInfo(id);
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
    if (!formData.attendanceDate || !formData.checkTime || !formData.reason.trim()) {
      toast.error('请完整填写补录信息');
      return;
    }

    try {
      if (current?.id) {
        await attendanceSupplementApi.edit(formData);
        toast.success('更新成功');
      } else {
        await attendanceSupplementApi.add(formData);
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
      title: '删除补录申请',
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
      title: '提交补录申请',
      message: '提交后将进入审批流程。',
      confirmText: '提交',
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
        await attendanceSupplementApi.remove([currentState.id]);
        toast.success('删除成功');
      } else {
        await attendanceSupplementApi.submit(currentState.id);
        toast.success('提交成功');
      }
      await fetchList();
    } catch (error) {
      const messageMap: Record<ConfirmState['type'], string> = {
        delete: '删除失败',
        submit: '提交失败',
      };
      toast.error(getErrorMessage(error, messageMap[currentState.type]));
    }
  };

  const handleExport = async () => {
    try {
      const blob = await attendanceSupplementApi.export(searchParams);
      const fileName = downloadBlob(blob, buildExcelFileName('考勤补录'));
      toast.success(
        total > 0
          ? `已导出 ${total} 条考勤补录申请，下载文件：${fileName}`
          : `已导出空结果，下载文件：${fileName}`,
      );
    } catch (error) {
      toast.error(getErrorMessage(error, '导出失败'));
    }
  };

  const getStatusBadge = (status: string) => {
    const config: Record<string, string> = {
      MISSING: 'border border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
      APPROVING: 'border border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-200',
      SUPPLEMENT: 'border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200',
      REJECTED: 'border border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200',
    };
    const className = config[status] || config.MISSING;
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
          <CalendarClock className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-300" />
          Attendance Supplements
        </div>
        <h1 className="mt-1.5 text-[26px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          考勤补录申请
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
                  value={searchParams.checkType || ALL_FILTER_VALUE}
                  onValueChange={(value) =>
                    setSearchParams((prev) => ({
                      ...prev,
                      checkType: value === ALL_FILTER_VALUE ? '' : value,
                      pageNum: 1,
                    }))
                  }
                >
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="按打卡类型筛选" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_FILTER_VALUE}>全部类型</SelectItem>
                    <SelectItem value="CHECK_IN">签到</SelectItem>
                    <SelectItem value="CHECK_OUT">签退</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {`共 ${total} 条 · 草稿 ${draftCount} · 审批中 ${pendingCount} · 已补录 ${approvedCount}${hasActiveFilters ? ` · ${currentStatusLabel} · ${currentTypeLabel}` : ''}`}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSearchParams({ status: '', checkType: '', pageNum: 1, pageSize: 10 })}
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
              <table className="w-full min-w-[980px]">
                <TableHeader className="sticky top-0 z-10 bg-white dark:bg-slate-950/95">
                  <tr>
                    <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                      补录单号
                    </TableHead>
                    <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                      补录日期
                    </TableHead>
                    <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                      打卡类型
                    </TableHead>
                    <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                      补录时间
                    </TableHead>
                    <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                      原因
                    </TableHead>
                    <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                      状态
                    </TableHead>
                    <TableActionHead className="w-52 px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                      当前操作
                    </TableActionHead>
                  </tr>
                </TableHeader>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {loading ? (
                    <TableStateRow colSpan={7} title="正在加载补录申请..." loading />
                  ) : list.length === 0 ? (
                    <TableStateRow
                      colSpan={7}
                      icon={<ClipboardCheck className="h-4 w-4" />}
                      title={hasActiveFilters ? '当前条件下暂无记录' : '暂无考勤补录申请'}
                    />
                  ) : (
                    list.map((item) => (
                      <tr key={item.id} className="transition hover:bg-slate-50 dark:hover:bg-slate-900/60">
                        <td className="px-4 py-2.5 text-sm text-slate-900 dark:text-slate-100">
                          {item.supplementNo || '-'}
                        </td>
                        <td className="px-4 py-2.5 text-sm text-slate-600 dark:text-slate-300">
                          {item.attendanceDate || '-'}
                        </td>
                        <td className="px-4 py-2.5 text-sm text-slate-600 dark:text-slate-300">
                          {checkTypeMap[item.checkType] || item.checkType}
                        </td>
                        <td className="px-4 py-2.5 text-sm text-slate-600 dark:text-slate-300">
                          {toTimeValue(item.checkTime) || '-'}
                        </td>
                        <td className="max-w-xs truncate px-4 py-2.5 text-sm text-slate-600 dark:text-slate-300">
                          {item.reason || '-'}
                        </td>
                        <td className="px-4 py-2.5">{getStatusBadge(item.status || 'MISSING')}</td>
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
                                hidden: item.status !== 'MISSING' || selfServiceLocked,
                                className: 'rounded-lg',
                              },
                              {
                                label: '提交',
                                icon: <Send size={14} />,
                                onClick: () => openSubmitConfirm(item.id!),
                                tone: 'success',
                                hidden: item.status !== 'MISSING' || selfServiceLocked,
                                className: 'rounded-lg',
                              },
                              {
                                label: '删除',
                                icon: <Trash2 size={14} />,
                                onClick: () => openDeleteConfirm(item.id!),
                                tone: 'danger',
                                hidden: item.status !== 'MISSING' || selfServiceLocked,
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
        title={current ? '编辑补录申请' : '新建补录申请'}
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
                补录日期
              </label>
              <DatePicker
                className="h-11 rounded-xl"
                type="date"
                value={formData.attendanceDate}
                onChange={(event) =>
                  setFormData((prev) => ({ ...prev, attendanceDate: event.target.value }))
                }
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                打卡类型
              </label>
              <Select
                value={formData.checkType}
                onValueChange={(value) => setFormData((prev) => ({ ...prev, checkType: value }))}
              >
                <SelectTrigger className="h-11 rounded-xl">
                  <SelectValue placeholder="请选择打卡类型" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CHECK_IN">签到</SelectItem>
                  <SelectItem value="CHECK_OUT">签退</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
              补录时间
            </label>
            <DatePicker
              className="h-11 rounded-xl"
              type="time"
              value={formData.checkTime}
              onChange={(event) =>
                setFormData((prev) => ({ ...prev, checkTime: event.target.value }))
              }
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
              补录原因
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
        title={detailRecord?.supplementNo || '补录详情'}
        onClose={closeDetailDialog}
        width="wide"
        headerAside={detailRecord ? getStatusBadge(detailRecord.status || 'MISSING') : null}
        bodyClassName="space-y-4"
        footer={(
          <Button variant="outline" onClick={closeDetailDialog}>
            关闭
          </Button>
        )}
      >
        {detailLoading || !detailRecord ? (
          <InlineState title="正在加载补录详情..." className="py-12" />
        ) : (
          <>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <DetailField label="补录单号" value={renderDetailValue(detailRecord.supplementNo)} />
              <DetailField label="申请人" value={renderDetailValue(detailRecord.employeeName)} />
              <DetailField label="补录日期" value={renderDetailValue(detailRecord.attendanceDate)} />
              <DetailField label="打卡类型" value={checkTypeMap[detailRecord.checkType] || detailRecord.checkType} />
              <DetailField label="补录时间" value={renderDetailValue(detailRecord.checkTime)} />
              <DetailField label="创建时间" value={formatDateTimeDisplay(detailRecord.createTime)} />
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/70">
              <div className="text-sm font-medium text-slate-900 dark:text-slate-100">补录原因</div>
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

export default AttendanceSupplementPage;
