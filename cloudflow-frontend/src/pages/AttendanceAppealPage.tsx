import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Calendar, ClipboardCheck, Download, Edit, Paperclip, Plus, RotateCcw, Search, Send, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { attendanceAppealApi, AttendanceAppeal } from '@/services/api/hrAttendance';
import { FileUpload } from '../components/FileUpload';
import { buildExcelFileName, downloadBlob } from '@/utils/download';
import { Button, Card, DatePicker, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, TableActionHead, TableHead, TableHeader, Textarea } from '@/components/ui';
import { TableRowActions } from '@/components/ui/table-row-actions';
import { WorkspaceBackdrop, WorkspaceEmptyPanel, WorkspaceSectionHeader } from '@/components/workspace/WorkspacePrimitives';

const formatDateCN = (date: Date) => {
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  return `${date.getMonth() + 1}月${date.getDate()}日 ${weekdays[date.getDay()]}`;
};

export const AttendanceAppealPage: React.FC = () => {
  const [list, setList] = useState<AttendanceAppeal[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchParams, setSearchParams] = useState({ status: '', appealType: '', pageNum: 1, pageSize: 10 });
  const [total, setTotal] = useState(0);
  const [showDialog, setShowDialog] = useState(false);
  const [current, setCurrent] = useState<AttendanceAppeal | null>(null);
  const [formData, setFormData] = useState<AttendanceAppeal>({ appealType: 'MAKEUP', appealDate: '', reason: '' });

  useEffect(() => {
    fetchList();
  }, [searchParams]);

  const fetchList = async () => {
    setLoading(true);
    try {
      const response = await attendanceAppealApi.list(searchParams);
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
    setFormData({ appealType: 'MAKEUP', appealDate: '', reason: '', checkType: '1', originalStatus: '', witnessName: '', attachmentUrl: '' });
    setShowDialog(true);
  };

  const handleEdit = async (id: number) => {
    try {
      const response = await attendanceAppealApi.getInfo(id);
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
    if (!formData.appealDate || !formData.reason) {
      toast.error('请填写完整信息');
      return;
    }
    if (formData.appealType === 'MAKEUP' && !formData.appealTime) {
      toast.error('补卡类型请填写补卡时间');
      return;
    }
    if (formData.appealType === 'FIELD' && !formData.address) {
      toast.error('外勤类型请填写外勤地址');
      return;
    }

    try {
      if (current?.id) {
        await attendanceAppealApi.edit(formData);
        toast.success('更新成功');
      } else {
        await attendanceAppealApi.add(formData);
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
      await attendanceAppealApi.remove(ids);
      toast.success('删除成功');
      fetchList();
    } catch {
      toast.error('删除失败');
    }
  };

  const handleSubmit = async (id: number) => {
    if (!confirm('确定提交审批？')) return;
    try {
      await attendanceAppealApi.submit(id);
      toast.success('提交成功');
      fetchList();
    } catch {
      toast.error('提交失败');
    }
  };

  const handleExport = async () => {
    try {
      const blob = await attendanceAppealApi.export(searchParams);
      downloadBlob(blob, buildExcelFileName('补卡外勤申请'));
      toast.success('导出成功');
    } catch {
      toast.error('导出失败');
    }
  };

  const statusMap: Record<string, string> = { DRAFT: '草稿', PENDING: '审批中', APPROVED: '已通过', REJECTED: '已驳回', CANCELLED: '已取消' };
  const typeMap: Record<string, string> = { MAKEUP: '补卡', FIELD: '外勤' };
  const checkTypeMap: Record<string, string> = { '1': '签到', '2': '签退' };
  const originalStatusMap: Record<string, string> = { LATE: '迟到', EARLY: '早退', ABSENT: '缺卡', ABNORMAL: '异常' };

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

  const draftCount = list.filter(item => item.status === 'DRAFT').length;
  const pendingCount = list.filter(item => item.status === 'PENDING').length;
  const approvedCount = list.filter(item => item.status === 'APPROVED').length;
  const todayLabel = formatDateCN(new Date());
  const timeLabel = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

  const focusItems = useMemo(() => {
    const items = [
      { label: '待提交草稿', value: `${draftCount} 条`, hint: '漏打卡或外勤说明还未提交审批', tone: 'bg-slate-100 text-slate-600' },
      { label: '审批中', value: `${pendingCount} 条`, hint: '正在等待主管或流程节点处理', tone: 'bg-pink-50 text-pink-600' },
      { label: '已通过', value: `${approvedCount} 条`, hint: '已经补录成功或外勤说明已确认', tone: 'bg-emerald-50 text-emerald-600' },
    ];
    return items;
  }, [draftCount, pendingCount, approvedCount]);

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
                    <Calendar size={14} />
                    {todayLabel}
                  </span>
                  <span className="rounded-full bg-white/80 px-3 py-1.5 ring-1 ring-slate-200/80">{timeLabel}</span>
                  <span className="rounded-full bg-white/80 px-3 py-1.5 ring-1 ring-slate-200/80">补卡 / 外勤</span>
                </div>

                <div className="mt-6 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                  <div className="max-w-2xl">
                    <div className="inline-flex items-center gap-2 rounded-full bg-white/75 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-pink-600 ring-1 ring-pink-100">
                      <ClipboardCheck size={14} />
                      考勤异常处理
                    </div>
                    <h1 className="mt-5 text-4xl font-bold tracking-tight text-slate-950 sm:text-[2.85rem]">补卡 / 外勤申请</h1>
                    <p className="mt-4 max-w-2xl text-base leading-8 text-slate-600">
                      适用于忘记签到签退、迟到早退说明、临时外勤到场记录等场景。把异常时间、原因和证明材料一次补齐后再进入审批。
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
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">补卡申请</div>
                    <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{list.filter(item => item.appealType === 'MAKEUP').length}</div>
                    <div className="mt-1 text-xs leading-5 text-slate-500">需要补录签到或签退的申请数</div>
                  </div>
                  <div className="rounded-[24px] border border-white/80 bg-white/72 px-4 py-4 shadow-sm backdrop-blur">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">外勤申请</div>
                    <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{list.filter(item => item.appealType === 'FIELD').length}</div>
                    <div className="mt-1 text-xs leading-5 text-slate-500">需要说明现场工作的外勤记录数</div>
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
              <WorkspaceSectionHeader eyebrow="申请工作区" title="补卡 / 外勤记录" />
              <div className="mt-2 text-sm leading-6 text-slate-500">
                先按状态和申请类型筛选，再继续补时间、地点、证明人与附件材料。
              </div>
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

                <Select value={searchParams.appealType} onValueChange={value => setSearchParams({ ...searchParams, appealType: value })}>
                  <SelectTrigger className="h-12 rounded-2xl">
                    <SelectValue placeholder="请选择" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">全部类型</SelectItem>
                    <SelectItem value="MAKEUP">补卡</SelectItem>
                    <SelectItem value="FIELD">外勤</SelectItem>
                  </SelectContent>
                </Select>

                <Button onClick={() => setSearchParams({ ...searchParams, pageNum: 1 })} className="h-12 rounded-2xl bg-pink-500 text-white hover:bg-pink-600">
                  <Search size={16} className="mr-2" />
                  搜索
                </Button>

                <Button variant="outline" onClick={() => setSearchParams({ status: '', appealType: '', pageNum: 1, pageSize: 10 })} className="h-12 rounded-2xl">
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
                      <TableHead>申请单号</TableHead>
                      <TableHead>类型</TableHead>
                      <TableHead>日期</TableHead>
                      <TableHead>补卡时间/地址</TableHead>
                      <TableHead>原始状态</TableHead>
                      <TableHead>事由</TableHead>
                      <TableHead>附件</TableHead>
                      <TableHead>状态</TableHead>
                      <TableActionHead className="w-52">操作</TableActionHead>
                    </tr>
                  </TableHeader>
                  <tbody className="divide-y divide-slate-100">
                    {loading ? (
                      <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-500"><div className="mx-auto h-6 w-6 animate-spin rounded-full border-b-2 border-pink-500"></div></td></tr>
                    ) : list.length === 0 ? (
                      <tr><td colSpan={9} className="px-0 py-0"><WorkspaceEmptyPanel icon={<ClipboardCheck size={26} />} title="暂无补卡或外勤申请" description="创建新的补卡或外勤说明后，这里会展示时间、原因、附件和审批状态。" /></td></tr>
                    ) : list.map(item => (
                      <tr key={item.id} className="hover:bg-slate-50/80">
                        <td className="px-4 py-3 text-sm text-slate-900">{item.appealNo}</td>
                        <td className="px-4 py-3 text-sm">{typeMap[item.appealType] || item.appealType}</td>
                        <td className="px-4 py-3 text-sm text-slate-600">{item.appealDate}</td>
                        <td className="px-4 py-3 text-sm text-slate-600">{item.appealType === 'MAKEUP' ? `${item.appealTime || ''} (${checkTypeMap[item.checkType || ''] || ''})` : (item.address || '-')}</td>
                        <td className="px-4 py-3 text-sm text-slate-600">{originalStatusMap[item.originalStatus || ''] || '-'}</td>
                        <td className="max-w-xs truncate px-4 py-3 text-sm text-slate-600">{item.reason}</td>
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
              <div className="relative border-b border-slate-100 px-6 pb-5 pt-6 sticky top-0 bg-white/95 z-10">
                <div className="absolute inset-x-0 top-0 h-28 bg-[radial-gradient(circle_at_top_right,rgba(244,114,182,0.16),transparent_70%)]" />
                <div className="relative flex items-start justify-between gap-4">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full bg-pink-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-pink-600 ring-1 ring-pink-100">
                      <ClipboardCheck size={14} />
                      异常说明表单
                    </div>
                    <h3 className="mt-4 text-2xl font-bold tracking-tight text-slate-900">{current ? '编辑申请' : '新增申请'}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-500">填写异常发生日期、补卡时间或外勤地点，并补充原因与证明材料后提交审批。</p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => setShowDialog(false)} className="rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                    <X size={18} />
                  </Button>
                </div>
              </div>

              <div className="space-y-4 p-6">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">申请类型 <span className="text-red-500">*</span></label>
                  <Select value={formData.appealType} onValueChange={value => setFormData({ ...formData, appealType: value })}>
                    <SelectTrigger className="h-12 rounded-2xl">
                      <SelectValue placeholder="请选择" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MAKEUP">补卡</SelectItem>
                      <SelectItem value="FIELD">外勤</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">日期 <span className="text-red-500">*</span></label>
                  <DatePicker type="date" value={formData.appealDate} onChange={e => setFormData({ ...formData, appealDate: e.target.value })} />
                </div>

                {formData.appealType === 'MAKEUP' && (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="mb-1 block text-sm font-medium text-slate-700">补卡时间 <span className="text-red-500">*</span></label>
                        <DatePicker type="time" value={formData.appealTime || ''} onChange={e => setFormData({ ...formData, appealTime: e.target.value })} />
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-slate-700">打卡类型 <span className="text-red-500">*</span></label>
                        <Select value={formData.checkType || '1'} onValueChange={value => setFormData({ ...formData, checkType: value })}>
                          <SelectTrigger className="h-12 rounded-2xl">
                            <SelectValue placeholder="请选择" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1">签到</SelectItem>
                            <SelectItem value="2">签退</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">原始打卡状态</label>
                      <Select value={formData.originalStatus || ''} onValueChange={value => setFormData({ ...formData, originalStatus: value })}>
                        <SelectTrigger className="h-12 rounded-2xl">
                          <SelectValue placeholder="请选择" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">请选择</SelectItem>
                          <SelectItem value="LATE">迟到</SelectItem>
                          <SelectItem value="EARLY">早退</SelectItem>
                          <SelectItem value="ABSENT">缺卡</SelectItem>
                          <SelectItem value="ABNORMAL">异常</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}

                {formData.appealType === 'FIELD' && (
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">外勤地址 <span className="text-red-500">*</span></label>
                    <Input className="h-12 rounded-2xl" type="text" value={formData.address || ''} onChange={e => setFormData({ ...formData, address: e.target.value })} placeholder="请输入外勤地址" />
                  </div>
                )}

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">证明人</label>
                  <Input className="h-12 rounded-2xl" type="text" value={formData.witnessName || ''} onChange={e => setFormData({ ...formData, witnessName: e.target.value })} placeholder="如：直属主管或现场同事姓名" />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">申请事由 <span className="text-red-500">*</span></label>
                  <Textarea className="h-24 rounded-2xl" value={formData.reason} onChange={e => setFormData({ ...formData, reason: e.target.value })} placeholder="例如：早高峰拥堵导致迟到、客户现场演示未及时返回办公室等" />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">附件</label>
                  <FileUpload
                    value={formData.attachmentUrl || ''}
                    onChange={(urls) => setFormData({ ...formData, attachmentUrl: urls })}
                    maxCount={3}
                    hint="可上传考勤截图、定位照片、现场证明等，最多 3 个文件"
                  />
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

export default AttendanceAppealPage;
