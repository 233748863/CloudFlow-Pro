import React, { useState, useEffect } from 'react';
import { ClipboardCheck, Plus, Edit, Trash2, Send, Search, RotateCcw, X, Paperclip, Download } from 'lucide-react';
import { attendanceAppealApi, AttendanceAppeal } from '../services/api/attendanceAppeal';
import { FileUpload } from '../components/FileUpload';
import { toast } from 'sonner';
import { buildExcelFileName, downloadBlob } from '@/utils/download';
import { TableRowActions } from '@/components/ui/table-row-actions';
import { DatePicker, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from '@/components/ui';

/** 补卡/外勤申请页面 */
export const AttendanceAppealPage: React.FC = () => {
  const [list, setList] = useState<AttendanceAppeal[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchParams, setSearchParams] = useState({ status: '', appealType: '', pageNum: 1, pageSize: 10 });
  const [total, setTotal] = useState(0);
  const [showDialog, setShowDialog] = useState(false);
  const [current, setCurrent] = useState<AttendanceAppeal | null>(null);
  const [formData, setFormData] = useState<AttendanceAppeal>({ appealType: 'MAKEUP', appealDate: '', reason: '' });

  useEffect(() => { fetchList(); }, [searchParams]);

  const fetchList = async () => {
    setLoading(true);
    try {
      const res = await attendanceAppealApi.list(searchParams);
      if (res) { setList(res.records || res.rows || []); setTotal(res.total || 0); }
    } catch { toast.error('获取列表失败'); } finally { setLoading(false); }
  };

  const handleAdd = () => {
    setCurrent(null);
    setFormData({ appealType: 'MAKEUP', appealDate: '', reason: '', checkType: '1', originalStatus: '', witnessName: '', attachmentUrl: '' });
    setShowDialog(true);
  };

  const handleEdit = async (id: number) => {
    try {
      const res = await attendanceAppealApi.getInfo(id);
      if (res) { setCurrent(res); setFormData(res); setShowDialog(true); }
    } catch { toast.error('获取详情失败'); }
  };

  const handleSave = async () => {
    if (!formData.appealDate || !formData.reason) { toast.error('请填写完整信息'); return; }
    if (formData.appealType === 'MAKEUP' && !formData.appealTime) { toast.error('补卡类型请填写补卡时间'); return; }
    if (formData.appealType === 'FIELD' && !formData.address) { toast.error('外勤类型请填写外勤地址'); return; }
    try {
      if (current?.id) { await attendanceAppealApi.edit(formData); toast.success('更新成功'); }
      else { await attendanceAppealApi.add(formData); toast.success('创建成功'); }
      setShowDialog(false); fetchList();
    } catch { toast.error('保存失败'); }
  };

  const handleDelete = async (ids: number[]) => {
    if (!confirm('确定删除？')) return;
    try { await attendanceAppealApi.remove(ids); toast.success('删除成功'); fetchList(); } catch { toast.error('删除失败'); }
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

  // 状态映射
  const statusMap: Record<string, string> = { DRAFT: '草稿', PENDING: '审批中', APPROVED: '已通过', REJECTED: '已驳回', CANCELLED: '已取消' };
  const typeMap: Record<string, string> = { MAKEUP: '补卡', FIELD: '外勤' };
  const checkTypeMap: Record<string, string> = { '1': '签到', '2': '签退' };
  const originalStatusMap: Record<string, string> = { LATE: '迟到', EARLY: '早退', ABSENT: '缺卡', ABNORMAL: '异常' };

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
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <ClipboardCheck className="text-pink-500" /> 补卡/外勤申请
        </h2>
        <div className="flex items-center gap-2">
          <button onClick={handleExport} className="bg-white text-pink-500 border border-pink-200 px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-pink-50"><Download size={18} />导出 Excel</button>
          <button onClick={handleAdd} className="bg-pink-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-pink-600"><Plus size={18} />新增申请</button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden min-h-[500px] flex flex-col">
        {/* 搜索栏 */}
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
          <Select value={searchParams.appealType} onValueChange={v => setSearchParams({...searchParams, appealType: v})}>
                    <SelectTrigger>
                      <SelectValue placeholder="请选择" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">全部类型</SelectItem>
                      <SelectItem value="MAKEUP">补卡</SelectItem>
                      <SelectItem value="FIELD">外勤</SelectItem>
                    </SelectContent>
                  </Select>
          <button onClick={() => setSearchParams({ ...searchParams, pageNum: 1 })} className="bg-pink-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-pink-600 text-sm"><Search size={16} />搜索</button>
          <button onClick={() => setSearchParams({ status: '', appealType: '', pageNum: 1, pageSize: 10 })} className="bg-slate-200 text-slate-700 px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-slate-300 text-sm"><RotateCcw size={16} />重置</button>
        </div>

        {/* 表格 */}
        <div className="flex-1 overflow-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">申请单号</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">类型</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">日期</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">补卡时间/地址</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">原始状态</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">事由</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">附件</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">状态</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase w-52">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-500"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-pink-500 mx-auto"></div></td></tr>
              ) : list.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-500">暂无数据</td></tr>
              ) : list.map(item => (
                <tr key={item.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-sm text-slate-900">{item.appealNo}</td>
                  <td className="px-4 py-3 text-sm">{typeMap[item.appealType] || item.appealType}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{item.appealDate}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{item.appealType === 'MAKEUP' ? `${item.appealTime || ''} (${checkTypeMap[item.checkType || ''] || ''})` : (item.address || '-')}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{originalStatusMap[item.originalStatus || ''] || '-'}</td>
                  <td className="px-4 py-3 text-sm text-slate-600 max-w-xs truncate">{item.reason}</td>
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

        {/* 分页 */}
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
              <h3 className="text-lg font-bold text-slate-800">{current ? '编辑申请' : '新增申请'}</h3>
              <button onClick={() => setShowDialog(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              {/* 申请类型 */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">申请类型 <span className="text-red-500">*</span></label>
                <Select value={formData.appealType} onValueChange={v => setFormData({...formData, appealType: v})}>
                    <SelectTrigger>
                      <SelectValue placeholder="请选择" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MAKEUP">补卡</SelectItem>
                      <SelectItem value="FIELD">外勤</SelectItem>
                    </SelectContent>
                  </Select>
              </div>
              {/* 日期 */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">日期 <span className="text-red-500">*</span></label>
                <DatePicker type="date" value={formData.appealDate} onChange={e => setFormData({ ...formData, appealDate: e.target.value })} />
              </div>
              {/* 补卡专有字段 */}
              {formData.appealType === 'MAKEUP' && (<>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">补卡时间 <span className="text-red-500">*</span></label>
                    <DatePicker type="time" value={formData.appealTime || ''} onChange={e => setFormData({ ...formData, appealTime: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">打卡类型 <span className="text-red-500">*</span></label>
                    <Select value={formData.checkType || '1'} onValueChange={v => setFormData({...formData, checkType: v})}>
                    <SelectTrigger>
                      <SelectValue placeholder="请选择" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">签到</SelectItem>
                      <SelectItem value="2">签退</SelectItem>
                    </SelectContent>
                  </Select>
                  </div>
                </div>
                {/* 原始打卡状态 */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">原始打卡状态</label>
                  <Select value={formData.originalStatus || ''} onValueChange={v => setFormData({...formData, originalStatus: v})}>
                    <SelectTrigger>
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
              </>)}
              {/* 外勤专有字段 */}
              {formData.appealType === 'FIELD' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">外勤地址 <span className="text-red-500">*</span></label>
                  <Input type="text" value={formData.address || ''} onChange={e => setFormData({ ...formData, address: e.target.value })} placeholder="请输入外勤地址" />
                </div>
              )}
              {/* 证明人 */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">证明人</label>
                <Input type="text" value={formData.witnessName || ''} onChange={e => setFormData({ ...formData, witnessName: e.target.value })} placeholder="可填写知情同事姓名" />
              </div>
              {/* 申请事由 */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">申请事由 <span className="text-red-500">*</span></label>
                <Textarea className="h-20" value={formData.reason} onChange={e => setFormData({ ...formData, reason: e.target.value })} placeholder="请详细描述补卡/外勤原因" />
              </div>
              {/* 附件上传 */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">附件</label>
                <FileUpload
                  value={formData.attachmentUrl || ''}
                  onChange={(urls) => setFormData({ ...formData, attachmentUrl: urls })}
                  maxCount={3}
                  hint="可上传截图、照片等证明材料，最多3个文件"
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

export default AttendanceAppealPage;
