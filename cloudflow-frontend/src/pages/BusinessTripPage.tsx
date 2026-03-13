import React, { useState, useEffect } from 'react';
import { Plane, Plus, Edit, Trash2, Send, Search, RotateCcw, X, Paperclip, Download } from 'lucide-react';
import { businessTripApi, BusinessTrip } from '../services/api/businessTrip';
import { FileUpload } from '../components/FileUpload';
import { toast } from 'sonner';
import { buildExcelFileName, downloadBlob } from '@/utils/download';
import { TableRowActions } from '@/components/ui/table-row-actions';
import { DatePicker, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea, TableHead, TableHeader, TableActionHead } from '@/components/ui';

/** 出差申请页面 */
export const BusinessTripPage: React.FC = () => {
  const [list, setList] = useState<BusinessTrip[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchParams, setSearchParams] = useState({ status: '', destination: '', pageNum: 1, pageSize: 10 });
  const [total, setTotal] = useState(0);
  const [showDialog, setShowDialog] = useState(false);
  const [current, setCurrent] = useState<BusinessTrip | null>(null);
  const [formData, setFormData] = useState<BusinessTrip>({
    destination: '', startDate: '', endDate: '', reason: '', transportType: 'TRAIN',
    departure: '', accommodation: 'SELF', contactPhone: '', emergencyContact: '', emergencyPhone: '', projectName: '', attachmentUrl: ''
  });

  useEffect(() => { fetchList(); }, [searchParams]);

  const fetchList = async () => {
    setLoading(true);
    try {
      const res = await businessTripApi.list(searchParams);
      if (res) { setList(res.records || res.rows || []); setTotal(res.total || 0); }
    } catch { toast.error('获取列表失败'); } finally { setLoading(false); }
  };

  const handleAdd = () => {
    setCurrent(null);
    setFormData({
      destination: '', startDate: '', endDate: '', reason: '', transportType: 'TRAIN',
      departure: '', accommodation: 'SELF', contactPhone: '', emergencyContact: '', emergencyPhone: '', projectName: '', attachmentUrl: ''
    });
    setShowDialog(true);
  };

  const handleEdit = async (id: number) => {
    try {
      const res = await businessTripApi.getInfo(id);
      if (res) { setCurrent(res); setFormData(res); setShowDialog(true); }
    } catch { toast.error('获取详情失败'); }
  };

  const handleSave = async () => {
    if (!formData.departure) { toast.error('请填写出发地'); return; }
    if (!formData.destination || !formData.startDate || !formData.endDate || !formData.reason) { toast.error('请填写完整信息'); return; }
    try {
      // 自动计算出差天数
      const start = new Date(formData.startDate).getTime();
      const end = new Date(formData.endDate).getTime();
      const days = Math.round((end - start) / 86400000) + 1;
      const data = { ...formData, tripDays: days > 0 ? days : 1 };

      if (current?.id) { await businessTripApi.edit(data); toast.success('更新成功'); }
      else { await businessTripApi.add(data); toast.success('创建成功'); }
      setShowDialog(false); fetchList();
    } catch { toast.error('保存失败'); }
  };

  const handleDelete = async (ids: number[]) => {
    if (!confirm('确定删除？')) return;
    try { await businessTripApi.remove(ids); toast.success('删除成功'); fetchList(); } catch { toast.error('删除失败'); }
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
    const cfg: Record<string, { bg: string; text: string }> = {
      DRAFT: { bg: 'bg-slate-100', text: 'text-slate-600' }, PENDING: { bg: 'bg-pink-50', text: 'text-pink-500' },
      APPROVED: { bg: 'bg-green-100', text: 'text-green-600' }, REJECTED: { bg: 'bg-red-100', text: 'text-red-600' },
      CANCELLED: { bg: 'bg-gray-100', text: 'text-gray-600' },
    };
    const c = cfg[status] || cfg.DRAFT;
    return <span className={`text-xs px-2 py-0.5 rounded ${c.bg} ${c.text}`}>{statusMap[status] || status}</span>;
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><Plane className="text-pink-500" /> 出差申请</h2>
        <div className="flex items-center gap-2">
          <button onClick={handleExport} className="bg-white text-pink-500 border border-pink-200 px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-pink-50"><Download size={18} />导出 Excel</button>
          <button onClick={handleAdd} className="bg-pink-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-pink-600"><Plus size={18} />新增申请</button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden min-h-[500px] flex flex-col">
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center gap-3">
          <div className="w-40 shrink-0">
            <Select value={searchParams.status} onValueChange={v => setSearchParams({...searchParams, status: v})}>
              <SelectTrigger>
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
          </div>
          <Input type="text" placeholder="搜索目的地" value={searchParams.destination} onChange={e => setSearchParams({ ...searchParams, destination: e.target.value })} className="max-w-xs" />
          <button onClick={() => setSearchParams({ ...searchParams, pageNum: 1 })} className="shrink-0 whitespace-nowrap bg-pink-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-pink-600 text-sm"><Search size={16} />搜索</button>
          <button onClick={() => setSearchParams({ status: '', destination: '', pageNum: 1, pageSize: 10 })} className="shrink-0 whitespace-nowrap bg-slate-200 text-slate-700 px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-slate-300 text-sm"><RotateCcw size={16} />重置</button>
        </div>

        <div className="flex-1 overflow-auto">
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
                <tr><td colSpan={10} className="px-4 py-8 text-center text-slate-500"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-pink-500 mx-auto"></div></td></tr>
              ) : list.length === 0 ? (
                <tr><td colSpan={10} className="px-4 py-8 text-center text-slate-500">暂无数据</td></tr>
              ) : list.map(item => (
                <tr key={item.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-sm text-slate-900">{item.tripNo}</td>
                  <td className="px-4 py-3 text-sm text-slate-900 font-medium">{item.departure ? `${item.departure} → ` : ''}{item.destination}</td>
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
                        {
                          label: '编辑',
                          icon: <Edit size={14} />,
                          onClick: () => handleEdit(item.id!),
                          tone: 'primary',
                          hidden: item.status !== 'DRAFT',
                        },
                        {
                          label: '提交',
                          icon: <Send size={14} />,
                          onClick: () => handleSubmit(item.id!),
                          tone: 'success',
                          hidden: item.status !== 'DRAFT',
                        },
                        {
                          label: '删除',
                          icon: <Trash2 size={14} />,
                          onClick: () => handleDelete([item.id!]),
                          tone: 'danger',
                          hidden: item.status !== 'DRAFT',
                        },
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="p-4 border-t border-slate-200 flex justify-between items-center">
          <span className="text-sm text-slate-600">共 {total} 条</span>
          <div className="flex gap-2">
            <button onClick={() => setSearchParams(p => ({ ...p, pageNum: Math.max(1, p.pageNum - 1) }))} disabled={searchParams.pageNum === 1} className="px-3 py-1 border border-slate-300 rounded text-sm disabled:opacity-50">上一页</button>
            <span className="px-3 py-1 text-sm">第 {searchParams.pageNum} 页</span>
            <button onClick={() => setSearchParams(p => ({ ...p, pageNum: p.pageNum + 1 }))} disabled={searchParams.pageNum * searchParams.pageSize >= total} className="px-3 py-1 border border-slate-300 rounded text-sm disabled:opacity-50">下一页</button>
          </div>
        </div>
      </div>

      {/* 新增/编辑对话框 */}
      {showDialog && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center sticky top-0 bg-white z-10">
              <h3 className="text-lg font-bold text-slate-800">{current ? '编辑出差申请' : '新增出差申请'}</h3>
              <button onClick={() => setShowDialog(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              {/* 出发地 & 目的地 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">出发地 <span className="text-red-500">*</span></label>
                  <Input type="text" value={formData.departure || ''} onChange={e => setFormData({ ...formData, departure: e.target.value })} placeholder="如：北京" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">目的地 <span className="text-red-500">*</span></label>
                  <Input type="text" value={formData.destination} onChange={e => setFormData({ ...formData, destination: e.target.value })} placeholder="如：上海" />
                </div>
              </div>
              {/* 日期 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">开始日期 <span className="text-red-500">*</span></label>
                  <DatePicker type="date" value={formData.startDate} onChange={e => setFormData({ ...formData, startDate: e.target.value })} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">结束日期 <span className="text-red-500">*</span></label>
                  <DatePicker type="date" value={formData.endDate} onChange={e => setFormData({ ...formData, endDate: e.target.value })} />
                </div>
              </div>
              {/* 交通方式 & 住宿安排 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">交通方式</label>
                  <Select value={formData.transportType || 'TRAIN'} onValueChange={v => setFormData({...formData, transportType: v})}>
                    <SelectTrigger>
                      <SelectValue placeholder="请选择" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PLANE">飞机</SelectItem>
                      <SelectItem value="TRAIN">火车</SelectItem>
                      <SelectItem value="CAR">自驾</SelectItem>
                      <SelectItem value="OTHER">其他</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">住宿安排</label>
                  <Select value={formData.accommodation || 'SELF'} onValueChange={v => setFormData({...formData, accommodation: v})}>
                    <SelectTrigger>
                      <SelectValue placeholder="请选择" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SELF">自行安排</SelectItem>
                      <SelectItem value="COMPANY">公司安排</SelectItem>
                      <SelectItem value="NONE">无需住宿</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {/* 预计费用 & 关联项目 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">预计费用(元)</label>
                  <Input type="number" value={formData.estimatedCost || ''} onChange={e => setFormData({ ...formData, estimatedCost: parseFloat(e.target.value) || 0 })} placeholder="0.00" step="0.01" min="0" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">关联项目</label>
                  <Input type="text" value={formData.projectName || ''} onChange={e => setFormData({ ...formData, projectName: e.target.value })} placeholder="如：XX项目客户拜访" />
                </div>
              </div>
              {/* 联系电话 */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">出差期间联系电话</label>
                <Input type="tel" value={formData.contactPhone || ''} onChange={e => setFormData({ ...formData, contactPhone: e.target.value })} placeholder="请输入手机号" />
              </div>
              {/* 紧急联系人 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">紧急联系人</label>
                  <Input type="text" value={formData.emergencyContact || ''} onChange={e => setFormData({ ...formData, emergencyContact: e.target.value })} placeholder="姓名" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">紧急联系人电话</label>
                  <Input type="tel" value={formData.emergencyPhone || ''} onChange={e => setFormData({ ...formData, emergencyPhone: e.target.value })} placeholder="电话" />
                </div>
              </div>
              {/* 同行人员 */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">同行人员</label>
                <Input type="text" value={formData.companions || ''} onChange={e => setFormData({ ...formData, companions: e.target.value })} placeholder="如：张三、李四" />
              </div>
              {/* 出差事由 */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">出差事由 <span className="text-red-500">*</span></label>
                <Textarea className="h-20" value={formData.reason} onChange={e => setFormData({ ...formData, reason: e.target.value })} placeholder="请详细描述出差目的和工作安排" />
              </div>
              {/* 附件上传 */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">附件</label>
                <FileUpload
                  value={formData.attachmentUrl || ''}
                  onChange={(urls) => setFormData({ ...formData, attachmentUrl: urls })}
                  maxCount={5}
                  hint="可上传邀请函、会议通知、行程单等，最多5个文件"
                />
              </div>
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50 rounded-b-xl flex justify-end gap-2 sticky bottom-0">
              <button onClick={() => setShowDialog(false)} className="bg-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm hover:bg-slate-300">取消</button>
              <button onClick={handleSave} className="bg-pink-500 text-white px-4 py-2 rounded-lg text-sm hover:bg-pink-600">保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BusinessTripPage;
