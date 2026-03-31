import React, { useEffect, useMemo, useState } from 'react';
import { Clock, Download, Edit, Paperclip, Plus, RotateCcw, Search, Send, Timer, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { overtimeApi, OvertimeRequest } from '@/services/api/hrOvertime';
import { FileUpload } from '../components/FileUpload';
import { toBackendDateString, toLocalDatetimeString } from '../utils/dateFormat';
import { buildExcelFileName, downloadBlob } from '@/utils/download';
import { Button, Card, DatePicker, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, TableActionHead, TableHead, TableHeader, Textarea } from '@/components/ui';
import { TableRowActions } from '@/components/ui/table-row-actions';
import { WorkspaceBackdrop, WorkspaceEmptyPanel, WorkspaceSectionHeader } from '@/components/workspace/WorkspacePrimitives';

const formatDateCN = (date: Date) => {
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  return `${date.getMonth() + 1}月${date.getDate()}日 ${weekdays[date.getDay()]}`;
};

export const OvertimePage: React.FC = () => {
  const [list, setList] = useState<OvertimeRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchParams, setSearchParams] = useState({ status: '', overtimeType: '', pageNum: 1, pageSize: 10 });
  const [total, setTotal] = useState(0);
  const [showDialog, setShowDialog] = useState(false);
  const [current, setCurrent] = useState<OvertimeRequest | null>(null);
  const [formData, setFormData] = useState<OvertimeRequest>({
    overtimeType: 'WORKDAY',
    startTime: '',
    endTime: '',
    reason: '',
    compensateType: 'SALARY',
    workContent: '',
    expectedOutput: '',
    needMeal: 0,
    workLocation: 'OFFICE',
    attachmentUrl: '',
  });

  useEffect(() => {
    fetchList();
  }, [searchParams]);

  const fetchList = async () => {
    setLoading(true);
    try {
      const response = await overtimeApi.list(searchParams);
      if (response) {
        setList(response.records || response.rows || []);
        setTotal(response.total || 0);
      }
    } catch {
      toast.error('获取列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    setCurrent(null);
    setFormData({
      overtimeType: 'WORKDAY',
      startTime: '',
      endTime: '',
      reason: '',
      compensateType: 'SALARY',
      workContent: '',
      expectedOutput: '',
      needMeal: 0,
      workLocation: 'OFFICE',
      attachmentUrl: '',
    });
    setShowDialog(true);
  };

  const handleEdit = async (id: number) => {
    try {
      const response = await overtimeApi.getInfo(id);
      if (response) {
        setCurrent(response);
        setFormData({
          ...response,
          startTime: toLocalDatetimeString(response.startTime) || response.startTime,
          endTime: toLocalDatetimeString(response.endTime) || response.endTime,
        });
        setShowDialog(true);
      }
    } catch {
      toast.error('获取详情失败');
    }
  };

  const handleSave = async () => {
    if (!formData.startTime || !formData.endTime || !formData.reason) {
      toast.error('请填写完整信息');
      return;
    }
    if (!formData.workContent) {
      toast.error('请填写加班工作内容');
      return;
    }

    try {
      const start = new Date(formData.startTime).getTime();
      const end = new Date(formData.endTime).getTime();
      const hours = Math.round(((end - start) / 3600000) * 10) / 10;
      const data = {
        ...formData,
        overtimeHours: hours > 0 ? hours : 0,
        startTime: toBackendDateString(formData.startTime),
        endTime: toBackendDateString(formData.endTime),
      };

      if (current?.id) {
        await overtimeApi.edit(data);
        toast.success('更新成功');
      } else {
        await overtimeApi.add(data);
        toast.success('创建成功');
      }
      setShowDialog(false);
      fetchList();
    } catch {
      toast.error('保存失败');
    }
  };

  const handleDelete = async (ids: number[]) => {
    if (!confirm('确定删除？')) return;
    try {
      await overtimeApi.remove(ids);
      toast.success('删除成功');
      fetchList();
    } catch {
      toast.error('删除失败');
    }
  };

  const handleSubmit = async (id: number) => {
    if (!confirm('确定提交审批？')) return;
    try {
      await overtimeApi.submit(id);
      toast.success('提交成功');
      fetchList();
    } catch {
      toast.error('提交失败');
    }
  };

  const handleExport = async () => {
    try {
      const blob = await overtimeApi.export(searchParams);
      downloadBlob(blob, buildExcelFileName('加班申请'));
      toast.success('导出成功');
    } catch {
      toast.error('导出失败');
    }
  };

  const statusMap: Record<string, string> = { DRAFT: '草稿', PENDING: '审批中', APPROVED: '已通过', REJECTED: '已驳回', CANCELLED: '已取消' };
  const typeMap: Record<string, string> = { WORKDAY: '工作日', WEEKEND: '周末', HOLIDAY: '节假日' };
  const compensateMap: Record<string, string> = { SALARY: '加班费', LEAVE: '调休' };
  const locationMap: Record<string, string> = { OFFICE: '办公室', HOME: '居家', OTHER: '其他' };

  const getStatusBadge = (status: string) => {
    const config: Record<string, { bg: string; text: string }> = {
      DRAFT: { bg: 'bg-slate-100', text: 'text-slate-600' },
      PENDING: { bg: 'bg-pink-50', text: 'text-pink-500' },
      APPROVED: { bg: 'bg-green-100', text: 'text-green-600' },
      REJECTED: { bg: 'bg-red-100', text: 'text-red-600' },
      CANCELLED: { bg: 'bg-gray-100', text: 'text-gray-600' },
    };
    const currentConfig = config[status] || config.DRAFT;
    return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${currentConfig.bg} ${currentConfig.text}`}>{statusMap[status] || status}</span>;
  };

  const todayLabel = formatDateCN(new Date());
  const timeLabel = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  const draftCount = list.filter(item => item.status === 'DRAFT').length;
  const pendingCount = list.filter(item => item.status === 'PENDING').length;
  const approvedCount = list.filter(item => item.status === 'APPROVED').length;
  const totalHours = list.reduce((sum, item) => sum + Number(item.overtimeHours || 0), 0);

  const focusItems = useMemo(() => [
    { label: '待提交草稿', value: `${draftCount} 条`, hint: '加班时间和工作内容还未提交审批', tone: 'bg-slate-100 text-slate-600' },
    { label: '审批中', value: `${pendingCount} 条`, hint: '等待主管确认的加班申请记录', tone: 'bg-pink-50 text-pink-600' },
    { label: '累计时长', value: `${totalHours.toFixed(1)} h`, hint: '当前筛选结果内加班小时合计', tone: 'bg-amber-50 text-amber-600' },
  ], [draftCount, pendingCount, totalHours]);

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
                    <Clock size={14} />
                    {todayLabel}
                  </span>
                  <span className="rounded-full bg-white/80 px-3 py-1.5 ring-1 ring-slate-200/80">{timeLabel}</span>
                  <span className="rounded-full bg-white/80 px-3 py-1.5 ring-1 ring-slate-200/80">加班申请</span>
                </div>

                <div className="mt-6 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                  <div className="max-w-2xl">
                    <div className="inline-flex items-center gap-2 rounded-full bg-white/75 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-pink-600 ring-1 ring-pink-100">
                      <Timer size={14} />
                      加班与补偿
                    </div>
                    <h1 className="mt-5 text-4xl font-bold tracking-tight text-slate-950 sm:text-[2.85rem]">加班申请</h1>
                    <p className="mt-4 max-w-2xl text-base leading-8 text-slate-600">
                      适用于工作日晚间、周末、节假日等加班场景。把加班时段、工作内容、预期成果和补偿方式提前说清，方便后续审批与核算。
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <Button className="h-12 rounded-2xl bg-pink-500 px-6 text-white shadow-[0_16px_32px_rgba(236,72,153,0.24)] hover:bg-pink-600" onClick={handleAdd}>
                      <Plus size={16} className="mr-2" />
                      新增申请
                    </Button>
                    <Button variant="outline" className="h-12 rounded-2xl bg-white/85 px-6" onClick={handleExport}>
                      <Download size={16} className="mr-2 text-pink-500" />
                      导出 Excel
                    </Button>
                  </div>
                </div>

                <div className="mt-7 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-[24px] border border-white/80 bg-white/72 px-4 py-4 shadow-sm backdrop-blur">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">申请总数</div>
                    <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{total}</div>
                    <div className="mt-1 text-xs leading-5 text-slate-500">当前筛选条件下的申请数量</div>
                  </div>
                  <div className="rounded-[24px] border border-white/80 bg-white/72 px-4 py-4 shadow-sm backdrop-blur">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">审批中</div>
                    <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{pendingCount}</div>
                    <div className="mt-1 text-xs leading-5 text-slate-500">仍在流程中等待处理的申请</div>
                  </div>
                  <div className="rounded-[24px] border border-white/80 bg-white/72 px-4 py-4 shadow-sm backdrop-blur">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">累计时长</div>
                    <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{totalHours.toFixed(1)} h</div>
                    <div className="mt-1 text-xs leading-5 text-slate-500">用于快速判断本期加班投入规模</div>
                  </div>
                </div>
              </div>
            </div>
          </Card>

          <Card className="rounded-[34px] border-white/80 bg-white/82 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.04)] backdrop-blur-xl">
            <WorkspaceSectionHeader eyebrow="今日焦点" title="先看这些" />
            <div className="mt-5 space-y-3">
              {focusItems.map(item => (
                <div key={item.label} className="flex items-start gap-3 rounded-[24px] border border-slate-100 bg-white px-4 py-4">
                  <div className={`rounded-2xl p-3 ${item.tone}`}>
                    <Clock size={16} />
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
              <WorkspaceSectionHeader eyebrow="申请工作区" title="加班申请记录" />
              <div className="mt-2 text-sm leading-6 text-slate-500">先按状态和加班类型筛选，再继续补时段、补偿方式、工作内容和附件材料。</div>
            </div>

            <div className="rounded-[24px] border border-slate-100 bg-white/85 p-4 shadow-sm">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                <Select value={searchParams.status} onValueChange={value => setSearchParams({ ...searchParams, status: value })}>
                  <SelectTrigger className="h-12 rounded-2xl">
                    <SelectValue placeholder="请选择" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">全部状态</SelectItem>
                    <SelectItem value="DRAFT">草稿</SelectItem>
                    <SelectItem value="PENDING">审批中</SelectItem>
                    <SelectItem value="APPROVED">已通过</SelectItem>
                    <SelectItem value="REJECTED">已驳回</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={searchParams.overtimeType} onValueChange={value => setSearchParams({ ...searchParams, overtimeType: value })}>
                  <SelectTrigger className="h-12 rounded-2xl">
                    <SelectValue placeholder="请选择" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">全部类型</SelectItem>
                    <SelectItem value="WORKDAY">工作日</SelectItem>
                    <SelectItem value="WEEKEND">周末</SelectItem>
                    <SelectItem value="HOLIDAY">节假日</SelectItem>
                  </SelectContent>
                </Select>

                <Button onClick={() => setSearchParams({ ...searchParams, pageNum: 1 })} className="h-12 rounded-2xl bg-pink-500 text-white hover:bg-pink-600">
                  <Search size={16} className="mr-2" />
                  搜索
                </Button>

                <Button variant="outline" onClick={() => setSearchParams({ status: '', overtimeType: '', pageNum: 1, pageSize: 10 })} className="h-12 rounded-2xl">
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
                      <TableHead>加班单号</TableHead>
                      <TableHead>类型</TableHead>
                      <TableHead>开始时间</TableHead>
                      <TableHead>结束时间</TableHead>
                      <TableHead>时长(h)</TableHead>
                      <TableHead>地点</TableHead>
                      <TableHead>补偿</TableHead>
                      <TableHead>附件</TableHead>
                      <TableHead>状态</TableHead>
                      <TableActionHead className="w-56">操作</TableActionHead>
                    </tr>
                  </TableHeader>
                  <tbody className="divide-y divide-slate-100">
                    {loading ? (
                      <tr><td colSpan={10} className="px-4 py-8 text-center text-slate-500"><div className="mx-auto h-6 w-6 animate-spin rounded-full border-b-2 border-pink-500"></div></td></tr>
                    ) : list.length === 0 ? (
                      <tr><td colSpan={10} className="px-0 py-0"><WorkspaceEmptyPanel icon={<Timer size={26} />} title="暂无加班申请" description="创建新的加班记录后，这里会展示时段、地点、补偿方式和审批状态。" /></td></tr>
                    ) : list.map(item => (
                      <tr key={item.id} className="hover:bg-slate-50/80">
                        <td className="px-4 py-3 text-sm text-slate-900">{item.overtimeNo}</td>
                        <td className="px-4 py-3 text-sm">{typeMap[item.overtimeType] || item.overtimeType}</td>
                        <td className="px-4 py-3 text-sm text-slate-600">{item.startTime}</td>
                        <td className="px-4 py-3 text-sm text-slate-600">{item.endTime}</td>
                        <td className="px-4 py-3 text-sm font-medium text-slate-900">{item.overtimeHours || '-'}</td>
                        <td className="px-4 py-3 text-sm">{locationMap[item.workLocation || ''] || '-'}</td>
                        <td className="px-4 py-3 text-sm">{compensateMap[item.compensateType || ''] || '-'}</td>
                        <td className="px-4 py-3 text-sm">{item.attachmentUrl ? <Paperclip size={14} className="text-pink-400" /> : <span className="text-slate-300">-</span>}</td>
                        <td className="px-4 py-3">{getStatusBadge(item.status || 'DRAFT')}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-right">
                          <TableRowActions
                            align="end"
                            actions={[
                              { label: '编辑', icon: <Edit size={14} />, onClick: () => handleEdit(item.id!), tone: 'primary', hidden: item.status !== 'DRAFT' },
                              { label: '提交', icon: <Send size={14} />, onClick: () => handleSubmit(item.id!), tone: 'success', hidden: item.status !== 'DRAFT' },
                              { label: '删除', icon: <Trash2 size={14} />, onClick: () => handleDelete([item.id!]), tone: 'danger', hidden: item.status !== 'DRAFT' },
                            ]}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between border-t border-slate-100 px-4 py-4">
                <span className="text-sm text-slate-600">共 {total} 条</span>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setSearchParams(prev => ({ ...prev, pageNum: Math.max(1, prev.pageNum - 1) }))} disabled={searchParams.pageNum === 1} className="rounded-xl">上一页</Button>
                  <span className="px-3 py-2 text-sm text-slate-600">第 {searchParams.pageNum} 页</span>
                  <Button variant="outline" onClick={() => setSearchParams(prev => ({ ...prev, pageNum: prev.pageNum + 1 }))} disabled={searchParams.pageNum * searchParams.pageSize >= total} className="rounded-xl">下一页</Button>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {showDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/28 p-4 backdrop-blur-sm">
            <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-[32px] border border-white/80 bg-white/95 shadow-[0_28px_72px_rgba(15,23,42,0.18)] backdrop-blur-xl">
              <div className="sticky top-0 z-10 border-b border-slate-100 bg-white/95 px-6 pb-5 pt-6">
                <div className="absolute inset-x-0 top-0 h-28 bg-[radial-gradient(circle_at_top_right,rgba(244,114,182,0.16),transparent_70%)]" />
                <div className="relative flex items-start justify-between gap-4">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full bg-pink-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-pink-600 ring-1 ring-pink-100">
                      <Timer size={14} />
                      加班申请表单
                    </div>
                    <h3 className="mt-4 text-2xl font-bold tracking-tight text-slate-900">{current ? '编辑加班申请' : '新增加班申请'}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-500">填写加班时段、地点、补偿方式、实际工作内容和预期成果，形成完整的加班申请单。</p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => setShowDialog(false)} className="rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                    <X size={18} />
                  </Button>
                </div>
              </div>

              <div className="space-y-4 p-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">加班类型 <span className="text-red-500">*</span></label>
                    <Select value={formData.overtimeType} onValueChange={value => setFormData({ ...formData, overtimeType: value })}>
                      <SelectTrigger className="h-12 rounded-2xl"><SelectValue placeholder="请选择" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="WORKDAY">工作日</SelectItem>
                        <SelectItem value="WEEKEND">周末</SelectItem>
                        <SelectItem value="HOLIDAY">节假日</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">补偿方式</label>
                    <Select value={formData.compensateType || 'SALARY'} onValueChange={value => setFormData({ ...formData, compensateType: value })}>
                      <SelectTrigger className="h-12 rounded-2xl"><SelectValue placeholder="请选择" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="SALARY">加班费</SelectItem>
                        <SelectItem value="LEAVE">调休</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">开始时间 <span className="text-red-500">*</span></label>
                    <DatePicker type="datetime-local" value={formData.startTime} onChange={e => setFormData({ ...formData, startTime: e.target.value })} />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">结束时间 <span className="text-red-500">*</span></label>
                    <DatePicker type="datetime-local" value={formData.endTime} onChange={e => setFormData({ ...formData, endTime: e.target.value })} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">加班地点</label>
                    <Select value={formData.workLocation || 'OFFICE'} onValueChange={value => setFormData({ ...formData, workLocation: value })}>
                      <SelectTrigger className="h-12 rounded-2xl"><SelectValue placeholder="请选择" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="OFFICE">办公室</SelectItem>
                        <SelectItem value="HOME">居家</SelectItem>
                        <SelectItem value="OTHER">其他</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">是否需要用餐</label>
                    <Select value={String(formData.needMeal ?? 0)} onValueChange={value => setFormData({ ...formData, needMeal: Number(value) })}>
                      <SelectTrigger className="h-12 rounded-2xl"><SelectValue placeholder="请选择" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={String(0)}>否</SelectItem>
                        <SelectItem value={String(1)}>是</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">加班事由 <span className="text-red-500">*</span></label>
                  <Textarea className="h-20 rounded-2xl" value={formData.reason} onChange={e => setFormData({ ...formData, reason: e.target.value })} placeholder="例如：版本上线支持、月末结算处理、客户紧急需求响应" />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">工作内容 <span className="text-red-500">*</span></label>
                  <Textarea className="h-24 rounded-2xl" value={formData.workContent || ''} onChange={e => setFormData({ ...formData, workContent: e.target.value })} placeholder="请写清本次加班具体完成了什么工作、处理了哪些事项" />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">预计产出 / 成果</label>
                  <Input className="h-12 rounded-2xl" type="text" value={formData.expectedOutput || ''} onChange={e => setFormData({ ...formData, expectedOutput: e.target.value })} placeholder="如：完成测试回归、输出结算报表、提交版本包" />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">附件</label>
                  <FileUpload value={formData.attachmentUrl || ''} onChange={(urls) => setFormData({ ...formData, attachmentUrl: urls })} maxCount={3} hint="可上传任务截图、工作记录、上线说明等，最多 3 个文件" />
                </div>
              </div>

              <div className="sticky bottom-0 flex justify-end gap-3 border-t border-slate-100 bg-slate-50/80 px-6 py-5">
                <Button variant="outline" onClick={() => setShowDialog(false)} className="rounded-2xl">取消</Button>
                <Button onClick={handleSave} className="rounded-2xl bg-pink-500 text-white hover:bg-pink-600">保存</Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default OvertimePage;
