import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { getConfigIntSync } from '../hooks/useSystemConfig';
import { SYS_PAGE_DEFAULT_PAGE_SIZE } from '../constants/sysConfig';
import { useWorkflowRefresh } from '@/hooks/useWorkflowRefresh';
import {
  Clock3,
  Download,
  Edit,
  Eye,
  Paperclip,
  Plane,
  Plus,
  RotateCcw,
  Search,
  Send,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { businessTripApi, BusinessTrip } from '@/services/api/businessTrip';
import FileUpload from '@/components/FileUpload';
import { ProcessTrace } from '@/components/ProcessTrace';
import { formatDateTimeDisplay } from '@/utils/dateFormat';
import { buildExcelFileName, downloadBlob } from '@/utils/download';
import { getErrorMessage } from '@/utils/errorMessage';
import { getAttachmentDisplayName, normalizeAttachmentUrls } from '@/utils/attachment';
import { BaseDialog } from '@/components/common/BaseDialog';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { ListResultFooter } from '@/components/common/ListResultFooter';
import { useAuth } from '@/context/AuthContext';
import {
  Button,
  DatePicker,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  UserSelector,
} from '@/components/common';
import type { UserBrief } from '@/types/workflow';
import { useDict } from '@/hooks/useDict';
import { DictBadge } from '@/components/common/DictBadge';
import { InnerTableSurface, TablePageLayout } from '@/components/layout/TablePageLayout';
import '../styles/features/admin-business.css';

interface ConfirmState {
  type: 'delete' | 'submit' | 'cancel';
  id: number;
  title: string;
  message: string;
  confirmText: string;
  danger?: boolean;
}

const createDefaultForm = (): BusinessTrip => ({
  destination: '',
  startDate: '',
  endDate: '',
  reason: '',
  transportType: 'TRAIN',
  departure: '',
  accommodation: 'SELF',
  contactPhone: '',
  emergencyContact: '',
  emergencyPhone: '',
  projectName: '',
  attachmentUrl: '',
});

const formatAmount = (value?: number | null) => {
  if (value === undefined || value === null || Number.isNaN(Number(value))) {
    return '-';
  }

  return `¥${Number(value).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const calculateTripDays = (startDate?: string, endDate?: string) => {
  if (!startDate || !endDate) {
    return null;
  }

  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) {
    return null;
  }

  return Math.round((end - start) / 86400000) + 1;
};

const joinClass = (...classes: Array<string | false | null | undefined>) =>
  classes.filter(Boolean).join(' ');

const InlineState: React.FC<{
  title: string;
  description?: string;
  icon?: React.ReactNode;
  className?: string;
}> = ({ title, description, icon, className }) => (
  <div className={joinClass('admin-dialog-empty-note', className)}>
    <div className="admin-source-stat-icon mb-3 text-cf-faint">
      {icon || <Plane className="h-4 w-4" />}
    </div>
    <div className="text-sm font-medium text-cf-title">{title}</div>
    {description ? (
      <div className="mt-2 text-xs leading-6 text-cf-subtle">{description}</div>
    ) : null}
  </div>
);

const TableStateRow: React.FC<{
  colSpan: number;
  title: string;
  description?: string;
  icon?: React.ReactNode;
  loading?: boolean;
}> = ({ colSpan, title, description, icon, loading = false }) => (
  <tr className="hover:bg-transparent">
    <td colSpan={colSpan} className="px-4 py-10">
      <div className="flex flex-col items-center justify-center text-center">
        <div className="admin-source-stat-icon mb-3 text-cf-faint">
          {loading ? <Clock3 className="h-4 w-4 animate-spin" /> : icon || <Plane className="h-4 w-4" />}
        </div>
        <div className="text-sm font-medium text-cf-title">{title}</div>
        {description ? (
          <div className="mt-2 text-xs leading-6 text-cf-subtle">{description}</div>
        ) : null}
      </div>
    </td>
  </tr>
);

const DialogPanel: React.FC<{
  title?: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}> = ({ title, description, actions, children, className, bodyClassName }) => (
  <section className={joinClass('table-scroll-container admin-inner-table-surface', className)}>
    {title || description || actions ? (
      <div className="admin-source-section-head border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <div>
          {title ? <strong>{title}</strong> : null}
          {description ? <span>{description}</span> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    ) : null}
    <div className={joinClass('p-4', bodyClassName)}>{children}</div>
  </section>
);

const DetailSection: React.FC<{
  title?: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}> = ({ title, description, actions, children, className, bodyClassName }) => (
  <section className={joinClass('admin-business-trip-detail-section', className)}>
    {title || description || actions ? (
      <header className="admin-business-trip-detail-section-head">
        <div className="min-w-0">
          {title ? <strong>{title}</strong> : null}
          {description ? <span>{description}</span> : null}
        </div>
        {actions ? <div className="admin-business-trip-detail-section-actions">{actions}</div> : null}
      </header>
    ) : null}
    <div className={joinClass('admin-business-trip-detail-section-body', bodyClassName)}>{children}</div>
  </section>
);

const DetailRows: React.FC<{
  children: React.ReactNode;
  className?: string;
  title?: string;
  description?: string;
}> = ({ children, className, title = '基础信息', description }) => (
  <DetailSection title={title} description={description} bodyClassName={joinClass('admin-business-trip-detail-grid', className)}>
    {children}
  </DetailSection>
);

const DetailRow: React.FC<{
  label: string;
  value: React.ReactNode;
  alignStart?: boolean;
}> = ({ label, value, alignStart = false }) => (
  <div
    className={joinClass(
      'admin-business-trip-detail-item',
      alignStart && 'admin-business-trip-detail-item-wide',
    )}
  >
    <div className="text-[11px] font-medium text-cf-faint">{label}</div>
    <div className="mt-1.5 text-sm leading-6 text-cf-title">{value}</div>
  </div>
);

export const BusinessTripPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const tripStatusDict = useDict('oa_business_trip_status');
  const transportDict = useDict('oa_transport_type');
  const accommodationDict = useDict('oa_accommodation_type');
  const [list, setList] = useState<BusinessTrip[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchParams, setSearchParams] = useState({
    status: '',
    destination: '',
    pageNum: 1,
    pageSize: getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10),
  });
  const [total, setTotal] = useState(0);
  const [destinationDraft, setDestinationDraft] = useState('');
  const [showDialog, setShowDialog] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [current, setCurrent] = useState<BusinessTrip | null>(null);
  const [detailTrip, setDetailTrip] = useState<BusinessTrip | null>(null);
  const [formData, setFormData] = useState<BusinessTrip>(createDefaultForm());
  const [selectedCompanionIds, setSelectedCompanionIds] = useState<string[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

  const fetchList = async () => {
    setLoading(true);
    try {
      const response = await businessTripApi.list(searchParams);
      setList(response.records || response.rows || []);
      setTotal(response.total || 0);
    } catch (error) {
      toast.error(getErrorMessage(error, '获取出差申请列表失败'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchList();
  }, [searchParams]);

  useWorkflowRefresh(fetchList, 'business_trip');

  const draftCount = useMemo(() => list.filter((item) => item.status === 'DRAFT').length, [list]);
  const pendingCount = useMemo(() => list.filter((item) => item.status === 'PENDING').length, [list]);
  const approvedCount = useMemo(() => list.filter((item) => item.status === 'APPROVED').length, [list]);
  const hasActiveFilters = Boolean(searchParams.status || searchParams.destination);
  const currentStatusLabel = searchParams.status ? tripStatusDict.getLabel(searchParams.status) : '全部状态';
  const currentDestinationLabel = searchParams.destination || '全部目的地';
  const totalPages = Math.max(1, Math.ceil(total / searchParams.pageSize));
  const resultSummary = hasActiveFilters ? `${currentStatusLabel} / ${currentDestinationLabel}` : '全部出差';
  const formTripDays = calculateTripDays(formData.startDate, formData.endDate);

  const handleApplyFilters = () => {
    setSearchParams((prev) => ({
      ...prev,
      destination: destinationDraft.trim(),
      pageNum: 1,
    }));
  };

  const handleResetFilters = () => {
    setDestinationDraft('');
    setSearchParams({
      status: '',
      destination: '',
      pageNum: 1,
      pageSize: getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10),
    });
  };

  const handleAdd = () => {
    setCurrent(null);
    setFormData(createDefaultForm());
    setSelectedCompanionIds([]);
    setShowDialog(true);
  };

  const closeDialog = () => {
    setShowDialog(false);
    setCurrent(null);
    setFormData(createDefaultForm());
    setSelectedCompanionIds([]);
  };

  const closeDetailDialog = () => {
    setShowDetail(false);
    setDetailLoading(false);
    setDetailTrip(null);
  };

  const handleEdit = async (id: number) => {
    try {
      const response = await businessTripApi.getInfo(id);
      setCurrent(response);
      setFormData({ ...createDefaultForm(), ...response });
      setSelectedCompanionIds([]);
      setShowDialog(true);
    } catch (error) {
      toast.error(getErrorMessage(error, '获取出差申请详情失败'));
    }
  };

  const handleCompanionChange = useCallback((userIds: string[]) => {
    setSelectedCompanionIds(userIds);
    if (userIds.length === 0) {
      setFormData((prev) => ({ ...prev, companions: '' }));
    }
  }, []);

  const handleCompanionUsersChange = useCallback((users: UserBrief[]) => {
    if (!users.length) {
      return;
    }
    setFormData((prev) => ({
      ...prev,
      companions: users.map((user) => user.name).join('、'),
    }));
  }, []);

  const handleView = async (id: number) => {
    setShowDetail(true);
    setDetailTrip(null);
    setDetailLoading(true);
    try {
      const response = await businessTripApi.getInfo(id);
      setDetailTrip(response);
    } catch (error) {
      closeDetailDialog();
      toast.error(getErrorMessage(error, '获取出差申请详情失败'));
    } finally {
      setDetailLoading(false);
    }
  };

  const handleSave = async () => {
    if (
      !formData.departure?.trim()
      || !formData.destination.trim()
      || !formData.startDate
      || !formData.endDate
      || !formData.reason.trim()
    ) {
      toast.error('请填写完整信息');
      return;
    }

    const start = new Date(formData.startDate).getTime();
    const end = new Date(formData.endDate).getTime();
    if (end < start) {
      toast.error('结束日期不能早于开始日期');
      return;
    }

    const tripDays = Math.round((end - start) / 86400000) + 1;
    const payload = { ...formData, tripDays: tripDays > 0 ? tripDays : 1 };

    try {
      if (current?.id) {
        await businessTripApi.edit(payload);
        toast.success('更新成功');
      } else {
        await businessTripApi.add(payload);
        toast.success('创建成功');
      }

      closeDialog();
      await fetchList();
    } catch (error) {
      toast.error(getErrorMessage(error, '保存失败'));
    }
  };

  const openDeleteConfirm = (id: number) => {
    setConfirmState({
      type: 'delete',
      id,
      title: '删除出差申请',
      message: '删除后当前草稿不可恢复。',
      confirmText: '删除',
      danger: true,
    });
  };

  const openSubmitConfirm = (id: number) => {
    setConfirmState({
      type: 'submit',
      id,
      title: '提交出差申请',
      message: '提交后将进入审批流程。',
      confirmText: '提交',
    });
  };

  const openCancelConfirm = (id: number) => {
    setConfirmState({
      type: 'cancel',
      id,
      title: '取消出差申请',
      message: '取消后当前申请将结束流转。',
      confirmText: '取消申请',
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
        await businessTripApi.remove([currentState.id]);
        toast.success('删除成功');
      } else if (currentState.type === 'submit') {
        await businessTripApi.submit(currentState.id);
        toast.success('提交成功');
      } else {
        await businessTripApi.cancel(currentState.id);
        toast.success('已取消出差申请');
        setDetailTrip((prev) => (prev?.id === currentState.id ? { ...prev, status: 'CANCELLED' } : prev));
      }

      await fetchList();
    } catch (error) {
      const messageMap: Record<ConfirmState['type'], string> = {
        delete: '删除失败',
        submit: '提交失败',
        cancel: '取消失败',
      };
      toast.error(getErrorMessage(error, messageMap[currentState.type]));
    }
  };

  const handleExport = async () => {
    try {
      const blob = await businessTripApi.export(searchParams);
      const fileName = downloadBlob(blob, buildExcelFileName('出差申请'));
      toast.success(total > 0 ? `已导出 ${total} 条出差申请，下载文件：${fileName}` : `已导出空结果，下载文件：${fileName}`);
    } catch (error) {
      toast.error(getErrorMessage(error, '导出失败'));
    }
  };

  const getStatusBadge = (status?: string) => (
    <DictBadge dictType="oa_business_trip_status" value={String(status || 'DRAFT')} />
  );

  const getAttachmentList = (attachmentUrl?: string) =>
    normalizeAttachmentUrls(attachmentUrl);

  const renderDetailValue = (value?: string | number | null) => {
    if (value === null || value === undefined || value === '') {
      return '-';
    }
    return value;
  };
  const metrics = [
    { label: '出差申请', value: String(total), meta: `当前页 ${list.length}`, icon: <Plane size={18} />, tone: 'blue' },
    { label: '草稿', value: String(draftCount), meta: '待提交', icon: <Edit size={18} />, tone: 'amber' },
    { label: '审批中', value: String(pendingCount), meta: '流程流转', icon: <Send size={18} />, tone: 'violet' },
    { label: '已通过', value: String(approvedCount), meta: '已归档', icon: <Clock3 size={18} />, tone: 'green' },
  ];

  const pageActions = (
    <div className="grid gap-5">
        <header className="admin-source-header">
          <div>
            <p className="admin-source-kicker">BUSINESS TRIPS</p>
            <h2>出差申请</h2>
            <span>跟踪行程、预算、同行人员、审批状态和流程轨迹</span>
          </div>
          <div className="admin-source-controls">
            <Button variant="outline" size="sm" onClick={handleExport} disabled={loading}>
              <Download size={16} />
              导出
            </Button>
            <Button size="sm" onClick={handleAdd} disabled={!hasPermission('oa:trip:add')}>
              <Plus size={16} />
              新建申请
            </Button>
          </div>
        </header>

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
              <span className="input-label">目的地</span>
              <div className="admin-source-search-field">
                <Search size={16} />
                <Input
                  type="text"
                  placeholder="按目的地搜索"
                  value={destinationDraft}
                  onChange={(event) => setDestinationDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      handleApplyFilters();
                    }
                  }}
                  className="h-[42px]"
                />
              </div>
            </label>
            <label>
              <span className="input-label">状态</span>
              <Select
                value={searchParams.status || 'ALL'}
                onValueChange={(value) =>
                  setSearchParams((prev) => ({
                    ...prev,
                    status: value === 'ALL' ? '' : value,
                    pageNum: 1,
                  }))
                }
              >
                <SelectTrigger className="h-[42px]">
                  <SelectValue placeholder="状态" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">全部状态</SelectItem>
                  {tripStatusDict.getOptions().map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <div className="admin-users-toolbar-actions">
              <Button variant="outline" size="sm" onClick={handleApplyFilters}>
                <Search size={14} />
                应用
              </Button>
              <Button variant="outline" size="sm" onClick={handleResetFilters} disabled={!hasActiveFilters}>
                <RotateCcw size={14} />
                重置
              </Button>
            </div>
          </div>
        </section>
  );

  const pageTable = (
        <InnerTableSurface>
              <table className="unity-data-table admin-source-table admin-business-trip-table">
                <colgroup>
                  <col />
                  <col />
                  <col />
                  <col />
                  <col />
                  <col />
                  <col />
                  <col />
                  <col />
                </colgroup>
                <thead>
                  <tr>
                    <th>出差单号</th>
                    <th>出差人 / 部门</th>
                    <th>行程 / 项目</th>
                    <th>日期</th>
                    <th>天数</th>
                    <th>交通</th>
                    <th>预算</th>
                    <th>状态</th>
                    <th className="text-right">当前操作</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <TableStateRow colSpan={9} title="正在加载出差申请..." loading />
                  ) : list.length === 0 ? (
                    <TableStateRow
                      colSpan={9}
                      title={hasActiveFilters ? '当前筛选下暂无记录' : '暂无出差申请'}
                    />
                  ) : (
                    list.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <div className="font-medium text-cf-title">{item.tripNo || '-'}</div>
                          <div className="mt-1 text-xs text-cf-faint">{formatDateTimeDisplay(item.createTime)}</div>
                        </td>
                        <td>
                          <div className="font-medium text-cf-title">{item.userName || '-'}</div>
                          <div className="mt-1 text-xs text-cf-faint">{item.deptName || '-'}</div>
                        </td>
                        <td>
                          <div className="font-medium text-cf-title">
                            {(item.departure || '-') + '->' + (item.destination || '-')}
                          </div>
                          <div className="mt-1 text-xs text-cf-faint">
                            {item.projectName || item.companions || '-'}
                          </div>
                        </td>
                        <td>
                          {item.startDate || '-'} ~ {item.endDate || '-'}
                        </td>
                        <td>
                          {item.tripDays ? `${item.tripDays} 天` : '-'}
                        </td>
                        <td>
                          {transportDict.getLabel(String(item.transportType ?? '')) || '-'}
                        </td>
                        <td>{formatAmount(item.estimatedCost)}</td>
                        <td>{getStatusBadge(item.status)}</td>
                        <td>
                          <div className="admin-users-row-actions">
                            <button type="button" data-tooltip="详情" aria-label="详情" onClick={() => void handleView(item.id!)}><Eye size={15} /></button>
                            {item.status === 'DRAFT' && hasPermission('oa:trip:edit') ? <button type="button" data-tooltip="编辑" aria-label="编辑" onClick={() => void handleEdit(item.id!)}><Edit size={15} /></button> : null}
                            {item.status === 'DRAFT' && hasPermission('oa:trip:submit') ? <button type="button" data-tooltip="提交" aria-label="提交" onClick={() => openSubmitConfirm(item.id!)}><Send size={15} /></button> : null}
                            {item.status === 'DRAFT' && hasPermission('oa:trip:remove') ? <button type="button" data-tooltip="删除" aria-label="删除" onClick={() => openDeleteConfirm(item.id!)}><Trash2 size={15} /></button> : null}
                            {item.status === 'PENDING' && hasPermission('oa:trip:cancel') ? <button type="button" data-tooltip="取消申请" aria-label="取消申请" onClick={() => openCancelConfirm(item.id!)}><RotateCcw size={15} /></button> : null}
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
    />
  );

  return (
    <>
      <section className="admin-source-page oa-approval-page business-trip-page">
        <TablePageLayout
          actions={pageActions}
          filters={pageFilters}
          table={pageTable}
          pagination={pagePagination}
        />
      </section>

      <BaseDialog
        open={showDialog}
        title={current ? '编辑出差申请' : '新建出差申请'}
        onClose={closeDialog}
        maxWidthClassName="w-full sm:max-w-5xl"
        panelClassName="max-h-[92vh]"
        bodyClassName="admin-dialog-stack max-h-[74vh] overflow-y-auto px-4 py-4 sm:px-6 sm:py-5"
        footer={(
          <>
            <Button variant="outline" onClick={closeDialog}>
              取消
            </Button>
            <Button onClick={() => void handleSave()} disabled={!hasPermission(current ? 'oa:trip:edit' : 'oa:trip:add')}>
              保存
            </Button>
          </>
        )}
      >
        <div className="grid gap-4">
          <DialogPanel
            title="行程信息"
            description="出发、目的地、时间、交通和预算"
            bodyClassName="grid gap-4 sm:grid-cols-2"
          >
              <div className="admin-dialog-field">
                <Label>出发地</Label>
                <Input
                  className="h-11"
                  type="text"
                  value={formData.departure || ''}
                  onChange={(event) => setFormData((prev) => ({ ...prev, departure: event.target.value }))}
                  placeholder="例如：北京"
                />
              </div>
              <div className="admin-dialog-field">
                <Label>目的地</Label>
                <Input
                  className="h-11"
                  type="text"
                  value={formData.destination}
                  onChange={(event) => setFormData((prev) => ({ ...prev, destination: event.target.value }))}
                  placeholder="例如：上海"
                />
              </div>
              <div className="admin-dialog-field">
                <Label>开始日期</Label>
                <DatePicker
                  className="h-11"
                  type="date"
                  value={formData.startDate}
                  onChange={(event) => setFormData((prev) => ({ ...prev, startDate: event.target.value }))}
                />
              </div>
              <div className="admin-dialog-field">
                <Label>结束日期</Label>
                <DatePicker
                  className="h-11"
                  type="date"
                  value={formData.endDate}
                  onChange={(event) => setFormData((prev) => ({ ...prev, endDate: event.target.value }))}
                />
              </div>
              <div className="admin-dialog-field">
                <Label>交通方式</Label>
                <Select
                  value={formData.transportType || 'TRAIN'}
                  onValueChange={(value) => setFormData((prev) => ({ ...prev, transportType: value }))}
                >
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="请选择交通方式" />
                  </SelectTrigger>
                  <SelectContent>
                    {transportDict.getOptions().map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="admin-dialog-field">
                <Label>住宿安排</Label>
                <Select
                  value={formData.accommodation || 'SELF'}
                  onValueChange={(value) => setFormData((prev) => ({ ...prev, accommodation: value }))}
                >
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="请选择住宿安排" />
                  </SelectTrigger>
                  <SelectContent>
                    {accommodationDict.getOptions().map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="admin-dialog-field">
                <Label>预计费用</Label>
                <Input
                  className="h-11"
                  type="number"
                  value={formData.estimatedCost || ''}
                  onChange={(event) => setFormData((prev) => ({ ...prev, estimatedCost: parseFloat(event.target.value) || 0 }))}
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                />
              </div>
              <div className="admin-dialog-field">
                <Label>关联项目</Label>
                <Input
                  className="h-11"
                  type="text"
                  value={formData.projectName || ''}
                  onChange={(event) => setFormData((prev) => ({ ...prev, projectName: event.target.value }))}
                  placeholder="例如：华东客户拜访"
                />
              </div>
          </DialogPanel>

          <DialogPanel
            title="联系信息"
            description="出差期间联系方式和紧急联系人"
            bodyClassName="grid gap-4 sm:grid-cols-2"
          >
              <div className="admin-dialog-field">
                <Label>联系电话</Label>
                <Input
                  className="h-11"
                  type="tel"
                  value={formData.contactPhone || ''}
                  onChange={(event) => setFormData((prev) => ({ ...prev, contactPhone: event.target.value }))}
                  placeholder="出差期间联系电话"
                />
              </div>
              <div className="admin-dialog-field">
                <Label>紧急联系人</Label>
                <Input
                  className="h-11"
                  type="text"
                  value={formData.emergencyContact || ''}
                  onChange={(event) => setFormData((prev) => ({ ...prev, emergencyContact: event.target.value }))}
                  placeholder="姓名"
                />
              </div>
              <div className="admin-dialog-field sm:col-span-2">
                <Label>紧急联系人电话</Label>
                <Input
                  className="h-11"
                  type="tel"
                  value={formData.emergencyPhone || ''}
                  onChange={(event) => setFormData((prev) => ({ ...prev, emergencyPhone: event.target.value }))}
                  placeholder="电话"
                />
              </div>
          </DialogPanel>

          <DialogPanel
            title="同行与摘要"
            description="同行人员和当前行程上下文"
            bodyClassName="grid gap-4 lg:grid-cols-2"
          >
            <div className="admin-dialog-field">
              <Label>同行人员</Label>
              <UserSelector
                value={selectedCompanionIds}
                onChange={handleCompanionChange}
                onUsersChange={handleCompanionUsersChange}
                multiple
                placeholder="搜索姓名、邮箱或部门"
                dropdownPlacement="bottom"
              />
              {formData.companions ? (
                <div className="admin-dialog-value-note">
                  {formData.companions}
                </div>
              ) : null}
            </div>

            <dl className="grid gap-3 rounded-md border border-slate-200 bg-[var(--cf-surface-muted)] p-4 text-sm dark:border-slate-800 dark:bg-slate-900/60">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-cf-subtle">路线</dt>
                <dd className="max-w-[18rem] truncate font-medium text-cf-title">
                  {(formData.departure || '-') + '->' + (formData.destination || '-')}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-cf-subtle">天数</dt>
                <dd className="font-medium text-cf-title">
                  {formTripDays ? `${formTripDays} 天` : '-'}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-cf-subtle">交通</dt>
                <dd className="font-medium text-cf-title">
                  {transportDict.getLabel(String(formData.transportType ?? '')) || '-'}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-cf-subtle">预算</dt>
                <dd className="font-medium text-cf-title">
                  {formatAmount(formData.estimatedCost)}
                </dd>
              </div>
            </dl>
          </DialogPanel>

          <DialogPanel title="出差事由" bodyClassName="admin-dialog-field">
            <Textarea
              className="min-h-[160px] resize-none"
              aria-label="出差事由"
              value={formData.reason}
              onChange={(event) => setFormData((prev) => ({ ...prev, reason: event.target.value }))}
              placeholder="填写出差背景和目的"
            />
          </DialogPanel>

          <DialogPanel title="附件材料" bodyClassName="admin-dialog-field">
            <FileUpload
              value={formData.attachmentUrl || ''}
              onChange={(urls) => setFormData((prev) => ({ ...prev, attachmentUrl: urls }))}
              maxCount={5}
            />
          </DialogPanel>
        </div>
      </BaseDialog>

      <BaseDialog
        open={showDetail}
        title={detailTrip?.tripNo || '出差申请详情'}
        onClose={closeDetailDialog}
        width="wide"
        headerAside={detailTrip ? getStatusBadge(detailTrip.status) : null}
        panelClassName="max-h-[92vh]"
        bodyClassName="admin-dialog-stack"
        footer={(
          <>
            {detailTrip?.status === 'PENDING' ? (
              <Button variant="outline" onClick={() => detailTrip.id && openCancelConfirm(detailTrip.id)} disabled={!hasPermission('oa:trip:cancel')}>
                取消申请
              </Button>
            ) : null}
            <Button variant="outline" onClick={closeDetailDialog}>
              关闭
            </Button>
          </>
        )}
      >
        {detailLoading ? (
          <InlineState
            title="正在加载出差详情..."
            className="py-12"
            icon={<Clock3 className="h-4 w-4 animate-spin" />}
          />
        ) : detailTrip ? (
          <>
            <DetailRows>
              <DetailRow label="申请人" value={renderDetailValue(detailTrip.userName)} />
              <DetailRow label="所属部门" value={renderDetailValue(detailTrip.deptName)} />
              <DetailRow label="出发地" value={renderDetailValue(detailTrip.departure)} />
              <DetailRow label="目的地" value={renderDetailValue(detailTrip.destination)} />
              <DetailRow label="日期" value={`${renderDetailValue(detailTrip.startDate)} ~ ${renderDetailValue(detailTrip.endDate)}`} />
              <DetailRow label="出差天数" value={detailTrip.tripDays ? `${detailTrip.tripDays} 天` : '-'} />
              <DetailRow label="交通方式" value={transportDict.getLabel(String(detailTrip.transportType ?? '')) || '-'} />
              <DetailRow label="住宿安排" value={accommodationDict.getLabel(String(detailTrip.accommodation ?? '')) || '-'} />
              <DetailRow label="预计费用" value={formatAmount(detailTrip.estimatedCost)} />
              <DetailRow label="关联项目" value={renderDetailValue(detailTrip.projectName)} />
              <DetailRow label="联系电话" value={renderDetailValue(detailTrip.contactPhone)} />
              <DetailRow label="紧急联系人" value={`${detailTrip.emergencyContact || '-'} / ${detailTrip.emergencyPhone || '-'}`} />
              <DetailRow label="同行人员" value={renderDetailValue(detailTrip.companions)} />
              <DetailRow label="流程实例" value={renderDetailValue(detailTrip.instanceId)} />
              <DetailRow label="创建时间" value={formatDateTimeDisplay(detailTrip.createTime)} />
            </DetailRows>

            <DetailSection title="出差事由">
              <div className="whitespace-pre-wrap text-sm leading-6 text-cf-muted">
                {detailTrip.reason || '-'}
              </div>
            </DetailSection>

            <DetailSection title="附件">
              {getAttachmentList(detailTrip.attachmentUrl).length ? (
                <div className="admin-dialog-link-list">
                  {getAttachmentList(detailTrip.attachmentUrl).map((url) => {
                    const label = getAttachmentDisplayName(url);
                    return (
                      <a
                        key={url}
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="admin-dialog-link-card"
                      >
                        <Paperclip size={14} />
                        <span className="truncate">{label}</span>
                      </a>
                    );
                  })}
                </div>
              ) : (
                <InlineState title="暂无附件" className="py-5" icon={<Paperclip className="h-4 w-4" />} />
              )}
            </DetailSection>

            <DetailSection
              title="流程轨迹"
              actions={detailTrip.instanceId ? (
                <div className="text-xs text-cf-subtle">{detailTrip.instanceId}</div>
              ) : null}
            >
              {detailTrip.instanceId ? (
                <ProcessTrace instanceId={detailTrip.instanceId} />
              ) : (
                <InlineState title="暂无流程轨迹" className="py-6" />
              )}
            </DetailSection>
          </>
        ) : null}
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

export default BusinessTripPage;
