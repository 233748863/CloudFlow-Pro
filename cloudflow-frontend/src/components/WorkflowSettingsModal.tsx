import React, { useEffect, useState } from 'react';
import { BaseDialog } from '@/components/common';
import { Button } from '@/components/common';
import { Input } from './common/input';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from './common/select';
import { getDeptTree } from '../services/api/auth';
import { FormDefinition } from '../types';
import { SysRole, SysUser, SysDept } from '../services/api/auth';
import { toast } from 'sonner';
import { WORKFLOW_CATEGORY_OPTIONS, normalizeWorkflowCategory } from '../utils/workflowCategory';

const SELECT_NONE_VALUE = '__NONE__';

const sectionTitleClassName = 'text-xs font-medium text-cyan-700 dark:text-cyan-300';
const fieldLabelClassName = 'mb-1 block text-[11px] text-slate-500 dark:text-slate-400';
const loadingBlockClassName =
  'w-full border border-slate-200 bg-white p-3 text-sm text-slate-400 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-500';

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

const flattenDeptTree = (nodes: SysDept[] = []): SysDept[] =>
  nodes.flatMap((node) => [node, ...flattenDeptTree(Array.isArray(node.children) ? node.children : [])]);

const formatTagText = (values: string[] = []) => values.join(', ');

const parseTagText = (value: string) =>
  value
    .split(/[,，]/)
    .map((item) => item.trim())
    .filter(Boolean);

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
  const [tagText, setTagText] = useState(formatTagText(initialTags));
  const [formId, setFormId] = useState(initialFormId);
  const [startPermissionType, setStartPermissionType] = useState(initialStartPermissionType || 'ALL');
  const [startPermissionValue, setStartPermissionValue] = useState(initialStartPermissionValue || '');
  const [formList, setFormList] = useState<Array<{ id: string; name: string }>>([]);
  const [roleList, setRoleList] = useState<SysRole[]>([]);
  const [userList, setUserList] = useState<SysUser[]>([]);
  const [deptList, setDeptList] = useState<SysDept[]>([]);
  const [loadingPermissions, setLoadingPermissions] = useState(false);
  const loadingForms = false;

  useEffect(() => {
    setDescription(initialDescription);
    setCategory(normalizeWorkflowCategory(initialCategory));
    setTagText(formatTagText(initialTags));
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
          setDeptList(flattenDeptTree(Array.isArray(depts) ? depts : []));
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

  const handleSave = () => {
    onSave({
      description,
      category,
      tags: parseTagText(tagText),
      formId,
      startPermissionType,
      startPermissionValue,
    });
    onClose();
  };

  return (
    <BaseDialog
      open={open}
      title="流程设置"
      onClose={onClose}
      maxWidthClassName="max-w-2xl"
      bodyClassName="max-h-[78vh] overflow-y-auto"
      footer={(
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button onClick={handleSave}>保存设置</Button>
        </div>
      )}
    >
      <div className="space-y-3">
        <div className="space-y-2">
          <div className={sectionTitleClassName}>基本信息</div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className={fieldLabelClassName}>流程名称</span>
              <Input
                value={workflowName}
                disabled
                className="bg-slate-50 text-slate-500 dark:bg-slate-900 dark:text-slate-300"
              />
            </div>
            <div>
              <span className={fieldLabelClassName}>流程 Key</span>
              <Input
                value={workflowKey}
                disabled
                className="bg-slate-50 font-mono text-slate-500 dark:bg-slate-900 dark:text-slate-300"
              />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <label className={sectionTitleClassName}>流程描述</label>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="请输入流程描述"
            className="min-h-[96px] w-full resize-none rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:placeholder:text-slate-500 dark:focus:border-slate-500 dark:focus:ring-slate-800"
          />
        </div>

        <div className="space-y-2">
          <label className={sectionTitleClassName}>流程分类</label>
          <Select
            value={category || SELECT_NONE_VALUE}
            onValueChange={(value) => setCategory(value === SELECT_NONE_VALUE ? '' : value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="请选择流程分类" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SELECT_NONE_VALUE}>未分类</SelectItem>
              {WORKFLOW_CATEGORY_OPTIONS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className={sectionTitleClassName}>流程标签</label>
          <Input
            value={tagText}
            onChange={(event) => setTagText(event.target.value)}
            placeholder="多个标签用逗号分隔"
          />
        </div>

        <div className="space-y-2">
          <label className={sectionTitleClassName}>关联表单</label>
          {loadingForms ? (
            <div className={loadingBlockClassName}>加载表单列表中...</div>
          ) : (
            <Select
              value={formId || SELECT_NONE_VALUE}
              onValueChange={(value) => setFormId(value === SELECT_NONE_VALUE ? '' : value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="选择关联的表单" />
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
        </div>

        <div className="space-y-3 border-t border-slate-200 pt-3 dark:border-slate-800">
          <div className={sectionTitleClassName}>启动权限</div>

          <div className="space-y-2">
            <span className={fieldLabelClassName}>谁可以启动此流程</span>
            <Select
              value={startPermissionType}
              onValueChange={(value) => {
                setStartPermissionType(value);
                setStartPermissionValue('');
              }}
            >
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

          {startPermissionType === 'ROLE' ? (
            <div className="space-y-2">
              <span className={fieldLabelClassName}>选择角色</span>
              {loadingPermissions ? (
                <div className={loadingBlockClassName}>加载角色列表中...</div>
              ) : (
                <Select
                  value={startPermissionValue || undefined}
                  onValueChange={setStartPermissionValue}
                >
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
          ) : null}

          {startPermissionType === 'DEPT' ? (
            <div className="space-y-2">
              <span className={fieldLabelClassName}>选择部门</span>
              {loadingPermissions ? (
                <div className={loadingBlockClassName}>加载部门列表中...</div>
              ) : (
                <Select
                  value={startPermissionValue || undefined}
                  onValueChange={setStartPermissionValue}
                >
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
          ) : null}

          {startPermissionType === 'USER' ? (
            <div className="space-y-2">
              <span className={fieldLabelClassName}>选择用户</span>
              {loadingPermissions ? (
                <div className={loadingBlockClassName}>加载用户列表中...</div>
              ) : (
                <Select
                  value={startPermissionValue || undefined}
                  onValueChange={setStartPermissionValue}
                >
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
          ) : null}
        </div>
      </div>
    </BaseDialog>
  );
};
