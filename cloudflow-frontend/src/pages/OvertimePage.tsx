import React, { useState, useEffect } from 'react';
import { Clock, Plus, Edit, Trash2, Send, Search, RotateCcw, X, Paperclip, Download } from 'lucide-react';
import { overtimeApi, OvertimeRequest } from '../services/api/overtime';
import { FileUpload } from '../components/FileUpload';
import { toBackendDateString, toLocalDatetimeString } from '../utils/dateFormat';
import { toast } from 'sonner';
import { TableRowActions } from '@/components/ui/table-row-actions';
import { buildExcelFileName, downloadBlob } from '@/utils/download';
import { DatePicker, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, TableActionHead, TableHead, TableHeader, Textarea } from '@/components/ui';

/** 加班申请页面 */
export const OvertimePage: React.FC = () => {
  const [list, setList] = useState<OvertimeRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchParams, setSearchParams] = useState({ status: '', overtimeType: '', pageNum: 1, pageSize: 10 });
  const [total, setTotal] = useState(0);
  const [showDialog, setShowDialog] = useState(false);
  const [current, setCurrent] = useState<OvertimeRequest | null>(null);
  const [formData, setFormData] = useState<OvertimeRequest>({
    overtimeType: 'WORKDAY', startTime: '', endTime: '', reason: '',
    compensateType: 'SALARY', workContent: '', expectedOutput: '', needMeal: 0, workLocation: 'OFFICE', attachmentUrl: ''
  });

  useEffect(() => { fetchList(); }, [searchParams]);

  const fetchList = async () => {
    setLoading(true);
    try {
      const res = await overtimeApi.list(searchParams);
      if (res) { setList(res.records || res.rows || []); setTotal(res.total || 0); }
    } catch { toast.error('获取列表失败'); } finally { setLoading(false); }
  };

  const handleAdd = () => {
    setCurrent(null);
    setFormData({
      overtimeType: 'WORKDAY', startTime: '', endTime: '', reason: '',
      compensateType: 'SALARY', workContent: '', expectedOutput: '', needMeal: 0, workLocation: 'OFFICE', attachmentUrl: ''
    });
    setShowDialog(true);
  };

  const handleEdit = async (id: number) => {
    try {
      const res = await overtimeApi.getInfo(id);
      if (res) {
        setCurrent(res);
        // 将后端时间格式转为 datetime-local 格式用于表单显示
        setFormData({
          ...res,
          startTime: toLocalDatetimeString(res.startTime) || res.startTime,
          endTime: toLocalDatetimeString(res.endTime) || res.endTime,
        });
        setShowDialog(true);
      }
    } catch { toast.error('获取详情失败'); }
  };

  const handleSave = async () => {
    if (!formData.startTime || !formData.endTime || !formData.reason) { toast.error('请填写完整信息'); return; }
    if (!formData.workContent) { toast.error('请填写加班工作内容'); return; }
    try {
      // 自动计算加班时长
      const start = new Date(formData.startTime).getTime();
      const end = new Date(formData.endTime).getTime();
      const hours = Math.round((end - start) / 3600000 * 10) / 10;
      const data = {
        ...formData,
        overtimeHours: hours > 0 ? hours : 0,
        startTime: toBackendDateString(formData.startTime),
        endTime: toBackendDateString(formData.endTime)
      };

      if (current?.id) { await overtimeApi.edit(data); toast.success('更新成功'); }
      else { await overtimeApi.add(data); toast.success('创建成功'); }
      setShowDialog(false); fetchList();
    } catch { toast.error('保存失败'); }
  };

  const handleDelete = async (ids: number[]) => {
    if (!confirm('确定删除？')) return;
    try { await overtimeApi.remove(ids); toast.success('删除成功'); fetchList(); } catch { toast.error('删除失败'); }
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
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><Clock className="text-pink-500" /> 加班申请</h2>
        <div className="flex items-center gap-2">
          <button onClick={handleExport} className="bg-white text-pink-500 border border-pink-200 px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-pink-50"><Download size={18} />导出 Excel</button>
          <button onClick={handleAdd} className="bg-pink-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-pink-600"><Plus size={18} />新增申请</button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden min-h-[500px] flex flex-col">
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex gap-3">
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
          <Select value={searchParams.overtimeType} onValueChange={v => setSearchParams({...searchParams, overtimeType: v})}>
                    <SelectTrigger>
                      <SelectValue placeholder="请选择" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">全部类型</SelectItem>
                      <SelectItem value="WORKDAY">工作日</SelectItem>
                      <SelectItem value="WEEKEND">周末</SelectItem>
                      <SelectItem value="HOLIDAY">节假日</SelectItem>
                    </SelectContent>
                  </Select>
          <button onClick={() => setSearchParams({ ...searchParams, pageNum: 1 })} className="bg-pink-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-pink-600 text-sm"><Search size={16} />搜索</button>
          <button onClick={() => setSearchParams({ status: '', overtimeType: '', pageNum: 1, pageSize: 10 })} className="bg-slate-200 text-slate-700 px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-slate-300 text-sm"><RotateCcw size={16} />重置</button>
        </div>

        <div className="flex-1 overflow-auto">
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
                <tr><td colSpan={10} className="px-4 py-8 text-center text-slate-500"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-pink-500 mx-auto"></div></td></tr>
              ) : list.length === 0 ? (
                <tr><td colSpan={10} className="px-4 py-8 text-center text-slate-500">暂无数据</td></tr>
              ) : list.map(item => (
                <tr key={item.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-sm text-slate-900">{item.overtimeNo}</td>
                  <td className="px-4 py-3 text-sm">{typeMap[item.overtimeType] || item.overtimeType}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{item.startTime}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{item.endTime}</td>
                  <td className="px-4 py-3 text-sm text-slate-900 font-medium">{item.overtimeHours || '-'}</td>
                  <td className="px-4 py-3 text-sm">{locationMap[item.workLocation || ''] || '-'}</td>
                  <td className="px-4 py-3 text-sm">{compensateMap[item.compensateType || ''] || '-'}</td>
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
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center sticky top-0 bg-white z-10">
              <h3 className="text-lg font-bold text-slate-800">{current ? '编辑加班申请' : '新增加班申请'}</h3>
              <button onClick={() => setShowDialog(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              {/* 加班类型 & 补偿方式 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">加班类型 <span className="text-red-500">*</span></label>
                  <Select value={formData.overtimeType} onValueChange={v => setFormData({...formData, overtimeType: v})}>
                    <SelectTrigger>
                      <SelectValue placeholder="请选择" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="WORKDAY">工作日</SelectItem>
                      <SelectItem value="WEEKEND">周末</SelectItem>
                      <SelectItem value="HOLIDAY">节假日</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">补偿方式</label>
                  <Select value={formData.compensateType || 'SALARY'} onValueChange={v => setFormData({...formData, compensateType: v})}>
                    <SelectTrigger>
                      <SelectValue placeholder="请选择" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SALARY">加班费</SelectItem>
                      <SelectItem value="LEAVE">调休</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {/* 时间 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">开始时间 <span className="text-red-500">*</span></label>
                  <DatePicker type="datetime-local" value={formData.startTime} onChange={e => setFormData({ ...formData, startTime: e.target.value })} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">结束时间 <span className="text-red-500">*</span></label>
                  <DatePicker type="datetime-local" value={formData.endTime} onChange={e => setFormData({ ...formData, endTime: e.target.value })} />
                </div>
              </div>
              {/* 加班地点 & 是否用餐 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">加班地点</label>
                  <Select value={formData.workLocation || 'OFFICE'} onValueChange={v => setFormData({...formData, workLocation: v})}>
                    <SelectTrigger>
                      <SelectValue placeholder="请选择" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="OFFICE">办公室</SelectItem>
                      <SelectItem value="HOME">居家</SelectItem>
                      <SelectItem value="OTHER">其他</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">是否需要用餐</label>
                  <Select value={String(formData.needMeal ?? 0)} onValueChange={v => setFormData({...formData, needMeal: Number(v)})}>
                    <SelectTrigger>
                      <SelectValue placeholder="请选择" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={String(0)}>否</SelectItem>
                      <SelectItem value={String(1)}>是</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {/* 加班事由 */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">加班事由 <span className="text-red-500">*</span></label>
                <Textarea className="h-16" value={formData.reason} onChange={e => setFormData({ ...formData, reason: e.target.value })} placeholder="请简要说明加班原因" />
              </div>
              {/* 加班工作内容 */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">工作内容 <span className="text-red-500">*</span></label>
                <Textarea className="h-20" value={formData.workContent || ''} onChange={e => setFormData({ ...formData, workContent: e.target.value })} placeholder="请详细描述加班期间的工作内容" />
              </div>
              {/* 预计产出 */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">预计产出/成果</label>
                <Input type="text" value={formData.expectedOutput || ''} onChange={e => setFormData({ ...formData, expectedOutput: e.target.value })} placeholder="如：完成XX模块开发、提交XX报告等" />
              </div>
              {/* 附件上传 */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">附件</label>
                <FileUpload
                  value={formData.attachmentUrl || ''}
                  onChange={(urls) => setFormData({ ...formData, attachmentUrl: urls })}
                  maxCount={3}
                  hint="可上传相关工作文档、任务截图等，最多3个文件"
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

export default OvertimePage;
