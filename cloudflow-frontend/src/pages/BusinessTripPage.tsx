import React, { useEffect, useMemo, useState } from 'react';
import { Ban, CheckCircle2, Clock3, Download, Edit, Eye, Paperclip, Plane, Plus, RotateCcw, Search, Send, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { businessTripApi, BusinessTrip } from '../services/api/businessTrip';
import { FileUpload } from '../components/FileUpload';
import { ProcessTrace } from '../components/ProcessTrace';
import { buildExcelFileName, downloadBlob } from '@/utils/download';
import { getErrorMessage } from '@/utils/errorMessage';
import { Button, Card, DatePicker, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, TableActionHead, TableHead, TableHeader, Textarea } from '@/components/ui';
import { TableRowActions } from '@/components/ui/table-row-actions';
import {
  WorkspaceBackdrop,
  WorkspaceHeroMetricsSection,
  WorkspaceIconButton,
  WorkspaceInlineState,
  WorkspacePaginationBar,
  WorkspacePageContent,
  WorkspaceResultCard,
  WorkspaceTableStateRow,
  WorkspaceWorkbenchCard,
  workspaceGlassSurfaceClassName,
} from '@/components/workspace';

const formatDateCN = (date: Date) => {
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  return `${date.getMonth() + 1}月${date.getDate()}日 ${weekdays[date.getDay()]}`;
};

export const BusinessTripPage: React.FC = () => {
  const [list, setList] = useState<BusinessTrip[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchParams, setSearchParams] = useState({ status: '', destination: '', pageNum: 1, pageSize: 10 });
  const [destinationInput, setDestinationInput] = useState('');
  const [total, setTotal] = useState(0);
  const [showDialog, setShowDialog] = useState(false);
  const [current, setCurrent] = useState<BusinessTrip | null>(null);
  const [detailTrip, setDetailTrip] = useState<BusinessTrip | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [formData, setFormData] = useState<BusinessTrip>({
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

  useEffect(() => {
    fetchList();
  }, [searchParams]);

  const fetchList = async () => {
    setLoading(true);
    try {
      const response = await businessTripApi.list(searchParams);
      if (response) {
        setList(response.records || response.rows || []);
        setTotal(response.total || 0);
      }
    } catch (error) {
      toast.error(getErrorMessage(error, '获取列表失败'));
    } finally {
      setLoading(false);
    }
  };

  const applyStatusFilter = (status: string) => {
    setSearchParams(prev => ({ ...prev, status, pageNum: 1 }));
  };

  const applySearch = () => {
    setSearchParams(prev => ({ ...prev, destination: destinationInput.trim(), pageNum: 1 }));
  };

  const handleResetFilters = () => {
    setDestinationInput('');
    setSearchParams({ status: '', destination: '', pageNum: 1, pageSize: 10 });
  };

  const handleAdd = () => {
    setCurrent(null);
    setFormData({
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
    setShowDialog(true);
  };

  const handleEdit = async (id: number) => {
    try {
      const response = await businessTripApi.getInfo(id);
      if (response) {
        setCurrent(response);
        setFormData(response);
        setShowDialog(true);
      }
    } catch (error) {
      toast.error(getErrorMessage(error, '获取详情失败'));
    }
  };

  const handleView = async (trip: BusinessTrip) => {
    // 先展示列表已有信息，再异步补齐接口详情，避免弹窗白屏等待。
    setDetailTrip(trip);
    setDetailLoading(true);
    try {
      const response = await businessTripApi.getInfo(trip.id!);
      if (response) {
        setDetailTrip(response);
      }
    } catch (error) {
      toast.error(getErrorMessage(error, '获取详情失败'));
    } finally {
      setDetailLoading(false);
    }
  };

  const handleSave = async () => {
    if (!formData.departure) {
      toast.error('请填写出发地');
      return;
    }
    if (!formData.destination || !formData.startDate || !formData.endDate || !formData.reason) {
      toast.error('请填写完整信息');
      return;
    }

    try {
      const start = new Date(formData.startDate).getTime();
      const end = new Date(formData.endDate).getTime();
      const days = Math.round((end - start) / 86400000) + 1;
      const data = { ...formData, tripDays: days > 0 ? days : 1 };

      if (current?.id) {
        await businessTripApi.edit(data);
        toast.success('更新成功');
      } else {
        await businessTripApi.add(data);
        toast.success('创建成功');
      }
      setShowDialog(false);
      fetchList();
    } catch (error) {
      toast.error(getErrorMessage(error, '保存失败'));
    }
  };

  const handleDelete = async (ids: number[]) => {
    if (!confirm('确定删除？')) return;
    try {
      await businessTripApi.remove(ids);
      toast.success('删除成功');
      fetchList();
    } catch (error) {
      toast.error(getErrorMessage(error, '删除失败'));
    }
  };

  const handleSubmit = async (id: number) => {
    if (!confirm('确定提交审批？')) return;
    try {
      await businessTripApi.submit(id);
      toast.success('提交成功');
      fetchList();
    } catch (error) {
      toast.error(getErrorMessage(error, '提交失败'));
    }
  };

  const handleCancel = async (id: number) => {
    if (!confirm('确认取消这条出差申请吗？')) return;
    try {
      await businessTripApi.cancel(id);
      toast.success('已取消出差申请');
      setDetailTrip(prev => (prev?.id === id ? { ...prev, status: 'CANCELLED' } : prev));
      fetchList();
    } catch (error) {
      toast.error(getErrorMessage(error, '取消失败'));
    }
  };

  const handleExport = async () => {
    try {
      const blob = await businessTripApi.export(searchParams);
      const fileName = downloadBlob(blob, buildExcelFileName('出差申请'));
      toast.success(
        total > 0
          ? `已导出 ${total} 条出差申请，下载文件：${fileName}`
          : `已导出空结果，下载文件：${fileName}`,
      );
    } catch (error) {
      toast.error(getErrorMessage(error, '导出失败'));
    }
  };

  const statusMap: Record<string, string> = { DRAFT: '草稿', PENDING: '审批中', APPROVED: '已通过', REJECTED: '已驳回', CANCELLED: '已取消' };
  const transportMap: Record<string, string> = { PLANE: '飞机', TRAIN: '火车', CAR: '自驾', OTHER: '其他' };
  const accommodationMap: Record<string, string> = { SELF: '自行安排', COMPANY: '公司安排', NONE: '无需住宿' };

  const getStatusBadge = (status: string) => {
    const config: Record<string, { tone: string }> = {
      DRAFT: { tone: 'border border-slate-200 bg-slate-50 text-slate-600' },
      PENDING: { tone: 'border border-cyan-200 bg-cyan-50 text-cyan-700' },
      APPROVED: { tone: 'border border-emerald-200 bg-emerald-50 text-emerald-600' },
      REJECTED: { tone: 'border border-rose-200 bg-rose-50 text-rose-600' },
      CANCELLED: { tone: 'border border-slate-200 bg-slate-100 text-slate-500' },
    };
    const currentConfig = config[status] || config.DRAFT;
    return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${currentConfig.tone}`}>{statusMap[status] || status}</span>;
  };

  const getAttachmentList = (attachmentUrl?: string) => (
    attachmentUrl
      ?.split(',')
      .map(item => item.trim())
      .filter(Boolean)
      ?? []
  );

  const renderDetailValue = (value?: string | number | null) => {
    if (value === null || value === undefined || value === '') {
      return '-';
    }
    return value;
  };

  const formatAmount = (value?: number) => {
    if (value === undefined || value === null || Number.isNaN(Number(value))) {
      return '-';
    }
    return `¥${Number(value).toFixed(2)}`;
  };

  const todayLabel = formatDateCN(new Date());
  const timeLabel = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  const draftCount = list.filter(item => item.status === 'DRAFT').length;
  const pendingCount = list.filter(item => item.status === 'PENDING').length;
  const approvedCount = list.filter(item => item.status === 'APPROVED').length;
  const totalTripDays = list.reduce((sum, item) => sum + Number(item.tripDays || 0), 0);

  const currentStatusLabel = searchParams.status ? statusMap[searchParams.status] || searchParams.status : '全部状态';

  const statusQuickFilters = useMemo(() => ([
    { label: '全部', value: '' },
    { label: '草稿', value: 'DRAFT' },
    { label: '审批中', value: 'PENDING' },
    { label: '已通过', value: 'APPROVED' },
    { label: '已驳回', value: 'REJECTED' },
    { label: '已取消', value: 'CANCELLED' },
  ]), []);

  const getActionHint = (status?: string) => {
    switch (status) {
      case 'DRAFT':
        return '可继续编辑并提交审批';
      case 'PENDING':
        return '可查看详情或取消申请';
      case 'APPROVED':
        return '审批完成，可回看附件与轨迹';
      case 'REJECTED':
        return '已驳回，建议先查看原因';
      case 'CANCELLED':
        return '已取消，仅保留记录留痕';
      default:
        return '可查看申请详情';
    }
  };

  const hasActiveFilters = Boolean(searchParams.status || searchParams.destination);
  const totalPages = Math.max(1, Math.ceil(total / searchParams.pageSize));

  // 顶部四张信息卡统一在这里定义，方便后续继续调整视觉层级和提示文案。
  const heroMetrics = useMemo(() => ([
    {
      label: '当前结果',
      value: `${total}`,
      hint: hasActiveFilters
        ? `${currentStatusLabel} · ${searchParams.destination || '全部目的地'}`
        : '默认视图下全部申请',
      icon: <Plane size={17} />,
    },
    {
      label: '待补充草稿',
      value: `${draftCount}`,
      hint: draftCount > 0 ? '建议优先补齐材料再提交' : '当前没有待补充草稿',
      icon: <Edit size={17} />,
    },
    {
      label: '审批中',
      value: `${pendingCount}`,
      hint: pendingCount > 0 ? '可查看流程轨迹与审批进度' : '当前没有审批中的申请',
      icon: <Clock3 size={17} />,
    },
    {
      label: '累计出差天数',
      value: `${totalTripDays} 天`,
      hint: approvedCount > 0 ? `已通过 ${approvedCount} 条，便于快速估算投入` : '用于快速判断当前出差投入规模',
      icon: <CheckCircle2 size={17} />,
    },
  ]), [approvedCount, currentStatusLabel, draftCount, hasActiveFilters, pendingCount, searchParams.destination, total, totalTripDays]);

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
      label: '目的地',
      value: searchParams.destination || '全部',
    },
    {
      label: '视图',
      value: hasActiveFilters ? '筛选结果' : '默认视图',
    },
  ];

  const glassModalShellClass = 'w-full max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl';
  const glassModalHeaderClass = 'border-b border-slate-100 px-6 py-4';
  const glassModalSectionClass = 'rounded-2xl border border-slate-200 bg-slate-50/70 p-4';
  const glassModalLabelClass = 'mb-1.5 block text-sm font-medium text-slate-700';
  const glassModalInputClass = 'h-11 rounded-xl';
  const glassModalTextareaClass = 'min-h-28 rounded-xl';
  const glassModalFooterClass = 'flex justify-end gap-3 border-t border-slate-100 px-6 py-4';
  const glassDetailCardClass = 'rounded-2xl border border-slate-200 bg-slate-50 p-4';

  return (
    <div className="relative min-h-screen pb-6">
      <WorkspaceBackdrop />

      <WorkspacePageContent>
        <WorkspaceHeroMetricsSection
          badge={(
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-slate-500">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-600">
                <Plane size={14} />
                {todayLabel}
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-500">{timeLabel}</span>
            </div>
          )}
          title="出差申请"
          actions={(
            <div className="flex flex-wrap gap-2 xl:justify-end">
              <Button size="lg" onClick={handleAdd}>
                <Plus size={15} className="mr-2" />
                新建申请
              </Button>
              <Button variant="outline" size="lg" onClick={handleExport}>
                <Download size={15} className="mr-2" />
                导出结果
              </Button>
            </div>
          )}
          contentClassName="p-4 sm:p-5"
          metrics={heroMetrics.map((item) => ({
            label: item.label,
            value: item.value,
            hint: item.hint,
            icon: item.icon,
          }))}
        />

        <Card className={`${workspaceGlassSurfaceClassName} p-3.5`}>
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
                <Button variant="outline" size="sm" onClick={handleResetFilters}>
                  <RotateCcw size={15} className="mr-2" />
                  清空所有条件
                </Button>
              ) : (
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-medium text-slate-400">
                  默认视图
                </span>
              )}
              filterBar={(
                <div className="grid grid-cols-1 gap-2.5 xl:grid-cols-[minmax(0,1fr)_auto_auto]">
                  <div className="relative">
                    <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <Input
                      type="text"
                      placeholder="按目的地搜索，如 杭州、苏州"
                      value={destinationInput}
                      onChange={e => setDestinationInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          applySearch();
                        }
                      }}
                      className="h-10 rounded-2xl pr-4"
                    />
                  </div>

                  <Button size="sm" onClick={applySearch}>
                    <Search size={15} className="mr-2" />
                    应用筛选
                  </Button>

                  <Button variant="outline" size="sm" onClick={handleResetFilters}>
                    <RotateCcw size={15} className="mr-2" />
                    清空条件
                  </Button>
                </div>
              )}
            />

            <WorkspaceResultCard total={total} description="行程、费用与状态">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <TableHeader className="sticky top-0 z-10 bg-white/72 backdrop-blur-xl">
                    <tr>
                      <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">出差单号</TableHead>
                      <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">出发地→目的地</TableHead>
                      <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">日期</TableHead>
                      <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">天数</TableHead>
                      <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">交通</TableHead>
                      <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">住宿</TableHead>
                      <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">费用</TableHead>
                      <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">附件</TableHead>
                      <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">状态</TableHead>
                      <TableActionHead className="px-4 py-3 w-52 text-right text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">当前操作</TableActionHead>
                    </tr>
                  </TableHeader>
                  <tbody className="divide-y divide-white/70">
                    {loading ? (
                      <WorkspaceTableStateRow colSpan={10} type="loading" title="正在加载出差申请..." />
                    ) : list.length === 0 ? (
                      <WorkspaceTableStateRow
                        colSpan={10}
                        variant="glass"
                        icon={<Plane size={26} />}
                        title={hasActiveFilters ? '当前条件下暂无记录' : '暂无出差申请'}
                        description={hasActiveFilters ? '试试切换状态、清空目的地条件，或者直接新建一条出差申请。' : '创建新的出差申请后，这里会展示行程、费用、住宿安排和审批状态。'}
                      />
                    ) : list.map(item => (
                      <tr key={item.id} className="bg-white/36 transition hover:bg-white/70">
                        <td className="px-4 py-2.5 text-sm text-slate-900">{item.tripNo}</td>
                        <td className="px-4 py-2.5 text-sm font-medium text-slate-900">{item.departure ? `${item.departure} → ` : ''}{item.destination}</td>
                        <td className="px-4 py-2.5 text-sm text-slate-600">{item.startDate} ~ {item.endDate}</td>
                        <td className="px-4 py-2.5 text-sm">{item.tripDays || '-'}天</td>
                        <td className="px-4 py-2.5 text-sm">{transportMap[item.transportType || ''] || '-'}</td>
                        <td className="px-4 py-2.5 text-sm">{accommodationMap[item.accommodation || ''] || '-'}</td>
                        <td className="px-4 py-2.5 text-sm">¥{item.estimatedCost?.toFixed(2) || '0.00'}</td>
                        <td className="px-4 py-2.5 text-sm">{item.attachmentUrl ? <Paperclip size={14} className="text-cyan-500" /> : <span className="text-slate-300">-</span>}</td>
                        <td className="px-4 py-2.5">{getStatusBadge(item.status || 'DRAFT')}</td>
                        <td className="px-4 py-2.5 whitespace-nowrap text-right">
                          <div className="flex flex-col items-end gap-1">
                            <TableRowActions
                              align="end"
                              className="gap-1"
                              actions={[
                                {
                                  label: '详情',
                                  title: '查看申请详情与流程轨迹',
                                  icon: <Eye size={14} />,
                                  onClick: () => void handleView(item),
                                  tone: 'neutral',
                                  className: 'rounded-full bg-slate-50/90 px-2.5 ring-1 ring-slate-200/80 hover:bg-slate-100',
                                },
                                {
                                  label: '编辑',
                                  title: '继续补充草稿内容',
                                  icon: <Edit size={14} />,
                                  onClick: () => handleEdit(item.id!),
                                  tone: 'primary',
                                  hidden: item.status !== 'DRAFT',
                                  className: 'rounded-full bg-cyan-50/90 px-2.5 ring-1 ring-cyan-100 text-cyan-700 hover:bg-cyan-100 hover:text-cyan-800',
                                },
                                {
                                  label: '提交',
                                  title: '发起审批流程',
                                  icon: <Send size={14} />,
                                  onClick: () => handleSubmit(item.id!),
                                  tone: 'success',
                                  hidden: item.status !== 'DRAFT',
                                  className: 'rounded-full bg-emerald-50/90 px-2.5 ring-1 ring-emerald-100 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800',
                                },
                                {
                                  label: '取消',
                                  title: '取消当前审批中的申请',
                                  icon: <Ban size={14} />,
                                  onClick: () => handleCancel(item.id!),
                                  tone: 'warning',
                                  hidden: item.status !== 'PENDING',
                                  className: 'rounded-full bg-amber-50/90 px-2.5 ring-1 ring-amber-100 text-amber-700 hover:bg-amber-100 hover:text-amber-800',
                                },
                                {
                                  label: '删除',
                                  title: '删除草稿申请',
                                  icon: <Trash2 size={14} />,
                                  onClick: () => handleDelete([item.id!]),
                                  tone: 'danger',
                                  hidden: item.status !== 'DRAFT',
                                  className: 'rounded-full bg-rose-50/90 px-2.5 ring-1 ring-rose-100 text-rose-600 hover:bg-rose-100 hover:text-rose-700',
                                },
                              ]}
                            />
                            <span className="text-[10px] font-medium text-slate-400">{getActionHint(item.status)}</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <WorkspacePaginationBar
                total={total}
                pageNum={searchParams.pageNum}
                totalPages={totalPages}
                onPrev={() => setSearchParams(prev => ({ ...prev, pageNum: Math.max(1, prev.pageNum - 1) }))}
                onNext={() => setSearchParams(prev => ({ ...prev, pageNum: prev.pageNum + 1 }))}
                prevDisabled={searchParams.pageNum === 1}
                nextDisabled={searchParams.pageNum * searchParams.pageSize >= total}
              />
            </WorkspaceResultCard>
          </div>
        </Card>

        {showDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(15,23,42,0.2)] p-4 backdrop-blur-md">
            <div className={`${glassModalShellClass} max-w-3xl`}>
              <div className={glassModalHeaderClass}>
                <div className="relative flex items-start justify-between gap-4">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600">
                      <Plane size={14} />
                      出差申请
                    </div>
                    <h3 className="mt-4 text-xl font-semibold tracking-tight text-slate-900">{current ? '编辑出差申请' : '新增出差申请'}</h3>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">{current ? '修改现有申请' : '创建新申请'}</span>
                      <span className="rounded-full border border-cyan-100 bg-cyan-50 px-2.5 py-1 text-cyan-700">按审批需要补齐信息</span>
                    </div>
                  </div>
                  <WorkspaceIconButton icon={<X size={18} />} label="关闭出差申请表单" shape="circle" onClick={() => setShowDialog(false)} className="border border-slate-200 bg-white hover:bg-slate-50" />
                </div>
              </div>

              <div className="space-y-4 p-6">
                {/* 将长表单拆成多块玻璃分组，降低一次性阅读整屏字段的压力。 */}
                <section className={glassModalSectionClass}>
                  <div className="mb-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">基础行程</div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className={glassModalLabelClass}>出发地 <span className="text-red-500">*</span></label>
                      <Input className={glassModalInputClass} type="text" value={formData.departure || ''} onChange={e => setFormData({ ...formData, departure: e.target.value })} placeholder="如：北京" />
                    </div>
                    <div>
                      <label className={glassModalLabelClass}>目的地 <span className="text-red-500">*</span></label>
                      <Input className={glassModalInputClass} type="text" value={formData.destination} onChange={e => setFormData({ ...formData, destination: e.target.value })} placeholder="如：上海" />
                    </div>
                    <div>
                      <label className={glassModalLabelClass}>开始日期 <span className="text-red-500">*</span></label>
                      <DatePicker className={glassModalInputClass} type="date" value={formData.startDate} onChange={e => setFormData({ ...formData, startDate: e.target.value })} />
                    </div>
                    <div>
                      <label className={glassModalLabelClass}>结束日期 <span className="text-red-500">*</span></label>
                      <DatePicker className={glassModalInputClass} type="date" value={formData.endDate} onChange={e => setFormData({ ...formData, endDate: e.target.value })} />
                    </div>
                  </div>
                </section>

                <section className={glassModalSectionClass}>
                  <div className="mb-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">交通与预算</div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className={glassModalLabelClass}>交通方式</label>
                      <Select value={formData.transportType || 'TRAIN'} onValueChange={value => setFormData({ ...formData, transportType: value })}>
                        <SelectTrigger className={glassModalInputClass}><SelectValue placeholder="请选择" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem className="rounded-[16px]" value="PLANE">飞机</SelectItem>
                          <SelectItem className="rounded-[16px]" value="TRAIN">火车</SelectItem>
                          <SelectItem className="rounded-[16px]" value="CAR">自驾</SelectItem>
                          <SelectItem className="rounded-[16px]" value="OTHER">其他</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className={glassModalLabelClass}>住宿安排</label>
                      <Select value={formData.accommodation || 'SELF'} onValueChange={value => setFormData({ ...formData, accommodation: value })}>
                        <SelectTrigger className={glassModalInputClass}><SelectValue placeholder="请选择" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem className="rounded-[16px]" value="SELF">自行安排</SelectItem>
                          <SelectItem className="rounded-[16px]" value="COMPANY">公司安排</SelectItem>
                          <SelectItem className="rounded-[16px]" value="NONE">无需住宿</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className={glassModalLabelClass}>预计费用(元)</label>
                      <Input className={glassModalInputClass} type="number" value={formData.estimatedCost || ''} onChange={e => setFormData({ ...formData, estimatedCost: parseFloat(e.target.value) || 0 })} placeholder="0.00" step="0.01" min="0" />
                    </div>
                    <div>
                      <label className={glassModalLabelClass}>关联项目</label>
                      <Input className={glassModalInputClass} type="text" value={formData.projectName || ''} onChange={e => setFormData({ ...formData, projectName: e.target.value })} placeholder="如：华东客户拜访、驻场实施支持" />
                    </div>
                  </div>
                </section>

                <section className={glassModalSectionClass}>
                  <div className="mb-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">联系与协作</div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="md:col-span-2">
                      <label className={glassModalLabelClass}>出差期间联系电话</label>
                      <Input className={glassModalInputClass} type="tel" value={formData.contactPhone || ''} onChange={e => setFormData({ ...formData, contactPhone: e.target.value })} placeholder="出差期间可直接联系到你的手机号" />
                    </div>
                    <div>
                      <label className={glassModalLabelClass}>紧急联系人</label>
                      <Input className={glassModalInputClass} type="text" value={formData.emergencyContact || ''} onChange={e => setFormData({ ...formData, emergencyContact: e.target.value })} placeholder="姓名" />
                    </div>
                    <div>
                      <label className={glassModalLabelClass}>紧急联系人电话</label>
                      <Input className={glassModalInputClass} type="tel" value={formData.emergencyPhone || ''} onChange={e => setFormData({ ...formData, emergencyPhone: e.target.value })} placeholder="电话" />
                    </div>
                    <div className="md:col-span-2">
                      <label className={glassModalLabelClass}>同行人员</label>
                      <Input className={glassModalInputClass} type="text" value={formData.companions || ''} onChange={e => setFormData({ ...formData, companions: e.target.value })} placeholder="如：销售张三、实施李四" />
                    </div>
                  </div>
                </section>

                <section className={glassModalSectionClass}>
                  <div className="mb-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">申请说明</div>
                  </div>
                  <div>
                    <label className={glassModalLabelClass}>出差事由 <span className="text-red-500">*</span></label>
                    <Textarea className={glassModalTextareaClass} value={formData.reason} onChange={e => setFormData({ ...formData, reason: e.target.value })} placeholder="例如：赴上海客户现场演示、参加杭州交付培训、驻场处理上线问题" />
                  </div>
                </section>

                <section className={glassModalSectionClass}>
                  <div className="mb-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">附件材料</div>
                  </div>
                  <FileUpload value={formData.attachmentUrl || ''} onChange={(urls) => setFormData({ ...formData, attachmentUrl: urls })} maxCount={5} hint="可上传邀请函、会议通知、行程单、酒店预订单等，最多 5 个文件" />
                </section>
              </div>

              <div className={glassModalFooterClass}>
                <Button variant="outline" size="lg" onClick={() => setShowDialog(false)}>取消</Button>
                <Button size="lg" onClick={handleSave}>保存</Button>
              </div>
            </div>
          </div>
        )}

        {detailTrip && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(15,23,42,0.22)] p-4 backdrop-blur-md" onClick={() => !detailLoading && setDetailTrip(null)}>
            <div
              className={`flex max-h-[90vh] max-w-5xl flex-col ${glassModalShellClass}`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className={glassModalHeaderClass}>
                <div className="relative flex items-start justify-between gap-4">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600">
                      <Eye size={14} />
                      出差详情
                    </div>
                    <h3 className="mt-4 text-xl font-semibold tracking-tight text-slate-900">{detailTrip.tripNo || '出差申请'}</h3>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-slate-500">
                      <span>{detailTrip.departure ? `${detailTrip.departure} → ` : ''}{detailTrip.destination || '-'}</span>
                      {getStatusBadge(detailTrip.status || 'DRAFT')}
                    </div>
                  </div>
                  <WorkspaceIconButton icon={<X size={18} />} label="关闭出差详情" shape="circle" onClick={() => setDetailTrip(null)} className="border border-slate-200 bg-white hover:bg-slate-50" />
                </div>
              </div>

              <div className="flex-1 space-y-6 overflow-y-auto p-6">
                {detailLoading ? (
                  <WorkspaceInlineState type="loading" title="正在加载出差详情..." className="py-12" />
                ) : (
                  <>
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      <div className={glassDetailCardClass}>
                        <div className="text-xs font-medium text-slate-400">出发地</div>
                        <div className="mt-2 text-sm font-semibold text-slate-900">{renderDetailValue(detailTrip.departure)}</div>
                      </div>
                      <div className={glassDetailCardClass}>
                        <div className="text-xs font-medium text-slate-400">目的地</div>
                        <div className="mt-2 text-sm font-semibold text-slate-900">{renderDetailValue(detailTrip.destination)}</div>
                      </div>
                      <div className={glassDetailCardClass}>
                        <div className="text-xs font-medium text-slate-400">出差日期</div>
                        <div className="mt-2 text-sm font-semibold text-slate-900">{renderDetailValue(detailTrip.startDate)} ~ {renderDetailValue(detailTrip.endDate)}</div>
                      </div>
                      <div className={glassDetailCardClass}>
                        <div className="text-xs font-medium text-slate-400">出差天数</div>
                        <div className="mt-2 text-sm font-semibold text-slate-900">
                          {detailTrip.tripDays ? `${detailTrip.tripDays} 天` : '-'}
                        </div>
                      </div>
                      <div className={glassDetailCardClass}>
                        <div className="text-xs font-medium text-slate-400">交通方式</div>
                        <div className="mt-2 text-sm font-semibold text-slate-900">{transportMap[detailTrip.transportType || ''] || '-'}</div>
                      </div>
                      <div className={glassDetailCardClass}>
                        <div className="text-xs font-medium text-slate-400">住宿安排</div>
                        <div className="mt-2 text-sm font-semibold text-slate-900">{accommodationMap[detailTrip.accommodation || ''] || '-'}</div>
                      </div>
                      <div className={glassDetailCardClass}>
                        <div className="text-xs font-medium text-slate-400">预计费用</div>
                        <div className="mt-2 text-sm font-semibold text-slate-900">{formatAmount(detailTrip.estimatedCost)}</div>
                      </div>
                      <div className={glassDetailCardClass}>
                        <div className="text-xs font-medium text-slate-400">关联项目</div>
                        <div className="mt-2 text-sm font-semibold text-slate-900">{renderDetailValue(detailTrip.projectName)}</div>
                      </div>
                      <div className={glassDetailCardClass}>
                        <div className="text-xs font-medium text-slate-400">申请人</div>
                        <div className="mt-2 text-sm font-semibold text-slate-900">{renderDetailValue(detailTrip.userName)}</div>
                      </div>
                      <div className={glassDetailCardClass}>
                        <div className="text-xs font-medium text-slate-400">联系电话</div>
                        <div className="mt-2 text-sm font-semibold text-slate-900">{renderDetailValue(detailTrip.contactPhone)}</div>
                      </div>
                      <div className={glassDetailCardClass}>
                        <div className="text-xs font-medium text-slate-400">紧急联系人</div>
                        <div className="mt-2 text-sm font-semibold text-slate-900">
                          {detailTrip.emergencyContact || detailTrip.emergencyPhone
                            ? `${detailTrip.emergencyContact || '-'} / ${detailTrip.emergencyPhone || '-'}`
                            : '-'}
                        </div>
                      </div>
                      <div className={glassDetailCardClass}>
                        <div className="text-xs font-medium text-slate-400">同行人员</div>
                        <div className="mt-2 text-sm font-semibold text-slate-900">{renderDetailValue(detailTrip.companions)}</div>
                      </div>
                    </div>

                    <div className={glassModalSectionClass}>
                      <div className="text-sm font-semibold text-slate-900">出差事由</div>
                      <div className="mt-3 whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-7 text-slate-600">
                        {detailTrip.reason || '-'}
                      </div>
                    </div>

                    <div className={glassModalSectionClass}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold text-slate-900">附件</div>
                        <div className="text-xs text-slate-400">支持直接打开已上传文件</div>
                      </div>
                      <div className="mt-4 space-y-2">
                        {getAttachmentList(detailTrip.attachmentUrl).length > 0 ? (
                          getAttachmentList(detailTrip.attachmentUrl).map((url) => {
                            const label = url.split('/').pop() || '附件';
                            return (
                              <a
                                key={url}
                                href={url}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 transition hover:border-cyan-200 hover:bg-white hover:text-cyan-700"
                              >
                                <Paperclip size={14} />
                                <span className="truncate">{label}</span>
                              </a>
                            );
                          })
                        ) : (
                          <WorkspaceInlineState title="暂无附件" description="当前出差单还没有上传附件材料。" className="py-5" />
                        )}
                      </div>
                    </div>

                    <div className={glassModalSectionClass}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold text-slate-900">流程轨迹</div>
                        <div className="text-xs text-slate-400">
                          {detailTrip.instanceId ? `实例号：${detailTrip.instanceId}` : '草稿或未发起流程时暂无轨迹'}
                        </div>
                      </div>
                      <div className="mt-4">
                        {detailTrip.instanceId ? (
                          <ProcessTrace instanceId={detailTrip.instanceId} />
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
                {detailTrip.status === 'PENDING' ? (
                  <Button variant="destructive" size="lg" onClick={() => detailTrip.id && void handleCancel(detailTrip.id)}>
                    取消申请
                  </Button>
                ) : null}
                <Button variant="outline" size="lg" onClick={() => setDetailTrip(null)}>关闭</Button>
              </div>
            </div>
          </div>
        )}
      </WorkspacePageContent>
    </div>
  );
};

export default BusinessTripPage;
