import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  Edit,
  Plus,
  RotateCcw,
  Search,
  Send,
  Timer,
  Trash2,
  X,
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

const emptyForm = (): OvertimeApplicationForm => ({
  overtimeType: 'WORKDAY',
  compensationType: 'PAYMENT',
  startTime: '',
  endTime: '',
  reason: '',
});

const formatDateCN = (date: Date) => {
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  return `${date.getMonth() + 1}月${date.getDate()}日 ${weekdays[date.getDay()]}`;
};

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
  const glassModalShellClass = 'w-full rounded-2xl border border-slate-200 bg-white shadow-2xl';
  const glassModalHeaderClass = 'sticky top-0 z-10 border-b border-slate-100 bg-white px-6 py-4';
  const glassModalSectionClass = 'rounded-2xl border border-slate-200 bg-slate-50/70 p-5';
  const glassModalLabelClass = 'mb-1.5 block text-sm font-medium text-slate-700';
  const glassModalInputClass = 'h-11 rounded-xl';
  const glassModalTextareaClass = 'min-h-[112px] rounded-xl';
  const glassModalFooterClass = 'sticky bottom-0 flex flex-wrap justify-end gap-3 border-t border-slate-100 bg-white px-6 py-4';
  const glassModalSelectContentClass = '';
  const glassDetailCardClass = 'rounded-2xl border border-slate-200 bg-slate-50 p-4';

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
    setDetailLoading(true);
    try {
      const detail = await overtimeApplicationApi.getInfo(id);
      setDetailRecord(detail);
    } catch (error) {
      setShowDetail(false);
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

    const start = new Date(formData.startTime).getTime();
    const end = new Date(formData.endTime).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
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
      setShowDialog(false);
      await fetchList();
    } catch (error) {
      toast.error(getErrorMessage(error, '保存失败'));
    }
  };

  const handleDelete = async (ids: number[]) => {
    if (!ensureCanOperate()) {
      return;
    }
    if (!confirm('确定删除这条加班申请吗？')) {
      return;
    }
    try {
      await overtimeApplicationApi.remove(ids);
      toast.success('删除成功');
      await fetchList();
    } catch (error) {
      toast.error(getErrorMessage(error, '删除失败'));
    }
  };

  const handleSubmit = async (id: number) => {
    if (!ensureCanOperate()) {
      return;
    }
    if (!confirm('确定提交这条加班申请吗？')) {
      return;
    }
    try {
      await overtimeApplicationApi.submit(id);
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
    if (!confirm('确定撤销这条加班申请吗？')) {
      return;
    }
    try {
      await overtimeApplicationApi.cancel(id);
      toast.success('撤销成功');
      await fetchList();
    } catch (error) {
      toast.error(getErrorMessage(error, '撤销失败'));
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
    const config: Record<string, { bg: string; text: string }> = {
      DRAFT: { bg: 'border border-slate-200 bg-slate-50', text: 'text-slate-600' },
      APPROVING: { bg: 'border border-cyan-200 bg-cyan-50', text: 'text-cyan-700' },
      APPROVED: { bg: 'border border-emerald-200 bg-emerald-50', text: 'text-emerald-600' },
      REJECTED: { bg: 'border border-rose-200 bg-rose-50', text: 'text-rose-600' },
      CANCELLED: { bg: 'border border-slate-200 bg-slate-100', text: 'text-slate-600' },
    };
    const currentConfig = config[status] || config.DRAFT;
    return (
      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${currentConfig.bg} ${currentConfig.text}`}>
        {statusMap[status] || status}
      </span>
    );
  };

  const todayLabel = formatDateCN(new Date());
  const timeLabel = new Date().toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const draftCount = list.filter((item) => item.status === 'DRAFT').length;
  const pendingCount = list.filter((item) => item.status === 'APPROVING').length;
  const approvedCount = list.filter((item) => item.status === 'APPROVED').length;
  const totalHours = list.reduce((sum, item) => sum + Number(item.duration || 0), 0);
  const currentStatusLabel = searchParams.status ? (statusMap[searchParams.status] || searchParams.status) : '全部状态';
  const currentTypeLabel = searchParams.overtimeType ? (overtimeTypeMap[searchParams.overtimeType] || searchParams.overtimeType) : '全部类型';
  const hasActiveFilters = Boolean(searchParams.status || searchParams.overtimeType);
  const totalPages = Math.max(1, Math.ceil(total / searchParams.pageSize));

  const getActionHint = (status?: string) => {
    switch (status) {
      case 'DRAFT':
        return '草稿可继续补充时段与事由后提交';
      case 'APPROVING':
        return '审批进行中，可等待流程结果';
      case 'APPROVED':
        return '审批完成，可用于调休或费用核对';
      case 'REJECTED':
        return '可调整内容后重新发起申请';
      case 'CANCELLED':
        return '申请已取消，可重新创建';
      default:
        return '当前记录可用于回看加班申请状态';
    }
  };

  const statusQuickFilters = [
    { label: '全部', value: '' },
    { label: '草稿', value: 'DRAFT' },
    { label: '审批中', value: 'APPROVING' },
    { label: '已通过', value: 'APPROVED' },
    { label: '已驳回', value: 'REJECTED' },
    { label: '已取消', value: 'CANCELLED' },
  ];

  const heroMetrics = useMemo(() => ([
    {
      label: '当前结果',
      value: `${total}`,
      hint: hasActiveFilters ? `${currentStatusLabel} · ${currentTypeLabel}` : '默认视图下全部加班申请',
      icon: <Timer size={17} />,
    },
    {
      label: '待提交草稿',
      value: `${draftCount}`,
      hint: draftCount > 0 ? '建议优先补齐时间段和事由后提交' : '当前没有待提交草稿',
      icon: <Edit size={17} />,
    },
    {
      label: '审批中',
      value: `${pendingCount}`,
      hint: pendingCount > 0 ? '可继续查看流程进度和审批节点' : '当前没有审批中的申请',
      icon: <Clock size={17} />,
    },
    {
      label: '累计加班时长',
      value: `${totalHours.toFixed(1)} h`,
      hint: approvedCount > 0 ? `已通过 ${approvedCount} 条，便于快速估算投入` : '用于快速判断当前加班总量',
      icon: <CheckCircle2 size={17} />,
    },
  ]), [approvedCount, currentStatusLabel, currentTypeLabel, draftCount, hasActiveFilters, pendingCount, total, totalHours]);

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
    setSearchParams(prev => ({ ...prev, status, pageNum: 1 }));
  };

  const handleResetFilters = () => {
    setSearchParams({ status: '', overtimeType: '', pageNum: 1, pageSize: 10 });
  };

  return (
    <div className="relative min-h-screen pb-6">
      <WorkspaceBackdrop />

      <WorkspacePageContent>
        <WorkspaceHeroMetricsSection
          badge={(
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-slate-500">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-600">
                <Clock size={14} />
                {todayLabel}
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-500">{timeLabel}</span>
            </div>
          )}
          title="加班申请"
          actions={(
            <div className="flex flex-wrap gap-2 xl:justify-end">
              <Button
                className="h-9 rounded-xl px-4"
                onClick={handleAdd}
                disabled={selfServiceLocked}
              >
                <Plus size={15} className="mr-2" />
                新建申请
              </Button>
              <Button
                variant="outline"
                className="h-9 rounded-xl px-4"
                onClick={handleExport}
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
                <div className="rounded-xl bg-white/80 p-2 text-amber-600 ring-1 ring-amber-200">
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
                  className="h-8 rounded-full border-slate-200 bg-white px-3.5 shadow-sm hover:bg-slate-50"
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
                        <SelectItem value="REJECTED">已驳回</SelectItem>
                        <SelectItem value="CANCELLED">已取消</SelectItem>
                      </SelectContent>
                    </Select>

                    <Select
                      value={searchParams.overtimeType}
                      onValueChange={(value) =>
                        setSearchParams(prev => ({ ...prev, overtimeType: value, pageNum: 1 }))
                      }
                    >
                      <SelectTrigger className="h-10 rounded-xl">
                        <SelectValue placeholder="请选择加班类型" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">全部类型</SelectItem>
                        <SelectItem value="WORKDAY">工作日</SelectItem>
                        <SelectItem value="WEEKEND">周末</SelectItem>
                        <SelectItem value="HOLIDAY">节假日</SelectItem>
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

            <WorkspaceResultCard total={total} description="轻玻璃视图下展示加班申请记录与当前操作">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <TableHeader className="sticky top-0 z-10 bg-white">
                    <tr>
                      <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">申请单号</TableHead>
                      <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">加班类型</TableHead>
                      <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">开始时间</TableHead>
                      <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">结束时间</TableHead>
                      <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">时长(h)</TableHead>
                      <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">补偿方式</TableHead>
                      <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">状态</TableHead>
                      <TableActionHead className="w-56 px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">当前操作</TableActionHead>
                    </tr>
                  </TableHeader>
                  <tbody className="divide-y divide-slate-100">
                    {loading ? (
                      <WorkspaceTableStateRow colSpan={8} type="loading" title="正在加载加班申请..." />
                    ) : list.length === 0 ? (
                      <WorkspaceTableStateRow
                        colSpan={8}
                        variant="glass"
                        icon={<Timer size={26} />}
                        title={hasActiveFilters ? '当前条件下暂无记录' : '暂无加班申请'}
                        description={hasActiveFilters ? '试试切换状态、清空类型条件，或者直接新建一条加班申请。' : '创建新的加班记录后，这里会展示时段、时长、补偿方式和审批状态。'}
                      />
                    ) : (
                      list.map((item) => (
                        <tr key={item.id} className="bg-white/36 transition hover:bg-white/70">
                          <td className="px-4 py-2.5 text-sm text-slate-900">{item.applicationNo}</td>
                          <td className="px-4 py-2.5 text-sm text-slate-600">
                            {overtimeTypeMap[item.overtimeType] || item.overtimeType}
                          </td>
                          <td className="px-4 py-2.5 text-sm text-slate-600">{item.startTime}</td>
                          <td className="px-4 py-2.5 text-sm text-slate-600">{item.endTime}</td>
                          <td className="px-4 py-2.5 text-sm font-medium text-slate-900">
                            {item.duration ?? '-'}
                          </td>
                          <td className="px-4 py-2.5 text-sm text-slate-600">
                            {compensationTypeMap[item.compensationType] || item.compensationType}
                          </td>
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
                                    className: 'rounded-full bg-slate-50/90 px-2.5 ring-1 ring-slate-200/80 hover:bg-slate-100',
                                  },
                                  {
                                    label: '编辑',
                                    icon: <Edit size={14} />,
                                    onClick: () => handleEdit(item.id!),
                                    tone: 'primary',
                                    hidden: item.status !== 'DRAFT' || selfServiceLocked,
                                    className: 'rounded-full bg-pink-50/90 px-2.5 ring-1 ring-pink-100',
                                  },
                                  {
                                    label: '提交',
                                    icon: <Send size={14} />,
                                    onClick: () => handleSubmit(item.id!),
                                    tone: 'success',
                                    hidden: item.status !== 'DRAFT' || selfServiceLocked,
                                    className: 'rounded-full bg-emerald-50/90 px-2.5 ring-1 ring-emerald-100 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800',
                                  },
                                  {
                                    label: '删除',
                                    icon: <Trash2 size={14} />,
                                    onClick: () => handleDelete([item.id!]),
                                    tone: 'danger',
                                    hidden: item.status !== 'DRAFT' || selfServiceLocked,
                                    className: 'rounded-full bg-rose-50/90 px-2.5 ring-1 ring-rose-100 text-rose-600 hover:bg-rose-100 hover:text-rose-700',
                                  },
                                  {
                                    label: '撤销',
                                    icon: <RotateCcw size={14} />,
                                    onClick: () => handleCancel(item.id!),
                                    tone: 'warning',
                                    hidden: !item.status || !['APPROVING', 'APPROVED'].includes(item.status) || selfServiceLocked,
                                    className: 'rounded-full bg-amber-50/90 px-2.5 ring-1 ring-amber-100 text-amber-700 hover:bg-amber-100 hover:text-amber-800',
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

        {showDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/28 p-4 backdrop-blur-sm">
            <div className={`${glassModalShellClass} max-w-3xl`}>
              <div className={glassModalHeaderClass}>
                <div className="relative flex items-start justify-between gap-4">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600">
                      <Timer size={14} />
                      加班申请表单
                    </div>
                    <h3 className="mt-4 text-2xl font-bold tracking-tight text-slate-900">
                      {current ? '编辑加班申请' : '新建加班申请'}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-slate-500">
                      填写加班类型、时间区间、补偿方式和事由后提交审批。
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

              <div className="space-y-4 p-6">
                {/* 将表单拆成分段玻璃卡，减少字段连续堆叠造成的阅读压力。 */}
                <section className={glassModalSectionClass}>
                  <div className="mb-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">基础设置</div>
                    <div className="mt-1 text-sm text-slate-500">先确认本次加班属于哪种场景，以及审批通过后的补偿方式。</div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className={glassModalLabelClass}>
                        加班类型 <span className="text-red-500">*</span>
                      </label>
                      <Select
                        value={formData.overtimeType}
                        onValueChange={(value) => setFormData({ ...formData, overtimeType: value })}
                      >
                        <SelectTrigger className={glassModalInputClass}>
                          <SelectValue placeholder="请选择" />
                        </SelectTrigger>
                        <SelectContent className={glassModalSelectContentClass}>
                          <SelectItem className="rounded-[16px]" value="WORKDAY">工作日</SelectItem>
                          <SelectItem className="rounded-[16px]" value="WEEKEND">周末</SelectItem>
                          <SelectItem className="rounded-[16px]" value="HOLIDAY">节假日</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <label className={glassModalLabelClass}>
                        补偿方式 <span className="text-red-500">*</span>
                      </label>
                      <Select
                        value={formData.compensationType}
                        onValueChange={(value) =>
                          setFormData({ ...formData, compensationType: value })
                        }
                      >
                        <SelectTrigger className={glassModalInputClass}>
                          <SelectValue placeholder="请选择" />
                        </SelectTrigger>
                        <SelectContent className={glassModalSelectContentClass}>
                          <SelectItem className="rounded-[16px]" value="PAYMENT">加班费</SelectItem>
                          <SelectItem className="rounded-[16px]" value="TIME_OFF">调休</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </section>

                <section className={glassModalSectionClass}>
                  <div className="mb-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">时间安排</div>
                    <div className="mt-1 text-sm text-slate-500">明确加班时间区间，方便系统和审批人快速判断本次投入时长。</div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className={glassModalLabelClass}>
                        开始时间 <span className="text-red-500">*</span>
                      </label>
                      <DatePicker
                        className={glassModalInputClass}
                        type="datetime-local"
                        value={formData.startTime}
                        onChange={(event) =>
                          setFormData({ ...formData, startTime: event.target.value })
                        }
                      />
                    </div>
                    <div>
                      <label className={glassModalLabelClass}>
                        结束时间 <span className="text-red-500">*</span>
                      </label>
                      <DatePicker
                        className={glassModalInputClass}
                        type="datetime-local"
                        value={formData.endTime}
                        onChange={(event) =>
                          setFormData({ ...formData, endTime: event.target.value })
                        }
                      />
                    </div>
                  </div>
                </section>

                <section className={glassModalSectionClass}>
                  <div className="mb-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">申请说明</div>
                    <div className="mt-1 text-sm text-slate-500">用一段清晰说明交代本次加班的业务背景、处理事项和必要性。</div>
                  </div>
                  <div>
                    <label className={glassModalLabelClass}>
                      加班事由 <span className="text-red-500">*</span>
                    </label>
                    <Textarea
                      className={glassModalTextareaClass}
                      value={formData.reason}
                      onChange={(event) =>
                        setFormData({ ...formData, reason: event.target.value })
                      }
                      placeholder="请说明本次加班的业务背景、处理事项和预期产出。"
                    />
                  </div>
                </section>
              </div>

              <div className={glassModalFooterClass}>
                <Button variant="outline" onClick={() => setShowDialog(false)} className="rounded-2xl px-5">
                  取消
                </Button>
                <Button onClick={handleSave} className="rounded-2xl px-5">
                  保存
                </Button>
              </div>
            </div>
          </div>
        )}

        {showDetail && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(15,23,42,0.22)] p-4 backdrop-blur-md" onClick={() => !detailLoading && setShowDetail(false)}>
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
                    <h3 className="mt-4 text-2xl font-bold tracking-tight text-slate-900">{detailRecord?.applicationNo || '加班申请'}</h3>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-slate-500">
                      <span>{detailRecord ? (overtimeTypeMap[detailRecord.overtimeType] || detailRecord.overtimeType) : '加载中'}</span>
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

              <div className="flex-1 space-y-6 overflow-y-auto p-6">
                {detailLoading || !detailRecord ? (
                  <WorkspaceInlineState type="loading" title="正在加载加班详情..." className="py-12" />
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
                        <div className="text-xs font-medium text-slate-400">加班类型</div>
                        <div className="mt-2 text-sm font-semibold text-slate-900">{overtimeTypeMap[detailRecord.overtimeType] || detailRecord.overtimeType}</div>
                      </div>
                      <div className={glassDetailCardClass}>
                        <div className="text-xs font-medium text-slate-400">补偿方式</div>
                        <div className="mt-2 text-sm font-semibold text-slate-900">{compensationTypeMap[detailRecord.compensationType] || detailRecord.compensationType}</div>
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
                        <div className="text-xs font-medium text-slate-400">加班时长</div>
                        <div className="mt-2 text-sm font-semibold text-slate-900">{detailRecord.duration ? `${detailRecord.duration} 小时` : '-'}</div>
                      </div>
                      <div className={glassDetailCardClass}>
                        <div className="text-xs font-medium text-slate-400">状态</div>
                        <div className="mt-2 text-sm font-semibold text-slate-900">{statusMap[detailRecord.status || 'DRAFT'] || detailRecord.status || '-'}</div>
                      </div>
                      <div className={glassDetailCardClass}>
                        <div className="text-xs font-medium text-slate-400">创建时间</div>
                        <div className="mt-2 text-sm font-semibold text-slate-900">{renderDetailValue(detailRecord.createTime)}</div>
                      </div>
                    </div>

                    <div className={glassModalSectionClass}>
                      <div className="text-sm font-semibold text-slate-900">加班事由</div>
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
                <Button
                  variant="outline"
                  onClick={() => setShowDetail(false)}
                  className="rounded-2xl px-5"
                >
                  关闭
                </Button>
              </div>
            </div>
          </div>
        )}
    </div>
  );
};

export default OvertimeApplicationPage;
