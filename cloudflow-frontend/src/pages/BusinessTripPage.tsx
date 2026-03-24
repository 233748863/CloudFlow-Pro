import React, { useEffect, useMemo, useState } from 'react';
import { Download, Edit, Paperclip, Plane, Plus, RotateCcw, Search, Send, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { businessTripApi, BusinessTrip } from '../services/api/businessTrip';
import { FileUpload } from '../components/FileUpload';
import { buildExcelFileName, downloadBlob } from '@/utils/download';
import { Button, Card, DatePicker, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, TableActionHead, TableHead, TableHeader, Textarea } from '@/components/ui';
import { TableRowActions } from '@/components/ui/table-row-actions';
import { WorkspaceBackdrop, WorkspaceEmptyPanel, WorkspaceSectionHeader } from '@/components/workspace/WorkspacePrimitives';

const formatDateCN = (date: Date) => {
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  return `${date.getMonth() + 1}月${date.getDate()}日 ${weekdays[date.getDay()]}`;
};

export const BusinessTripPage: React.FC = () => {
  const [list, setList] = useState<BusinessTrip[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchParams, setSearchParams] = useState({ status: '', destination: '', pageNum: 1, pageSize: 10 });
  const [total, setTotal] = useState(0);
  const [showDialog, setShowDialog] = useState(false);
  const [current, setCurrent] = useState<BusinessTrip | null>(null);
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
    } catch {
      toast.error('获取列表失败');
    } finally {
      setLoading(false);
    }
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
    } catch {
      toast.error('获取详情失败');
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
    } catch {
      toast.error('保存失败');
    }
  };

  const handleDelete = async (ids: number[]) => {
    if (!confirm('确定删除？')) return;
    try {
      await businessTripApi.remove(ids);
      toast.success('删除成功');
      fetchList();
    } catch {
      toast.error('删除失败');
    }
  };

  const handleSubmit = async (id: number) => {
    if (!confirm('确定提交审批？')) return;
    try {
      await businessTripApi.submit(id);
      toast.success('提交成功');
      fetchList();
    } catch {
      toast.error('提交失败');
    }
  };

  const handleExport = async () => {
    try {
      const blob = await businessTripApi.export(searchParams);
      downloadBlob(blob, buildExcelFileName('出差申请'));
      toast.success('导出成功');
    } catch {
      toast.error('导出失败');
    }
  };

  const statusMap: Record<string, string> = { DRAFT: '草稿', PENDING: '审批中', APPROVED: '已通过', REJECTED: '已驳回', CANCELLED: '已取消' };
  const transportMap: Record<string, string> = { PLANE: '飞机', TRAIN: '火车', CAR: '自驾', OTHER: '其他' };
  const accommodationMap: Record<string, string> = { SELF: '自行安排', COMPANY: '公司安排', NONE: '无需住宿' };

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
  const totalTripDays = list.reduce((sum, item) => sum + Number(item.tripDays || 0), 0);

  const focusItems = useMemo(() => [
    { label: '待提交草稿', value: `${draftCount} 条`, hint: '行程、联系人或附件仍可补充后再提交', tone: 'bg-slate-100 text-slate-600' },
    { label: '审批中', value: `${pendingCount} 条`, hint: '等待主管确认的出差申请记录', tone: 'bg-pink-50 text-pink-600' },
    { label: '累计天数', value: `${totalTripDays} 天`, hint: '当前筛选结果内出差天数合计', tone: 'bg-amber-50 text-amber-600' },
  ], [draftCount, pendingCount, totalTripDays]);

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
                    <Plane size={14} />
                    {todayLabel}
                  </span>
                  <span className="rounded-full bg-white/80 px-3 py-1.5 ring-1 ring-slate-200/80">{timeLabel}</span>
                  <span className="rounded-full bg-white/80 px-3 py-1.5 ring-1 ring-slate-200/80">出差申请</span>
                </div>

                <div className="mt-6 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                  <div className="max-w-2xl">
                    <div className="inline-flex items-center gap-2 rounded-full bg-white/75 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-pink-600 ring-1 ring-pink-100">
                      <Plane size={14} />
                      出差与行程
                    </div>
                    <h1 className="mt-5 text-4xl font-bold tracking-tight text-slate-950 sm:text-[2.85rem]">出差申请</h1>
                    <p className="mt-4 max-w-2xl text-base leading-8 text-slate-600">
                      适用于客户拜访、驻场支持、培训参会、异地协作等场景。把行程、费用、交通住宿和现场联系人一次说明，方便审批与后续执行。
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
                    <div className="mt-1 text-xs leading-5 text-slate-500">仍在流程中等待处理的出差记录</div>
                  </div>
                  <div className="rounded-[24px] border border-white/80 bg-white/72 px-4 py-4 shadow-sm backdrop-blur">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">累计天数</div>
                    <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{totalTripDays} 天</div>
                    <div className="mt-1 text-xs leading-5 text-slate-500">用于快速判断近期出差投入规模</div>
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
                    <Plane size={16} />
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
              <WorkspaceSectionHeader eyebrow="申请工作区" title="出差申请记录" />
              <div className="mt-2 text-sm leading-6 text-slate-500">先按状态和目的地筛选，再继续补充交通、住宿、费用、联系人和附件材料。</div>
            </div>

            <div className="rounded-[24px] border border-slate-100 bg-white/85 p-4 shadow-sm">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-[180px_minmax(0,1fr)_auto_auto]">
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

                <Input type="text" placeholder="搜索目的地" value={searchParams.destination} onChange={e => setSearchParams({ ...searchParams, destination: e.target.value })} className="h-12 rounded-2xl" />

                <Button onClick={() => setSearchParams({ ...searchParams, pageNum: 1 })} className="h-12 rounded-2xl bg-pink-500 text-white hover:bg-pink-600">
                  <Search size={16} className="mr-2" />
                  搜索
                </Button>

                <Button variant="outline" onClick={() => setSearchParams({ status: '', destination: '', pageNum: 1, pageSize: 10 })} className="h-12 rounded-2xl">
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
                      <TableHead className="px-4 py-3 text-left">出差单号</TableHead>
                      <TableHead className="px-4 py-3 text-left">出发地→目的地</TableHead>
                      <TableHead className="px-4 py-3 text-left">日期</TableHead>
                      <TableHead className="px-4 py-3 text-left">天数</TableHead>
                      <TableHead className="px-4 py-3 text-left">交通</TableHead>
                      <TableHead className="px-4 py-3 text-left">住宿</TableHead>
                      <TableHead className="px-4 py-3 text-left">费用</TableHead>
                      <TableHead className="px-4 py-3 text-left">附件</TableHead>
                      <TableHead className="px-4 py-3 text-left">状态</TableHead>
                      <TableActionHead className="px-4 py-3 w-52">操作</TableActionHead>
                    </tr>
                  </TableHeader>
                  <tbody className="divide-y divide-slate-100">
                    {loading ? (
                      <tr><td colSpan={10} className="px-4 py-8 text-center text-slate-500"><div className="mx-auto h-6 w-6 animate-spin rounded-full border-b-2 border-pink-500"></div></td></tr>
                    ) : list.length === 0 ? (
                      <tr><td colSpan={10} className="px-0 py-0"><WorkspaceEmptyPanel icon={<Plane size={26} />} title="暂无出差申请" description="创建新的出差申请后，这里会展示行程、费用、住宿安排和审批状态。" /></td></tr>
                    ) : list.map(item => (
                      <tr key={item.id} className="hover:bg-slate-50/80">
                        <td className="px-4 py-3 text-sm text-slate-900">{item.tripNo}</td>
                        <td className="px-4 py-3 text-sm font-medium text-slate-900">{item.departure ? `${item.departure} → ` : ''}{item.destination}</td>
                        <td className="px-4 py-3 text-sm text-slate-600">{item.startDate} ~ {item.endDate}</td>
                        <td className="px-4 py-3 text-sm">{item.tripDays || '-'}天</td>
                        <td className="px-4 py-3 text-sm">{transportMap[item.transportType || ''] || '-'}</td>
                        <td className="px-4 py-3 text-sm">{accommodationMap[item.accommodation || ''] || '-'}</td>
                        <td className="px-4 py-3 text-sm">¥{item.estimatedCost?.toFixed(2) || '0.00'}</td>
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
            <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-[32px] border border-white/80 bg-white/95 shadow-[0_28px_72px_rgba(15,23,42,0.18)] backdrop-blur-xl">
              <div className="sticky top-0 z-10 border-b border-slate-100 bg-white/95 px-6 pb-5 pt-6">
                <div className="absolute inset-x-0 top-0 h-28 bg-[radial-gradient(circle_at_top_right,rgba(244,114,182,0.16),transparent_70%)]" />
                <div className="relative flex items-start justify-between gap-4">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full bg-pink-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-pink-600 ring-1 ring-pink-100">
                      <Plane size={14} />
                      出差申请表单
                    </div>
                    <h3 className="mt-4 text-2xl font-bold tracking-tight text-slate-900">{current ? '编辑出差申请' : '新增出差申请'}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-500">填写出发地、目的地、日期、交通住宿、费用和联系人信息，形成完整的出差申请单。</p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => setShowDialog(false)} className="rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                    <X size={18} />
                  </Button>
                </div>
              </div>

              <div className="space-y-4 p-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">出发地 <span className="text-red-500">*</span></label>
                    <Input className="h-12 rounded-2xl" type="text" value={formData.departure || ''} onChange={e => setFormData({ ...formData, departure: e.target.value })} placeholder="如：北京" />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">目的地 <span className="text-red-500">*</span></label>
                    <Input className="h-12 rounded-2xl" type="text" value={formData.destination} onChange={e => setFormData({ ...formData, destination: e.target.value })} placeholder="如：上海" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">开始日期 <span className="text-red-500">*</span></label>
                    <DatePicker type="date" value={formData.startDate} onChange={e => setFormData({ ...formData, startDate: e.target.value })} />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">结束日期 <span className="text-red-500">*</span></label>
                    <DatePicker type="date" value={formData.endDate} onChange={e => setFormData({ ...formData, endDate: e.target.value })} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">交通方式</label>
                    <Select value={formData.transportType || 'TRAIN'} onValueChange={value => setFormData({ ...formData, transportType: value })}>
                      <SelectTrigger className="h-12 rounded-2xl"><SelectValue placeholder="请选择" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PLANE">飞机</SelectItem>
                        <SelectItem value="TRAIN">火车</SelectItem>
                        <SelectItem value="CAR">自驾</SelectItem>
                        <SelectItem value="OTHER">其他</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">住宿安排</label>
                    <Select value={formData.accommodation || 'SELF'} onValueChange={value => setFormData({ ...formData, accommodation: value })}>
                      <SelectTrigger className="h-12 rounded-2xl"><SelectValue placeholder="请选择" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="SELF">自行安排</SelectItem>
                        <SelectItem value="COMPANY">公司安排</SelectItem>
                        <SelectItem value="NONE">无需住宿</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">预计费用(元)</label>
                    <Input className="h-12 rounded-2xl" type="number" value={formData.estimatedCost || ''} onChange={e => setFormData({ ...formData, estimatedCost: parseFloat(e.target.value) || 0 })} placeholder="0.00" step="0.01" min="0" />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">关联项目</label>
                    <Input className="h-12 rounded-2xl" type="text" value={formData.projectName || ''} onChange={e => setFormData({ ...formData, projectName: e.target.value })} placeholder="如：华东客户拜访、驻场实施支持" />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">出差期间联系电话</label>
                  <Input className="h-12 rounded-2xl" type="tel" value={formData.contactPhone || ''} onChange={e => setFormData({ ...formData, contactPhone: e.target.value })} placeholder="出差期间可直接联系到你的手机号" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">紧急联系人</label>
                    <Input className="h-12 rounded-2xl" type="text" value={formData.emergencyContact || ''} onChange={e => setFormData({ ...formData, emergencyContact: e.target.value })} placeholder="姓名" />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">紧急联系人电话</label>
                    <Input className="h-12 rounded-2xl" type="tel" value={formData.emergencyPhone || ''} onChange={e => setFormData({ ...formData, emergencyPhone: e.target.value })} placeholder="电话" />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">同行人员</label>
                  <Input className="h-12 rounded-2xl" type="text" value={formData.companions || ''} onChange={e => setFormData({ ...formData, companions: e.target.value })} placeholder="如：销售张三、实施李四" />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">出差事由 <span className="text-red-500">*</span></label>
                  <Textarea className="h-24 rounded-2xl" value={formData.reason} onChange={e => setFormData({ ...formData, reason: e.target.value })} placeholder="例如：赴上海客户现场演示、参加杭州交付培训、驻场处理上线问题" />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">附件</label>
                  <FileUpload value={formData.attachmentUrl || ''} onChange={(urls) => setFormData({ ...formData, attachmentUrl: urls })} maxCount={5} hint="可上传邀请函、会议通知、行程单、酒店预订单等，最多 5 个文件" />
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

export default BusinessTripPage;
