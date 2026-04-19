import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CalendarClock,
  ClipboardCheck,
  Download,
  Eye,
  Edit,
  Plus,
  RotateCcw,
  Search,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  attendanceSupplementApi,
  AttendanceSupplement,
  AttendanceSupplementForm,
} from '@/services/api/attendanceSupplement';
import { useHrSelfServiceEligibility } from '@/hooks/useHrSelfServiceEligibility';
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

const emptyForm = (): AttendanceSupplementForm => ({
  attendanceDate: '',
  checkType: 'CHECK_IN',
  checkTime: '09:00',
  reason: '',
});

const formatDateCN = (date: Date) => {
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  return `${date.getMonth() + 1}月${date.getDate()}日 ${weekdays[date.getDay()]}`;
};

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
  const glassModalShellClass = 'w-full rounded-2xl border border-slate-200 bg-white shadow-[0_22px_44px_rgba(15,23,42,0.14)]';
  const glassModalHeaderClass = 'sticky top-0 z-10 border-b border-slate-100 bg-white px-5 py-4';
  const glassModalSectionClass = 'rounded-2xl border border-slate-200 bg-slate-50 p-4';
  const glassModalLabelClass = 'mb-1.5 block text-sm font-medium text-slate-700';
  const glassModalInputClass = 'h-11 rounded-xl';
  const glassModalTextareaClass = 'min-h-[112px] rounded-xl';
  const glassModalFooterClass = 'sticky bottom-0 flex flex-wrap justify-end gap-3 border-t border-slate-100 bg-white px-5 py-4';
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
    setDetailLoading(true);
    try {
      const detail = await attendanceSupplementApi.getInfo(id);
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
    if (!confirm('确定删除这条考勤补录申请吗？')) {
      return;
    }
    try {
      await attendanceSupplementApi.remove(ids);
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
    if (!confirm('确定提交这条考勤补录申请吗？')) {
      return;
    }
    try {
      await attendanceSupplementApi.submit(id);
      toast.success('提交成功');
      await fetchList();
    } catch (error) {
      toast.error(getErrorMessage(error, '提交失败'));
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
    const config: Record<string, { bg: string; text: string }> = {
      MISSING: { bg: 'bg-slate-100', text: 'text-slate-600' },
      APPROVING: { bg: 'bg-cyan-50', text: 'text-cyan-600' },
      SUPPLEMENT: { bg: 'bg-emerald-100', text: 'text-emerald-600' },
      REJECTED: { bg: 'bg-red-100', text: 'text-red-600' },
    };
    const currentConfig = config[status] || config.MISSING;
    return (
      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${currentConfig.bg} ${currentConfig.text}`}>
        {statusMap[status] || status}
      </span>
    );
  };

  const draftCount = list.filter((item) => item.status === 'MISSING').length;
  const pendingCount = list.filter((item) => item.status === 'APPROVING').length;
  const approvedCount = list.filter((item) => item.status === 'SUPPLEMENT').length;
  const todayLabel = formatDateCN(new Date());
  const timeLabel = new Date().toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const currentStatusLabel = searchParams.status ? (statusMap[searchParams.status] || searchParams.status) : '全部状态';
  const currentTypeLabel = searchParams.checkType ? (checkTypeMap[searchParams.checkType] || searchParams.checkType) : '全部类型';
  const hasActiveFilters = Boolean(searchParams.status || searchParams.checkType);
  const totalPages = Math.max(1, Math.ceil(total / searchParams.pageSize));

  const getActionHint = (status?: string) => {
    switch (status) {
      case 'MISSING':
        return '草稿可继续补录时间与原因后提交';
      case 'APPROVING':
        return '流程进行中，可等待审批结果';
      case 'SUPPLEMENT':
        return '补录已生效，可回看打卡记录';
      case 'REJECTED':
        return '可调整时间或原因后重新提交';
      default:
        return '当前记录可用于回看补录状态';
    }
  };

  const statusQuickFilters = [
    { label: '全部', value: '' },
    { label: '草稿', value: 'MISSING' },
    { label: '审批中', value: 'APPROVING' },
    { label: '已补录', value: 'SUPPLEMENT' },
    { label: '已驳回', value: 'REJECTED' },
  ];

  const heroMetrics = useMemo(() => ([
    {
      label: '当前结果',
      value: `${total}`,
      hint: hasActiveFilters ? `${currentStatusLabel} · ${currentTypeLabel}` : '默认视图下全部补录申请',
      icon: <CalendarClock size={17} />,
    },
    {
      label: '待提交草稿',
      value: `${draftCount}`,
      hint: draftCount > 0 ? '建议优先补齐时间和原因后提交' : '当前没有待提交草稿',
      icon: <Edit size={17} />,
    },
    {
      label: '审批中',
      value: `${pendingCount}`,
      hint: pendingCount > 0 ? '可继续查看流程节点和审批进度' : '当前没有审批中的补录',
      icon: <AlertCircle size={17} />,
    },
    {
      label: '已补录',
      value: `${approvedCount}`,
      hint: approvedCount > 0 ? '已生效记录可用于回看补录完成情况' : '用于快速判断当前已完成补录数',
      icon: <ClipboardCheck size={17} />,
    },
  ]), [approvedCount, currentStatusLabel, currentTypeLabel, draftCount, hasActiveFilters, pendingCount, total]);

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
    setSearchParams({ status: '', checkType: '', pageNum: 1, pageSize: 10 });
  };

  return (
    <div className="relative min-h-screen pb-6">
      <WorkspaceBackdrop />

      <WorkspacePageContent>
        <WorkspaceHeroMetricsSection
          badge={(
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-slate-500">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-600">
                <CalendarClock size={14} />
                {todayLabel}
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-500">{timeLabel}</span>
            </div>
          )}
          title="考勤补录申请"
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
          {restrictionMessage && (
            <div
              data-testid="hr-self-service-restriction"
              className="mb-2 rounded-2xl border border-amber-200 bg-amber-50 px-3.5 py-3.5 text-amber-900 shadow-sm"
            >
              <div className="flex items-start gap-3">
                <div className="rounded-xl border border-amber-200 bg-white p-2 text-amber-600">
                  <AlertCircle size={18} />
                </div>
                <div>
                  <div className="text-sm font-semibold">当前账号暂时不能继续发起 HR 自助流程</div>
                  <div className="mt-1 text-xs leading-6 text-amber-800">{restrictionMessage}</div>
                </div>
              </div>
            </div>
          )}
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
                        <SelectItem value="MISSING">草稿</SelectItem>
                        <SelectItem value="APPROVING">审批中</SelectItem>
                        <SelectItem value="SUPPLEMENT">已补录</SelectItem>
                        <SelectItem value="REJECTED">已驳回</SelectItem>
                      </SelectContent>
                    </Select>

                    <Select
                      value={searchParams.checkType}
                      onValueChange={(value) =>
                        setSearchParams(prev => ({ ...prev, checkType: value, pageNum: 1 }))
                      }
                    >
                      <SelectTrigger className="h-10 rounded-xl">
                        <SelectValue placeholder="请选择打卡类型" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">全部类型</SelectItem>
                        <SelectItem value="CHECK_IN">签到</SelectItem>
                        <SelectItem value="CHECK_OUT">签退</SelectItem>
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

            <WorkspaceResultCard total={total} description="轻玻璃视图下展示补录申请记录与当前操作">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <TableHeader className="sticky top-0 z-10 bg-white">
                    <tr>
                      <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">补录单号</TableHead>
                      <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">补录日期</TableHead>
                      <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">打卡类型</TableHead>
                      <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">补录时间</TableHead>
                      <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">事由</TableHead>
                      <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">状态</TableHead>
                      <TableActionHead className="w-52 px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">当前操作</TableActionHead>
                    </tr>
                  </TableHeader>
                  <tbody className="divide-y divide-slate-100">
                    {loading ? (
                      <WorkspaceTableStateRow colSpan={7} type="loading" title="正在加载补卡申请..." />
                    ) : list.length === 0 ? (
                      <WorkspaceTableStateRow
                        colSpan={7}
                        variant="glass"
                        icon={<ClipboardCheck size={26} />}
                        title={hasActiveFilters ? '当前条件下暂无记录' : '暂无考勤补录申请'}
                        description={hasActiveFilters ? '试试切换状态、清空类型条件，或者直接新建一条补录申请。' : '创建新的补录记录后，这里会展示日期、时间、事由和审批状态。'}
                      />
                    ) : (
                      list.map((item) => (
                        <tr key={item.id} className="transition hover:bg-slate-50">
                          <td className="px-4 py-2.5 text-sm text-slate-900">{item.supplementNo}</td>
                          <td className="px-4 py-2.5 text-sm text-slate-600">{item.attendanceDate}</td>
                          <td className="px-4 py-2.5 text-sm text-slate-600">
                            {checkTypeMap[item.checkType] || item.checkType}
                          </td>
                          <td className="px-4 py-2.5 text-sm text-slate-600">{toTimeValue(item.checkTime)}</td>
                          <td className="max-w-xs truncate px-4 py-2.5 text-sm text-slate-600">{item.reason}</td>
                          <td className="px-4 py-2.5">{getStatusBadge(item.status || 'MISSING')}</td>
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
                                    className: 'rounded-full border border-slate-200 bg-white px-2.5 hover:bg-slate-50',
                                  },
                                  {
                                    label: '编辑',
                                    icon: <Edit size={14} />,
                                    onClick: () => handleEdit(item.id!),
                                    tone: 'primary',
                                    hidden: item.status !== 'MISSING' || selfServiceLocked,
                                    className: 'rounded-full border border-cyan-200 bg-cyan-50 px-2.5 text-cyan-700 hover:bg-cyan-100 hover:text-cyan-800',
                                  },
                                  {
                                    label: '提交',
                                    icon: <Send size={14} />,
                                    onClick: () => handleSubmit(item.id!),
                                    tone: 'success',
                                    hidden: item.status !== 'MISSING' || selfServiceLocked,
                                    className: 'rounded-full border border-emerald-200 bg-emerald-50 px-2.5 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800',
                                  },
                                  {
                                    label: '删除',
                                    icon: <Trash2 size={14} />,
                                    onClick: () => handleDelete([item.id!]),
                                    tone: 'danger',
                                    hidden: item.status !== 'MISSING' || selfServiceLocked,
                                    className: 'rounded-full border border-rose-200 bg-rose-50 px-2.5 text-rose-600 hover:bg-rose-100 hover:text-rose-700',
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
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/32 p-4">
            <div className={`${glassModalShellClass} max-w-3xl`}>
              <div className={glassModalHeaderClass}>
                <div className="relative flex items-start justify-between gap-4">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600">
                      <ClipboardCheck size={14} />
                      考勤补录表单
                    </div>
                    <h3 className="mt-4 text-2xl font-bold tracking-tight text-slate-900">
                      {current ? '编辑补录申请' : '新建补录申请'}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-slate-500">
                      填写补录日期、打卡类型、补录时间和事由后提交审批。
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

              <div className="space-y-4 p-5">
                {/* 将补录字段拆成几个玻璃分组，避免弹窗内部仍然是旧式整块表单。 */}
                <section className={glassModalSectionClass}>
                  <div className="mb-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">补录信息</div>
                    <div className="mt-1 text-sm text-slate-500">先明确补录日期、打卡类型和具体时间，方便系统匹配到正确的考勤记录。</div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className={glassModalLabelClass}>
                        补录日期 <span className="text-red-500">*</span>
                      </label>
                      <DatePicker
                        className={glassModalInputClass}
                        type="date"
                        value={formData.attendanceDate}
                        onChange={(event) =>
                          setFormData({ ...formData, attendanceDate: event.target.value })
                        }
                      />
                    </div>
                    <div>
                      <label className={glassModalLabelClass}>
                        打卡类型 <span className="text-red-500">*</span>
                      </label>
                      <Select
                        value={formData.checkType}
                        onValueChange={(value) => setFormData({ ...formData, checkType: value })}
                      >
                        <SelectTrigger className={glassModalInputClass}>
                          <SelectValue placeholder="请选择" />
                        </SelectTrigger>
                        <SelectContent className={glassModalSelectContentClass}>
                          <SelectItem className="rounded-xl" value="CHECK_IN">签到</SelectItem>
                          <SelectItem className="rounded-xl" value="CHECK_OUT">签退</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="md:col-span-2">
                      <label className={glassModalLabelClass}>
                        补录时间 <span className="text-red-500">*</span>
                      </label>
                      <DatePicker
                        className={glassModalInputClass}
                        type="time"
                        value={formData.checkTime}
                        onChange={(event) =>
                          setFormData({ ...formData, checkTime: event.target.value })
                        }
                      />
                    </div>
                  </div>
                </section>

                <section className={glassModalSectionClass}>
                  <div className="mb-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">事由说明</div>
                    <div className="mt-1 text-sm text-slate-500">说明漏打卡、外出、网络异常等背景，帮助审批人快速判断本次补录是否合理。</div>
                  </div>
                  <div>
                    <label className={glassModalLabelClass}>
                      补录原因 <span className="text-red-500">*</span>
                    </label>
                    <Textarea
                      className={glassModalTextareaClass}
                      value={formData.reason}
                      onChange={(event) =>
                        setFormData({ ...formData, reason: event.target.value })
                      }
                      placeholder="请说明补录原因，例如漏打卡、临时网络异常、外出办事等。"
                    />
                  </div>
                </section>
              </div>

              <div className={glassModalFooterClass}>
                <Button variant="outline" onClick={() => setShowDialog(false)} className="rounded-xl px-5">
                  取消
                </Button>
                <Button onClick={handleSave} className="rounded-xl px-5">
                  保存
                </Button>
              </div>
            </div>
          </div>
        )}

        {showDetail && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/32 p-4" onClick={() => !detailLoading && setShowDetail(false)}>
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
                    <h3 className="mt-4 text-2xl font-bold tracking-tight text-slate-900">{detailRecord?.supplementNo || '考勤补录申请'}</h3>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-slate-500">
                      <span>{detailRecord ? (checkTypeMap[detailRecord.checkType] || detailRecord.checkType) : '加载中'}</span>
                      {detailRecord ? getStatusBadge(detailRecord.status || 'MISSING') : null}
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

              <div className="flex-1 space-y-5 overflow-y-auto p-5">
                {detailLoading || !detailRecord ? (
                  <WorkspaceInlineState type="loading" title="正在加载补卡详情..." className="py-12" />
                ) : (
                  <>
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      <div className={glassDetailCardClass}>
                        <div className="text-xs font-medium text-slate-400">补录单号</div>
                        <div className="mt-2 text-sm font-semibold text-slate-900">{renderDetailValue(detailRecord.supplementNo)}</div>
                      </div>
                      <div className={glassDetailCardClass}>
                        <div className="text-xs font-medium text-slate-400">申请人</div>
                        <div className="mt-2 text-sm font-semibold text-slate-900">{renderDetailValue(detailRecord.employeeName)}</div>
                      </div>
                      <div className={glassDetailCardClass}>
                        <div className="text-xs font-medium text-slate-400">补录日期</div>
                        <div className="mt-2 text-sm font-semibold text-slate-900">{renderDetailValue(detailRecord.attendanceDate)}</div>
                      </div>
                      <div className={glassDetailCardClass}>
                        <div className="text-xs font-medium text-slate-400">打卡类型</div>
                        <div className="mt-2 text-sm font-semibold text-slate-900">{checkTypeMap[detailRecord.checkType] || detailRecord.checkType}</div>
                      </div>
                      <div className={glassDetailCardClass}>
                        <div className="text-xs font-medium text-slate-400">补录时间</div>
                        <div className="mt-2 text-sm font-semibold text-slate-900">{renderDetailValue(detailRecord.checkTime)}</div>
                      </div>
                      <div className={glassDetailCardClass}>
                        <div className="text-xs font-medium text-slate-400">创建时间</div>
                        <div className="mt-2 text-sm font-semibold text-slate-900">{renderDetailValue(detailRecord.createTime)}</div>
                      </div>
                    </div>

                    <div className={glassModalSectionClass}>
                      <div className="text-sm font-semibold text-slate-900">补录原因</div>
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
                  className="rounded-xl px-5"
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

export default AttendanceSupplementPage;
