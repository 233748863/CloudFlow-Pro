import React, { useEffect, useMemo, useState } from 'react';
import { getConfigIntSync } from '../hooks/useSystemConfig';
import { SYS_PAGE_DEFAULT_PAGE_SIZE } from '../constants/sysConfig';
import { useWorkflowRefresh } from '@/hooks/useWorkflowRefresh';
import {
  AlertCircle,
  Clock,
  Download,
  Edit,
  Eye,
  Plus,
  RefreshCw,
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
import { formatDateTimeDisplay, toBackendDateString, toLocalDatetimeString } from '@/utils/dateFormat';
import { buildExcelFileName, downloadBlob } from '@/utils/download';
import { getErrorMessage } from '@/utils/errorMessage';
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

const InlineState: React.FC<InlineStateProps> = ({
  title,
  icon,
  className,
}) => (
  <div className={['flex flex-col items-center justify-center px-6 py-10 text-center', className].filter(Boolean).join(' ')}>
    <div className="admin-source-stat-icon mb-3">
      {icon || <Timer className="h-4 w-4" />}
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
          {loading ? <Timer className="h-4 w-4" /> : icon || <Timer className="h-4 w-4" />}
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
  const statusDict = useDict('hr_overtime_status');
  const typeDict = useDict('hr_overtime_type');
  const compensationDict = useDict('hr_overtime_compensation_type');
  const [list, setList] = useState<OvertimeApplication[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchParams, setSearchParams] = useState({
    status: '',
    overtimeType: '',
    pageNum: 1,
    pageSize: getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10),
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

  useEffect(() => {
    void fetchList();
  }, [searchParams]);

  useWorkflowRefresh(fetchList, 'OVERTIME');

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
    ? (statusDict.getLabel(searchParams.status) || '未配置状态')
    : '全部状态';
  const currentTypeLabel = searchParams.overtimeType
    ? (typeDict.getLabel(searchParams.overtimeType) || '未配置类型')
    : '全部类型';
  const hasActiveFilters = Boolean(searchParams.status || searchParams.overtimeType);
  const totalPages = Math.max(1, Math.ceil(total / searchParams.pageSize));
  const resultSummary = hasActiveFilters ? `${currentStatusLabel} / ${currentTypeLabel}` : '全部加班';
  const metrics = [
    { label: '加班申请', value: String(total), meta: `当前页 ${list.length}`, icon: <Timer size={18} />, tone: 'blue' },
    { label: '草稿', value: String(draftCount), meta: '待提交', icon: <Edit size={18} />, tone: 'amber' },
    { label: '审批中', value: String(pendingCount), meta: '流程流转', icon: <Send size={18} />, tone: 'violet' },
    { label: '累计时长', value: `${totalHours.toFixed(1)}h`, meta: `已通过 ${approvedCount}`, icon: <Clock size={18} />, tone: 'green' },
  ];

  const renderDetailValue = (value?: string | number | null) => {
    if (value === null || value === undefined || value === '') {
      return '-';
    }
    return String(value);
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

  const getStatusBadge = (status: string) => (
    <DictBadge dictType="hr_overtime_status" value={String(status || 'DRAFT')} />
  );

  const pageActions = (
    <div className="grid gap-5">
      <header className="admin-source-header">
        <div>
          <p className="admin-source-kicker">OVERTIME APPLICATIONS</p>
          <h2>加班申请</h2>
          <span>跟踪加班类型、补偿方式、累计时长和审批状态</span>
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
          <Button size="sm" onClick={handleAdd} disabled={selfServiceLocked}>
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
          <span className="input-label">加班类型</span>
          <Select value={searchParams.overtimeType || ALL_FILTER_VALUE} onValueChange={(value) => setSearchParams((prev) => ({ ...prev, overtimeType: value === ALL_FILTER_VALUE ? '' : value, pageNum: 1 }))}>
            <SelectTrigger className="h-[42px]"><SelectValue placeholder="全部类型" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_FILTER_VALUE}>全部类型</SelectItem>
              {typeDict.getOptions().map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </label>
        <div className="admin-users-toolbar-actions">
          <Button variant="outline" size="sm" onClick={() => setSearchParams({ status: '', overtimeType: '', pageNum: 1, pageSize: getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10) })} disabled={!hasActiveFilters}>
            <RotateCcw size={14} />重置
          </Button>
        </div>
      </div>
    </section>
  );

  const pageTable = (
    <InnerTableSurface>
      <table className="unity-data-table admin-source-table min-w-[1100px]">
          <thead>
            <tr>
              <th>申请单号</th>
              <th>加班类型</th>
              <th>时间区间</th>
              <th>时长</th>
              <th>补偿方式</th>
              <th>状态</th>
              <th className="text-right">当前操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableStateRow colSpan={7} title="正在加载加班申请..." loading />
            ) : list.length === 0 ? (
              <TableStateRow colSpan={7} icon={<Timer className="h-4 w-4" />} title={hasActiveFilters ? '当前条件下暂无记录' : '暂无加班申请'} />
            ) : (
              list.map((item) => (
                <tr key={item.id}>
                  <td><strong>{item.applicationNo || '-'}</strong></td>
                  <td>{typeDict.getLabel(item.overtimeType || '') || '-'}</td>
                  <td>
                    <div>{formatDateTimeDisplay(item.startTime)}</div>
                    <div className="mt-1 text-xs text-cf-subtle">{formatDateTimeDisplay(item.endTime)}</div>
                  </td>
                  <td>{item.duration ? `${item.duration} 小时` : '-'}</td>
                  <td>{compensationDict.getLabel(item.compensationType || '') || '-'}</td>
                  <td>{getStatusBadge(item.status || 'DRAFT')}</td>
                  <td>
                    <div className="admin-users-row-actions">
                      <button type="button" data-tooltip="详情" aria-label="详情" onClick={() => void handleView(item.id!)}><Eye size={15} /></button>
                      {item.status === 'DRAFT' && !selfServiceLocked ? <button type="button" data-tooltip="编辑" aria-label="编辑" onClick={() => void handleEdit(item.id!)}><Edit size={15} /></button> : null}
                      {item.status === 'DRAFT' && !selfServiceLocked ? <button type="button" data-tooltip="提交" aria-label="提交" onClick={() => openSubmitConfirm(item.id!)}><Send size={15} /></button> : null}
                      {item.status === 'DRAFT' && !selfServiceLocked ? <button type="button" className="danger" data-tooltip="删除" aria-label="删除" onClick={() => openDeleteConfirm(item.id!)}><Trash2 size={15} /></button> : null}
                      {item.status && ['APPROVING', 'APPROVED'].includes(item.status) && !selfServiceLocked ? <button type="button" data-tooltip="撤销" aria-label="撤销" onClick={() => openCancelConfirm(item.id!)}><RotateCcw size={15} /></button> : null}
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
      <section className="admin-source-page oa-approval-page overtime-application-page">
        <TablePageLayout
          actions={pageActions}
          filters={pageFilters}
          table={pageTable}
          pagination={pagePagination}
        />
      </section>

      <BaseDialog
        open={showDialog}
        title={current ? '编辑加班申请' : '新建加班申请'}
        onClose={closeDialog}
        width="wide"
        bodyClassName="admin-dialog-stack"
        footer={(
          <>
            <Button variant="outline" onClick={closeDialog}>
              取消
            </Button>
            <Button onClick={() => void handleSave()}>保存</Button>
          </>
        )}
      >
        <div className="admin-dialog-stack">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="admin-dialog-field">
              <Label>加班类型</Label>
              <Select
                value={formData.overtimeType}
                onValueChange={(value) => setFormData((prev) => ({ ...prev, overtimeType: value }))}
              >
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="请选择加班类型" />
                </SelectTrigger>
                <SelectContent>
                  {typeDict.getOptions().map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="admin-dialog-field">
              <Label>补偿方式</Label>
              <Select
                value={formData.compensationType}
                onValueChange={(value) =>
                  setFormData((prev) => ({ ...prev, compensationType: value }))
                }
              >
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="请选择补偿方式" />
                </SelectTrigger>
                <SelectContent>
                  {compensationDict.getOptions().map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="admin-dialog-field">
              <Label>开始时间</Label>
              <DatePicker
                className="h-11"
                type="datetime-local"
                value={formData.startTime}
                onChange={(event) =>
                  setFormData((prev) => ({ ...prev, startTime: event.target.value }))
                }
              />
            </div>

            <div className="admin-dialog-field">
              <Label>结束时间</Label>
              <DatePicker
                className="h-11"
                type="datetime-local"
                value={formData.endTime}
                onChange={(event) =>
                  setFormData((prev) => ({ ...prev, endTime: event.target.value }))
                }
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-cf-subtle">
            <span>时长 {formDuration > 0 ? `${formDuration} 小时` : '--'}</span>
            <span>{typeDict.getLabel(formData.overtimeType || '') || '--'}</span>
            <span>{compensationDict.getLabel(formData.compensationType || '') || '--'}</span>
          </div>

          <div className="admin-dialog-field">
            <Label>加班事由</Label>
            <Textarea
              className="min-h-[120px]"
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
        bodyClassName="admin-dialog-stack"
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
              <DetailField label="加班类型" value={typeDict.getLabel(detailRecord.overtimeType || '') || '-'} />
              <DetailField label="补偿方式" value={compensationDict.getLabel(detailRecord.compensationType || '') || '-'} />
              <DetailField label="开始时间" value={formatDateTimeDisplay(detailRecord.startTime)} />
              <DetailField label="结束时间" value={formatDateTimeDisplay(detailRecord.endTime)} />
              <DetailField label="加班时长" value={detailRecord.duration ? `${detailRecord.duration} 小时` : '-'} />
              <DetailField label="状态" value={statusDict.getLabel(detailRecord.status || 'DRAFT') || '-'} />
              <DetailField label="创建时间" value={formatDateTimeDisplay(detailRecord.createTime)} />
            </div>

            <section className="table-scroll-container admin-inner-table-surface admin-source-panel">
              <div className="admin-source-panel-head">
                <div>
                  <h3>加班事由</h3>
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
        danger={confirmState?.danger}
        onConfirm={() => void handleConfirmAction()}
        onCancel={() => setConfirmState(null)}
      />
    </>
  );
};

export default OvertimeApplicationPage;
