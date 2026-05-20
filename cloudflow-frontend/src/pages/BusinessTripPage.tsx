import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { Pagination } from '@/components/common/Pagination';
import { TablePageLayout, TableSurfaceCard } from '@/components/layout/TablePageLayout';
import { useAuth } from '@/context/AuthContext';
import {
  Button,
  DatePicker,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TableActionHead,
  TableHead,
  TableHeader,
  Textarea,
  UserSelector,
} from '@/components/common';
import { TableRowActions } from '@/components/common/table-row-actions';
import type { UserBrief } from '@/types/workflow';

const STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
  { value: 'DRAFT', label: '草稿' },
  { value: 'PENDING', label: '审批中' },
  { value: 'APPROVED', label: '已通过' },
  { value: 'REJECTED', label: '已拒绝' },
  { value: 'CANCELLED', label: '已取消' },
] as const;

const TRANSPORT_OPTIONS = [
  { value: 'PLANE', label: '飞机' },
  { value: 'TRAIN', label: '火车' },
  { value: 'CAR', label: '自驾' },
  { value: 'OTHER', label: '其他' },
] as const;

const ACCOMMODATION_OPTIONS = [
  { value: 'SELF', label: '自行安排' },
  { value: 'COMPANY', label: '公司安排' },
  { value: 'NONE', label: '无需住宿' },
] as const;

const STATUS_LABELS: Record<string, string> = {
  DRAFT: '草稿',
  PENDING: '审批中',
  APPROVED: '已通过',
  REJECTED: '已拒绝',
  CANCELLED: '已取消',
};

const TRANSPORT_LABELS: Record<string, string> = {
  PLANE: '飞机',
  TRAIN: '火车',
  CAR: '自驾',
  OTHER: '其他',
};

const ACCOMMODATION_LABELS: Record<string, string> = {
  SELF: '自行安排',
  COMPANY: '公司安排',
  NONE: '无需住宿',
};

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

const InlineState: React.FC<{
  title: string;
  description?: string;
  icon?: React.ReactNode;
  className?: string;
}> = ({ title, description, icon, className }) => (
  <div className={['flex flex-col items-center justify-center px-6 py-10 text-center', className].filter(Boolean).join(' ')}>
    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500">
      {icon || <Plane className="h-4 w-4" />}
    </div>
    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
    {description ? (
      <div className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">{description}</div>
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
    <td colSpan={colSpan} className="px-4 py-16">
      <div className="flex flex-col items-center justify-center text-center">
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500">
          {loading ? <Clock3 className="h-4 w-4 animate-spin" /> : icon || <Plane className="h-4 w-4" />}
        </div>
        <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
        {description ? (
          <div className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">{description}</div>
        ) : null}
      </div>
    </td>
  </tr>
);

const DetailRows: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className }) => (
  <div className={['grid gap-x-6 gap-y-3 md:grid-cols-2 xl:grid-cols-3', className].filter(Boolean).join(' ')}>
    {children}
  </div>
);

const DetailRow: React.FC<{
  label: string;
  value: React.ReactNode;
  alignStart?: boolean;
}> = ({ label, value, alignStart = false }) => (
  <div
    className={[
      'border-b border-slate-100 pb-3 dark:border-slate-800',
      alignStart ? 'md:col-span-2 xl:col-span-3' : '',
    ].filter(Boolean).join(' ')}
  >
    <div className="text-[11px] font-medium text-slate-400 dark:text-slate-500">{label}</div>
    <div className="mt-1.5 text-sm leading-6 text-slate-900 dark:text-slate-100">{value}</div>
  </div>
);

