import React, { useState, useEffect } from 'react';
import { RefreshCw, Server, Database, Activity, Key, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { getCacheInfo, getCacheKeys } from '../../services/api/system';

/** 统计卡片组件 */
const StatCard: React.FC<{ icon: React.ReactNode; label: string; value: string | number; color: string }> = ({ icon, label, value, color }) => (
  <div className="bg-white rounded-lg shadow-sm p-5 flex items-center gap-4">
    <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${color}`}>{icon}</div>
    <div>
      <p className="text-sm text-slate-500">{label}</p>
      <p className="text-xl font-bold text-slate-800">{value}</p>
    </div>
  </div>
);

export const CacheMonitor = () => {
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState<Record<string, string>>({});
  const [dbSize, setDbSize] = useState(0);
  const [commandStats, setCommandStats] = useState<{ name: string; value: number }[]>([]);
  const [keyGroups, setKeyGroups] = useState<{ prefix: string; count: number }[]>([]);

  useEffect(() => { fetchCacheInfo(); }, []);

  const fetchCacheInfo = async () => {
    setLoading(true);
    try {
      const res: any = await getCacheInfo();
      if (res) {
        setInfo(res.info || {});
        setDbSize(res.dbSize || 0);
        setCommandStats(res.commandStats || []);
        setKeyGroups(res.keyGroups || []);
      }
    } catch (e) {
      console.error(e);
      toast.error('获取缓存信息失败');
    } finally {
      setLoading(false);
    }
  };

  /** 格式化内存大小 */
  const formatMemory = (bytes: string) => {
    const num = parseInt(bytes, 10);
    if (isNaN(num)) return bytes || '-';
    if (num < 1024) return `${num} B`;
    if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
    return `${(num / (1024 * 1024)).toFixed(1)} MB`;
  };

  // 从 Redis info 中提取关键指标
  const redisVersion = info['redis_version'] || '-';
  const usedMemory = info['used_memory'] || '0';
  const usedMemoryHuman = info['used_memory_human'] || formatMemory(usedMemory);
  const connectedClients = info['connected_clients'] || '0';
  const uptimeInDays = info['uptime_in_days'] || '0';
  const totalCommandsProcessed = info['total_commands_processed'] || '0';
  const usedMemoryPeak = info['used_memory_peak_human'] || '-';
  const maxmemory = info['maxmemory_human'] || info['maxmemory'] || '-';
  const role = info['role'] || '-';

  return (
    <div className="p-6 h-full flex flex-col bg-slate-50 overflow-y-auto">
      {/* 标题栏 */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-slate-800">缓存监控</h1>
        <button onClick={fetchCacheInfo} disabled={loading} className="bg-pink-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-pink-600 transition-colors disabled:opacity-50">
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} /> 刷新
        </button>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="animate-spin text-pink-500" size={32} />
        </div>
      ) : (
        <>
          {/* 概览卡片 */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard icon={<Server size={24} className="text-pink-500" />} label="Redis 版本" value={redisVersion} color="bg-pink-50" />
            <StatCard icon={<Database size={24} className="text-emerald-600" />} label="已用内存" value={usedMemoryHuman} color="bg-emerald-50" />
            <StatCard icon={<Activity size={24} className="text-amber-600" />} label="连接客户端" value={connectedClients} color="bg-amber-50" />
            <StatCard icon={<Key size={24} className="text-rose-600" />} label="Key 数量" value={dbSize} color="bg-rose-50" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* 基本信息 */}
            <div className="bg-white rounded-lg shadow-sm">
              <div className="p-4 border-b border-slate-100">
                <h2 className="text-base font-semibold text-slate-800">基本信息</h2>
              </div>
              <div className="p-4">
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-slate-100">
                    {[
                      ['Redis 版本', redisVersion],
                      ['运行天数', `${uptimeInDays} 天`],
                      ['已用内存', usedMemoryHuman],
                      ['内存峰值', usedMemoryPeak],
                      ['最大内存', maxmemory === '0' ? '无限制' : maxmemory],
                      ['角色', role],
                      ['已处理命令', Number(totalCommandsProcessed).toLocaleString()],
                      ['连接客户端', connectedClients],
                    ].map(([label, value]) => (
                      <tr key={label}>
                        <td className="py-2.5 text-slate-500 w-1/3">{label}</td>
                        <td className="py-2.5 text-slate-800 font-medium">{value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 命令统计 Top 10 */}
            <div className="bg-white rounded-lg shadow-sm">
              <div className="p-4 border-b border-slate-100">
                <h2 className="text-base font-semibold text-slate-800">命令统计 (Top 10)</h2>
              </div>
              <div className="p-4">
                {commandStats.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-8">暂无命令统计数据</p>
                ) : (
                  <div className="space-y-3">
                    {commandStats.slice(0, 10).map((cmd, idx) => {
                      const maxVal = commandStats[0]?.value || 1;
                      const pct = Math.round((cmd.value / maxVal) * 100);
                      return (
                        <div key={cmd.name}>
                          <div className="flex justify-between text-sm mb-1">
                            <span className="text-slate-700 font-mono">{cmd.name}</span>
                            <span className="text-slate-500">{cmd.value.toLocaleString()}</span>
                          </div>
                          <div className="w-full bg-slate-100 rounded-full h-2">
                            <div className="bg-pink-400 h-2 rounded-full transition-all" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Key 分组统计 */}
          <div className="bg-white rounded-lg shadow-sm">
            <div className="p-4 border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-800">Key 前缀分组统计</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">前缀</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">数量</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">占比</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {keyGroups.length === 0 ? (
                    <tr><td colSpan={3} className="px-6 py-8 text-center text-slate-400 text-sm">暂无 Key 数据</td></tr>
                  ) : keyGroups.map(group => {
                    const pct = dbSize > 0 ? ((group.count / dbSize) * 100).toFixed(1) : '0';
                    return (
                      <tr key={group.prefix} className="hover:bg-slate-50">
                        <td className="px-6 py-3 text-sm font-mono text-slate-800">{group.prefix}*</td>
                        <td className="px-6 py-3 text-sm text-slate-600">{group.count}</td>
                        <td className="px-6 py-3 text-sm">
                          <div className="flex items-center gap-2">
                            <div className="w-24 bg-slate-100 rounded-full h-2">
                              <div className="bg-emerald-500 h-2 rounded-full" style={{ width: `${Math.min(parseFloat(pct), 100)}%` }} />
                            </div>
                            <span className="text-slate-500">{pct}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
