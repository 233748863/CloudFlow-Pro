import React, { useState, useEffect } from 'react';
import { BookOpen, Plus, Pencil, Trash2, Search, Tag } from 'lucide-react';
import { dictTypeApi, dictDataApi, SysDictType, SysDictData } from '../../services/api/dict';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';
import { Card } from '../../components/ui/card';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select';

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
    primary: 'bg-pink-100 text-pink-700',
    success: 'bg-green-100 text-green-700',
    warning: 'bg-amber-100 text-amber-700',
    danger: 'bg-red-100 text-red-700',
    info: 'bg-sky-100 text-sky-700',
  };

  return (
    <div className="p-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <BookOpen className="w-6 h-6 text-pink-600" />
          <h1 className="text-xl font-semibold text-gray-800">字典管理</h1>
        </div>
      </div>

      <div className="flex gap-6">
        {/* 左侧：字典类型列表 */}
        <Card className="w-80 shrink-0 self-start overflow-hidden">
          {/* 头部：标题 + 新增按钮 */}
          <div className="p-4 border-b border-slate-200 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700">字典类型</h3>
            <Button size="icon" className="w-7 h-7" onClick={handleAddType} title="新增字典类型">
              <Plus size={14} />
            </Button>
          </div>

          {/* 搜索框 */}
          <div className="p-3 border-b border-slate-100">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                type="text"
                placeholder="搜索字典类型..."
                value={typeKeyword}
                onChange={e => setTypeKeyword(e.target.value)}
                className="pl-9 py-1.5 text-sm"
              />
            </div>
          </div>

          {/* 类型列表 */}
          <div className="max-h-[600px] overflow-y-auto">
            {typeLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-pink-500"></div>
              </div>
            ) : filteredTypes.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-sm">暂无字典类型</div>
            ) : (
              filteredTypes.map(item => (
                <div
                  key={item.dictId}
                  onClick={() => setSelectedType(item)}
                  className={`px-4 py-3 border-b border-slate-50 cursor-pointer transition-colors group ${
                    selectedType?.dictId === item.dictId ? 'bg-pink-50 border-l-2 border-l-pink-500' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-slate-800 truncate">{item.dictName}</div>
                      <div className="text-xs text-slate-500 mt-0.5 font-mono">{item.dictType}</div>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="w-7 h-7 text-slate-400 hover:text-pink-600"
                        onClick={e => { e.stopPropagation(); handleEditType(item); }}
                        title="编辑"
                      >
                        <Pencil size={13} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="w-7 h-7 text-slate-400 hover:text-red-600 hover:bg-red-50"
                        onClick={e => { e.stopPropagation(); handleDeleteType(item); }}
                        title="删除"
                      >
                        <Trash2 size={13} />
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        {/* 右侧：字典数据列表 */}
        <Card className="flex-1 overflow-hidden self-start">
          {/* 头部 */}
          <div className="p-4 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-700">
                {selectedType ? `${selectedType.dictName} 的字典数据` : '请选择左侧字典类型'}
              </h3>
              {selectedType && <span className="text-xs text-slate-500 font-mono">{selectedType.dictType}</span>}
            </div>
            {selectedType && (
              <Button size="sm" onClick={handleAddData} className="flex items-center gap-1.5">
                <Plus size={14} /> 新增数据
              </Button>
            )}
          </div>

          {/* 数据内容区 */}
          {!selectedType ? (
            <div className="text-center py-20 text-slate-400">
              <Tag size={48} className="mx-auto mb-3 opacity-20" />
              <p className="text-sm">请在左侧选择一个字典类型</p>
            </div>
          ) : dataLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-500"></div>
            </div>
          ) : dictDataList.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <Tag size={40} className="mx-auto mb-2 opacity-20" />
              <p className="text-sm">暂无字典数据</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50/80 text-left">
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
                  <tr key={item.dictCode} className="border-t border-slate-100 hover:bg-slate-50/80 transition-colors">
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
                      <Button variant="ghost" size="sm" className="text-pink-600 hover:text-pink-800 mr-1" onClick={() => handleEditData(item)}>
                        编辑
                      </Button>
                      <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700" onClick={() => handleDeleteData(item)}>
                        删除
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      {/* ========== 字典类型弹窗 ========== */}
      <Dialog open={typeModalOpen} onOpenChange={setTypeModalOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>{editingType ? '编辑字典类型' : '新增字典类型'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* 字典名称 */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">字典名称 <span className="text-red-500">*</span></label>
              <Input
                value={typeForm.dictName}
                onChange={e => setTypeForm({ ...typeForm, dictName: e.target.value })}
                placeholder="如：用户性别"
              />
            </div>
            {/* 类型标识 */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">类型标识 <span className="text-red-500">*</span></label>
              <Input
                className="font-mono"
                value={typeForm.dictType}
                onChange={e => setTypeForm({ ...typeForm, dictType: e.target.value })}
                placeholder="如：sys_user_sex"
              />
            </div>
            {/* 状态 */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">状态</label>
              <Select value={typeForm.status} onValueChange={v => setTypeForm({ ...typeForm, status: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="请选择状态" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">正常</SelectItem>
                  <SelectItem value="1">停用</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {/* 备注 */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">备注</label>
              <Input
                value={typeForm.remark}
                onChange={e => setTypeForm({ ...typeForm, remark: e.target.value })}
                placeholder="备注说明"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTypeModalOpen(false)}>取消</Button>
            <Button onClick={handleSaveType}>确定</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========== 字典数据弹窗 ========== */}
      <Dialog open={dataModalOpen} onOpenChange={setDataModalOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>{editingData ? '编辑字典数据' : '新增字典数据'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* 数据标签 */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">数据标签 <span className="text-red-500">*</span></label>
              <Input
                value={dataForm.dictLabel}
                onChange={e => setDataForm({ ...dataForm, dictLabel: e.target.value })}
                placeholder="如：男"
              />
            </div>
            {/* 数据键值 */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">数据键值 <span className="text-red-500">*</span></label>
              <Input
                className="font-mono"
                value={dataForm.dictValue}
                onChange={e => setDataForm({ ...dataForm, dictValue: e.target.value })}
                placeholder="如：0"
              />
            </div>
            {/* 排序号 + 样式 */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">排序号</label>
                <Input
                  type="number"
                  value={dataForm.dictSort}
                  onChange={e => setDataForm({ ...dataForm, dictSort: Number(e.target.value) })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">样式</label>
                <Select value={dataForm.listClass} onValueChange={v => setDataForm({ ...dataForm, listClass: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="默认" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">默认</SelectItem>
                    <SelectItem value="primary">主要</SelectItem>
                    <SelectItem value="success">成功</SelectItem>
                    <SelectItem value="warning">警告</SelectItem>
                    <SelectItem value="danger">危险</SelectItem>
                    <SelectItem value="info">信息</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {/* 状态 + 是否默认 */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">状态</label>
                <Select value={dataForm.status} onValueChange={v => setDataForm({ ...dataForm, status: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="请选择状态" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">正常</SelectItem>
                    <SelectItem value="1">停用</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">是否默认</label>
                <Select value={dataForm.isDefault} onValueChange={v => setDataForm({ ...dataForm, isDefault: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="请选择" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="N">否</SelectItem>
                    <SelectItem value="Y">是</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {/* 备注 */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">备注</label>
              <Input
                value={dataForm.remark}
                onChange={e => setDataForm({ ...dataForm, remark: e.target.value })}
                placeholder="备注说明"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDataModalOpen(false)}>取消</Button>
            <Button onClick={handleSaveData}>确定</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DictPage;
