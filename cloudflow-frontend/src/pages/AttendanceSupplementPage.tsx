import React, { useEffect, useState } from 'react';
import { getConfigIntSync } from '../hooks/useSystemConfig';
import { SYS_PAGE_DEFAULT_PAGE_SIZE } from '../constants/sysConfig';
import { useWorkflowRefresh } from '@/hooks/useWorkflowRefresh';
import {
  AlertCircle,
  CalendarClock,
  ClipboardCheck,
  Download,
  Edit,
  Eye,
  Plus,
  RefreshCw,
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

const InlineState: React.FC<InlineStateProps> = ({
  title,
  icon,
  className,
}) => (
  <div className={['flex flex-col items-center justify-center px-6 py-10 text-center', className].filter(Boolean).join(' ')}>
    <div className="admin-source-stat-icon mb-3 text-cf-faint">
      {icon || <ClipboardCheck className="h-4 w-4" />}
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
        <div className="admin-source-stat-icon mb-3 text-cf-faint">
          {loading ? <ClipboardCheck className="h-4 w-4" /> : icon || <ClipboardCheck className="h-4 w-4" />}
        </div>
        <div className="text-sm font-medium text-cf-title">{title}</div>
      </div>
    </td>
  </tr>
);

const DetailField: React.FC<DetailFieldProps> = ({ label, value }) => (
  <div>
    <span>{label}</span>
    <strong>{value || '-'}</strong>
  </div>
);

const SupplementPanel: React.FC<{ title: string; children: React.ReactNode; meta?: React.ReactNode }> = ({ title, children, meta }) => (
  <section className="table-scroll-container admin-inner-table-surface">
    <div className="admin-source-section-head border-b border-slate-200 px-4 py-3 dark:border-slate-800">
      <div>
        <strong>{title}</strong>
        {meta ? <span>{meta}</span> : null}
      </div>
    </div>
    <div className="p-4">{children}</div>
  </section>
);

export const AttendanceSupplementPage: React.FC = () => {
  const statusDict = useDict('hr_attendance_supplement_status');
  const checkTypeDict = useDict('hr_check_type');
  const [list, setList] = useState<AttendanceSupplement[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchParams, setSearchParams] = useState({
    status: '',
    checkType: '',
    pageNum: 1,
    pageSize: getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10),
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

  useEffect(() => {
    void fetchList();
  }, [searchParams]);

  useWorkflowRefresh(fetchList, 'ATTENDANCE_SUPPLEMENT');

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
    ? (statusDict.getLabel(searchParams.status) || '未配置状态')
    : '全部状态';
  const currentTypeLabel = searchParams.checkType
    ? (checkTypeDict.getLabel(searchParams.checkType) || '未配置类型')
    : '全部类型';
  const hasActiveFilters = Boolean(searchParams.status || searchParams.checkType);
  const totalPages = Math.max(1, Math.ceil(total / searchParams.pageSize));
  const resultSummary = hasActiveFilters ? `${currentStatusLabel} / ${currentTypeLabel}` : '全部补录';
  const metrics = [
    { label: '补录申请', value: String(total), meta: `当前页 ${list.length}`, icon: <ClipboardCheck size={18} />, tone: 'blue' },
    { label: '草稿', value: String(draftCount), meta: '待提交', icon: <Edit size={18} />, tone: 'amber' },
    { label: '审批中', value: String(pendingCount), meta: '流程流转', icon: <Send size={18} />, tone: 'violet' },
    { label: '已补录', value: String(approvedCount), meta: '考勤已修正', icon: <CalendarClock size={18} />, tone: 'green' },
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

  const getStatusBadge = (status: string) => (
    <DictBadge dictType="hr_attendance_supplement_status" value={String(status || 'MISSING')} />
  );

  const pageActions = (
    <div className="grid gap-5">
      <header className="admin-source-header">
        <div>
          <p className="admin-source-kicker">ATTENDANCE SUPPLEMENTS</p>
          <h2>考勤补录申请</h2>
          <span>跟踪补录日期、打卡类型、补录时间和审批结果</span>
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
          <span className="input-label">打卡类型</span>
          <Select value={searchParams.checkType || ALL_FILTER_VALUE} onValueChange={(value) => setSearchParams((prev) => ({ ...prev, checkType: value === ALL_FILTER_VALUE ? '' : value, pageNum: 1 }))}>
            <SelectTrigger className="h-[42px]"><SelectValue placeholder="全部类型" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_FILTER_VALUE}>全部类型</SelectItem>
              {checkTypeDict.getOptions().map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </label>
        <div className="admin-users-toolbar-actions">
          <Button variant="outline" size="sm" onClick={() => setSearchParams({ status: '', checkType: '', pageNum: 1, pageSize: getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10) })} disabled={!hasActiveFilters}>
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
              <th>补录单号</th>
              <th>补录日期</th>
              <th>打卡类型</th>
              <th>补录时间</th>
              <th>原因</th>
              <th>状态</th>
              <th className="text-right">当前操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableStateRow colSpan={7} title="正在加载补录申请..." loading />
            ) : list.length === 0 ? (
              <TableStateRow colSpan={7} icon={<ClipboardCheck className="h-4 w-4" />} title={hasActiveFilters ? '当前条件下暂无记录' : '暂无考勤补录申请'} />
            ) : (
              list.map((item) => (
                <tr key={item.id}>
                  <td><strong>{item.supplementNo || '-'}</strong></td>
                  <td>{item.attendanceDate || '-'}</td>
                  <td>{checkTypeDict.getLabel(item.checkType || '') || '-'}</td>
                  <td>{toTimeValue(item.checkTime) || '-'}</td>
                  <td><div className="max-w-xs truncate">{item.reason || '-'}</div></td>
                  <td>{getStatusBadge(item.status || 'MISSING')}</td>
                  <td>
                    <div className="admin-users-row-actions">
                      <button type="button" data-tooltip="详情" aria-label="详情" onClick={() => void handleView(item.id!)}><Eye size={15} /></button>
                      {item.status === 'MISSING' && !selfServiceLocked ? <button type="button" data-tooltip="编辑" aria-label="编辑" onClick={() => void handleEdit(item.id!)}><Edit size={15} /></button> : null}
                      {item.status === 'MISSING' && !selfServiceLocked ? <button type="button" data-tooltip="提交" aria-label="提交" onClick={() => openSubmitConfirm(item.id!)}><Send size={15} /></button> : null}
                      {item.status === 'MISSING' && !selfServiceLocked ? <button type="button" className="danger" data-tooltip="删除" aria-label="删除" onClick={() => openDeleteConfirm(item.id!)}><Trash2 size={15} /></button> : null}
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
      <section className="admin-source-page oa-approval-page attendance-supplement-page">
        <TablePageLayout
          actions={pageActions}
          filters={pageFilters}
          table={pageTable}
          pagination={pagePagination}
        />
      </section>

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
        <div className="admin-dialog-stack">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="admin-dialog-field">
              <Label>补录日期</Label>
              <DatePicker
                className="h-11"
                type="date"
                value={formData.attendanceDate}
                onChange={(event) =>
                  setFormData((prev) => ({ ...prev, attendanceDate: event.target.value }))
                }
              />
            </div>
            <div className="admin-dialog-field">
              <Label>打卡类型</Label>
              <Select
                value={formData.checkType}
                onValueChange={(value) => setFormData((prev) => ({ ...prev, checkType: value }))}
              >
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="请选择打卡类型" />
                </SelectTrigger>
                <SelectContent>
                  {checkTypeDict.getOptions().map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="admin-dialog-field">
            <Label>补录时间</Label>
            <DatePicker
              className="h-11"
              type="time"
              value={formData.checkTime}
              onChange={(event) =>
                setFormData((prev) => ({ ...prev, checkTime: event.target.value }))
              }
            />
          </div>

          <div className="admin-dialog-field">
            <Label>补录原因</Label>
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
        title={detailRecord?.supplementNo || '补录详情'}
        onClose={closeDetailDialog}
        width="wide"
        headerAside={detailRecord ? getStatusBadge(detailRecord.status || 'MISSING') : null}
        bodyClassName="admin-dialog-stack"
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
            <div className="admin-finance-detail-list admin-contract-detail-grid">
              <DetailField label="补录单号" value={renderDetailValue(detailRecord.supplementNo)} />
              <DetailField label="申请人" value={renderDetailValue(detailRecord.employeeName)} />
              <DetailField label="补录日期" value={renderDetailValue(detailRecord.attendanceDate)} />
              <DetailField label="打卡类型" value={checkTypeDict.getLabel(detailRecord.checkType || '') || '-'} />
              <DetailField label="补录时间" value={renderDetailValue(detailRecord.checkTime)} />
              <DetailField label="创建时间" value={formatDateTimeDisplay(detailRecord.createTime)} />
            </div>

            <SupplementPanel title="补录原因">
              <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-cf-muted">
                {detailRecord.reason || '-'}
              </div>
            </SupplementPanel>

            <SupplementPanel
              title="流程轨迹"
              meta={detailRecord.processInstanceId ? detailRecord.processInstanceId : undefined}
            >
              {detailRecord.processInstanceId ? (
                <ProcessTrace instanceId={detailRecord.processInstanceId} />
              ) : (
                <InlineState title="暂无流程轨迹" className="py-6" />
              )}
            </SupplementPanel>
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

export default AttendanceSupplementPage;
