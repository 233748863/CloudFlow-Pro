import React, { useState, useEffect } from 'react';
import { Calendar, Plus, Search, RotateCcw, X, LogIn, LogOut, RefreshCw } from 'lucide-react';
import { dutyScheduleApi, DutySchedule } from '../services/api/dutySchedule';
import { toast } from 'sonner';

/** 值班排班页面 */
export const DutySchedulePage: React.FC = () => {
  const [list, setList] = useState<DutySchedule[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchParams, setSearchParams] = useState({ status: '', scheduleType: '', pageNum: 1, pageSize: 10 });
  const [total, setTotal] = useState(0);
  const [showDialog, setShowDialog] = useState(false);
  const [showSwapDialog, setShowSwapDialog] = useState(false);
  const [swapId, setSwapId] = useState<number | null>(null);
  const [swapData, setSwapData] = useState({ backupUserId: 0, backupUserName: '', reason: '' });
  const [formData, setFormData] = useState<DutySchedule>({ title: '', scheduleType: 'DAILY', dutyDate: '', userId: 0, shiftType: 'DAY' });

  useEffect(() => { fetchList(); }, [searchParams]);

  const fetchList = async () => {
    setLoading(true);
    try {
      const res = await dutyScheduleApi.list(searchParams);
      if (res) { setList(res.records || res.rows || []); setTotal(res.total || 0); }
    } catch { toast.error('获取列表失败'); } finally { setLoading(false); }
  };

  const handleAdd = () => {
    setFormData({ title: '', scheduleType: 'DAILY', dutyDate: '', userId: 0, shiftType: 'DAY', userName: '', location: '', dutyContent: '' });
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!formData.title || !formData.dutyDate || !formData.userName) { toast.error('请填写完整信息'); return; }
    try {
      await dutyScheduleApi.add(formData);
      toast.success('排班成功');
      setShowDialog(false); fetchList();
    } catch { toast.error('保存失败'); }
  };

  const handleCheckIn = async (id: number) => {
    try { await dutyScheduleApi.checkIn(id); toast.success('签到成功'); fetchList(); } catch { toast.error('签到失败'); }
  };

  const handleCheckOut = async (id: number) => {
    try { await dutyScheduleApi.checkOut(id); toast.success('签退成功'); fetchList(); } catch { toast.error('签退失败'); }
  };

  const openSwapDialog = (id: number) => {
    setSwapId(id);
    setSwapData({ backupUserId: 0, backupUserName: '', reason: '' });
    setShowSwapDialog(true);
  };

  const handleSwap = async () => {
    if (!swapId || !swapData.backupUserName || !swapData.reason) { toast.error('请填写完整信息'); return; }
    try {
      await dutyScheduleApi.swap(swapId, swapData);
      toast.success('换班成功');
      setShowSwapDialog(false); fetchList();
    } catch { toast.error('换班失败'); }
  };

  const statusMap: Record<string, string> = { SCHEDULED: '已排班', CHECKED_IN: '已签到', COMPLETED: '已完成', SWAPPED: '已换班', CANCELLED: '已取消' };
  const typeMap: Record<string, string> = { DAILY: '日常值班', HOLIDAY: '节假日值班', EMERGENCY: '应急值班' };
  const shiftMap: Record<string, string> = { DAY: '白班', NIGHT: '夜班', FULL: '全天' };

  const getStatusBadge = (status: string) => {
    const cfg: Record<string, { bg: string; text: string }> = {
      SCHEDULED: { bg: 'bg-blue-100', text: 'text-blue-600' }, CHECKED_IN: { bg: 'bg-yellow-100', text: 'text-yellow-700' },
      COMPLETED: { bg: 'bg-green-100', text: 'text-green-600' }, SWAPPED: { bg: 'bg-purple-100', text: 'text-purple-600' },
      CANCELLED: { bg: 'bg-gray-100', text: 'text-gray-600' },
    };
    const c = cfg[status] || cfg.SCHEDULED;
    return <span className={`text-xs px-2 py-0.5 rounded ${c.bg} ${c.text}`}>{statusMap[status] || status}</span>;
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><Calendar className="text-indigo-600" /> 值班排班</h2>
        <button onClick={handleAdd} className="bg-indigo-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-indigo-700"><Plus size={18} />新增排班</button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden min-h-[500px] flex flex-col">
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex gap-3">
          <select value={searchParams.status} onChange={e => setSearchParams({ ...searchParams, status: e.target.value, pageNum: 1 })} className="border border-slate-300 rounded-lg px-3 py-2 text-sm">
            <option value="">全部状态</option><option value="SCHEDULED">已排班</option><option value="CHECKED_IN">已签到</option><option value="COMPLETED">已完成</option><option value="SWAPPED">已换班</option>
          </select>
          <select value={searchParams.scheduleType} onChange={e => setSearchParams({ ...searchParams, scheduleType: e.target.value, pageNum: 1 })} className="border border-slate-300 rounded-lg px-3 py-2 text-sm">
            <option value="">全部类型</option><option value="DAILY">日常值班</option><option value="HOLIDAY">节假日值班</option><option value="EMERGENCY">应急值班</option>
          </select>
          <button onClick={() => setSearchParams({ ...searchParams, pageNum: 1 })} className="bg-indigo-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-indigo-700 text-sm"><Search size={16} />搜索</button>
          <button onClick={() => setSearchParams({ status: '', scheduleType: '', pageNum: 1, pageSize: 10 })} className="bg-slate-200 text-slate-700 px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-slate-300 text-sm"><RotateCcw size={16} />重置</button>
        </div>

        <div className="flex-1 overflow-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">标题</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">类型</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">值班日期</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">班次</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">值班人</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">地点</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">签到/签退</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">状态</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-500"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600 mx-auto"></div></td></tr>
              ) : list.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-500">暂无排班记录</td></tr>
              ) : list.map(item => (
                <tr key={item.scheduleId} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-sm text-slate-900 font-medium">{item.title}</td>
                  <td className="px-4 py-3 text-sm">{typeMap[item.scheduleType] || item.scheduleType}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{item.dutyDate}</td>
                  <td className="px-4 py-3 text-sm">{shiftMap[item.shiftType || ''] || '-'}</td>
                  <td className="px-4 py-3 text-sm text-slate-900">{item.userName}{item.backupUserName ? ` → ${item.backupUserName}` : ''}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{item.location || '-'}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {item.checkInTime ? `到: ${item.checkInTime}` : '-'}<br />
                    {item.checkOutTime ? `退: ${item.checkOutTime}` : '-'}
                  </td>
                  <td className="px-4 py-3">{getStatusBadge(item.status || 'SCHEDULED')}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      {item.status === 'SCHEDULED' && (<>
                        <button onClick={() => handleCheckIn(item.scheduleId!)} className="text-green-600 hover:text-green-800 p-1" title="签到"><LogIn size={16} /></button>
                        <button onClick={() => openSwapDialog(item.scheduleId!)} className="text-purple-600 hover:text-purple-800 p-1" title="换班"><RefreshCw size={16} /></button>
                      </>)}
                      {item.status === 'CHECKED_IN' && (
                        <button onClick={() => handleCheckOut(item.scheduleId!)} className="text-orange-600 hover:text-orange-800 p-1" title="签退"><LogOut size={16} /></button>
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

      {/* 新增排班对话框 */}
      {showDialog && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-800">新增排班</h3>
              <button onClick={() => setShowDialog(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">排班标题</label>
                <input type="text" className="w-full border border-slate-300 rounded-lg p-2" value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} placeholder="如：2月16日值班" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">值班类型</label>
                  <select className="w-full border border-slate-300 rounded-lg p-2" value={formData.scheduleType} onChange={e => setFormData({ ...formData, scheduleType: e.target.value })}>
                    <option value="DAILY">日常值班</option><option value="HOLIDAY">节假日值班</option><option value="EMERGENCY">应急值班</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">班次</label>
                  <select className="w-full border border-slate-300 rounded-lg p-2" value={formData.shiftType || 'DAY'} onChange={e => setFormData({ ...formData, shiftType: e.target.value })}>
                    <option value="DAY">白班</option><option value="NIGHT">夜班</option><option value="FULL">全天</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">值班日期</label>
                <input type="date" className="w-full border border-slate-300 rounded-lg p-2" value={formData.dutyDate} onChange={e => setFormData({ ...formData, dutyDate: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">值班人姓名</label>
                  <input type="text" className="w-full border border-slate-300 rounded-lg p-2" value={formData.userName || ''} onChange={e => setFormData({ ...formData, userName: e.target.value })} placeholder="请输入值班人" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">值班地点</label>
                  <input type="text" className="w-full border border-slate-300 rounded-lg p-2" value={formData.location || ''} onChange={e => setFormData({ ...formData, location: e.target.value })} placeholder="选填" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">值班内容</label>
                <textarea className="w-full border border-slate-300 rounded-lg p-2 h-16" value={formData.dutyContent || ''} onChange={e => setFormData({ ...formData, dutyContent: e.target.value })} placeholder="选填" />
              </div>
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50 rounded-b-xl flex justify-end gap-2">
              <button onClick={() => setShowDialog(false)} className="bg-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm hover:bg-slate-300">取消</button>
              <button onClick={handleSave} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700">保存</button>
            </div>
          </div>
        </div>
      )}

      {/* 换班对话框 */}
      {showSwapDialog && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-800">换班申请</h3>
              <button onClick={() => setShowSwapDialog(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">替班人姓名</label>
                <input type="text" className="w-full border border-slate-300 rounded-lg p-2" value={swapData.backupUserName} onChange={e => setSwapData({ ...swapData, backupUserName: e.target.value })} placeholder="请输入替班人姓名" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">换班原因</label>
                <textarea className="w-full border border-slate-300 rounded-lg p-2 h-20" value={swapData.reason} onChange={e => setSwapData({ ...swapData, reason: e.target.value })} placeholder="请输入换班原因" />
              </div>
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50 rounded-b-xl flex justify-end gap-2">
              <button onClick={() => setShowSwapDialog(false)} className="bg-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm hover:bg-slate-300">取消</button>
              <button onClick={handleSwap} className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-purple-700">确认换班</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DutySchedulePage;
