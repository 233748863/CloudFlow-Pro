import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CalendarClock,
  ClipboardCheck,
  Download,
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
import { TableRowActions } from '@/components/ui/table-row-actions';
import {
  WorkspaceBackdrop,
  WorkspaceEmptyPanel,
  WorkspaceSectionHeader,
} from '@/components/workspace/WorkspacePrimitives';

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
      APPROVING: { bg: 'bg-pink-50', text: 'text-pink-500' },
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

  const focusItems = useMemo(
    () => [
      {
        label: '待提交草稿',
        value: `${draftCount} 条`,
        hint: '还未进入审批流的补录申请',
        tone: 'bg-slate-100 text-slate-600',
      },
      {
        label: '审批中',
        value: `${pendingCount} 条`,
        hint: '等待主管确认的考勤补录',
        tone: 'bg-pink-50 text-pink-600',
      },
      {
        label: '已补录',
        value: `${approvedCount} 条`,
        hint: '已经完成补录并生效的记录',
        tone: 'bg-emerald-50 text-emerald-600',
      },
    ],
    [approvedCount, draftCount, pendingCount],
  );

  return (
    <div className="relative min-h-screen pb-6">
      <WorkspaceBackdrop />

      <div className="relative z-10 space-y-6">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_360px]">
          <Card className="overflow-hidden rounded-[34px] border-white/80 bg-white/78 shadow-[0_20px_60px_rgba(15,23,42,0.05)] backdrop-blur-xl">
            <div className="relative p-7 sm:p-8">
              <div className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_top_right,rgba(244,114,182,0.16),transparent_55%)]" />
              <div className="absolute -right-16 top-8 h-48 w-48 rounded-full bg-pink-200/30 blur-3xl" />
              <div className="absolute bottom-0 left-1/3 h-24 w-24 rounded-full bg-amber-100/55 blur-2xl" />

              <div className="relative">
                <div className="flex flex-wrap items-center gap-3 text-sm font-medium text-slate-500">
                  <span className="inline-flex items-center gap-2 rounded-full bg-pink-50 px-3 py-1.5 text-pink-600 ring-1 ring-pink-100">
                    <CalendarClock size={14} />
                    {todayLabel}
                  </span>
                  <span className="rounded-full bg-white/80 px-3 py-1.5 ring-1 ring-slate-200/80">
                    {timeLabel}
                  </span>
                  <span className="rounded-full bg-white/80 px-3 py-1.5 ring-1 ring-slate-200/80">
                    考勤补录
                  </span>
                </div>

                <div className="mt-6 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                  <div className="max-w-2xl">
                    <div className="inline-flex items-center gap-2 rounded-full bg-white/75 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-pink-600 ring-1 ring-pink-100">
                      <ClipboardCheck size={14} />
                      Attendance Supplement
                    </div>
                    <h1 className="mt-5 text-4xl font-bold tracking-tight text-slate-950 sm:text-[2.85rem]">
                      考勤补录申请
                    </h1>
                    <p className="mt-4 max-w-2xl text-base leading-8 text-slate-600">
                      适用于漏打卡、异常打卡说明等正式补录场景。只保留 HR
                      考勤模块已支持的补录字段，直接提交到考勤补录流程，不再混入外勤兼容数据。
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <Button
                      className="h-12 rounded-2xl bg-pink-500 px-6 text-white shadow-[0_16px_32px_rgba(236,72,153,0.24)] hover:bg-pink-600"
                      onClick={handleAdd}
                      disabled={selfServiceLocked}
                    >
                      <Plus size={16} className="mr-2" />
                      新建申请
                    </Button>
                    <Button
                      variant="outline"
                      className="h-12 rounded-2xl bg-white/85 px-6"
                      onClick={handleExport}
                    >
                      <Download size={16} className="mr-2 text-pink-500" />
                      导出 Excel
                    </Button>
                  </div>
                </div>

                {restrictionMessage && (
                  <div
                    data-testid="hr-self-service-restriction"
                    className="mt-5 rounded-[24px] border border-amber-200 bg-amber-50/90 px-4 py-4 text-amber-900"
                  >
                    <div className="flex items-start gap-3">
                      <div className="rounded-2xl bg-white/80 p-2 text-amber-600 ring-1 ring-amber-200">
                        <AlertCircle size={18} />
                      </div>
                      <div>
                        <div className="text-sm font-semibold">当前账号暂时不能继续发起 HR 自助流程</div>
                        <div className="mt-1 text-xs leading-6 text-amber-800">{restrictionMessage}</div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="mt-7 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-[24px] border border-white/80 bg-white/72 px-4 py-4 shadow-sm backdrop-blur">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">申请总数</div>
                    <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{total}</div>
                    <div className="mt-1 text-xs leading-5 text-slate-500">当前筛选条件下的补录申请数</div>
                  </div>
                  <div className="rounded-[24px] border border-white/80 bg-white/72 px-4 py-4 shadow-sm backdrop-blur">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">待提交</div>
                    <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{draftCount}</div>
                    <div className="mt-1 text-xs leading-5 text-slate-500">还未进入审批的草稿补录</div>
                  </div>
                  <div className="rounded-[24px] border border-white/80 bg-white/72 px-4 py-4 shadow-sm backdrop-blur">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">已补录</div>
                    <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{approvedCount}</div>
                    <div className="mt-1 text-xs leading-5 text-slate-500">已经完成审批并生效的记录</div>
                  </div>
                </div>
              </div>
            </div>
          </Card>

          <Card className="rounded-[34px] border-white/80 bg-white/82 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.04)] backdrop-blur-xl">
            <WorkspaceSectionHeader eyebrow="今日焦点" title="先看这些" />
            <div className="mt-5 space-y-3">
              {focusItems.map((item) => (
                <div
                  key={item.label}
                  className="flex items-start gap-3 rounded-[24px] border border-slate-100 bg-white px-4 py-4"
                >
                  <div className={`rounded-2xl p-3 ${item.tone}`}>
                    <AlertCircle size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-slate-900">{item.label}</div>
                      <div className="text-xs font-semibold text-slate-400">{item.value}</div>
                    </div>
                    <div className="mt-1 text-xs leading-5 text-slate-500">{item.hint}</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <Card className="rounded-[32px] border-white/80 bg-white/78 p-6 shadow-[0_18px_48px_rgba(15,23,42,0.05)] backdrop-blur-xl">
          <div className="flex flex-col gap-5">
            <div className="rounded-[28px] border border-slate-100 bg-gradient-to-r from-white via-pink-50/35 to-white p-5">
              <WorkspaceSectionHeader eyebrow="申请工作区" title="考勤补录记录" />
              <div className="mt-2 text-sm leading-6 text-slate-500">
                先按状态和打卡类型筛选，再继续处理待提交的补录草稿。
              </div>
            </div>

            <div className="rounded-[24px] border border-slate-100 bg-white/85 p-4 shadow-sm">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                <Select
                  value={searchParams.status}
                  onValueChange={(value) =>
                    setSearchParams({ ...searchParams, status: value, pageNum: 1 })
                  }
                >
                  <SelectTrigger className="h-12 rounded-2xl">
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
                    setSearchParams({ ...searchParams, checkType: value, pageNum: 1 })
                  }
                >
                  <SelectTrigger className="h-12 rounded-2xl">
                    <SelectValue placeholder="请选择打卡类型" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">全部类型</SelectItem>
                    <SelectItem value="CHECK_IN">签到</SelectItem>
                    <SelectItem value="CHECK_OUT">签退</SelectItem>
                  </SelectContent>
                </Select>

                <Button
                  onClick={() => setSearchParams({ ...searchParams, pageNum: 1 })}
                  className="h-12 rounded-2xl bg-pink-500 text-white hover:bg-pink-600"
                >
                  <Search size={16} className="mr-2" />
                  搜索
                </Button>

                <Button
                  variant="outline"
                  onClick={() =>
                    setSearchParams({ status: '', checkType: '', pageNum: 1, pageSize: 10 })
                  }
                  className="h-12 rounded-2xl"
                >
                  <RotateCcw size={16} className="mr-2" />
                  重置
                </Button>
              </div>
            </div>

            <div className="overflow-hidden rounded-[28px] border border-slate-100 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <TableHeader className="sticky top-0 z-10">
                    <tr>
                      <TableHead>补录单号</TableHead>
                      <TableHead>补录日期</TableHead>
                      <TableHead>打卡类型</TableHead>
                      <TableHead>补录时间</TableHead>
                      <TableHead>事由</TableHead>
                      <TableHead>状态</TableHead>
                      <TableActionHead className="w-52">操作</TableActionHead>
                    </tr>
                  </TableHeader>
                  <tbody className="divide-y divide-slate-100">
                    {loading ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                          <div className="mx-auto h-6 w-6 animate-spin rounded-full border-b-2 border-pink-500" />
                        </td>
                      </tr>
                    ) : list.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-0 py-0">
                          <WorkspaceEmptyPanel
                            icon={<ClipboardCheck size={26} />}
                            title="暂无考勤补录申请"
                            description="创建新的补录记录后，这里会展示日期、时间、事由和审批状态。"
                          />
                        </td>
                      </tr>
                    ) : (
                      list.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-50/80">
                          <td className="px-4 py-3 text-sm text-slate-900">{item.supplementNo}</td>
                          <td className="px-4 py-3 text-sm text-slate-600">{item.attendanceDate}</td>
                          <td className="px-4 py-3 text-sm text-slate-600">
                            {checkTypeMap[item.checkType] || item.checkType}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-600">{toTimeValue(item.checkTime)}</td>
                          <td className="max-w-xs truncate px-4 py-3 text-sm text-slate-600">{item.reason}</td>
                          <td className="px-4 py-3">{getStatusBadge(item.status || 'MISSING')}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-right">
                            <TableRowActions
                              align="end"
                              actions={[
                                {
                                  label: '编辑',
                                  icon: <Edit size={14} />,
                                  onClick: () => handleEdit(item.id!),
                                  tone: 'primary',
                                  hidden: item.status !== 'MISSING' || selfServiceLocked,
                                },
                                {
                                  label: '提交',
                                  icon: <Send size={14} />,
                                  onClick: () => handleSubmit(item.id!),
                                  tone: 'success',
                                  hidden: item.status !== 'MISSING' || selfServiceLocked,
                                },
                                {
                                  label: '删除',
                                  icon: <Trash2 size={14} />,
                                  onClick: () => handleDelete([item.id!]),
                                  tone: 'danger',
                                  hidden: item.status !== 'MISSING' || selfServiceLocked,
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

              <div className="flex items-center justify-between border-t border-slate-100 px-4 py-4">
                <span className="text-sm text-slate-600">共 {total} 条</span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() =>
                      setSearchParams((prev) => ({
                        ...prev,
                        pageNum: Math.max(1, prev.pageNum - 1),
                      }))
                    }
                    disabled={searchParams.pageNum === 1}
                    className="rounded-xl"
                  >
                    上一页
                  </Button>
                  <span className="px-3 py-2 text-sm text-slate-600">第 {searchParams.pageNum} 页</span>
                  <Button
                    variant="outline"
                    onClick={() =>
                      setSearchParams((prev) => ({
                        ...prev,
                        pageNum: prev.pageNum + 1,
                      }))
                    }
                    disabled={searchParams.pageNum * searchParams.pageSize >= total}
                    className="rounded-xl"
                  >
                    下一页
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {showDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/28 p-4 backdrop-blur-sm">
            <div className="w-full max-w-lg rounded-[32px] border border-white/80 bg-white/95 shadow-[0_28px_72px_rgba(15,23,42,0.18)] backdrop-blur-xl">
              <div className="sticky top-0 z-10 border-b border-slate-100 bg-white/95 px-6 pb-5 pt-6">
                <div className="absolute inset-x-0 top-0 h-28 bg-[radial-gradient(circle_at_top_right,rgba(244,114,182,0.16),transparent_70%)]" />
                <div className="relative flex items-start justify-between gap-4">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full bg-pink-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-pink-600 ring-1 ring-pink-100">
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
                    className="rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  >
                    <X size={18} />
                  </Button>
                </div>
              </div>

              <div className="space-y-4 p-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      补录日期 <span className="text-red-500">*</span>
                    </label>
                    <DatePicker
                      type="date"
                      value={formData.attendanceDate}
                      onChange={(event) =>
                        setFormData({ ...formData, attendanceDate: event.target.value })
                      }
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      打卡类型 <span className="text-red-500">*</span>
                    </label>
                    <Select
                      value={formData.checkType}
                      onValueChange={(value) => setFormData({ ...formData, checkType: value })}
                    >
                      <SelectTrigger className="h-12 rounded-2xl">
                        <SelectValue placeholder="请选择" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="CHECK_IN">签到</SelectItem>
                        <SelectItem value="CHECK_OUT">签退</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    补录时间 <span className="text-red-500">*</span>
                  </label>
                  <DatePicker
                    type="time"
                    value={formData.checkTime}
                    onChange={(event) =>
                      setFormData({ ...formData, checkTime: event.target.value })
                    }
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    事由说明 <span className="text-red-500">*</span>
                  </label>
                  <Textarea
                    className="h-28 rounded-2xl"
                    value={formData.reason}
                    onChange={(event) =>
                      setFormData({ ...formData, reason: event.target.value })
                    }
                    placeholder="请说明补录原因，例如漏打卡、临时网络异常等。"
                  />
                </div>
              </div>

              <div className="sticky bottom-0 flex justify-end gap-3 border-t border-slate-100 bg-slate-50/80 px-6 py-5">
                <Button variant="outline" onClick={() => setShowDialog(false)} className="rounded-2xl">
                  取消
                </Button>
                <Button onClick={handleSave} className="rounded-2xl bg-pink-500 text-white hover:bg-pink-600">
                  保存
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AttendanceSupplementPage;
