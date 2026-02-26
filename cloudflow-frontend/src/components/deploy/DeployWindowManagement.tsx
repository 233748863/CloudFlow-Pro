import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Power, PowerOff, Clock, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../ui/select';
import {
  DeployWindow,
  listDeployWindows,
  saveDeployWindow,
  updateDeployWindow,
  deleteDeployWindow,
  toggleDeployWindow,
} from '@/services/api/deployEnhancement';

const WINDOW_TYPES = [
  { value: 'DAILY', label: '每日' },
  { value: 'WEEKLY', label: '每周' },
  { value: 'MONTHLY', label: '每月' },
  { value: 'CUSTOM', label: '自定义' },
];

const WEEK_DAYS = [
  { value: '1', label: '周一' },
  { value: '2', label: '周二' },
  { value: '3', label: '周三' },
  { value: '4', label: '周四' },
  { value: '5', label: '周五' },
  { value: '6', label: '周六' },
  { value: '7', label: '周日' },
];

export const DeployWindowManagement: React.FC = () => {
  const [windows, setWindows] = useState<DeployWindow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingWindow, setEditingWindow] = useState<DeployWindow | null>(null);
  const [formData, setFormData] = useState<Partial<DeployWindow>>({
    windowName: '',
    windowType: 'DAILY',
    startTime: '09:00',
    endTime: '18:00',
    weekDays: '',
    monthDays: '',
    customDates: '',
    isEnabled: true,
    description: '',
  });

  useEffect(() => {
    loadWindows();
  }, []);

  const loadWindows = async () => {
    try {
      setLoading(true);
      const data = await listDeployWindows();
      setWindows(Array.isArray(data) ? data : []);
    } catch (error) {
      toast.error('加载发布窗口失败');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      if (!formData.windowName || !formData.startTime || !formData.endTime) {
        toast.error('请填写必填字段');
        return;
      }

      if (editingWindow) {
        await updateDeployWindow({ ...formData, id: editingWindow.id } as DeployWindow);
        toast.success('更新成功');
      } else {
        await saveDeployWindow(formData as DeployWindow);
        toast.success('创建成功');
      }

      setShowModal(false);
      setEditingWindow(null);
      setFormData({
        windowName: '',
        windowType: 'DAILY',
        startTime: '09:00',
        endTime: '18:00',
        weekDays: '',
        monthDays: '',
        customDates: '',
        isEnabled: true,
        description: '',
      });
      loadWindows();
    } catch (error) {
      toast.error('保存失败');
      console.error(error);
    }
  };

  const handleEdit = (window: DeployWindow) => {
    setEditingWindow(window);
    setFormData(window);
    setShowModal(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确定要删除此发布窗口吗？')) return;

    try {
      await deleteDeployWindow(id);
      toast.success('删除成功');
      loadWindows();
    } catch (error) {
      toast.error('删除失败');
      console.error(error);
    }
  };

  const handleToggle = async (id: number, enabled: boolean) => {
    try {
      await toggleDeployWindow(id, !enabled);
      toast.success(enabled ? '已禁用' : '已启用');
      loadWindows();
    } catch (error) {
      toast.error('操作失败');
      console.error(error);
    }
  };

  const getWindowTypeLabel = (type: string) => {
    return WINDOW_TYPES.find(t => t.value === type)?.label || type;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 头部操作栏 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">发布窗口管理</h2>
          <p className="text-sm text-gray-500 mt-1">配置允许发布的时间窗口</p>
        </div>
        <button
          onClick={() => {
            setEditingWindow(null);
            setFormData({
              windowName: '',
              windowType: 'DAILY',
              startTime: '09:00',
              endTime: '18:00',
              weekDays: '',
              monthDays: '',
              customDates: '',
              isEnabled: true,
              description: '',
            });
            setShowModal(true);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-pink-500 text-white rounded-lg hover:bg-pink-600 transition-colors"
        >
          <Plus className="w-4 h-4" />
          新建窗口
        </button>
      </div>

      {/* 窗口列表 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {windows.length === 0 ? (
          <div className="col-span-full text-center py-12 text-gray-400">
            <Clock className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>暂无发布窗口配置</p>
          </div>
        ) : (
          windows.map(window => (
            <div
              key={window.id}
              className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                    {window.windowName}
                    {window.isEnabled ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">
                        启用
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
                        禁用
                      </span>
                    )}
                  </h3>
                  <p className="text-sm text-gray-500 mt-1">
                    {getWindowTypeLabel(window.windowType)}
                  </p>
                </div>
              </div>

              <div className="space-y-2 mb-4">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Clock className="w-4 h-4" />
                  <span>{window.startTime} - {window.endTime}</span>
                </div>
                {window.windowType === 'WEEKLY' && window.weekDays && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Calendar className="w-4 h-4" />
                    <span>
                      {window.weekDays.split(',').map(d => 
                        WEEK_DAYS.find(wd => wd.value === d)?.label
                      ).join(', ')}
                    </span>
                  </div>
                )}
                {window.description && (
                  <p className="text-sm text-gray-500">{window.description}</p>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleEdit(window)}
                  className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 text-sm text-pink-500 bg-pink-50 rounded hover:bg-pink-50 transition-colors"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  编辑
                </button>
                <button
                  onClick={() => handleToggle(window.id!, window.isEnabled)}
                  className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 text-sm text-gray-600 bg-gray-50 rounded hover:bg-gray-100 transition-colors"
                >
                  {window.isEnabled ? (
                    <>
                      <PowerOff className="w-3.5 h-3.5" />
                      禁用
                    </>
                  ) : (
                    <>
                      <Power className="w-3.5 h-3.5" />
                      启用
                    </>
                  )}
                </button>
                <button
                  onClick={() => handleDelete(window.id!)}
                  className="px-3 py-1.5 text-sm text-red-600 bg-red-50 rounded hover:bg-red-100 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* 创建/编辑模态框 */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">
                {editingWindow ? '编辑发布窗口' : '新建发布窗口'}
              </h3>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    窗口名称 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.windowName}
                    onChange={e => setFormData({ ...formData, windowName: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-400 focus:border-transparent"
                    placeholder="例如：工作日发布窗口"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    窗口类型 <span className="text-red-500">*</span>
                  </label>
                  <Select value={formData.windowType} onValueChange={v => setFormData({...formData, windowType: v as 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'CUSTOM'})}>
                    <SelectTrigger>
                      <SelectValue placeholder="请选择" />
                    </SelectTrigger>
                    <SelectContent>
                      {WINDOW_TYPES.map(type => (
                        <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      开始时间 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="time"
                      value={formData.startTime}
                      onChange={e => setFormData({ ...formData, startTime: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-400 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      结束时间 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="time"
                      value={formData.endTime}
                      onChange={e => setFormData({ ...formData, endTime: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-400 focus:border-transparent"
                    />
                  </div>
                </div>

                {formData.windowType === 'WEEKLY' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      选择星期
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {WEEK_DAYS.map(day => {
                        const selected = formData.weekDays?.split(',').includes(day.value);
                        return (
                          <button
                            key={day.value}
                            type="button"
                            onClick={() => {
                              const days = formData.weekDays?.split(',').filter(d => d) || [];
                              if (selected) {
                                setFormData({
                                  ...formData,
                                  weekDays: days.filter(d => d !== day.value).join(','),
                                });
                              } else {
                                setFormData({
                                  ...formData,
                                  weekDays: [...days, day.value].join(','),
                                });
                              }
                            }}
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                              selected
                                ? 'bg-pink-500 text-white'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                          >
                            {day.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    描述
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-400 focus:border-transparent"
                    placeholder="窗口说明..."
                  />
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="isEnabled"
                    checked={formData.isEnabled}
                    onChange={e => setFormData({ ...formData, isEnabled: e.target.checked })}
                    className="w-4 h-4 text-pink-500 border-gray-300 rounded focus:ring-pink-400"
                  />
                  <label htmlFor="isEnabled" className="text-sm text-gray-700">
                    启用此窗口
                  </label>
                </div>
              </div>

              <div className="flex items-center gap-3 mt-6 pt-4 border-t">
                <button
                  onClick={() => {
                    setShowModal(false);
                    setEditingWindow(null);
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleSave}
                  className="flex-1 px-4 py-2 bg-pink-500 text-white rounded-lg hover:bg-pink-600 transition-colors"
                >
                  {editingWindow ? '更新' : '创建'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
