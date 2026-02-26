import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Search, X, Loader2, Lock, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { getConfigList, addConfig, updateConfig, deleteConfig, type SysConfig } from '../../services/api/system';
import { clearConfigCache } from '../../hooks/useSystemConfig';

export const ConfigList = () => {
  const [configs, setConfigs] = useState<SysConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<SysConfig | null>(null);
  const [formData, setFormData] = useState<SysConfig>({
    configName: '', configKey: '', configValue: '', configType: 'N', configScope: '1', remark: '',
  });

  // 分页状态
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(15);
  const [total, setTotal] = useState(0);
  const totalPages = Math.ceil(total / pageSize) || 1;

  useEffect(() => { fetchConfigs(); }, [currentPage]);

  const fetchConfigs = async () => {
    setLoading(true);
    try {
      const res: any = await getConfigList({
        configName: searchTerm || undefined,
        pageNum: currentPage,
        pageSize,
      });
      // 兼容分页和数组两种返回格式
      if (res?.records) {
        setConfigs(res.records);
        setTotal(res.total || 0);
      } else if (res?.rows) {
        setConfigs(res.rows);
        setTotal(res.total || 0);
      } else if (Array.isArray(res)) {
        setConfigs(res);
        setTotal(res.length);
      } else {
        setConfigs([]);
        setTotal(0);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setCurrentPage(1); // 搜索时重置到第一页
    fetchConfigs();
  };

  const handleOpenModal = (config?: SysConfig) => {
    if (config) {
      setEditingConfig(config);
      setFormData({ ...config });
    } else {
      setEditingConfig(null);
      setFormData({ configName: '', configKey: '', configValue: '', configType: 'N', configScope: '1', remark: '' });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.configName.trim()) { toast.error('请输入参数名称'); return; }
    if (!formData.configKey.trim()) { toast.error('请输入参数键名'); return; }
    if (!formData.configValue.trim()) { toast.error('请输入参数键值'); return; }
    try {
      if (editingConfig) {
        await updateConfig({ ...formData, configId: editingConfig.configId });
        toast.success('参数更新成功');
      } else {
        await addConfig(formData);
        toast.success('参数创建成功');
      }
      // 配置变更后清空前端缓存，确保其他组件读取到最新值
      clearConfigCache();
      setIsModalOpen(false);
      fetchConfigs();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (config: SysConfig) => {
    // 系统内置参数不允许删除
    if (config.configType === 'Y') {
      toast.error('系统内置参数不允许删除');
      return;
    }
    if (!window.confirm('确认删除该参数配置吗？')) return;
    try {
      await deleteConfig([config.configId!]);
      toast.success('参数删除成功');
      // 配置变更后清空前端缓存
      clearConfigCache();
      fetchConfigs();
    } catch (e) {
      console.error(e);
    }
  };

  // 生成页码按钮列表
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (currentPage > 3) pages.push('...');
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (currentPage < totalPages - 2) pages.push('...');
      pages.push(totalPages);
    }
    return pages;
  };

  const isEdit = !!editingConfig;

  return (
    <div className="p-6 h-full flex flex-col bg-slate-50">
      {/* 标题栏 */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-slate-800">参数配置</h1>
        <button onClick={() => handleOpenModal()} className="bg-pink-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-pink-600 transition-colors">
          <Plus size={18} /> 新增参数
        </button>
      </div>

      {/* 搜索栏 */}
      <div className="bg-white p-4 rounded-lg shadow-sm mb-6">
        <form onSubmit={handleSearch} className="flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input type="text" placeholder="搜索参数名称..." className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-pink-400 outline-none" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          </div>
          <button type="submit" className="bg-slate-800 text-white px-6 py-2 rounded-lg hover:bg-slate-900 transition-colors">搜索</button>
        </form>
      </div>

      {/* 表格 */}
      <div className="bg-white rounded-lg shadow-sm flex-1 overflow-hidden flex flex-col">
        <div className="overflow-x-auto flex-1">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">参数名称</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">参数键名</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">参数键值</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">类型</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">作用域</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">创建时间</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr><td colSpan={8} className="px-6 py-12 text-center text-slate-500"><Loader2 className="animate-spin inline mr-2" size={18} />加载中...</td></tr>
              ) : configs.length === 0 ? (
                <tr><td colSpan={8} className="px-6 py-12 text-center text-slate-500">暂无数据</td></tr>
              ) : configs.map(config => (
                <tr key={config.configId} className="hover:bg-slate-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{config.configId}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">{config.configName}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-700 font-mono">{config.configKey}</td>
                  <td className="px-6 py-4 text-sm text-slate-700 max-w-xs truncate" title={config.configValue}>{config.configValue}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${config.configType === 'Y' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                      {config.configType === 'Y' ? '内置' : '自定义'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${config.configScope === '0' ? 'bg-pink-50 text-pink-600' : 'bg-green-100 text-green-700'}`}>
                      {config.configScope === '0' ? '全局' : '租户'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{config.createTime || '-'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 flex gap-3">
                    <button onClick={() => handleOpenModal(config)} className="text-pink-500 hover:text-pink-700 flex items-center gap-1"><Edit size={16} /> 编辑</button>
                    {config.configType === 'Y' ? (
                      <span className="text-slate-300 flex items-center gap-1 cursor-not-allowed"><Lock size={16} /> 内置</span>
                    ) : (
                      <button onClick={() => handleDelete(config)} className="text-red-600 hover:text-red-900 flex items-center gap-1"><Trash2 size={16} /> 删除</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 分页栏 */}
        <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <span className="text-sm text-slate-500">
            共 {total} 条记录，第 {currentPage}/{totalPages} 页
          </span>
          <div className="flex items-center gap-1">
            {/* 上一页 */}
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="p-1.5 rounded-md text-slate-500 hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={18} />
            </button>

            {/* 页码按钮 */}
            {getPageNumbers().map((page, idx) =>
              typeof page === 'string' ? (
                <span key={`ellipsis-${idx}`} className="px-2 text-slate-400 text-sm">...</span>
              ) : (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={`min-w-[32px] h-8 rounded-md text-sm font-medium transition-colors ${
                    page === currentPage
                      ? 'bg-pink-500 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {page}
                </button>
              )
            )}

            {/* 下一页 */}
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="p-1.5 rounded-md text-slate-500 hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* 新增/编辑弹窗 */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setIsModalOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-slate-100 flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-800">{isEdit ? '编辑参数' : '新增参数'}</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">参数名称 <span className="text-red-500">*</span></label>
                <input className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-pink-400 outline-none" value={formData.configName} onChange={e => setFormData({ ...formData, configName: e.target.value })} placeholder="如: 用户初始密码" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">参数键名 <span className="text-red-500">*</span></label>
                <input className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-pink-400 outline-none font-mono" value={formData.configKey} onChange={e => setFormData({ ...formData, configKey: e.target.value })} placeholder="如: sys.user.initPassword" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">系统内置</label>
                  <div className="flex gap-4 pt-2">
                    {[['Y', '是'], ['N', '否']].map(([v, l]) => (
                      <label key={v} className="flex items-center gap-1.5 cursor-pointer">
                        <input type="radio" checked={formData.configType === v} onChange={() => setFormData({ ...formData, configType: v })} className="accent-pink-500" />
                        <span className="text-sm">{l}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">作用域</label>
                  <div className="flex gap-4 pt-2">
                    {[['0', '全局'], ['1', '租户']].map(([v, l]) => (
                      <label key={v} className="flex items-center gap-1.5 cursor-pointer">
                        <input type="radio" checked={formData.configScope === v} onChange={() => setFormData({ ...formData, configScope: v })} className="accent-pink-500" />
                        <span className="text-sm">{l}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">参数键值 <span className="text-red-500">*</span></label>
                <textarea className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-pink-400 outline-none resize-none font-mono" rows={3} value={formData.configValue} onChange={e => setFormData({ ...formData, configValue: e.target.value })} placeholder="参数值" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">备注</label>
                <textarea className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-pink-400 outline-none resize-none" rows={2} value={formData.remark || ''} onChange={e => setFormData({ ...formData, remark: e.target.value })} placeholder="备注信息" />
              </div>
            </form>
            <div className="p-5 border-t border-slate-100 flex justify-end gap-3">
              <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">取消</button>
              <button type="button" onClick={e => handleSubmit(e as any)} className="px-4 py-2 text-sm bg-pink-500 text-white rounded-lg hover:bg-pink-600 transition-colors shadow-sm">{isEdit ? '保存修改' : '立即创建'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
