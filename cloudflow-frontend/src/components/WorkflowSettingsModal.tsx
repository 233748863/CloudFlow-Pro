import React, { useState, useEffect } from 'react';
import { X, Settings, FileText, Tag, FolderOpen, Shield, Users } from 'lucide-react';
import { Input } from './ui/input';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from './ui/select';
import { getDeptTree } from '../services/api/auth';
import { FormDefinition } from '../types';
import { SysRole, SysUser, SysDept } from '../services/api/auth';
import { toast } from 'sonner';
import { WORKFLOW_CATEGORY_OPTIONS, normalizeWorkflowCategory } from '../utils/workflowCategory';

const SELECT_NONE_VALUE = '__NONE__';

// 流程分类选项
const COMMON_TAGS = [
  '审批', '请假', '报销', '采购', '合同',
  '入职', '离职', '培训', '考勤', '绩效',
  '项目', '任务', '变更', '发布', '维护',
];

interface WorkflowSettingsModalProps {
  open: boolean;
  onClose: () => void;
  workflowName: string;
  workflowKey: string;
  description: string;
  category: string;
  tags: string[];
  formId: string;
  startPermissionType: string;
  startPermissionValue: string;
  availableForms?: FormDefinition[];
  availableRoles?: SysRole[];
  availableUsers?: SysUser[];
  onSave: (settings: {
    description: string;
    category: string;
    tags: string[];
    formId: string;
    startPermissionType: string;
    startPermissionValue: string;
  }) => void;
}

