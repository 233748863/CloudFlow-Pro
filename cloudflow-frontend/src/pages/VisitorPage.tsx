import React, { useState, useEffect } from 'react';
import { UserCheck, Plus, Search, RotateCcw, X, LogIn, LogOut, CheckCircle, XCircle } from 'lucide-react';
import { visitorApi, Visitor } from '../services/api/visitor';
import { toast } from 'sonner';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select';
import { Input } from '../components/ui/input';
import { DatePicker } from '../components/ui/date-picker';
import { Textarea } from '../components/ui/textarea';

/** 访客管理页面 */
export const VisitorPage: React.FC = () => {
  const [list, setList] = useState<Visitor[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchParams, setSearchParams] = useState({ status: '', visitorName: '', pageNum: 1, pageSize: 10 });
  const [total, setTotal] = useState(0);
  const [showDialog, setShowDialog] = useState(false);
  const [formData, setFormData] = useState<Visitor>({ visitorName: '', visitReason: '', hostId: 0, visitDate: '' });

  useEffect(() => { fetchList(); }, [searchParams]);

  const fetchList = async () => {
    setLoading(true);
    try {
      const res = await visitorApi.list(searchParams);
      if (res) { setList(res.records || res.rows || []); setTotal(res.total || 0); }
    } catch { toast.error('获取列表失败'); } finally { setLoading(false); }
  };

  const handleAdd = () => {
    setFormData({ visitorName: '', visitReason: '', hostId: 0, visitDate: '', visitorPhone: '', visitorCompany: '', visitorCount: 1, visitArea: '', carPlate: '' });
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!formData.visitorName || !formData.visitReason || !formData.visitDate) { toast.error('请填写完整信息'); return; }
    try {
      await visitorApi.add(formData);
      toast.success('预约成功');
      setShowDialog(false); fetchList();
    } catch { toast.error('保存失败'); }
  };

  const handleConfirm = async (id: number) => {
    try { await visitorApi.confirm(id); toast.success('已确认'); fetchList(); } catch { toast.error('操作失败'); }
  };
  const handleCheckIn = async (id: number) => {
    try { await visitorApi.checkIn(id); toast.success('已签到'); fetchList(); } catch { toast.error('操作失败'); }
  };
  const handleCheckOut = async (id: number) => {
    try { await visitorApi.checkOut(id); toast.success('已签退'); fetchList(); } catch { toast.error('操作失败'); }
  };
  const handleCancel = async (id: number) => {
    if (!confirm('确定取消？')) return;
    try { await visitorApi.cancel(id); toast.success('已取消'); fetchList(); } catch { toast.error('操作失败'); }
  };

  const statusMap: Record<string, string> = { PENDING: '待确认', CONFIRMED: '已确认', ARRIVED: '已到访', COMPLETED: '已离开', CANCELLED: '已取消' };

  const getStatusBadge = (status: string) => {
    const cfg: Record<string, { bg: string; text: string }> = {
      PENDING: { bg: 'bg-yellow-100', text: 'text-yellow-700' }, CONFIRMED: { bg: 'bg-pink-50', text: 'text-pink-500' },
      ARRIVED: { bg: 'bg-green-100', text: 'text-green-600' }, COMPLETED: { bg: 'bg-slate-100', text: 'text-slate-600' },
      CANCELLED: { bg: 'bg-gray-100', text: 'text-gray-600' },
    };
    const c = cfg[status] || cfg.PENDING;
    return <span className={`text-xs px-2 py-0.5 rounded ${c.bg} ${c.text}`}>{statusMap[status] || status}</span>;
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><UserCheck className="text-pink-500" /> 访客管理</h2>
        <button onClick={handleAdd} className="bg-pink-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-pink-600 shrink-0"><Plus size={18} />新增预约</button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden min-h-[500px] flex flex-col">
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center gap-3">
          <Select value={searchParams.status || 'all'} onValueChange={v => setSearchParams({...searchParams, status: v === 'all' ? '' : v})}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="全部状态" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              <SelectItem value="PENDING">待确认</SelectItem>
              <SelectItem value="CONFIRMED">已确认</SelectItem>
              <SelectItem value="ARRIVED">已到访</SelectItem>
              <SelectItem value="COMPLETED">已离开</SelectItem>
            </SelectContent>
          </Select>
          <Input type="text" placeholder="搜索访客姓名" className="w-56" value={searchParams.visitorName} onChange={e => setSearchParams({ ...searchParams, visitorName: e.target.value })} onKeyDown={e => e.key === 'Enter' && setSearchParams({ ...searchParams, pageNum: 1 })} />
          <button onClick={() => setSearchParams({ ...searchParams, pageNum: 1 })} className="bg-pink-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-pink-600 text-sm shrink-0"><Search size={16} />搜索</button>
          <button onClick={() => setSearchParams({ status: '', visitorName: '', pageNum: 1, pageSize: 10 })} className="bg-slate-200 text-slate-700 px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-slate-300 text-sm shrink-0"><RotateCcw size={16} />重置</button>
        </div>

        <div className="flex-1 overflow-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">访客姓名</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">单位</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">来访日期</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">被访人</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">来访事由</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">通行证</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">状态</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-500"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-pink-500 mx-auto"></div></td></tr>
              ) : list.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-500">暂无访客记录</td></tr>
              ) : list.map(item => (
                <tr key={item.visitorId} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-sm text-slate-900 font-medium">{item.visitorName}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{item.visitorCompany || '-'}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{item.visitDate}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{item.hostName || '-'}</td>
                  <td className="px-4 py-3 text-sm text-slate-600 max-w-xs truncate">{item.visitReason}</td>
                  <td className="px-4 py-3 text-sm text-pink-500 font-mono">{item.passCode || '-'}</td>
                  <td className="px-4 py-3">{getStatusBadge(item.status || 'PENDING')}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      {item.status === 'PENDING' && (
                        <button onClick={() => handleConfirm(item.visitorId!)} className="text-pink-500 hover:text-pink-700 p-1" title="确认"><CheckCircle size={16} /></button>
                      )}
                      {(item.status === 'PENDING' || item.status === 'CONFIRMED') && (
                        <button onClick={() => handleCheckIn(item.visitorId!)} className="text-green-600 hover:text-green-800 p-1" title="签到"><LogIn size={16} /></button>
                      )}
                      {item.status === 'ARRIVED' && (
                        <button onClick={() => handleCheckOut(item.visitorId!)} className="text-orange-600 hover:text-orange-800 p-1" title="签退"><LogOut size={16} /></button>
                      )}
                      {(item.status === 'PENDING' || item.status === 'CONFIRMED') && (
                        <button onClick={() => handleCancel(item.visitorId!)} className="text-red-600 hover:text-red-800 p-1" title="取消"><XCircle size={16} /></button>
                      )}
                    </div>
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

      {/* 新增预约对话框 */}
      {showDialog && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-800">新增访客预约</h3>
              <button onClick={() => setShowDialog(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">访客姓名</label>
                  <Input type="text" value={formData.visitorName} onChange={e => setFormData({ ...formData, visitorName: e.target.value })} placeholder="请输入访客姓名" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">访客电话</label>
                  <Input type="text" value={formData.visitorPhone || ''} onChange={e => setFormData({ ...formData, visitorPhone: e.target.value })} placeholder="请输入电话" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">访客单位</label>
                  <Input type="text" value={formData.visitorCompany || ''} onChange={e => setFormData({ ...formData, visitorCompany: e.target.value })} placeholder="请输入单位" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">来访人数</label>
                  <Input type="number" value={formData.visitorCount || 1} onChange={e => setFormData({ ...formData, visitorCount: parseInt(e.target.value) || 1 })} min="1" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">来访日期</label>
                  <DatePicker type="date" value={formData.visitDate} onChange={e => setFormData({ ...formData, visitDate: e.target.value })} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">车牌号</label>
                  <Input type="text" value={formData.carPlate || ''} onChange={e => setFormData({ ...formData, carPlate: e.target.value })} placeholder="选填" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">被访人姓名</label>
                <Input type="text" value={formData.hostName || ''} onChange={e => setFormData({ ...formData, hostName: e.target.value })} placeholder="请输入被访人姓名" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">来访事由</label>
                <Textarea className="h-20" value={formData.visitReason} onChange={e => setFormData({ ...formData, visitReason: e.target.value })} placeholder="请输入来访事由" />
              </div>
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50 rounded-b-xl flex justify-end gap-2">
              <button onClick={() => setShowDialog(false)} className="bg-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm hover:bg-slate-300">取消</button>
              <button onClick={handleSave} className="bg-pink-500 text-white px-4 py-2 rounded-lg text-sm hover:bg-pink-600">保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VisitorPage;
