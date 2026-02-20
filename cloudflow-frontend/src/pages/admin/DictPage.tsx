import React, { useState, useEffect } from 'react';
import { BookOpen, Plus, Pencil, Trash2, Search, RotateCcw, Tag, X } from 'lucide-react';
import { dictTypeApi, dictDataApi, SysDictType, SysDictData } from '../../services/api/dict';
import { toast } from 'sonner';

/** 字典管理页面 */
export const DictPage: React.FC = () => {
  // 字典类型状态
  const [dictTypes, setDictTypes] = useState<SysDictType[]>([]);
  const [selectedType, setSelectedType] = useState<SysDictType | null>(null);
  const [typeLoading, setTypeLoading] = useState(false);

  // 字典数据状态
  const [dictDataList, setDictDataList] = useState<SysDictData[]>([]);
  const [dataLoading, setDataLoading] = useState(false);

  // 弹窗状态
  const [typeModalOpen, setTypeModalOpen] = useState(false);
  const [dataModalOpen, setDataModalOpen] = useState(false);
  const [editingType, setEditingType] = useState<SysDictType | null>(null);
  const [editingData, setEditingData] = useState<SysDictData | null>(null);

  // 表单状态
  const [typeForm, setTypeForm] = useState({ dictName: '', dictType: '', status: '0', remark: '' });
  const [dataForm, setDataForm] = useState({ dictLabel: '', dictValue: '', dictSort: 0, listClass: '', isDefault: 'N', status: '0', remark: '' });

  // 搜索
  const [typeKeyword, setTypeKeyword] = useState('');

  useEffect(() => { loadDictTypes(); }, []);
  useEffect(() => { if (selectedType) loadDictData(selectedType.dictType); }, [selectedType]);

  /** 加载字典类型列表 */
  const loadDictTypes = async () => {
    setTypeLoading(true);
    try {
      const res = await dictTypeApi.list();
      setDictTypes(Array.isArray(res) ? res : []);
    } catch { toast.error('获取字典类型失败'); } finally { setTypeLoading(false); }
  };

  /** 加载字典数据列表 */
  const loadDictData = async (dictType: string) => {
    setDataLoading(true);
    try {
      const res = await dictDataApi.list(dictType);
      setDictDataList(Array.isArray(res) ? res : []);
    } catch { toast.error('获取字典数据失败'); } finally { setDataLoading(false); }
  };

  // ========== 字典类型操作 ==========
  const handleAddType = () => {
    setEditingType(null);
    setTypeForm({ dictName: '', dictType: '', status: '0', remark: '' });
    setTypeModalOpen(true);
  };

  const handleEditType = (item: SysDictType) => {
    setEditingType(item);
    setTypeForm({ dictName: item.dictName, dictType: item.dictType, status: item.status || '0', remark: item.remark || '' });
    setTypeModalOpen(true);
  };

  const handleSaveType = async () => {
    if (!typeForm.dictName || !typeForm.dictType) { toast.error('请填写字典名称和类型标识'); return; }
    try {
      if (editingType) {
        await dictTypeApi.edit({ ...editingType, ...typeForm });
        toast.success('修改成功');
      } else {
        await dictTypeApi.add(typeForm as SysDictType);
        toast.success('新增成功');
      }
      setTypeModalOpen(false);
      loadDictTypes();
    } catch { toast.error('保存失败'); }
  };

  const handleDeleteType = async (item: SysDictType) => {
    if (!confirm(`确认删除字典类型"${item.dictName}"？将同时删除关联的字典数据。`)) return;
    try {
      await dictTypeApi.remove([item.dictId!]);
      toast.success('删除成功');
      if (selectedType?.dictId === item.dictId) { setSelectedType(null); setDictDataList([]); }
      loadDictTypes();
    } catch { toast.error('删除失败'); }
  };

  // ========== 字典数据操作 ==========
  const handleAddData = () => {
    if (!selectedType) { toast.error('请先选择字典类型'); return; }
    setEditingData(null);
    setDataForm({ dictLabel: '', dictValue: '', dictSort: 0, listClass: '', isDefault: 'N', status: '0', remark: '' });
    setDataModalOpen(true);
  };

  const handleEditData = (item: SysDictData) => {
    setEditingData(item);
    setDataForm({
      dictLabel: item.dictLabel, dictValue: item.dictValue, dictSort: item.dictSort || 0,
      listClass: item.listClass || '', isDefault: item.isDefault || 'N', status: item.status || '0', remark: item.remark || '',
    });
    setDataModalOpen(true);
  };

  const handleSaveData = async () => {
    if (!dataForm.dictLabel || !dataForm.dictValue) { toast.error('请填写标签和键值'); return; }
    try {
      if (editingData) {
        await dictDataApi.edit({ ...editingData, ...dataForm });
        toast.success('修改成功');
      } else {
        await dictDataApi.add({ ...dataForm, dictType: selectedType!.dictType } as SysDictData);
        toast.success('新增成功');
      }
      setDataModalOpen(false);
      loadDictData(selectedType!.dictType);
    } catch { toast.error('保存失败'); }
  };

  const handleDeleteData = async (item: SysDictData) => {
    if (!confirm(`确认删除字典数据"${item.dictLabel}"？`)) return;
    try {
      await dictDataApi.remove([item.dictCode!]);
      toast.success('删除成功');
      loadDictData(selectedType!.dictType);
    } catch { toast.error('删除失败'); }
  };

  // 过滤字典类型
  const filteredTypes = dictTypes.filter(t =>
    !typeKeyword || t.dictName.includes(typeKeyword) || t.dictType.includes(typeKeyword)
  );

  // 样式标签颜色映射
  const listClassColors: Record<string, string> = {
    default: 'bg-slate-100 text-slate-700',
    primary: 'bg-indigo-100 text-indigo-700',
    success: 'bg-green-100 text-green-700',
    warning: 'bg-amber-100 text-amber-700',
    danger: 'bg-red-100 text-red-700',
    info: 'bg-sky-100 text-sky-700',
  };

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <BookOpen className="text-indigo-600" /> 字典管理
        </h2>
      </div>

      <div className="flex gap-6">
        {/* 左侧：字典类型列表 */}
        <div className="w-80 bg-white rounded-xl shadow-sm border border-slate-200 shrink-0 self-start">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700">字典类型</h3>
            <button onClick={handleAddType} className="bg-indigo-600 text-white p-1.5 rounded-lg hover:bg-indigo-700" title="新增字典类型">
              <Plus size={14} />
            </button>
          </div>
          {/* 搜索 */}
          <div className="p-3 border-b border-slate-100">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text" placeholder="搜索字典类型..." value={typeKeyword}
                onChange={e => setTypeKeyword(e.target.value)}
                className="w-full border border-slate-300 rounded-lg pl-9 pr-3 py-1.5 text-sm"
              />
            </div>
          </div>
          {/* 类型列表 */}
          <div className="max-h-[600px] overflow-y-auto">
            {typeLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600"></div>
              </div>
            ) : filteredTypes.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-sm">暂无字典类型</div>
            ) : (
              filteredTypes.map(item => (
                <div
                  key={item.dictId}
                  onClick={() => setSelectedType(item)}
                  className={`px-4 py-3 border-b border-slate-50 cursor-pointer transition-colors group ${
                    selectedType?.dictId === item.dictId ? 'bg-indigo-50 border-l-2 border-l-indigo-600' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-slate-800 truncate">{item.dictName}</div>
                      <div className="text-xs text-slate-500 mt-0.5 font-mono">{item.dictType}</div>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-2">
                      <button onClick={e => { e.stopPropagation(); handleEditType(item); }} className="p-1 text-slate-400 hover:text-indigo-600" title="编辑">
                        <Pencil size={13} />
                      </button>
                      <button onClick={e => { e.stopPropagation(); handleDeleteType(item); }} className="p-1 text-slate-400 hover:text-red-600" title="删除">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 右侧：字典数据列表 */}
        <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden self-start">
          <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-700">
                {selectedType ? `${selectedType.dictName} 的字典数据` : '请选择左侧字典类型'}
              </h3>
              {selectedType && <span className="text-xs text-slate-500 font-mono">{selectedType.dictType}</span>}
            </div>
            {selectedType && (
              <button onClick={handleAddData} className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg flex items-center gap-1.5 hover:bg-indigo-700 text-sm">
                <Plus size={14} /> 新增数据
              </button>
            )}
          </div>

          {!selectedType ? (
            <div className="text-center py-20 text-slate-400">
              <Tag size={48} className="mx-auto mb-3 opacity-20" />
              <p className="text-sm">请在左侧选择一个字典类型</p>
            </div>
          ) : dataLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            </div>
          ) : dictDataList.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <Tag size={40} className="mx-auto mb-2 opacity-20" />
              <p className="text-sm">暂无字典数据</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 text-left">
                  <th className="px-4 py-3 text-xs font-semibold text-slate-600">排序</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-600">标签</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-600">键值</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-600">样式</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-600">状态</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-600">备注</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-600 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {dictDataList.map(item => (
                  <tr key={item.dictCode} className="border-t border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-sm text-slate-600">{item.dictSort}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${listClassColors[item.listClass || 'default'] || listClassColors.default}`}>
                        {item.dictLabel}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700 font-mono">{item.dictValue}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{item.listClass || '-'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded ${item.status === '0' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {item.status === '0' ? '正常' : '停用'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 max-w-[120px] truncate">{item.remark || '-'}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => handleEditData(item)} className="text-indigo-600 hover:text-indigo-800 text-sm mr-3">编辑</button>
                      <button onClick={() => handleDeleteData(item)} className="text-red-500 hover:text-red-700 text-sm">删除</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* 字典类型弹窗 */}
      {typeModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setTypeModalOpen(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-200">
              <h3 className="text-lg font-semibold text-slate-800">{editingType ? '编辑字典类型' : '新增字典类型'}</h3>
              <button onClick={() => setTypeModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">字典名称 <span className="text-red-500">*</span></label>
                <input type="text" value={typeForm.dictName} onChange={e => setTypeForm({ ...typeForm, dictName: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" placeholder="如：用户性别" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">类型标识 <span className="text-red-500">*</span></label>
                <input type="text" value={typeForm.dictType} onChange={e => setTypeForm({ ...typeForm, dictType: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono" placeholder="如：sys_user_sex" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">状态</label>
                <select value={typeForm.status} onChange={e => setTypeForm({ ...typeForm, status: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm">
                  <option value="0">正常</option>
                  <option value="1">停用</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">备注</label>
                <input type="text" value={typeForm.remark} onChange={e => setTypeForm({ ...typeForm, remark: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" placeholder="备注说明" />
              </div>
            </div>
            <div className="p-5 border-t border-slate-200 flex justify-end gap-3">
              <button onClick={() => setTypeModalOpen(false)} className="px-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-700 hover:bg-slate-50">取消</button>
              <button onClick={handleSaveType} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700">确定</button>
            </div>
          </div>
        </div>
      )}

      {/* 字典数据弹窗 */}
      {dataModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setDataModalOpen(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-200">
              <h3 className="text-lg font-semibold text-slate-800">{editingData ? '编辑字典数据' : '新增字典数据'}</h3>
              <button onClick={() => setDataModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">数据标签 <span className="text-red-500">*</span></label>
                <input type="text" value={dataForm.dictLabel} onChange={e => setDataForm({ ...dataForm, dictLabel: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" placeholder="如：男" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">数据键值 <span className="text-red-500">*</span></label>
                <input type="text" value={dataForm.dictValue} onChange={e => setDataForm({ ...dataForm, dictValue: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono" placeholder="如：0" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">排序号</label>
                  <input type="number" value={dataForm.dictSort} onChange={e => setDataForm({ ...dataForm, dictSort: Number(e.target.value) })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">样式</label>
                  <select value={dataForm.listClass} onChange={e => setDataForm({ ...dataForm, listClass: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm">
                    <option value="">默认</option>
                    <option value="primary">主要</option>
                    <option value="success">成功</option>
                    <option value="warning">警告</option>
                    <option value="danger">危险</option>
                    <option value="info">信息</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">状态</label>
                  <select value={dataForm.status} onChange={e => setDataForm({ ...dataForm, status: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm">
                    <option value="0">正常</option>
                    <option value="1">停用</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">是否默认</label>
                  <select value={dataForm.isDefault} onChange={e => setDataForm({ ...dataForm, isDefault: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm">
                    <option value="N">否</option>
                    <option value="Y">是</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">备注</label>
                <input type="text" value={dataForm.remark} onChange={e => setDataForm({ ...dataForm, remark: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" placeholder="备注说明" />
              </div>
            </div>
            <div className="p-5 border-t border-slate-200 flex justify-end gap-3">
              <button onClick={() => setDataModalOpen(false)} className="px-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-700 hover:bg-slate-50">取消</button>
              <button onClick={handleSaveData} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700">确定</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DictPage;
