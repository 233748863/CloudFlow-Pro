import React, { useEffect, useMemo, useState } from 'react';
import { BaseDialog } from '@/components/common';
import { Button } from '@/components/common';
import { Input } from './common/input';
import { Textarea } from './common/textarea';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from './common/select';
import { StartPermissionSelector } from './workflow-builder/StartPermissionSelector';
import { FormDefinition } from '../types';
import { WORKFLOW_CATEGORY_OPTIONS, normalizeWorkflowCategory } from '../utils/workflowCategory';

const SELECT_NONE_VALUE = '__NONE__';

const sectionTitleClassName = 'text-xs font-medium text-cyan-700 dark:text-cyan-300';
const fieldLabelClassName = 'mb-1 block text-[11px] text-cf-subtle';
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
  onSave: (settings: {
    description: string;
    category: string;
    tags: string[];
    formId: string;
    startPermissionType: string;
    startPermissionValue: string;
  }) => void;
}

const formatTagText = (values: string[] = []) => values.join(', ');

const parseTagText = (value: string) =>
  value
    .split(/[,，]/)
    .map((item) => item.trim())
    .filter(Boolean);

type FormOption = {
  id: string;
  name: string;
};

const normalizeFormOption = (form?: FormDefinition | null): FormOption | null => {
  if (!form) {
    return null;
  }

  const rawId = form.id ?? '';
  const id = String(rawId).trim();
  if (!id) {
    return null;
  }

  const rawName = form.name ?? id;
  const name = String(rawName).trim() || id;
  return { id, name };
};

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
  onSave,
}) => {
  const [description, setDescription] = useState(initialDescription);
  const [category, setCategory] = useState(normalizeWorkflowCategory(initialCategory));
  const [tagText, setTagText] = useState(formatTagText(initialTags));
  const [formId, setFormId] = useState(initialFormId);
  const [startPermissionType, setStartPermissionType] = useState(initialStartPermissionType || 'ALL');
  const [startPermissionValue, setStartPermissionValue] = useState(initialStartPermissionValue || '[]');

  const formList = useMemo(
    () =>
      availableForms
        .map((form) => normalizeFormOption(form))
        .filter((form): form is FormOption => Boolean(form)),
    [availableForms],
  );

  useEffect(() => {
    setDescription(initialDescription);
    setCategory(normalizeWorkflowCategory(initialCategory));
    setTagText(formatTagText(initialTags));
    setFormId(initialFormId);
    setStartPermissionType(initialStartPermissionType || 'ALL');
    setStartPermissionValue(initialStartPermissionValue || '[]');
  }, [
    initialDescription,
    initialCategory,
    initialTags,
    initialFormId,
    initialStartPermissionType,
    initialStartPermissionValue,
  ]);

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
      <div className="admin-dialog-stack">
        <div className="admin-dialog-field">
          <div className={sectionTitleClassName}>基本信息</div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className={fieldLabelClassName}>流程名称</span>
              <Input
                value={workflowName}
                disabled
                className="bg-[var(--cf-surface-muted)] text-cf-subtle dark:bg-slate-900"
              />
            </div>
            <div>
              <span className={fieldLabelClassName}>流程 Key</span>
              <Input
                value={workflowKey}
                disabled
                className="bg-[var(--cf-surface-muted)] font-mono text-cf-subtle dark:bg-slate-900"
              />
            </div>
          </div>
        </div>

        <div className="admin-dialog-field">
          <label className={sectionTitleClassName}>流程描述</label>
          <Textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="请输入流程描述"
            className="min-h-[96px] resize-none"
          />
        </div>

        <div className="admin-dialog-field">
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

        <div className="admin-dialog-field">
          <label className={sectionTitleClassName}>流程标签</label>
          <Input
            value={tagText}
            onChange={(event) => setTagText(event.target.value)}
            placeholder="多个标签用逗号分隔"
          />
        </div>

        <div className="admin-dialog-field">
          <label className={sectionTitleClassName}>关联表单</label>
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
        </div>

        <div className="admin-dialog-stack border-t border-slate-200 pt-3 dark:border-slate-800">
          <div className={sectionTitleClassName}>启动权限</div>

          <div className="admin-dialog-field">
            <span className={fieldLabelClassName}>谁可以启动此流程</span>
            <Select
              value={startPermissionType}
              onValueChange={(value) => {
                setStartPermissionType(value);
                setStartPermissionValue('[]');
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

          {['ROLE', 'USER', 'DEPT'].includes(startPermissionType) && (
            <StartPermissionSelector
              type={startPermissionType as 'ROLE' | 'USER' | 'DEPT'}
              value={startPermissionValue}
              onChange={setStartPermissionValue}
            />
          )}
        </div>
      </div>
    </BaseDialog>
  );
};