export const WorkflowSettingsModal: React.FC<WorkflowSettingsModalProps> = ({
  open,
  onClose,
  workflowName,
  workflowKey,
  description: initialDescription,
  category: initialCategory,
  tags: initialTags,
  formId: initialFormId,
  startPermissionType: initialStartPermissionType,
  startPermissionValue: initialStartPermissionValue,
  availableForms = [],
  availableRoles = [],
  availableUsers = [],
  onSave,
}) => {
  const [description, setDescription] = useState(initialDescription);
  const [category, setCategory] = useState(normalizeWorkflowCategory(initialCategory));
  const [tags, setTags] = useState<string[]>(initialTags);
  const [formId, setFormId] = useState(initialFormId);
  const [tagInput, setTagInput] = useState('');
  
  // P2: 启动权限配置状态
  const [startPermissionType, setStartPermissionType] = useState(initialStartPermissionType || 'ALL');
  const [startPermissionValue, setStartPermissionValue] = useState(initialStartPermissionValue || '');
  const [formList, setFormList] = useState<Array<{ id: string; name: string }>>([]);
  const [roleList, setRoleList] = useState<SysRole[]>([]);
  const [userList, setUserList] = useState<SysUser[]>([]);
  const [deptList, setDeptList] = useState<SysDept[]>([]);
  const [loadingPermissions, setLoadingPermissions] = useState(false);
  const loadingForms = false;

  // 同步外部状态变化
  useEffect(() => {
    setDescription(initialDescription);
    setCategory(normalizeWorkflowCategory(initialCategory));
    setTags(initialTags);
    setFormId(initialFormId);
    setStartPermissionType(initialStartPermissionType || 'ALL');
    setStartPermissionValue(initialStartPermissionValue || '');
  }, [
    initialDescription,
    initialCategory,
    initialTags,
    initialFormId,
    initialStartPermissionType,
    initialStartPermissionValue,
  ]);

  useEffect(() => {
    setFormList(
      availableForms.map((form) => ({
        id: String(form.id),
        name: String(form.name),
      })),
    );
  }, [availableForms]);

  useEffect(() => {
    setRoleList(Array.isArray(availableRoles) ? availableRoles : []);
  }, [availableRoles]);

  useEffect(() => {
    setUserList(Array.isArray(availableUsers) ? availableUsers : []);
  }, [availableUsers]);

  // 仅在打开且选择“指定部门”时拉取部门树，避免每次弹窗都重复请求。
  useEffect(() => {
    if (!open || startPermissionType !== 'DEPT' || deptList.length > 0) {
      return;
    }
    let cancelled = false;
    const loadDeptList = async () => {
      try {
        setLoadingPermissions(true);
        const depts = await getDeptTree();
        if (!cancelled) {
          setDeptList(Array.isArray(depts) ? depts : []);
        }
      } catch (error) {
        console.error('加载部门列表失败:', error);
        if (!cancelled) {
          toast.error('加载部门列表失败');
        }
      } finally {
        if (!cancelled) {
          setLoadingPermissions(false);
        }
      }
    };
    void loadDeptList();
    return () => {
      cancelled = true;
    };
  }, [open, startPermissionType, deptList.length]);

  const handleAddTag = (tag: string) => {
    const trimmedTag = tag.trim();
    if (trimmedTag && !tags.includes(trimmedTag)) {
      setTags([...tags, trimmedTag]);
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter(t => t !== tagToRemove));
  };

  const handleSave = () => {
    onSave({
      description,
      category,
      tags,
      formId,
      startPermissionType,
      startPermissionValue,
    });
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/32 p-4">
      <div className="flex max-h-[85vh] w-[600px] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
        {/* 标题栏 */}
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-200 bg-cyan-50">
              <Settings size={20} className="text-cyan-700" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">流程设置</h2>
              <p className="text-xs text-slate-400 mt-0.5">配置流程的基本信息和属性</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white p-2 text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-700"
          >
            <X size={18} />
          </button>
        </div>

        {/* 内容区域 */}
        <div className="p-6 flex-1 overflow-y-auto space-y-5">
          {/* 基本信息（只读） */}
          <div className="space-y-3">
            <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <FileText size={14} />
              基本信息
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-xs text-slate-400 mb-1 block">流程名称</span>
                <Input
                  value={workflowName}
                  disabled
                  className="bg-slate-50 text-slate-500"
                />
              </div>
              <div>
                <span className="text-xs text-slate-400 mb-1 block">流程Key</span>
                <Input
                  value={workflowKey}
                  disabled
                  className="bg-slate-50 text-slate-500"
                />
              </div>
            </div>
          </div>

          {/* 流程描述 */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700">流程描述</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="请输入流程的详细描述，帮助用户了解此流程的用途和使用场景..."
               className="min-h-[100px] w-full resize-none rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-200"
            />
            <p className="text-xs text-slate-400">
              💡 建议包含：流程用途、适用场景、注意事项等
            </p>
          </div>

          {/* 流程分类 */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <FolderOpen size={14} />
              流程分类
            </label>
            <Select
              value={category || SELECT_NONE_VALUE}
              onValueChange={(value) => setCategory(value === SELECT_NONE_VALUE ? '' : value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="请选择流程分类" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SELECT_NONE_VALUE}>未分类</SelectItem>
                {WORKFLOW_CATEGORY_OPTIONS.map((cat) => (
                  <SelectItem key={cat.value} value={cat.value}>
                    {cat.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-slate-400">
              💡 选择合适的分类，便于流程管理和检索
            </p>
          </div>

          {/* 流程标签 */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <Tag size={14} />
              流程标签
            </label>
            
            {/* 已添加的标签 */}
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-2 p-3 bg-slate-50 rounded-lg border border-slate-100">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-medium text-cyan-700"
                  >
                    {tag}
                    <button
                      onClick={() => handleRemoveTag(tag)}
                      className="ml-1 hover:text-cyan-800"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* 标签输入 */}
            <div className="flex gap-2">
              <Input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddTag(tagInput);
                  }
                }}
                placeholder="输入标签后按回车添加"
                className="flex-1"
              />
              <button
                onClick={() => handleAddTag(tagInput)}
                disabled={!tagInput.trim()}
                className="rounded-xl bg-cyan-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                添加
              </button>
            </div>

            {/* 常用标签快捷选择 */}
            <div className="space-y-2">
              <p className="text-xs text-slate-400">常用标签：</p>
              <div className="flex flex-wrap gap-2">
                {COMMON_TAGS.filter(t => !tags.includes(t)).slice(0, 10).map((tag) => (
                  <button
                    key={tag}
                    onClick={() => handleAddTag(tag)}
                    className="px-2 py-1 bg-slate-100 text-slate-600 rounded text-xs hover:bg-slate-200 transition-colors"
                  >
                    + {tag}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 关联表单 */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700">关联表单</label>
            {loadingForms ? (
              <div className="w-full border border-slate-200 rounded-lg p-3 text-sm text-slate-400 bg-slate-50">
                加载表单列表中...
              </div>
            ) : (
              <Select
                value={formId || SELECT_NONE_VALUE}
                onValueChange={(value) => setFormId(value === SELECT_NONE_VALUE ? '' : value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择关联的表单（可选）" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SELECT_NONE_VALUE}>无</SelectItem>
                  {formList.map((form) => (
                    <SelectItem key={form.id} value={form.id}>
                      {form.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <p className="text-xs text-slate-400">
              💡 关联表单后，流程启动时将使用该表单收集数据
            </p>
          </div>

          {/* P2: 启动权限配置 */}
          <div className="space-y-3 pt-3 border-t border-slate-200">
            <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <Shield size={14} />
              启动权限配置
            </label>
            
            {/* 权限类型选择 */}
            <div className="space-y-2">
              <span className="text-xs text-slate-500">谁可以启动此流程？</span>
              <Select value={startPermissionType} onValueChange={(value) => {
                setStartPermissionType(value);
                setStartPermissionValue(''); // 切换类型时清空值
              }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">所有人</SelectItem>
                  <SelectItem value="ROLE">指定角色</SelectItem>
                  <SelectItem value="DEPT">指定部门</SelectItem>
                  <SelectItem value="USER">指定用户</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* 根据权限类型显示不同的选择器 */}
            {startPermissionType === 'ROLE' && (
              <div className="space-y-2">
                <span className="text-xs text-slate-500">选择角色</span>
                {loadingPermissions ? (
                  <div className="w-full border border-slate-200 rounded-lg p-3 text-sm text-slate-400 bg-slate-50">
                    加载角色列表中...
                  </div>
                ) : (
                  <Select value={startPermissionValue || undefined} onValueChange={setStartPermissionValue}>
                    <SelectTrigger>
                      <SelectValue placeholder="请选择角色" />
                    </SelectTrigger>
                    <SelectContent>
                      {roleList.map((role) => (
                        <SelectItem key={role.roleId} value={String(role.roleId)}>
                          {role.roleName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            {startPermissionType === 'DEPT' && (
              <div className="space-y-2">
                <span className="text-xs text-slate-500">选择部门</span>
                {loadingPermissions ? (
                  <div className="w-full border border-slate-200 rounded-lg p-3 text-sm text-slate-400 bg-slate-50">
                    加载部门列表中...
                  </div>
                ) : (
                  <Select value={startPermissionValue || undefined} onValueChange={setStartPermissionValue}>
                    <SelectTrigger>
                      <SelectValue placeholder="请选择部门" />
                    </SelectTrigger>
                    <SelectContent>
                      {deptList.map((dept) => (
                        <SelectItem key={dept.deptId} value={String(dept.deptId)}>
                          {dept.deptName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            {startPermissionType === 'USER' && (
              <div className="space-y-2">
                <span className="text-xs text-slate-500">选择用户</span>
                {loadingPermissions ? (
                  <div className="w-full border border-slate-200 rounded-lg p-3 text-sm text-slate-400 bg-slate-50">
                    加载用户列表中...
                  </div>
                ) : (
                  <Select value={startPermissionValue || undefined} onValueChange={setStartPermissionValue}>
                    <SelectTrigger>
                      <SelectValue placeholder="请选择用户" />
                    </SelectTrigger>
                    <SelectContent>
                      {userList.map((user) => (
                        <SelectItem key={user.userId} value={String(user.userId)}>
                          {user.nickName || user.userName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            <p className="text-xs text-slate-400">
              💡 配置后，只有符合条件的用户才能启动此流程
            </p>
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3 shrink-0">
          <button
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            className="rounded-xl bg-cyan-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-cyan-700"
          >
            保存设置
          </button>
        </div>
      </div>
    </div>
  );
};