export const BusinessTripPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const [list, setList] = useState<BusinessTrip[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchParams, setSearchParams] = useState({
    status: '',
    destination: '',
    pageNum: 1,
    pageSize: 10,
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

  useEffect(() => {
    void fetchList();
  }, [searchParams]);

  const draftCount = useMemo(() => list.filter((item) => item.status === 'DRAFT').length, [list]);
  const pendingCount = useMemo(() => list.filter((item) => item.status === 'PENDING').length, [list]);
  const approvedCount = useMemo(() => list.filter((item) => item.status === 'APPROVED').length, [list]);
  const hasActiveFilters = Boolean(searchParams.status || searchParams.destination);
  const currentStatusLabel = searchParams.status ? STATUS_LABELS[searchParams.status] || searchParams.status : '全部状态';
  const currentDestinationLabel = searchParams.destination || '全部目的地';
  const formTripDays = calculateTripDays(formData.startDate, formData.endDate);

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
      pageSize: 10,
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

  const getStatusBadge = (status?: string) => {
    const toneMap: Record<string, string> = {
      DRAFT: 'border border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
      PENDING: 'border border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-200',
      APPROVED: 'border border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200',
      REJECTED: 'border border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200',
      CANCELLED: 'border border-slate-200 bg-slate-100 text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400',
    };

    return (
      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${toneMap[status || 'DRAFT'] || toneMap.DRAFT}`}>
        {STATUS_LABELS[status || 'DRAFT'] || status || '-'}
      </span>
    );
  };

  const getAttachmentList = (attachmentUrl?: string) =>
    normalizeAttachmentUrls(attachmentUrl);

  const renderDetailValue = (value?: string | number | null) => {
    if (value === null || value === undefined || value === '') {
      return '-';
    }
    return value;
  };

  return (
    <div className="space-y-4">
      <TablePageLayout
        className="gap-4"
        filters={(
          <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/88 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-1 flex-wrap items-center gap-3">
              <div className="relative min-w-[220px] flex-1 lg:max-w-sm">
                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
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
                  className="h-10 pl-10"
                />
              </div>

              <div className="w-full sm:w-[180px]">
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
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="状态" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">全部状态</SelectItem>
                    {STATUS_OPTIONS.filter((option) => option.value).map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex min-w-[220px] flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                <span>{hasActiveFilters ? `${currentStatusLabel} / ${currentDestinationLabel}` : '全部'}</span>
                <span>共 {total} 条</span>
                <span>草稿 {draftCount}</span>
                <span>审批中 {pendingCount}</span>
                <span>已通过 {approvedCount}</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
              <Button variant="outline" size="sm" onClick={handleApplyFilters}>
                <Search size={14} className="mr-1.5" />
                应用
              </Button>
              <Button variant="outline" size="sm" onClick={handleResetFilters}>
                <RotateCcw size={14} className="mr-1.5" />
                清空条件
              </Button>
              <Button variant="outline" size="sm" onClick={handleExport}>
                <Download size={14} className="mr-1.5" />
                导出结果
              </Button>
              <Button size="sm" onClick={handleAdd} disabled={!hasPermission('oa:trip:add')}>
                <Plus size={14} className="mr-1.5" />
                新建申请
              </Button>
            </div>
          </div>
        )}
        table={(<TableSurfaceCard>
          <div className="flex min-h-[40rem] flex-col">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1180px]">
                <TableHeader className="sticky top-0 z-10">
                  <tr>
                    <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">出差单号</TableHead>
                    <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">出差人 / 部门</TableHead>
                    <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">行程 / 项目</TableHead>
                    <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">日期</TableHead>
                    <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">天数</TableHead>
                    <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">交通</TableHead>
                    <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">预算</TableHead>
                    <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">状态</TableHead>
                    <TableActionHead className="w-44 px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">操作</TableActionHead>
                  </tr>
                </TableHeader>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {loading ? (
                    <TableStateRow colSpan={9} title="正在加载出差申请..." loading />
                  ) : list.length === 0 ? (
                    <TableStateRow
                      colSpan={9}
                      title={hasActiveFilters ? '当前筛选下暂无记录' : '暂无出差申请'}
                    />
                  ) : (
                    list.map((item) => (
                      <tr key={item.id} className="transition hover:bg-slate-50 dark:hover:bg-slate-900/60">
                        <td className="px-4 py-3 text-sm text-slate-900 dark:text-slate-100">
                          <div className="font-medium text-slate-900 dark:text-slate-100">{item.tripNo || '-'}</div>
                          <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">{formatDateTimeDisplay(item.createTime)}</div>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                          <div className="font-medium text-slate-900 dark:text-slate-100">{item.userName || '-'}</div>
                          <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">{item.deptName || '-'}</div>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                          <div className="font-medium text-slate-900 dark:text-slate-100">
                            {(item.departure || '-') + ' -> ' + (item.destination || '-')}
                          </div>
                          <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                            {item.projectName || item.companions || '-'}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                          {item.startDate || '-'} ~ {item.endDate || '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                          {item.tripDays ? `${item.tripDays} 天` : '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                          {TRANSPORT_LABELS[item.transportType || ''] || '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-200">{formatAmount(item.estimatedCost)}</td>
                        <td className="px-4 py-3">{getStatusBadge(item.status)}</td>
                        <td className="px-4 py-3 text-right">
                          <TableRowActions
                            align="end"
                            className="gap-1"
                            actions={[
                              {
                                label: '详情',
                                icon: <Eye size={14} />,
                                onClick: () => void handleView(item.id!),
                                tone: 'neutral',
                              },
                              {
                                label: '编辑',
                                icon: <Edit size={14} />,
                                onClick: () => void handleEdit(item.id!),
                                tone: 'primary',
                                hidden: item.status !== 'DRAFT',
                                permissionKey: 'oa:trip:edit',
                              },
                              {
                                label: '提交',
                                icon: <Send size={14} />,
                                onClick: () => openSubmitConfirm(item.id!),
                                tone: 'success',
                                hidden: item.status !== 'DRAFT',
                                permissionKey: 'oa:trip:submit',
                              },
                              {
                                label: '删除',
                                icon: <Trash2 size={14} />,
                                onClick: () => openDeleteConfirm(item.id!),
                                tone: 'danger',
                                hidden: item.status !== 'DRAFT',
                                permissionKey: 'oa:trip:remove',
                              },
                              {
                                label: '取消申请',
                                icon: <RotateCcw size={14} />,
                                onClick: () => openCancelConfirm(item.id!),
                                tone: 'warning',
                                hidden: item.status !== 'PENDING',
                                permissionKey: 'oa:trip:cancel',
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
        </TableSurfaceCard>)}
        pagination={(
          total > 0 ? (
            <Pagination
              total={total}
              page={searchParams.pageNum}
              pageSize={searchParams.pageSize}
              showPageSizeSelector={false}
              showJump={false}
              onPageChange={(page) => setSearchParams((prev) => ({ ...prev, pageNum: page }))}
              onPageSizeChange={() => {}}
            />
          ) : null
        )}
      />

      <BaseDialog
        open={showDialog}
        title={current ? '编辑出差申请' : '新建出差申请'}
        onClose={closeDialog}
        maxWidthClassName="w-full sm:max-w-5xl"
        panelClassName="max-h-[92vh]"
        bodyClassName="max-h-[74vh] overflow-y-auto px-4 py-4 sm:px-6 sm:py-5"
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
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-5">
            <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/70">
              <h4 className="mb-4 text-sm font-semibold text-slate-900 dark:text-slate-100">行程信息</h4>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    出发地
                  </label>
                  <Input
                    className="h-11"
                    type="text"
                    value={formData.departure || ''}
                    onChange={(event) => setFormData((prev) => ({ ...prev, departure: event.target.value }))}
                    placeholder="例如：北京"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    目的地
                  </label>
                  <Input
                    className="h-11"
                    type="text"
                    value={formData.destination}
                    onChange={(event) => setFormData((prev) => ({ ...prev, destination: event.target.value }))}
                    placeholder="例如：上海"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    开始日期
                  </label>
                  <DatePicker
                    className="h-11"
                    type="date"
                    value={formData.startDate}
                    onChange={(event) => setFormData((prev) => ({ ...prev, startDate: event.target.value }))}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    结束日期
                  </label>
                  <DatePicker
                    className="h-11"
                    type="date"
                    value={formData.endDate}
                    onChange={(event) => setFormData((prev) => ({ ...prev, endDate: event.target.value }))}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    交通方式
                  </label>
                  <Select
                    value={formData.transportType || 'TRAIN'}
                    onValueChange={(value) => setFormData((prev) => ({ ...prev, transportType: value }))}
                  >
                    <SelectTrigger className="h-11">
                      <SelectValue placeholder="请选择交通方式" />
                    </SelectTrigger>
                    <SelectContent>
                      {TRANSPORT_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    住宿安排
                  </label>
                  <Select
                    value={formData.accommodation || 'SELF'}
                    onValueChange={(value) => setFormData((prev) => ({ ...prev, accommodation: value }))}
                  >
                    <SelectTrigger className="h-11">
                      <SelectValue placeholder="请选择住宿安排" />
                    </SelectTrigger>
                    <SelectContent>
                      {ACCOMMODATION_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    预计费用
                  </label>
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
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    关联项目
                  </label>
                  <Input
                    className="h-11"
                    type="text"
                    value={formData.projectName || ''}
                    onChange={(event) => setFormData((prev) => ({ ...prev, projectName: event.target.value }))}
                    placeholder="例如：华东客户拜访"
                  />
                </div>
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/70">
              <h4 className="mb-4 text-sm font-semibold text-slate-900 dark:text-slate-100">联系信息</h4>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    联系电话
                  </label>
                  <Input
                    className="h-11"
                    type="tel"
                    value={formData.contactPhone || ''}
                    onChange={(event) => setFormData((prev) => ({ ...prev, contactPhone: event.target.value }))}
                    placeholder="出差期间联系电话"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    紧急联系人
                  </label>
                  <Input
                    className="h-11"
                    type="text"
                    value={formData.emergencyContact || ''}
                    onChange={(event) => setFormData((prev) => ({ ...prev, emergencyContact: event.target.value }))}
                    placeholder="姓名"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    紧急联系人电话
                  </label>
                  <Input
                    className="h-11"
                    type="tel"
                    value={formData.emergencyPhone || ''}
                    onChange={(event) => setFormData((prev) => ({ ...prev, emergencyPhone: event.target.value }))}
                    placeholder="电话"
                  />
                </div>
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/70">
              <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                出差事由
              </label>
              <Textarea
                className="min-h-[160px] resize-none"
                value={formData.reason}
                onChange={(event) => setFormData((prev) => ({ ...prev, reason: event.target.value }))}
                placeholder="填写出差背景和目的"
              />
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/70">
              <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                附件材料
              </label>
              <FileUpload
                value={formData.attachmentUrl || ''}
                onChange={(urls) => setFormData((prev) => ({ ...prev, attachmentUrl: urls }))}
                maxCount={5}
              />
            </section>
          </div>

          <aside className="space-y-4 lg:sticky lg:top-0 lg:self-start">
            <section className="rounded-lg border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/50">
              <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                同行人员
              </label>
              <UserSelector
                value={selectedCompanionIds}
                onChange={handleCompanionChange}
                onUsersChange={handleCompanionUsersChange}
                multiple
                placeholder="搜索姓名、邮箱或部门"
                dropdownPlacement="bottom"
              />
              {formData.companions ? (
                <div className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">
                  {formData.companions}
                </div>
              ) : null}
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/70">
              <h4 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">行程摘要</h4>
              <dl className="space-y-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-500 dark:text-slate-400">路线</dt>
                  <dd className="max-w-[12rem] truncate font-medium text-slate-900 dark:text-slate-100">
                    {(formData.departure || '-') + ' -> ' + (formData.destination || '-')}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-500 dark:text-slate-400">天数</dt>
                  <dd className="font-medium text-slate-900 dark:text-slate-100">
                    {formTripDays ? `${formTripDays} 天` : '-'}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-500 dark:text-slate-400">交通</dt>
                  <dd className="font-medium text-slate-900 dark:text-slate-100">
                    {TRANSPORT_LABELS[formData.transportType || ''] || '-'}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-500 dark:text-slate-400">预算</dt>
                  <dd className="font-medium text-slate-900 dark:text-slate-100">
                    {formatAmount(formData.estimatedCost)}
                  </dd>
                </div>
              </dl>
            </section>
          </aside>
        </div>
      </BaseDialog>

      <BaseDialog
        open={showDetail}
        title={detailTrip?.tripNo || '出差申请详情'}
        onClose={closeDetailDialog}
        width="wide"
        headerAside={detailTrip ? getStatusBadge(detailTrip.status) : null}
        bodyClassName="space-y-4"
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
              <DetailRow label="交通方式" value={TRANSPORT_LABELS[detailTrip.transportType || ''] || '-'} />
              <DetailRow label="住宿安排" value={ACCOMMODATION_LABELS[detailTrip.accommodation || ''] || '-'} />
              <DetailRow label="预计费用" value={formatAmount(detailTrip.estimatedCost)} />
              <DetailRow label="关联项目" value={renderDetailValue(detailTrip.projectName)} />
              <DetailRow label="联系电话" value={renderDetailValue(detailTrip.contactPhone)} />
              <DetailRow label="紧急联系人" value={`${detailTrip.emergencyContact || '-'} / ${detailTrip.emergencyPhone || '-'}`} />
              <DetailRow label="同行人员" value={renderDetailValue(detailTrip.companions)} />
              <DetailRow label="流程实例" value={renderDetailValue(detailTrip.instanceId)} />
              <DetailRow label="创建时间" value={formatDateTimeDisplay(detailTrip.createTime)} />
            </DetailRows>

            <div className="rounded-xl border border-slate-200 px-4 py-4 dark:border-slate-800">
              <div className="text-sm font-medium text-slate-900 dark:text-slate-100">出差事由</div>
              <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600 dark:text-slate-300">
                {detailTrip.reason || '-'}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 px-4 py-4 dark:border-slate-800">
              <div className="mb-3 text-sm font-medium text-slate-900 dark:text-slate-100">附件</div>
              {getAttachmentList(detailTrip.attachmentUrl).length ? (
                <div className="space-y-2">
                  {getAttachmentList(detailTrip.attachmentUrl).map((url) => {
                    const label = getAttachmentDisplayName(url);
                    return (
                      <a
                        key={url}
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 transition hover:border-cyan-200 hover:bg-slate-50 hover:text-cyan-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:border-cyan-800 dark:hover:text-cyan-200"
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
            </div>

            <div className="rounded-xl border border-slate-200 px-4 py-4 dark:border-slate-800">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm font-medium text-slate-900 dark:text-slate-100">流程轨迹</div>
                {detailTrip.instanceId ? (
                  <div className="text-xs text-slate-500 dark:text-slate-400">{detailTrip.instanceId}</div>
                ) : null}
              </div>
              {detailTrip.instanceId ? (
                <ProcessTrace instanceId={detailTrip.instanceId} />
              ) : (
                <InlineState title="暂无流程轨迹" className="py-8" />
              )}
            </div>
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
    </div>
  );
};

export default BusinessTripPage;


