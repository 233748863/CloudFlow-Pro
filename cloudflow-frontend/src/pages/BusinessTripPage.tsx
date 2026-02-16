import React, { useState, useEffect } from 'react';
import { Plane, Plus, Edit, Trash2, Send, Search, RotateCcw, X } from 'lucide-react';
import { businessTripApi, BusinessTrip } from '../services/api/businessTrip';
import { toast } from 'sonner';

/** 出差申请页面 */
export const BusinessTripPage: React.FC = () => {
  const [list, setList] = useState<BusinessTrip[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchParams, setSearchParams] = useState({ status: '', destination: '', pageNum: 1, pageSize: 10 });
  const [total, setTotal] = useState(0);
  const [showDialog, setShowDialog] = useState(false);
  const [current, setCurrent] = useState<BusinessTrip | null>(null);
  const [formData, setFormData] = useState<BusinessTrip>({ destination: '', startDate: '', endDate: '', reason: '', transportType: 'TRAIN' });

  useEffect(() => { fetchList(); }, [searchParams]);

  const fetchList = async () => {
    setLoading(true);
    try {
      const res = await businessTripApi.list(searchParams);
      if (res.data) { setList(res.data.records || []); setTotal(res.data.total || 0); }
    } catch { toast.error('获取列表失败'); } finally { setLoading(false); }
  };

  const handleAdd = () => {
    setCurrent(null);
    setFormData({ destination: '', startDate: '', endDate: '', reason: '', transportType: 'TRAIN' });
    setShowDialog(true);
  };

  const handleEdit = async (id: number) => {
    try {
      const res = await businessTripApi.getInfo(id);
      if (res.data) { setCurrent(res.data); setFormData(res.data); setShowDialog(true); }
    } catch { toast.error('获取详情失败'); }
  };

  const handleSave = async () => {
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
    try { await businessTripApi.submit(id); toast.success('提交成功'); fetchList(); } catch { toast.error('提交失败'); }
  };

  const statusMap: Record<string, string> = { DRAFT: '草稿', PENDING: '审批中', APPROVED: '已通过', REJECTED: '已驳回', CANCELLED: '已取消' };
  const transportMap: Record<string, string> = { PLANE: '飞机', TRAIN: '火车', CAR: '自驾', OTHER: '其他' };

  const getStatusBadge = (status: string) => {
    const cfg: Record<string, { bg: string; text: string }> = {
      DRAFT: { bg: 'bg-slate-100', text: 'text-slate-600' }, PENDING: { bg: 'bg-blue-100', text: 'text-blue-600' },
      APPROVED: { bg: 'bg-green-100', text: 'text-green-600' }, REJECTED: { bg: 'bg-red-100', text: 'text-red-600' },
      CANCELLED: { bg: 'bg-gray-100', text: 'text-gray-600' },
    };
    const c = cfg[status] || cfg.DRAFT;
    return <span className={`text-xs px-2 py-0.5 rounded ${c.bg} ${c.text}`}>{statusMap[status] || status}</span>;
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><Plane className="text-indigo-600" /> 出差申请</h2>
        <button onClick={handleAdd} className="bg-indigo-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-indigo-700"><Plus size={18} />新增申请</button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden min-h-[500px] flex flex-col">
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex gap-3">
          <select value={searchParams.status} onChange={e => setSearchParams({ ...searchParams, status: e.target.value, pageNum: 1 })} className="border border-slate-300 rounded-lg px-3 py-2 text-sm">
            <option value="">全部状态</option><option value="DRAFT">草稿</option><option value="PENDING">审批中</option><option value="APPROVED">已通过</option><option value="REJECTED">已驳回</option>
          </select>
          <input type="text" placeholder="搜索目的地" value={searchParams.destination} onChange={e => setSearchParams({ ...searchParams, destination: e.target.value })} className="border border-slate-300 rounded-lg px-3 py-2 text-sm" />
          <button onClick={() => setSearchParams({ ...searchParams, pageNum: 1 })} className="bg-indigo-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-indigo-700 text-sm"><Search size={16} />搜索</button>
          <button onClick={() => setSearchParams({ status: '', destination: '', pageNum: 1, pageSize: 10 })} className="bg-slate-200 text-slate-700 px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-slate-300 text-sm"><RotateCcw size={16} />重置</button>
        </div>

        <div className="flex-1 overflow-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">出差单号</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">目的地</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">开始日期</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">结束日期</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">天数</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">交通方式</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">预计费用</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">状态</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-500"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600 mx-auto"></div></td></tr>
              ) : list.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-500">暂无数据</td></tr>
              ) : list.map(item => (
                <tr key={item.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-sm text-slate-900">{item.tripNo}</td>
                  <td className="px-4 py-3 text-sm text-slate-900 font-medium">{item.destination}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{item.startDate}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{item.endDate}</td>
                  <td className="px-4 py-3 text-sm">{item.tripDays || '-'}天</td>
                  <td className="px-4 py-3 text-sm">{transportMap[item.transportType || ''] || '-'}</td>
                  <td className="px-4 py-3 text-sm">¥{item.estimatedCost?.toFixed(2) || '0.00'}</td>
                  <td className="px-4 py-3">{getStatusBadge(item.status || 'DRAFT')}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {item.status === 'DRAFT' && (<>
                        <button onClick={() => handleEdit(item.id!)} className="text-green-600 hover:text-green-800"><Edit size={16} /></button>
                        <button onClick={() => handleSubmit(item.id!)} className="text-indigo-600 hover:text-indigo-800"><Send size={16} /></button>
                        <button onClick={() => handleDelete([item.id!])} className="text-red-600 hover:text-red-800"><Trash2 size={16} /></button>
                      </>)}
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

      {showDialog && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-800">{current ? '编辑出差申请' : '新增出差申请'}</h3>
              <button onClick={() => setShowDialog(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">出差目的地</label>
                <input type="text" className="w-full border border-slate-300 rounded-lg p-2" value={formData.destination} onChange={e => setFormData({ ...formData, destination: e.target.value })} placeholder="请输入目的地" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">开始日期</label>
                  <input type="date" className="w-full border border-slate-300 rounded-lg p-2" value={formData.startDate} onChange={e => setFormData({ ...formData, startDate: e.target.value })} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">结束日期</label>
                  <input type="date" className="w-full border border-slate-300 rounded-lg p-2" value={formData.endDate} onChange={e => setFormData({ ...formData, endDate: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">交通方式</label>
                  <select className="w-full border border-slate-300 rounded-lg p-2" value={formData.transportType || 'TRAIN'} onChange={e => setFormData({ ...formData, transportType: e.target.value })}>
                    <option value="PLANE">飞机</option><option value="TRAIN">火车</option><option value="CAR">自驾</option><option value="OTHER">其他</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">预计费用(元)</label>
                  <input type="number" className="w-full border border-slate-300 rounded-lg p-2" value={formData.estimatedCost || ''} onChange={e => setFormData({ ...formData, estimatedCost: parseFloat(e.target.value) || 0 })} placeholder="0.00" step="0.01" min="0" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">出差事由</label>
                <textarea className="w-full border border-slate-300 rounded-lg p-2 h-20" value={formData.reason} onChange={e => setFormData({ ...formData, reason: e.target.value })} placeholder="请输入出差事由" />
              </div>
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50 rounded-b-xl flex justify-end gap-2">
              <button onClick={() => setShowDialog(false)} className="bg-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm hover:bg-slate-300">取消</button>
              <button onClick={handleSave} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700">保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BusinessTripPage;
